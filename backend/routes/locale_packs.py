# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1

"""
Mobile app-string locale packs — downloadable-on-demand translations.

The mobile app ships with only English bundled in the binary. Every other
locale's UI strings live here as pre-built static JSON, produced offline by
mobile/scripts/translate_appstrings.py, and are fetched by the app at
runtime the first time a user selects that language in Settings (then
cached to disk, so it works offline afterward).

No auth required — same reasoning as routes/questions.py: this is static,
non-user-specific UI copy, not learner data, and needs to be fetchable
before login (e.g. a future pre-login language picker).
"""

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from pathlib import Path
import json
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/locale-packs", tags=["locale-packs"])

LOCALE_PACKS_DIR = Path(__file__).parent.parent / "locale_packs"
MANIFEST_PATH = LOCALE_PACKS_DIR / "manifest.json"


def _load_manifest() -> dict:
    if not MANIFEST_PATH.exists():
        return {}
    try:
        with open(MANIFEST_PATH, encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.warning(f"locale-packs: could not parse manifest.json: {e}")
        return {}


@router.get("/manifest")
async def get_manifest():
    """{code: {version, updatedAt}} for every locale pack currently published."""
    manifest = _load_manifest()
    return JSONResponse(
        content=manifest,
        headers={"Cache-Control": "public, max-age=300"},
    )


@router.get("/{code}")
async def get_pack(code: str):
    """
    Serve one locale's translated strings as a flat JSON file.

    `code` must be a key in manifest.json — checked before touching the
    filesystem, which also fully avoids path-traversal concerns (no
    filename sanitization needed beyond this whitelist check).
    """
    manifest = _load_manifest()
    entry = manifest.get(code)
    if not entry:
        raise HTTPException(status_code=404, detail=f"No locale pack published for '{code}'")

    pack_path = LOCALE_PACKS_DIR / f"{code}.json"
    if not pack_path.exists():
        raise HTTPException(status_code=404, detail=f"Locale pack file missing for '{code}'")

    return FileResponse(
        pack_path,
        media_type="application/json",
        headers={
            "Cache-Control": "public, max-age=86400",
            "ETag": entry.get("version", ""),
        },
    )
