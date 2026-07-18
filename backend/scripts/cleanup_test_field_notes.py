# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
One-off cleanup: removes the empty/junk draft field notes created while
testing the "image doesn't persist in field note" bug and the raw-JSON
description display bug (titles: "test filed note", "New journal entry",
"New Field Note"). Only deletes rows in 'draft' status, so anything shared,
submitted, or promoted is left untouched.

Run from the backend container:
    docker compose exec backend python3 scripts/cleanup_test_field_notes.py
"""

import asyncio
from sqlalchemy import text

from core.database import get_session_factory

JUNK_TITLES = ("test filed note", "New journal entry", "New Field Note")


async def main() -> None:
    async with get_session_factory()() as session:
        result = await session.execute(
            text(
                "DELETE FROM student_field_notes "
                "WHERE title = ANY(:titles) AND status = 'draft'"
            ),
            {"titles": list(JUNK_TITLES)},
        )
        await session.commit()
        print(f"Deleted {result.rowcount} test field note(s).")


if __name__ == "__main__":
    asyncio.run(main())
