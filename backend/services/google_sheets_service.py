# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Google Sheets Service
======================
Appends beta-signup requests to a Google Sheet using a service account.

Setup (one-time, see docs/BETA_SIGNUP_SETUP.md for the full walkthrough):
  1. Create a Google Cloud project + service account with the Sheets API enabled.
  2. Download the service account's JSON key file.
  3. Share the target Google Sheet with the service account's email address
     (found in the JSON key as "client_email"), with Editor access.
  4. Set env vars:
       GOOGLE_SERVICE_ACCOUNT_FILE=/path/to/key.json
       BETA_SIGNUP_SHEET_ID=<the id from the sheet's URL>
       BETA_SIGNUP_SHEET_TAB=Requests   (optional, defaults to "Requests")

If GOOGLE_SERVICE_ACCOUNT_FILE or BETA_SIGNUP_SHEET_ID is unset, append_row()
logs a warning and returns False instead of raising — a missing Sheets
integration should never block a beta request from being emailed.
"""

import logging
from datetime import datetime, timezone
from typing import Optional

from core.config import settings

logger = logging.getLogger(__name__)

_SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]

# Cached client — built lazily on first use, reused across requests.
_sheets_client = None


def _get_client():
    """Build (and cache) an authorized Google Sheets API client, or None if
    credentials/config are missing or invalid."""
    global _sheets_client
    if _sheets_client is not None:
        return _sheets_client

    if not settings.GOOGLE_SERVICE_ACCOUNT_FILE or not settings.BETA_SIGNUP_SHEET_ID:
        logger.info(
            "[google_sheets_service] GOOGLE_SERVICE_ACCOUNT_FILE or BETA_SIGNUP_SHEET_ID "
            "not set — skipping Sheets write (request will still be emailed)."
        )
        return None

    try:
        from google.oauth2 import service_account
        from googleapiclient.discovery import build

        creds = service_account.Credentials.from_service_account_file(
            settings.GOOGLE_SERVICE_ACCOUNT_FILE, scopes=_SCOPES
        )
        _sheets_client = build("sheets", "v4", credentials=creds, cache_discovery=False)
        return _sheets_client
    except Exception as exc:
        logger.error(f"[google_sheets_service] Failed to build Sheets client: {exc}")
        return None


async def append_beta_request(
    name: str,
    email: str,
    role: Optional[str] = None,
    organization: Optional[str] = None,
    message: Optional[str] = None,
) -> bool:
    """
    Append one row to the configured beta-signup Google Sheet.
    Returns True on success, False if skipped or failed (never raises —
    a Sheets outage should not break the /beta/request endpoint).
    """
    client = _get_client()
    if client is None:
        return False

    row = [
        datetime.now(timezone.utc).isoformat(timespec="seconds"),
        name or "",
        email or "",
        role or "",
        organization or "",
        message or "",
    ]

    try:
        # google-api-python-client is sync; run it off the event loop so it
        # doesn't block other requests.
        import asyncio

        def _do_append():
            return client.spreadsheets().values().append(
                spreadsheetId=settings.BETA_SIGNUP_SHEET_ID,
                range=f"{settings.BETA_SIGNUP_SHEET_TAB}!A:F",
                valueInputOption="USER_ENTERED",
                insertDataOption="INSERT_ROWS",
                body={"values": [row]},
            ).execute()

        await asyncio.to_thread(_do_append)
        return True
    except Exception as exc:
        logger.error(f"[google_sheets_service] Failed to append beta request row: {exc}")
        return False
