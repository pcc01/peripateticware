# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""GPX <-> scavenger-hunt wayfinding.

parse_gpx()  — a teacher-uploaded .gpx (from Gaia GPS, CalTopo, AllTrails,
               Strava, …) into the waypoint list + route LineString the
               activity model stores.
build_gpx()  — an activity's stored waypoints + route back out as a .gpx
               file so a hunt can round-trip to a handheld GPS.

Only teacher content passes through here — no student PII. See
WAYFINDING_CONSENT_LADDER.md.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

import gpxpy
import gpxpy.gpx

logger = logging.getLogger(__name__)

MAX_WAYPOINTS = 200
MAX_ROUTE_POINTS = 5000
_DEFAULT_ARRIVAL_RADIUS_M = 25


class GPXParseError(ValueError):
    """Raised when an uploaded file can't be read as usable GPX."""


def _clean_coord(lat: Any, lon: Any) -> Optional[tuple[float, float]]:
    try:
        latf, lonf = float(lat), float(lon)
    except (TypeError, ValueError):
        return None
    if not (-90.0 <= latf <= 90.0 and -180.0 <= lonf <= 180.0):
        return None
    return latf, lonf


def parse_gpx(raw: bytes | str) -> Dict[str, Any]:
    """Parse GPX bytes into {"waypoints": [...], "route_geometry": {...}|None}.

    - <wpt> elements become hunt stops (name, clue_text from <desc>/<cmt>,
      symbol from <sym>).
    - The connecting path is taken from the first <trk> (all segments joined)
      if present, else the first <rte>. Stored as a GeoJSON LineString.
    - If there are no <wpt> but there is a <rte>, the route points are
      promoted to waypoints so an ordered route still produces stops.
    """
    text = raw.decode("utf-8", errors="replace") if isinstance(raw, bytes) else raw
    try:
        gpx = gpxpy.parse(text)
    except Exception as exc:  # gpxpy raises its own GPXException subclasses
        raise GPXParseError(f"Could not parse GPX: {exc}") from exc

    waypoints: List[Dict[str, Any]] = []
    for wpt in gpx.waypoints:
        coord = _clean_coord(wpt.latitude, wpt.longitude)
        if coord is None:
            continue
        lat, lon = coord
        waypoints.append({
            "sequence_index": len(waypoints),
            "name": (wpt.name or f"Stop {len(waypoints) + 1}").strip()[:255],
            "clue_text": ((wpt.description or wpt.comment or "").strip() or None),
            "latitude": lat,
            "longitude": lon,
            "arrival_radius_meters": _DEFAULT_ARRIVAL_RADIUS_M,
            "symbol": (wpt.symbol or None),
            "required": True,
            "capture_requirements": None,
            "hint_unlock_rule": "immediate",
            "hint_unlock_minutes": None,
        })
        if len(waypoints) >= MAX_WAYPOINTS:
            break

    # ── Connecting path: prefer a track, fall back to a route ────────────────
    line: List[List[float]] = []
    for trk in gpx.tracks:
        for seg in trk.segments:
            for pt in seg.points:
                coord = _clean_coord(pt.latitude, pt.longitude)
                if coord:
                    line.append([coord[1], coord[0]])  # GeoJSON = [lng, lat]
        if line:
            break

    route_points_for_waypoints: List[gpxpy.gpx.GPXRoutePoint] = []
    if not line:
        for rte in gpx.routes:
            for pt in rte.points:
                coord = _clean_coord(pt.latitude, pt.longitude)
                if coord:
                    line.append([coord[1], coord[0]])
                    route_points_for_waypoints.append(pt)
            if line:
                break

    if len(line) > MAX_ROUTE_POINTS:
        # Down-sample evenly rather than reject a dense track.
        step = len(line) / MAX_ROUTE_POINTS
        line = [line[int(i * step)] for i in range(MAX_ROUTE_POINTS)]

    # No <wpt> but we do have a <rte> — promote route points to stops.
    if not waypoints and route_points_for_waypoints:
        for pt in route_points_for_waypoints[:MAX_WAYPOINTS]:
            coord = _clean_coord(pt.latitude, pt.longitude)
            if coord is None:
                continue
            lat, lon = coord
            waypoints.append({
                "sequence_index": len(waypoints),
                "name": (pt.name or f"Stop {len(waypoints) + 1}").strip()[:255],
                "clue_text": ((pt.description or "").strip() or None),
                "latitude": lat,
                "longitude": lon,
                "arrival_radius_meters": _DEFAULT_ARRIVAL_RADIUS_M,
                "symbol": (pt.symbol or None),
                "required": True,
                "capture_requirements": None,
                "hint_unlock_rule": "immediate",
                "hint_unlock_minutes": None,
            })

    if not waypoints:
        raise GPXParseError(
            "This GPX file has no waypoints or route points to build a hunt from."
        )

    route_geometry = {"type": "LineString", "coordinates": line} if len(line) >= 2 else None
    return {"waypoints": waypoints, "route_geometry": route_geometry}


def build_gpx(
    *,
    activity_title: str,
    waypoints: List[Dict[str, Any]],
    route_geometry: Optional[Dict[str, Any]] = None,
) -> str:
    """Serialize a hunt back to a GPX 1.1 document string.

    waypoints: list of dicts with latitude/longitude/name/clue_text/symbol
               (ActivityWaypoint.to_dict() shape), assumed already ordered.
    """
    gpx = gpxpy.gpx.GPX()
    gpx.creator = "Peripateticware — scavenger hunt wayfinding"
    gpx.name = activity_title or "Scavenger hunt"

    for wp in waypoints:
        coord = _clean_coord(wp.get("latitude"), wp.get("longitude"))
        if coord is None:
            continue
        lat, lon = coord
        gpx.waypoints.append(gpxpy.gpx.GPXWaypoint(
            latitude=lat,
            longitude=lon,
            name=(wp.get("name") or None),
            description=(wp.get("clue_text") or None),
            symbol=(wp.get("symbol") or None),
        ))

    # Ordered <rte> mirroring the stop order.
    if waypoints:
        rte = gpxpy.gpx.GPXRoute(name=(activity_title or "Route"))
        for wp in waypoints:
            coord = _clean_coord(wp.get("latitude"), wp.get("longitude"))
            if coord is None:
                continue
            rte.points.append(gpxpy.gpx.GPXRoutePoint(
                latitude=coord[0], longitude=coord[1], name=(wp.get("name") or None),
            ))
        gpx.routes.append(rte)

    # The connecting path as a <trk>.
    coords = (route_geometry or {}).get("coordinates") or []
    if len(coords) >= 2:
        trk = gpxpy.gpx.GPXTrack(name=(activity_title or "Trail"))
        seg = gpxpy.gpx.GPXTrackSegment()
        for pair in coords:
            coord = _clean_coord(pair[1] if len(pair) > 1 else None,
                                 pair[0] if pair else None)
            if coord:
                seg.points.append(gpxpy.gpx.GPXTrackPoint(latitude=coord[0], longitude=coord[1]))
        if seg.points:
            trk.segments.append(seg)
            gpx.tracks.append(trk)

    return gpx.to_xml()
