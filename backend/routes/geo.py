# Copyright (c) 2026 Paul Christopher Cerda
# Business Source License 1.1

"""
GET /api/v1/geo/hint

Returns a country code and subdivision support flag derived from the caller's IP
address using the MaxMind GeoLite2-Country database.

No auth required — this endpoint is called before signup to pre-fill the
Teaching Context step in the signup form.

Behaviour:
  - Reads X-Forwarded-For first (Cloudflare sets this), falls back to client.host
  - Returns {country_code, country_name, subdivision_support}
  - On any failure (local IP, VPN, missing DB): returns all nulls, no 500
"""

import logging
import os
from typing import Optional

from fastapi import APIRouter, Request
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/geo", tags=["geo"])

# Countries where state/province level matters for privacy law
SUBDIVISION_SUPPORT = {'US', 'CA', 'AU', 'BR', 'DE', 'IN'}

# Path where the MaxMind DB is copied at build time (see Dockerfile)
_DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'GeoLite2-Country.mmdb')
_READER = None  # lazy-loaded on first request


def _get_reader():
    """Return a cached geoip2 reader, or None if the DB is not available."""
    global _READER
    if _READER is not None:
        return _READER
    db_path = os.path.abspath(_DB_PATH)
    if not os.path.exists(db_path):
        logger.warning(f"[geo] GeoLite2-Country.mmdb not found at {db_path} — geo/hint will return nulls")
        return None
    try:
        import geoip2.database  # type: ignore
        _READER = geoip2.database.Reader(db_path)
        logger.info(f"[geo] GeoLite2 reader loaded from {db_path}")
        return _READER
    except Exception as exc:
        logger.warning(f"[geo] Failed to load GeoLite2 reader: {exc}")
        return None


class GeoHintResponse(BaseModel):
    country_code:       Optional[str]
    country_name:       Optional[str]
    subdivision_support: bool


def _client_ip(request: Request) -> Optional[str]:
    """Extract the real client IP, preferring X-Forwarded-For (Cloudflare/proxy)."""
    xff = request.headers.get("X-Forwarded-For")
    if xff:
        # May be comma-separated; first entry is the originating client
        return xff.split(",")[0].strip()
    if request.client:
        return request.client.host
    return None


@router.get("/hint", response_model=GeoHintResponse)
async def geo_hint(request: Request):
    """
    Return a country code and subdivision support flag for the caller's IP.
    Falls back gracefully to null values for local / unresolvable IPs.
    """
    empty = GeoHintResponse(
        country_code=None,
        country_name=None,
        subdivision_support=False,
    )

    ip = _client_ip(request)
    if not ip:
        return empty

    # Local / loopback addresses — skip lookup
    if ip in ('127.0.0.1', '::1', 'localhost') or ip.startswith('192.168.') or ip.startswith('10.'):
        logger.debug(f"[geo] Local IP {ip} — returning null hint")
        return empty

    reader = _get_reader()
    if reader is None:
        return empty

    try:
        record = reader.country(ip)
        cc   = record.country.iso_code        # e.g. 'US'
        name = record.country.name            # e.g. 'United States'
        return GeoHintResponse(
            country_code=cc,
            country_name=name,
            subdivision_support=(cc in SUBDIVISION_SUPPORT),
        )
    except Exception as exc:
        # geoip2.errors.AddressNotFoundError is expected for private IPs/VPNs
        logger.debug(f"[geo] Lookup failed for {ip}: {exc}")
        return empty
