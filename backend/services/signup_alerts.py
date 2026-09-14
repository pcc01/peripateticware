# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Signup Alerts
=============
Notifies ADMIN_EMAIL when a new account is created by someone other than the
developer or the developer's own tooling.

Deliberately IP-free by design (raw client IP was the first approach floated
for this feature and was rejected on privacy grounds — see the migration
20260914c_signup_source_locale.py docstring). Two signals decide whether an
account is "you" instead:

  1. created_via -- which code path created the row (models/user.py). Only
     'public_signup' (POST /auth/signup) and 'invite_accept' (a classroom
     join link) are paths a real stranger can ever hit. Every other path
     (admin panel, homeschool "add a child", seed/demo scripts) is something
     only you or your own tooling can trigger, so those never even reach the
     notify decision below.
  2. Email/username pattern -- for the two paths above, an address matching
     _INTERNAL_PATTERNS is still treated as you (this is what actually
     covers the k6 load-test accounts and any manual QA signups you do
     against the live form, both of which go through the real public
     endpoint and so can't be distinguished by created_via alone).

The notification body includes signup_country_code/signup_locale when
present -- both are coarse, already-collected hints (see models/user.py),
not new data captured for this feature.
"""

import logging
import re
from typing import Optional

from fastapi import BackgroundTasks

from core.config import settings
from services.email_service import send_notification

logger = logging.getLogger(__name__)

# Paths a real outside person can actually hit. Everything else short-
# circuits to "not a notify candidate" before pattern-matching even runs.
NOTIFIABLE_CREATED_VIA = {"public_signup", "invite_accept"}

# Email/username patterns that mean "this is you or your own tooling," even
# though the row came in through a real public endpoint. Extend this list
# rather than adding a new signal (IP, etc.) when a new internal flow starts
# hitting the public endpoints -- e.g. a new load-test account prefix.
_INTERNAL_PATTERNS = [
    re.compile(r"@thewordinbits\.com$", re.I),  # your own domain -- see
                                                  # peripateticware-admin-accounts
                                                  # memory: admin@thewordinbits.com
                                                  # is the real prod admin login;
                                                  # this also covers the k6
                                                  # loadtest.*@thewordinbits.com
                                                  # accounts, which sign up
                                                  # through the real endpoint.
    re.compile(r"@peripateticware\.com$", re.I), # the app's own domain -- no
                                                  # real customer signs up with
                                                  # this. Covers the local-dev
                                                  # admin login (admin@peripate-
                                                  # ticware.com, per the same
                                                  # memory) and the
                                                  # billy@/sally@/stevie@ demo
                                                  # fixture accounts found by
                                                  # review_existing_accounts.py.
    re.compile(r"@example\.com$", re.I),         # seed/demo/e2e fixture domain
                                                  # used throughout backend/
                                                  # scripts and frontend/tests
    re.compile(r"^test_", re.I),                 # e.g. test_admin
]


def is_internal_account(email: str, username: Optional[str] = None) -> bool:
    """True if this email/username matches a known you-or-your-tooling pattern."""
    email = (email or "").lower()
    username = (username or "").lower()
    return any(p.search(email) or (username and p.search(username)) for p in _INTERNAL_PATTERNS)


def should_notify(created_via: str, email: str, username: Optional[str] = None) -> bool:
    """Decide whether a newly created account should page ADMIN_EMAIL."""
    if created_via not in NOTIFIABLE_CREATED_VIA:
        return False
    return not is_internal_account(email, username)


def queue_new_signup_notification(
    background_tasks: BackgroundTasks,
    *,
    created_via: str,
    email: str,
    username: Optional[str] = None,
    role: Optional[str] = None,
    country_code: Optional[str] = None,
    locale: Optional[str] = None,
) -> None:
    """
    Schedule the admin notification as a background task if this signup
    looks external. Fire-and-forget, same pattern as auth.py's verification
    email: a slow/misconfigured SMTP server must never hold up or fail the
    signup response itself.
    """
    if not should_notify(created_via, email, username):
        return

    to = settings.ADMIN_EMAIL or settings.EMAIL_FROM
    if not to:
        logger.warning("[signup_alerts] No ADMIN_EMAIL/EMAIL_FROM configured — "
                        "new-signup notification for %s not sent", email)
        return

    context_bits = [f"<strong>Path:</strong> {created_via}"]
    if role:
        context_bits.append(f"<strong>Role:</strong> {role}")
    if country_code:
        context_bits.append(f"<strong>Country hint:</strong> {country_code}")
    if locale:
        context_bits.append(f"<strong>Signup locale:</strong> {locale}")
    context_html = "<br>".join(context_bits)

    body_html = f"""
    <h2>New account created</h2>
    <p>A new account was just created that doesn't match your own known
    accounts or tooling.</p>
    <p><strong>Email:</strong> {email}<br>{context_html}</p>
    <p>Log in to the admin panel to review it if this is unexpected.</p>
    """

    async def _send():
        try:
            await send_notification(
                to=to,
                subject="New Peripateticware signup",
                body_html=body_html,
            )
        except Exception:
            logger.exception("[signup_alerts] Failed to send new-signup notification for %s", email)

    background_tasks.add_task(_send)
