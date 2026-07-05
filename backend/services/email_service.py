# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Email Service
=============
Sends transactional emails via aiosmtplib (async SMTP).

Config (env vars, all optional in dev — EMAIL_DRY_RUN=true by default):
  SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_USE_TLS
  EMAIL_FROM, EMAIL_FROM_NAME, FRONTEND_URL, EMAIL_DRY_RUN

In development (EMAIL_DRY_RUN=true) every email is logged but not sent.
Set EMAIL_DRY_RUN=false and provide real SMTP credentials in production.

Supported email types:
  send_verification_email(to, token)                               — account confirmation on signup
  send_password_reset_email(to, token)                             — password reset link
  send_parent_consent_email(to, token, student_name)
  send_welcome_email(to, name, role)                               — after email verified
  send_classroom_invite_email(to, teacher_name, classroom_name,    — student classroom invite
                               org_name, join_url)
  send_notification(to, subject, body_html)                        — generic
"""

import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

import aiosmtplib

from core.config import settings

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# HTML template helpers
# ---------------------------------------------------------------------------

_BASE_STYLE = """
<style>
  body{font-family:system-ui,Arial,sans-serif;background:#f4f4f4;margin:0;padding:0}
  .wrap{max-width:600px;margin:32px auto;background:#fff;border-radius:8px;overflow:hidden;
        box-shadow:0 2px 8px rgba(0,0,0,.08)}
  .hdr{background:#1b4332;padding:28px 32px}
  .hdr h1{margin:0;color:#fff;font-size:22px;font-weight:700}
  .hdr p{margin:4px 0 0;color:#a7f3d0;font-size:13px}
  .body{padding:32px}
  .body p{color:#374151;line-height:1.6;margin:0 0 16px}
  .btn{display:inline-block;background:#1b4332;color:#fff!important;text-decoration:none;
       padding:12px 28px;border-radius:6px;font-weight:600;font-size:15px;margin:8px 0 20px}
  .note{font-size:12px;color:#6b7280;border-top:1px solid #e5e7eb;margin-top:24px;padding-top:16px}
  .ftr{background:#f9fafb;padding:16px 32px;text-align:center;font-size:12px;color:#9ca3af}
</style>
"""


def _wrap(header_title: str, header_sub: str, body_html: str) -> str:
    return f"""<!DOCTYPE html><html><head><meta charset="UTF-8">{_BASE_STYLE}</head>
<body><div class="wrap">
  <div class="hdr"><h1>{header_title}</h1><p>{header_sub}</p></div>
  <div class="body">{body_html}</div>
  <div class="ftr">Peripateticware &mdash; Learning in Motion &middot;
    <a href="{settings.FRONTEND_URL}/settings" style="color:#9ca3af">Email preferences</a>
  </div>
</div></body></html>"""


# ---------------------------------------------------------------------------
# Core send function
# ---------------------------------------------------------------------------

async def _send(to: str, subject: str, html: str, text: Optional[str] = None) -> bool:
    """
    Send an email. Returns True on success.
    In dry-run mode logs the email instead of sending.
    """
    if settings.EMAIL_DRY_RUN or not settings.SMTP_HOST:
        logger.info(
            "EMAIL DRY-RUN | To: %s | Subject: %s\n"
            "(Set SMTP_HOST and EMAIL_DRY_RUN=false to send real emails)",
            to, subject,
        )
        return True

    msg = MIMEMultipart("alternative")
    msg["From"] = f"{settings.EMAIL_FROM_NAME} <{settings.EMAIL_FROM}>"
    msg["To"] = to
    msg["Subject"] = subject

    if text:
        msg.attach(MIMEText(text, "plain"))
    msg.attach(MIMEText(html, "html"))

    try:
        await aiosmtplib.send(
            msg,
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            username=settings.SMTP_USER or None,
            password=settings.SMTP_PASSWORD or None,
            start_tls=settings.SMTP_USE_TLS,
        )
        logger.info("Email sent | To: %s | Subject: %s", to, subject)
        return True
    except Exception as exc:
        logger.error("Email send failed | To: %s | %s", to, exc)
        return False


# ---------------------------------------------------------------------------
# Transactional email functions
# ---------------------------------------------------------------------------

async def send_verification_email(to: str, token: str) -> bool:
    """Send account email-verification link after signup."""
    link = f"{settings.FRONTEND_URL}/verify-email?token={token}"
    html = _wrap(
        "Confirm your email",
        "One more step to get started",
        f"""
        <p>Thanks for signing up! Click below to confirm your email address and
        activate your Peripateticware account.</p>
        <a class="btn" href="{link}">Confirm Email Address</a>
        <p class="note">This link expires in <strong>24 hours</strong>.
        If you didn't create an account, you can safely ignore this email.<br>
        Or copy this URL: {link}</p>
        """,
    )
    return await _send(to, "Confirm your Peripateticware account", html)


async def send_password_reset_email(to: str, token: str) -> bool:
    """Send password-reset link."""
    link = f"{settings.FRONTEND_URL}/reset-password?token={token}"
    html = _wrap(
        "Reset your password",
        "We received a request to reset your password",
        f"""
        <p>Click below to choose a new password. This link is valid for
        <strong>60 minutes</strong>.</p>
        <a class="btn" href="{link}">Reset Password</a>
        <p class="note">If you didn't request this, ignore this email &mdash;
        your password won't change.<br>Or copy this URL: {link}</p>
        """,
    )
    return await _send(to, "Reset your Peripateticware password", html)


async def send_welcome_email(to: str, name: str, role: str) -> bool:
    """Send welcome email after account is verified."""
    role_label = {"TEACHER": "teacher", "STUDENT": "student",
                  "PARENT": "parent", "HOMESCHOOL": "homeschool parent"}.get(role.upper(), "user")
    dashboard_link = f"{settings.FRONTEND_URL}/{role_label if role_label != 'user' else ''}"
    html = _wrap(
        f"Welcome, {name}!",
        "Your account is ready",
        f"""
        <p>Your Peripateticware account is confirmed. You're signed up as a
        <strong>{role_label}</strong>.</p>
        <a class="btn" href="{dashboard_link}">Go to your dashboard</a>
        <p>If you have questions, reply to this email — we read everything.</p>
        """,
    )
    return await _send(to, f"Welcome to Peripateticware, {name}!", html)


async def send_beta_request_confirmation(to: str, name: str) -> bool:
    """Confirms receipt of a "Request Beta Access" submission to the requester."""
    first_name = (name or "there").split(" ")[0]
    html = _wrap(
        "Thanks for your interest!",
        "We've got your request",
        f"""
        <p>Hi {first_name},</p>
        <p>Thanks for requesting beta access to Peripateticware. We've added you to our
        list and will reach out at this email address once a spot opens up.</p>
        <p>If you already have an invite code from us, you can go ahead and sign up now
        using the link we sent you.</p>
        <p>If you have questions in the meantime, just reply to this email.</p>
        """,
    )
    return await _send(to, "We've received your Peripateticware beta request", html)


async def send_parent_consent_email(to: str, token: str, student_name: str) -> bool:
    """Send parental consent request link."""
    link = f"{settings.FRONTEND_URL}/parent-consent/{token}"
    html = _wrap(
        "Parental consent required",
        f"Action needed for {student_name}'s account",
        f"""
        <p>A Peripateticware account has been created for <strong>{student_name}</strong>.
        Because they are under 13, we need your consent before they can use the app.</p>
        <a class="btn" href="{link}">Review &amp; Give Consent</a>
        <p class="note">This link expires in <strong>72 hours</strong>.
        If you did not request this, please ignore it. No account will be activated
        without your action.<br>Or copy this URL: {link}</p>
        """,
    )
    return await _send(to, f"Consent needed for {student_name}'s Peripateticware account", html)


async def send_classroom_invite_email(
    to: str,
    teacher_name: str,
    classroom_name: str,
    org_name: str,
    join_url: str,
) -> bool:
    """
    Send a classroom invitation to a prospective student.

    join_url should be the full URL, e.g. https://app.peripateticware.com/join/<token>
    """
    html = _wrap(
        "You've been invited to join a class",
        f"{org_name} — {classroom_name}",
        f"""
        <p><strong>{teacher_name}</strong> has invited you to join their class
        <strong>{classroom_name}</strong> on Peripateticware — an outdoor and
        field-based learning platform.</p>
        <a class="btn" href="{join_url}">Accept Invitation</a>
        <p>Clicking the button will take you to a short sign-up form. It only
        takes a minute, and you'll be enrolled in the class automatically.</p>
        <p class="note">This invite link expires in <strong>14 days</strong>.
        If you weren't expecting this, you can safely ignore it.<br>
        Or copy this URL: {join_url}</p>
        """,
    )
    return await _send(
        to,
        f"{teacher_name} invited you to join {classroom_name} on Peripateticware",
        html,
    )


async def send_notification(to: str, subject: str, body_html: str) -> bool:
    """Generic notification email."""
    html = _wrap("Peripateticware", "Notification", f"<p>{body_html}</p>")
    return await _send(to, subject, html)


async def send_progress_digest(
    to: str,
    child_name: str,
    period: str,
    activities_completed: int,
    hours_learned: float,
    new_competencies: list,
    achievements: list,
) -> bool:
    """Send weekly/monthly progress digest to parent."""
    period_label = "This Week" if period == "weekly" else "This Month"
    comp_list = "".join(f"<li>{c}</li>" for c in new_competencies) or "<li>None yet</li>"
    ach_list = "".join(f"<li>{a}</li>" for a in achievements) or "<li>None yet</li>"
    html = _wrap(
        f"{period_label}'s Progress",
        f"{child_name} on Peripateticware",
        f"""
        <p>Here's {child_name}'s learning summary for {period_label.lower()}.</p>
        <p>✅ <strong>{activities_completed}</strong> activities completed &nbsp;|&nbsp;
           ⏱ <strong>{hours_learned:.1f}</strong> hours of learning</p>
        <h3 style="color:#1b4332;margin:20px 0 8px">New Competencies</h3>
        <ul style="padding-left:20px;color:#374151">{comp_list}</ul>
        <h3 style="color:#1b4332;margin:20px 0 8px">Achievements</h3>
        <ul style="padding-left:20px;color:#374151">{ach_list}</ul>
        <a class="btn" href="{settings.FRONTEND_URL}/parent/progress">View Full Report</a>
        """,
    )
    subject = (f"Weekly Progress: {child_name}" if period == "weekly"
               else f"Monthly Report: {child_name}")
    return await _send(to, subject, html)


# ---------------------------------------------------------------------------
# Breach notification emails — GDPR Art. 33 (DPA) & Art. 34 (users)
# ---------------------------------------------------------------------------

async def send_dpa_breach_notification(
    dpa_email: str,
    incident_id: str,
    discovered_at: str,
    severity: str,
    description: str,
    data_categories: list,
    affected_count: "int | None",
    jurisdictions: list,
    controller_name: str = "Peripateticware",
    controller_contact: str = "privacy@peripateticware.com",
) -> bool:
    """GDPR Art. 33: Notify the Data Protection Authority of a personal data breach."""
    body = f"""
    <h2>Personal Data Breach Notification &mdash; GDPR Article 33</h2>
    <p><strong>Incident ID:</strong> {incident_id}</p>
    <p><strong>Data Controller:</strong> {controller_name} ({controller_contact})</p>
    <p><strong>Date/Time Discovered:</strong> {discovered_at} UTC</p>
    <p><strong>Severity:</strong> {severity.upper()}</p>
    <p><strong>Jurisdictions Affected:</strong> {', '.join(jurisdictions)}</p>
    <h3>Nature of the Breach</h3>
    <p>{description}</p>
    <h3>Categories of Personal Data Involved</h3>
    <p>{', '.join(data_categories)}</p>
    <h3>Approximate Number of Individuals Affected</h3>
    <p>{affected_count if affected_count is not None else 'Under investigation'}</p>
    <h3>Likely Consequences</h3>
    <p>Under investigation. Full impact assessment in progress.</p>
    <h3>Measures Taken</h3>
    <p>Containment measures have been initiated. Full report to follow within 30 days per GDPR Art. 33(4).</p>
    <hr>
    <p><small>This notification is submitted pursuant to GDPR Article 33.
    Reference: {incident_id}. Controller DPO contact: {controller_contact}</small></p>
    """
    return await send_notification(
        dpa_email,
        f"[BREACH NOTIFICATION] {controller_name} — Incident {incident_id[:8]}",
        body,
    )


async def send_user_breach_notification(
    to: str,
    incident_id: str,
    data_categories: list,
    description_for_users: str,
    recommended_actions: "list | None" = None,
    controller_contact: str = "privacy@peripateticware.com",
) -> bool:
    """GDPR Art. 34: Notify affected users of a high-risk breach."""
    actions_html = ""
    if recommended_actions:
        items = "".join(f"<li>{a}</li>" for a in recommended_actions)
        actions_html = f"<h3>Recommended Actions</h3><ul>{items}</ul>"

    body = f"""
    <h2>Important Security Notice</h2>
    <p>We are contacting you because a security incident may have affected personal data
    associated with your Peripateticware account.</p>
    <h3>What Happened</h3>
    <p>{description_for_users}</p>
    <h3>What Information Was Involved</h3>
    <p>The following categories of information may have been affected:
    {', '.join(data_categories)}.</p>
    {actions_html}
    <h3>What We Are Doing</h3>
    <p>We have taken immediate steps to contain the incident and have notified the relevant
    Data Protection Authority as required by law. A full investigation is underway.</p>
    <h3>Contact Us</h3>
    <p>If you have questions, contact our privacy team at
    <a href="mailto:{controller_contact}">{controller_contact}</a>.</p>
    <p>Reference: {incident_id[:8]}</p>
    """
    return await send_notification(
        to,
        "Important Security Notice — Peripateticware",
        body,
    )
