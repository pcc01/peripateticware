# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""Unit tests for services/gpx_wayfinding.py — GPX <-> hunt wayfinding.

Pure function tests, no DB / no app. Covers the parse cases the import
endpoint (POST /activities/{id}/gpx) relies on and the build round-trip
used by the export endpoint. See WAYFINDING_CONSENT_LADDER.md.
"""

from __future__ import annotations

import pytest

pytest.importorskip("gpxpy")

from services.gpx_wayfinding import parse_gpx, build_gpx, GPXParseError  # noqa: E402


_WPTS_AND_TRACK = """<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <wpt lat="37.8716" lon="-122.2727">
    <name>Oak Tree</name><desc>Find the oldest oak</desc><sym>Flag, Green</sym>
  </wpt>
  <wpt lat="37.8720" lon="-122.2710">
    <name>Fountain</name><cmt>Count the spouts</cmt>
  </wpt>
  <trk><name>Trail</name><trkseg>
    <trkpt lat="37.8716" lon="-122.2727"/>
    <trkpt lat="37.8718" lon="-122.2718"/>
    <trkpt lat="37.8720" lon="-122.2710"/>
  </trkseg></trk>
</gpx>"""

_ROUTE_ONLY = """<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test" xmlns="http://www.topografix.com/GPX/1/1">
  <rte><name>R</name>
    <rtept lat="10.0" lon="20.0"><name>A</name></rtept>
    <rtept lat="10.1" lon="20.1"><name>B</name></rtept>
  </rte>
</gpx>"""


def test_parse_wpts_and_track():
    out = parse_gpx(_WPTS_AND_TRACK)
    wps = out["waypoints"]
    assert len(wps) == 2
    assert wps[0]["name"] == "Oak Tree"
    assert wps[0]["clue_text"] == "Find the oldest oak"
    assert wps[0]["symbol"] == "Flag, Green"
    assert wps[0]["sequence_index"] == 0 and wps[1]["sequence_index"] == 1
    # <cmt> is used as the clue when <desc> is absent
    assert wps[1]["clue_text"] == "Count the spouts"
    # track -> GeoJSON LineString, [lng, lat] order
    geom = out["route_geometry"]
    assert geom["type"] == "LineString"
    assert geom["coordinates"][0] == [-122.2727, 37.8716]
    assert len(geom["coordinates"]) == 3


def test_parse_route_promoted_to_waypoints():
    out = parse_gpx(_ROUTE_ONLY)
    # no <wpt> but a <rte> exists -> route points become stops
    assert [w["name"] for w in out["waypoints"]] == ["A", "B"]
    assert out["route_geometry"]["coordinates"] == [[20.0, 10.0], [20.1, 10.1]]


def test_parse_rejects_empty():
    empty = ('<?xml version="1.0"?><gpx version="1.1" creator="t" '
             'xmlns="http://www.topografix.com/GPX/1/1"></gpx>')
    with pytest.raises(GPXParseError):
        parse_gpx(empty)


def test_parse_rejects_garbage():
    with pytest.raises(GPXParseError):
        parse_gpx(b"not xml at all {}")


def test_parse_skips_out_of_range_coords():
    bad = """<?xml version="1.0"?>
    <gpx version="1.1" creator="t" xmlns="http://www.topografix.com/GPX/1/1">
      <wpt lat="999" lon="0"><name>bad</name></wpt>
      <wpt lat="1.0" lon="2.0"><name>good</name></wpt>
    </gpx>"""
    out = parse_gpx(bad)
    assert [w["name"] for w in out["waypoints"]] == ["good"]


def test_build_round_trips():
    parsed = parse_gpx(_WPTS_AND_TRACK)
    xml = build_gpx(
        activity_title="My Hunt",
        waypoints=[
            {"latitude": 37.8716, "longitude": -122.2727, "name": "Oak",
             "clue_text": "a clue", "symbol": None},
        ],
        route_geometry=parsed["route_geometry"],
    )
    assert "<wpt" in xml and "<rte>" in xml and "<trkpt" in xml
    # re-parse what we built
    again = parse_gpx(xml)
    assert again["waypoints"][0]["name"] == "Oak"
    assert again["route_geometry"]["coordinates"][0] == [-122.2727, 37.8716]
