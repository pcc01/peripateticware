# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Beta signup gate — public config + request-access endpoints.

- GET  /api/v1/config/public   — tells the frontend whether self-signup is
  open or invite-only, so it can decide whether to show the real signup form
  or the "Request Beta Access" page. No auth required; no secrets exposed.
- POST /api/v1/beta/request    — collects a beta access request (name, email,
  role, organization, message), appends it to a Google Sheet, and emails the
  admin. Never raises to the caller on Sheets/email failure — the request is
  still acknowledged so the visitor isn't shown a scary error for an
  infrastructure hiccup on our side.
"""

import logging

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, EmailStr, Field

from core.config import settings
from services import google_sheets_service
from services.email_service import send_notification, send_beta_request_confirmation

logger = logging.getLogger(__name__)

router = APIRouter(tags=["beta"])


# ── Public config ────────────────────────────────────────────────────────────

@router.get("/config/public")
async def get_public_config():
    """Public, non-sensitive config the frontend needs before login."""
    return {
        "signup_mode": settings.SIGNUP_MODE,  # "open" | "invite_only"
    }


# ── Beta request ──────────────────────────────────────────────────────────────

class BetaRequestBody(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    email: EmailStr
    role: str = Field("", max_length=50)
    organization: str = Field("", max_length=200)
    message: str = Field("", max_length=2000)


@router.post("/beta/request", status_code=status.HTTP_201_CREATED)
async def request_beta_access(body: BetaRequestBody):
    name = body.name.strip()
    email = str(body.email).strip().lower()
    role = body.role.strip()
    organization = body.organization.strip()
    message = body.message.strip()

    if not name or not email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Name and email are required.")

    sheet_ok = await google_sheets_service.append_beta_request(
        name=name, email=email, role=role, organization=organization, message=message
    )
    if not sheet_ok:
        logger.warning(f"[beta] Could not write beta request for {email} to Google Sheet (see log above).")

    notify_to = settings.BETA_NOTIFY_EMAIL or settings.ADMIN_EMAIL
    if notify_to:
        try:
            body_html = (
                f"<p><strong>Name:</strong> {name}</p>"
                f"<p><strong>Email:</strong> {email}</p>"
                f"<p><strong>Role:</strong> {role or '—'}</p>"
                f"<p><strong>Organization:</strong> {organization or '—'}</p>"
                f"<p><strong>Message:</strong><br>{message or '—'}</p>"
            )
            await send_notification(notify_to, f"New beta request: {name}", body_html)
        except Exception as exc:
            logger.error(f"[beta] Failed to send admin notification email: {exc}")

    # Confirmation email to the requester — best-effort, never blocks the response.
    try:
        await send_beta_request_confirmation(email, name)
    except Exception as exc:
        logger.error(f"[beta] Failed to send requester confirmation email to {email}: {exc}")

    return {
        "status": "received",
        "message": "Thanks! We've received your request and will be in touch.",
    }
