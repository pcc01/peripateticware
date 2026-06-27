# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Tests for field-level encryption (core/encryption.py).

Covers:
  - Passthrough when FIELD_ENCRYPTION_KEY is not set
  - encrypt/decrypt round-trip
  - Blind index determinism and uniqueness
  - Plaintext fallback (pre-migration compatibility)
  - EncryptedString SQLAlchemy TypeDecorator (bind/result processing)
  - Key derivation from hex and Fernet formats
"""
import os
import sys
import pytest


def _reload_encryption(key: str = ""):
    """Reload the encryption module with a fresh env + fresh import."""
    os.environ["FIELD_ENCRYPTION_KEY"] = key
    # Drop every encryption-related module so _init_encryption() reruns cleanly.
    for mod in list(sys.modules.keys()):
        if "encryption" in mod:
            del sys.modules[mod]
    backend_path = "/sessions/serene-brave-volta/mnt/peripateticware/backend"
    if backend_path not in sys.path:
        sys.path.insert(0, backend_path)
    import core.encryption as enc
    enc._init_encryption()
    return enc


class TestPassthrough:
    """Without FIELD_ENCRYPTION_KEY, values pass through unchanged."""

    def setup_method(self):
        self.enc = _reload_encryption("")

    def teardown_method(self):
        os.environ.pop("FIELD_ENCRYPTION_KEY", None)

    def test_encrypt_passthrough(self):
        assert self.enc.encrypt("hello@example.com") == "hello@example.com"

    def test_decrypt_passthrough(self):
        assert self.enc.decrypt("hello@example.com") == "hello@example.com"

    def test_blind_index_normalises(self):
        idx = self.enc.blind_index("  HELLO@EXAMPLE.COM  ")
        assert idx == "hello@example.com"

    def test_encrypt_none_safe(self):
        # encrypt on empty string should not crash and should pass through
        result = self.enc.encrypt("")
        assert result == ""


class TestEncryptionEnabled:
    """With a valid FIELD_ENCRYPTION_KEY, values are encrypted."""

    def setup_method(self):
        from cryptography.fernet import Fernet
        self.key = Fernet.generate_key().decode()
        self.enc = _reload_encryption(self.key)

    def teardown_method(self):
        os.environ.pop("FIELD_ENCRYPTION_KEY", None)

    def test_encrypt_changes_value(self):
        ct = self.enc.encrypt("secret@example.com")
        assert ct != "secret@example.com"
        assert len(ct) > 20  # Fernet tokens are ~100+ chars

    def test_round_trip(self):
        original = "paul@peripateticware.com"
        assert self.enc.decrypt(self.enc.encrypt(original)) == original

    def test_round_trip_unicode(self):
        original = "ñoño@peripateticware.mx"
        assert self.enc.decrypt(self.enc.encrypt(original)) == original

    def test_blind_index_deterministic(self):
        idx1 = self.enc.blind_index("test@example.com")
        idx2 = self.enc.blind_index("test@example.com")
        assert idx1 == idx2

    def test_blind_index_case_insensitive(self):
        assert (
            self.enc.blind_index("TEST@EXAMPLE.COM")
            == self.enc.blind_index("test@example.com")
        )

    def test_blind_index_different_values_differ(self):
        assert self.enc.blind_index("a@example.com") != self.enc.blind_index("b@example.com")

    def test_blind_index_length(self):
        idx = self.enc.blind_index("test@example.com")
        assert len(idx) == 64  # SHA-256 hex digest = 64 hex chars

    def test_plaintext_fallback(self):
        """decrypt() must return the raw value when it was never encrypted (pre-migration rows)."""
        raw = "plaintext_that_was_never_encrypted@example.com"
        assert self.enc.decrypt(raw) == raw

    def test_encrypt_different_ciphertexts_same_plaintext(self):
        """Fernet is IND-CPA secure: different nonce per call => different ciphertext."""
        ct1 = self.enc.encrypt("test@example.com")
        ct2 = self.enc.encrypt("test@example.com")
        assert ct1 != ct2

    def test_generate_key_format(self):
        key = self.enc.generate_key()
        assert len(key) == 44  # URL-safe base64 of 32 bytes + padding
        assert key.endswith("=")


class TestEncryptedStringTypeDecorator:
    """Test the SQLAlchemy TypeDecorator process_bind_param / process_result_value."""

    def setup_method(self):
        from cryptography.fernet import Fernet
        self.key = Fernet.generate_key().decode()
        self.enc = _reload_encryption(self.key)

    def teardown_method(self):
        os.environ.pop("FIELD_ENCRYPTION_KEY", None)

    def test_bind_param_encrypts(self):
        col = self.enc.EncryptedString(600)
        ct = col.process_bind_param("sensitive_data", None)
        assert ct != "sensitive_data"

    def test_result_value_decrypts(self):
        col = self.enc.EncryptedString(600)
        ct = col.process_bind_param("sensitive_data", None)
        pt = col.process_result_value(ct, None)
        assert pt == "sensitive_data"

    def test_bind_param_none_passthrough(self):
        col = self.enc.EncryptedString(600)
        assert col.process_bind_param(None, None) is None

    def test_result_value_none_passthrough(self):
        col = self.enc.EncryptedString(600)
        assert col.process_result_value(None, None) is None

    def test_round_trip_via_decorator(self):
        """Full bind->result cycle via the TypeDecorator matches the original value."""
        col = self.enc.EncryptedString(600)
        original = "sensitive@example.com"
        stored = col.process_bind_param(original, None)
        assert stored != original          # must actually encrypt
        recovered = col.process_result_value(stored, None)
        assert recovered == original       # must cleanly decrypt
