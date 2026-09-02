# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Regression test for the SMTP TLS-mode bug: prod runs smtp.resend.com:465
(implicit TLS / SMTPS), but _send() was passing start_tls=True (STARTTLS),
which hangs until timeout and never delivers. _send() must pick implicit TLS
for port 465 and STARTTLS for 587/25, and always pass a timeout.
"""

import pytest

from services import email_service


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "port, use_tls_cfg, expect_use_tls, expect_start_tls",
    [
        (465, True, True, False),   # implicit TLS — the prod case that was broken
        (587, True, False, True),   # STARTTLS
        (25, False, False, False),  # plaintext
    ],
)
async def test_send_picks_tls_mode_from_port(
    monkeypatch, port, use_tls_cfg, expect_use_tls, expect_start_tls
):
    captured = {}

    async def fake_send(msg, **kwargs):
        captured.update(kwargs)
        return None

    monkeypatch.setattr(email_service.settings, "EMAIL_DRY_RUN", False)
    monkeypatch.setattr(email_service.settings, "SMTP_HOST", "smtp.example.com")
    monkeypatch.setattr(email_service.settings, "SMTP_PORT", port)
    monkeypatch.setattr(email_service.settings, "SMTP_USER", "u")
    monkeypatch.setattr(email_service.settings, "SMTP_PASSWORD", "p")
    monkeypatch.setattr(email_service.settings, "SMTP_USE_TLS", use_tls_cfg)
    monkeypatch.setattr(email_service.aiosmtplib, "send", fake_send)

    ok = await email_service._send("to@example.com", "subj", "<p>hi</p>", "hi")

    assert ok is True
    assert captured.get("use_tls", False) is expect_use_tls
    assert captured.get("start_tls") == expect_start_tls
    assert captured.get("timeout") is not None
