# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
review_existing_accounts.py — one-time heuristic review of accounts that
predate the new-signup notification feature (services/signup_alerts.py).

No account has ever had its creation source (IP, or anything else) recorded,
so this canNOT reconstruct "who really created row X" with certainty. What
it CAN do is list every account with the signals that already exist —
is_protected (the existing seed/demo-account flag), email/username pattern,
role, and created_at — and flag the ones that look like neither a known
seed/demo account nor your own email domain, so you can eyeball them.

Everything created AFTER this feature shipped (2026-09-14) is handled going
forward by the real-time notification instead — this script is only for the
backlog of accounts that already existed.

Usage (inside the backend container):
    docker compose exec -T backend python scripts/review_existing_accounts.py

Tracked in git under backend/scripts/ (unlike backend/set_admin.py, which is
gitignored) — this needs to reach prod via the normal git pull + rebuild
deploy flow before it can be run there.
"""

import asyncio
import sys

from sqlalchemy import select

from core.database import get_session_factory
from models.user import User
from services.signup_alerts import is_internal_account


async def main() -> int:
    session_factory = get_session_factory()

    flagged = []
    known = []

    async with session_factory() as db:
        result = await db.execute(select(User).order_by(User.created_at))
        users = result.scalars().all()

        for u in users:
            # is_protected already marks every known seed/demo account (set
            # by the 2026-08-19 org-scoping migration's PROTECTED_USERNAMES
            # backfill, and by every startup.py seeding path going forward)
            # -- that's a stronger, pre-existing signal than pattern-matching
            # for this backlog, since those rows never went through a public
            # endpoint in the first place.
            is_known = bool(getattr(u, "is_protected", False)) or is_internal_account(
                u.email or "", u.username or ""
            )
            row = (u.created_at, u.email, u.username, u.role, getattr(u, "created_via", None), is_known)
            (known if is_known else flagged).append(row)

    print(f"Total accounts: {len(known) + len(flagged)}")
    print(f"Recognized as you / your tooling: {len(known)}")
    print(f"Flagged for manual review: {len(flagged)}\n")

    if flagged:
        print("── Review these — not recognized as you or known seed data ──")
        for created_at, email, username, role, created_via, _ in flagged:
            print(f"  {created_at}  {email!r:40}  {username!r:25}  role={role:12}  created_via={created_via}")
    else:
        print("Nothing flagged.")

    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
