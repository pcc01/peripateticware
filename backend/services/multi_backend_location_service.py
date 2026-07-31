# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Multi-Backend Dynamic Location Service v2
Supports free/open alternatives:
- OpenStreetMap (Overpass API) - Free location discovery
- Nominatim - Free geocoding & reverse geocoding
- Wikidata - Free structured data about artworks, statues, architecture
- Wikipedia - Free detailed information
- OpenHistoricalMap - Free historical location data
- Google Maps - Optional paid tier for advanced features

Configurable via LOCATION_BACKEND environment variable
"""

from typing import Dict, List, Optional, Any, Literal
from dataclasses import dataclass
import asyncio
import logging
import httpx
from datetime import datetime
from abc import ABC, abstractmethod
import os
import json

logger = logging.getLogger(__name__)

# Wikimedia (Wikidata + Wikipedia) API etiquette policy rejects requests with
# no/generic User-Agent — same class of bug as the Overpass 406 fixed
# earlier this session, just on a different host. Missing this header is
# what made Wikidata enrichment 403 even on the rare cases Overpass *did*
# successfully find a real POI: https://meta.wikimedia.org/wiki/User-Agent_policy
WIKIMEDIA_USER_AGENT = "PeripateticwareApp/1.0 (contact: support@peripateticware.com)"

# Shared, connection-pooled client for all Overpass/Nominatim/Wikipedia/
# Wikidata calls in this module. Every call site here used to open its own
# `async with httpx.AsyncClient()` — a fresh TCP+TLS handshake per hop, even
# though the enrichment chain (fetch_wikidata_id_by_name -> enrich_with_wikidata
# -> enrich_with_wikipedia) makes 2-3 *sequential* calls to the same 2 hosts
# in a single request. Reusing one pooled client lets httpx keep those
# connections alive across hops (and across requests), which is the main
# fix for "the wikidata lookup feels slow." Default timeout is tightened from
# the previous per-call 10s to 4s — these APIs normally answer in well under
# a second, so 10s was only ever making a hang (not a normal response) take
# longer to fail. Overpass/Nominatim keep their own longer per-call timeouts
# below since they're a different, occasionally slower host.
_shared_http_client: Optional[httpx.AsyncClient] = None


def get_http_client() -> httpx.AsyncClient:
    """Get (or lazily create) the shared pooled httpx client for this module."""
    global _shared_http_client
    if _shared_http_client is None or _shared_http_client.is_closed:
        _shared_http_client = httpx.AsyncClient(
            timeout=4,
            headers={"User-Agent": WIKIMEDIA_USER_AGENT},
            limits=httpx.Limits(max_keepalive_connections=20, max_connections=40),
        )
    return _shared_http_client


async def close_http_client() -> None:
    """Close the shared client. Call once on app shutdown."""
    global _shared_http_client
    if _shared_http_client is not None and not _shared_http_client.is_closed:
        await _shared_http_client.aclose()
        _shared_http_client = None


@dataclass
class LocationData:
    """Location with all available data"""
    name: str
    latitude: float
    longitude: float
    location_type: str  # museum, park, statue, artwork, historic_building, etc.
    address: str
    place_id: str  # Backend-specific ID
    
    # Enrichment data
    description: Optional[str] = None
    image_url: Optional[str] = None
    wikipedia_url: Optional[str] = None
    wikidata_id: Optional[str] = None
    
    # Educational enrichment
    subjects: List[str] = None
    keywords: List[str] = None
    learning_opportunities: List[str] = None
    historical_significance: Optional[str] = None
    architect_or_artist: Optional[str] = None
    construction_date: Optional[str] = None
    
    # Metadata
    source: str = "unknown"  # osm, nominatim, wikidata, wikipedia, google
    rating: Optional[float] = None
    user_ratings_total: Optional[int] = None
    
    def __post_init__(self):
        if self.subjects is None:
            self.subjects = []
        if self.keywords is None:
            self.keywords = []
        if self.learning_opportunities is None:
            self.learning_opportunities = []


class LocationBackend(ABC):
    """Abstract base for location service backends"""
    
    @abstractmethod
    async def search_nearby(
        self,
        latitude: float,
        longitude: float,
        radius_meters: int = 5000,
        location_types: Optional[List[str]] = None,
        query: Optional[str] = None
    ) -> List[LocationData]:
        """Search for nearby locations"""
        pass
    
    @abstractmethod
    async def enrich_location(
        self,
        location: LocationData,
        subject: Optional[str] = None
    ) -> LocationData:
        """Add educational data to location"""
        pass


class OpenStreetMapBackend(LocationBackend):
    """
    Uses OpenStreetMap via Overpass API
    Free, no API key required, open source
    """
    
    def __init__(self):
        self.overpass_url = "https://overpass-api.de/api/interpreter"
        logger.info("OpenStreetMapBackend initialized")
    
    async def search_nearby(
        self,
        latitude: float,
        longitude: float,
        radius_meters: int = 5000,
        location_types: Optional[List[str]] = None,
        query: Optional[str] = None
    ) -> List[LocationData]:
        """
        Search using Overpass API
        Returns OSM data for educational locations
        """
        
        # Build Overpass query for educational locations
        location_filters = self._build_osm_filters(location_types, query)
        
        # Radius in degrees (roughly 1 degree = 111km at equator)
        radius_degrees = radius_meters / 111000
        
        overpass_query = f"""
        [out:json][bbox:{latitude - radius_degrees},{longitude - radius_degrees},{latitude + radius_degrees},{longitude + radius_degrees}];
        (
            {location_filters}
        );
        out center;
        """
        
        try:
            client = get_http_client()
            # Sending the raw query via `content=` gives the request no
            # (or the wrong) Content-Type, which Overpass rejects with
            # "406 Not Acceptable" — every search silently fell through
            # to the Nominatim backend as a result, and since Nominatim
            # has no Wikidata link, the enrichment step never had a real
            # POI to enrich, only ever synthesizing generic content.
            # Overpass expects its query as a `data` form field (this is
            # the documented way to POST — see overpass-api.de/api/interpreter);
            # `data=` makes httpx send it as
            # application/x-www-form-urlencoded, which Overpass accepts.
            response = await client.post(
                self.overpass_url,
                data={"data": overpass_query},
                # The public Overpass instance has been intermittently
                # unreachable from this deployment ("All connection
                # attempts failed" — a connect-level failure, not a slow
                # response), likely rate-limiting/blocking after repeated
                # testing. Search now runs all backends concurrently
                # (see MultiBackendLocationService.search_nearby), so
                # this timeout is the effective floor on total search
                # latency whenever Overpass is unreachable — Overpass,
                # when reachable, responds in well under a second for a
                # bbox this small, so 5s is still generous for the
                # success case while capping the failure case tighter
                # than the previous 8s (itself already cut from 30s).
                timeout=5,
                # Overpass's public instance usage policy rejects requests
                # with no/generic User-Agent — this call had none at all
                # (unlike NominatimBackend below, which already sets one),
                # which is the likely other half of the 406 behavior.
                headers={"User-Agent": "PeripateticwareApp/1.0 (contact: support@peripateticware.com)"},
            )

            if response.status_code == 200:
                data = response.json()
                locations = self._parse_osm_response(data)
                return locations
            else:
                logger.error(f"Overpass API error: {response.status_code}")
                return []

        except Exception as e:
            logger.error(f"Error querying Overpass API: {e}")
            return []
    
    async def enrich_location(
        self,
        location: LocationData,
        subject: Optional[str] = None
    ) -> LocationData:
        """Enrich OSM data with Wikidata/Wikipedia"""

        # Get Wikidata ID from OSM tags if available
        if not location.wikidata_id:
            location = await fetch_wikidata_id_by_name(location)

        # Fetch from Wikidata
        if location.wikidata_id:
            location = await enrich_with_wikidata(location)

        # Fetch from Wikipedia
        if location.wikipedia_url:
            location = await enrich_with_wikipedia(location)

        # Add educational metadata
        location = add_educational_metadata(location, subject)

        location.source = "openstreetmap"
        return location
    
    def _build_osm_filters(self, location_types: Optional[List[str]], query: Optional[str]) -> str:
        """Build Overpass API query filters"""

        filters = []

        # Default educational locations if no types specified
        if not location_types:
            location_types = [
                "museum", "historic", "monument", "artwork",
                "park", "library", "school", "university"
            ]

        # Map location types to OSM tag filters. NOTE: these are just the
        # ["tag"="value"] part — the node/way/relation prefix is applied
        # below for each, not baked in here.
        #
        # Real POIs are frequently mapped as ways or relations rather than
        # nodes — parks, university/school campuses, and many museum
        # buildings are almost always polygons (way/relation), not a single
        # point. A node-only query silently matches zero results for these,
        # which made search fall through to the bare Nominatim backend (no
        # Wikidata link -> no enrichment -> placeholder-looking output) even
        # though Overpass itself was responding successfully.
        type_mapping = {
            "museum": '["tourism"="museum"]',
            "historic": '["historic"]',
            "monument": '["historic"="monument"]',
            "artwork": '["artwork"]',
            "park": '["leisure"="park"]',
            "library": '["amenity"="library"]',
            "school": '["amenity"="school"]',
            "university": '["amenity"="university"]',
            "statue": '["artwork_type"="statue"]',
            "building": '["building:type"]',
            "garden": '["leisure"="garden"]',
            "memorial": '["historic"="memorial"]',
        }

        for loc_type in location_types:
            tag_filter = type_mapping.get(loc_type)
            if tag_filter:
                filters.append(f"node{tag_filter}")
                filters.append(f"way{tag_filter}")
                filters.append(f"relation{tag_filter}")

        # Add custom query if provided
        if query:
            filters.append(f'node["name"~"{query}"]')
            filters.append(f'way["name"~"{query}"]')

        # Every filter is a standalone Overpass QL statement and MUST end in
        # its own ";" — including the last one. The previous
        # `";".join(filters)` only put a ";" *between* items, so the final
        # filter in the union block had no terminator before the closing
        # ");", which is a hard Overpass syntax error. Once the earlier
        # Content-Type/User-Agent fix let requests actually reach Overpass's
        # parser, every real query started failing on this — Overpass
        # returned a non-200 parse-error response, the code logged it and
        # returned [], and search silently fell back to bare Nominatim again.
        # That's the actual reason results kept coming back as placeholders
        # even after the transport-level fix.
        if not filters:
            return 'node["tourism"];way["tourism"];'
        return "".join(f"{f};" for f in filters)
    
    def _parse_osm_response(self, data: Dict) -> List[LocationData]:
        """Parse Overpass API response"""
        locations = []

        for element in data.get("elements", []):
            el_type = element.get("type")
            if el_type not in ("node", "way", "relation"):
                continue

            tags = element.get("tags", {})
            if not tags:
                # Untagged elements (e.g. plain geometry nodes that make up
                # a way) aren't real POIs — skip them.
                continue

            # Nodes carry lat/lon directly; with `out center;` ways and
            # relations instead carry a computed "center" object. Without
            # this branch, way/relation results (most parks, campuses, and
            # many museum buildings) silently got lat=0, lon=0.
            if el_type == "node":
                lat = element.get("lat", 0)
                lon = element.get("lon", 0)
            else:
                center = element.get("center", {})
                lat = center.get("lat", 0)
                lon = center.get("lon", 0)

            location = LocationData(
                name=tags.get("name", "Unnamed Location"),
                latitude=lat,
                longitude=lon,
                location_type=self._classify_osm_location(tags),
                address=self._build_osm_address(tags),
                # Include element type in place_id — a way and a node can
                # share the same numeric OSM id, so this avoids collisions.
                place_id=f"osm_{el_type}_{element.get('id')}",
                description=tags.get("description", tags.get("name:en")),
                wikipedia_url=self._extract_wikipedia_url(tags),
                wikidata_id=tags.get("wikidata"),
                architect_or_artist=tags.get("architect", tags.get("artist")),
                construction_date=tags.get("start_date", tags.get("opening_date")),
                source="openstreetmap"
            )

            locations.append(location)

        return locations[:20]  # Limit to 20 results
    
    def _classify_osm_location(self, tags: Dict) -> str:
        """Classify location type from OSM tags"""
        if tags.get("tourism") == "museum":
            return "museum"
        elif tags.get("historic"):
            if "statue" in tags.get("artwork_type", "").lower():
                return "statue"
            return "historic"
        elif tags.get("artwork"):
            return "artwork"
        elif tags.get("leisure") == "park":
            return "park"
        elif tags.get("amenity") == "library":
            return "library"
        elif tags.get("building"):
            return "building"
        else:
            return "point_of_interest"
    
    def _build_osm_address(self, tags: Dict) -> str:
        """Build address from OSM tags"""
        address_parts = []
        
        if tags.get("addr:street"):
            address_parts.append(tags.get("addr:street"))
        if tags.get("addr:housenumber"):
            address_parts.append(tags.get("addr:housenumber"))
        if tags.get("addr:city"):
            address_parts.append(tags.get("addr:city"))
        if tags.get("addr:postcode"):
            address_parts.append(tags.get("addr:postcode"))
        
        return ", ".join(address_parts) if address_parts else tags.get("name", "")
    
    def _extract_wikipedia_url(self, tags: Dict) -> Optional[str]:
        """Extract Wikipedia URL from OSM tags"""
        if tags.get("wikipedia"):
            lang = tags.get("wikipedia").split(":")[0] if ":" in tags.get("wikipedia") else "en"
            title = tags.get("wikipedia").split(":")[-1]
            return f"https://{lang}.wikipedia.org/wiki/{title}"
        return None
    

# ─────────────────────────────────────────────────────────────────────────
# Shared Wikidata/Wikipedia enrichment helpers
#
# Pulled out of OpenStreetMapBackend so WikipediaGeosearchBackend (below)
# can reuse the exact same enrichment pipeline. OpenStreetMapBackend's job
# was always split into two steps: Overpass finds a candidate POI (name +
# maybe a wikidata tag), then these functions add the actual educational
# content from Wikidata/Wikipedia. WikipediaGeosearchBackend does discovery
# a different way (Wikipedia's own geosearch) but needs the same enrichment
# step afterward, hence sharing this code instead of duplicating it.
# ─────────────────────────────────────────────────────────────────────────

async def fetch_wikidata_id_by_name(location: LocationData) -> LocationData:
    """Fetch Wikidata ID by searching Wikidata for the location's name"""
    if location.name:
        try:
            client = get_http_client()
            response = await client.get(
                "https://www.wikidata.org/w/api.php",
                params={
                    "action": "wbsearchentities",
                    "search": location.name,
                    "language": "en",
                    "format": "json"
                },
            )

            if response.status_code == 200:
                data = response.json()
                if data.get("search"):
                    location.wikidata_id = data["search"][0]["id"]
        except Exception as e:
            logger.warning(f"Could not fetch Wikidata ID: {e}")

    return location


async def enrich_with_wikidata(location: LocationData) -> LocationData:
    """Fetch enrichment data from Wikidata"""
    if not location.wikidata_id:
        return location

    try:
        client = get_http_client()
        response = await client.get(
            "https://www.wikidata.org/wiki/Special:EntityData/{}.json".format(
                location.wikidata_id
            ),
        )

        if response.status_code == 200:
            data = response.json()
            entity = data["entities"].get(location.wikidata_id, {})

            # Extract claims (statements)
            claims = entity.get("claims", {})

            # Get image
            if "P18" in claims:  # image
                try:
                    image_title = claims["P18"][0]["mainsnak"]["datavalue"]["value"]
                    location.image_url = f"https://commons.wikimedia.org/wiki/Special:FilePath/{image_title}"
                except:
                    pass

            # Get description (short, one-line — Wikidata's own summary,
            # e.g. "tower located on the Champ de Mars in Paris, France").
            # Only used as a fallback when nothing better is set yet —
            # enrich_with_wikipedia's full article synopsis is what
            # "points of interest about the location" actually means,
            # and must never get clobbered by this one-liner regardless
            # of which function happens to run first.
            if not location.description and "en" in entity.get("descriptions", {}):
                location.description = entity["descriptions"]["en"]["value"]

            # Cross-link to the English Wikipedia article via Wikidata's
            # own sitelinks. OSM tags frequently carry a wikidata= tag
            # without a matching wikipedia= tag (or no tags at all, when
            # we got here via the name-search fallback) — without this,
            # location.wikipedia_url stays empty, enrich_with_wikipedia()
            # never runs, and the panel is stuck showing only the short
            # Wikidata description above instead of a real synopsis.
            if not location.wikipedia_url:
                enwiki_title = entity.get("sitelinks", {}).get("enwiki", {}).get("title")
                if enwiki_title:
                    location.wikipedia_url = f"https://en.wikipedia.org/wiki/{enwiki_title.replace(' ', '_')}"

            # Get inception date
            if "P571" in claims:  # inception
                try:
                    location.construction_date = claims["P571"][0]["mainsnak"]["datavalue"]["value"]["time"]
                except:
                    pass

            # Get creator/artist. Falls back to "architect" (P84)
            # for buildings, since P170 (creator) is mostly used for
            # artworks. Either way this is a Wikidata *entity ID*
            # (e.g. "Q42"), not a name — resolve it to a human
            # -readable label below, otherwise the panel shows a raw
            # Q-code, which is exactly the kind of placeholder-
            # looking junk this was supposed to fix.
            creator_id = None
            for prop in ("P170", "P84"):
                if prop in claims:
                    try:
                        creator_id = claims[prop][0]["mainsnak"]["datavalue"]["value"]["id"]
                        break
                    except Exception:
                        continue

            if creator_id:
                try:
                    label_resp = await client.get(
                        "https://www.wikidata.org/w/api.php",
                        params={
                            "action": "wbgetentities",
                            "ids": creator_id,
                            "props": "labels",
                            "languages": "en",
                            "format": "json",
                        },
                    )
                    if label_resp.status_code == 200:
                        label_data = label_resp.json()
                        label = (
                            label_data.get("entities", {})
                            .get(creator_id, {})
                            .get("labels", {})
                            .get("en", {})
                            .get("value")
                        )
                        location.architect_or_artist = label or creator_id
                except Exception:
                    location.architect_or_artist = creator_id

    except Exception as e:
        logger.warning(f"Error enriching with Wikidata: {e}")

    return location


async def enrich_with_wikipedia(location: LocationData) -> LocationData:
    """Fetch enrichment from Wikipedia"""
    if not location.wikipedia_url:
        return location

    try:
        # Extract page title
        title = location.wikipedia_url.split("/wiki/")[-1]

        client = get_http_client()
        response = await client.get(
            "https://en.wikipedia.org/w/api.php",
            params={
                "action": "query",
                "titles": title,
                # pageprops added so we can pull the linked Wikidata QID
                # (wikibase_item) from this same response — previously a
                # separate wbsearchentities round trip to Wikidata was
                # always made afterward to find it by name-matching,
                # which is both slower (one more network hop in the
                # critical path) and less reliable (name search can
                # match the wrong entity). One fewer sequential request
                # when this succeeds.
                "prop": "extracts|pageimages|pageprops",
                "exintro": True,
                "explaintext": True,
                "format": "json"
            },
        )

        if response.status_code == 200:
            data = response.json()
            pages = data.get("query", {}).get("pages", {})

            for page_id, page in pages.items():
                if page_id != "-1":
                    if "extract" in page:
                        # 500 chars was one clipped sentence — not what
                        # "tell me interesting points about this place"
                        # means. `exintro=True` already limits this to
                        # just the lead section (before the first
                        # heading), so it won't run away into the whole
                        # article; 2000 chars comfortably fits a full
                        # multi-sentence synopsis for most landmarks.
                        location.description = page["extract"][:2000]
                    if "thumbnail" in page:
                        location.image_url = page["thumbnail"]["source"]
                    if not location.wikidata_id:
                        qid = page.get("pageprops", {}).get("wikibase_item")
                        if qid:
                            location.wikidata_id = qid

    except Exception as e:
        logger.warning(f"Error enriching with Wikipedia: {e}")

    return location


def add_educational_metadata(location: LocationData, subject: Optional[str]) -> LocationData:
    """Add educational context based on location type and subject"""

    type_subjects = {
        "museum": ["history", "art", "culture", "science"],
        "historic": ["history", "culture", "social_studies"],
        "monument": ["history", "civics", "social_studies"],
        "artwork": ["art", "culture", "history"],
        "statue": ["art", "history", "civics"],
        "park": ["ecology", "biology", "environmental_science"],
        "library": ["literature", "research", "information_literacy"],
        "school": ["social_studies", "community"],
        "university": ["higher_education", "research"],
        "building": ["architecture", "history"],
        "garden": ["ecology", "botany", "landscape_design"],
    }

    location.subjects = type_subjects.get(location.location_type, ["social_studies", "history"])

    if subject and subject.lower() not in [s.lower() for s in location.subjects]:
        location.subjects.append(subject)

    location.keywords = [location.location_type, location.name.lower()]

    # Add learning opportunities based on type
    opportunities = {
        "museum": [
            "Observe and analyze artifacts",
            "Learn about historical periods",
            "Study curatorial methods"
        ],
        "historic": [
            "Study historical context",
            "Analyze primary sources",
            "Understand cultural significance"
        ],
        "artwork": [
            "Analyze artistic techniques",
            "Study artist's context",
            "Understand artistic movements"
        ],
        "park": [
            "Observe ecosystems",
            "Study biodiversity",
            "Measure environmental data"
        ],
    }

    location.learning_opportunities = opportunities.get(location.location_type, [
        "Observation and exploration",
        "Research and discovery",
        "Community engagement"
    ])

    return location


class NominatimBackend(LocationBackend):
    """
    Uses Nominatim (OpenStreetMap Geocoding)
    Free geocoding and reverse geocoding
    """
    
    def __init__(self):
        self.nominatim_url = "https://nominatim.openstreetmap.org"
        logger.info("NominatimBackend initialized")
    
    async def search_nearby(
        self,
        latitude: float,
        longitude: float,
        radius_meters: int = 5000,
        location_types: Optional[List[str]] = None,
        query: Optional[str] = None
    ) -> List[LocationData]:
        """Search using Nominatim reverse geocoding"""
        
        try:
            client = get_http_client()
            response = await client.get(
                f"{self.nominatim_url}/reverse",
                params={
                    "lat": latitude,
                    "lon": longitude,
                    "radius": min(radius_meters, 5000),  # Nominatim limit
                    "zoom": 17,
                    "format": "json"
                },
                timeout=10,
            )

            if response.status_code == 200:
                data = response.json()
                # Nominatim returns single result, use with OSM for better results
                raw_address = data.get("address", {})
                if isinstance(raw_address, dict):
                    # Build a readable string from Nominatim's address object
                    parts = [
                        raw_address.get("road", ""),
                        raw_address.get("city") or raw_address.get("town") or raw_address.get("village", ""),
                        raw_address.get("state", ""),
                        raw_address.get("postcode", ""),
                    ]
                    address_str = ", ".join(p for p in parts if p)
                else:
                    address_str = str(raw_address)

                location = LocationData(
                    name=data.get("name") or data.get("display_name", "Location"),
                    latitude=float(data.get("lat")),
                    longitude=float(data.get("lon")),
                    location_type="point_of_interest",
                    address=address_str,
                    place_id=f"nominatim_{data.get('osm_id')}",
                    source="nominatim"
                )
                return [location]
            else:
                return []

        except Exception as e:
            logger.error(f"Error querying Nominatim: {e}")
            return []
    
    async def enrich_location(
        self,
        location: LocationData,
        subject: Optional[str] = None
    ) -> LocationData:
        """Nominatim doesn't provide enrichment, just geocoding"""
        location.source = "nominatim"
        return location


class WikipediaGeosearchBackend(LocationBackend):
    """
    Uses Wikipedia's own geosearch API to discover nearby places directly —
    no dependency on Overpass/OSM at all.

    Why this exists: the OSM pipeline above is a two-step process — Overpass
    finds a candidate POI (by OSM tag: museum, park, etc.), and only *then*
    do we look it up on Wikidata/Wikipedia for the actual educational
    content. There was never a discovery path that used Wikipedia/Wikidata
    directly to *find* nearby places — Wikidata/Wikipedia were only ever
    used for enrichment after OSM found something. So when Overpass is slow,
    rate-limited, or (as observed in this deployment) outright unreachable,
    search falls all the way through to bare Nominatim, which has no
    Wikidata link and therefore no real content to show.

    Wikipedia's `list=geosearch` API finds real, named, documented places
    near a coordinate directly (Wikimedia Foundation infrastructure — much
    more reliably available than the community-run public Overpass
    instance). This backend uses it as a second, independent discovery path,
    then reuses the exact same Wikidata/Wikipedia enrichment pipeline as
    OpenStreetMapBackend (see the shared helper functions above) so the
    output shape is identical either way.
    """

    def __init__(self):
        logger.info("WikipediaGeosearchBackend initialized")

    async def search_nearby(
        self,
        latitude: float,
        longitude: float,
        radius_meters: int = 5000,
        location_types: Optional[List[str]] = None,
        query: Optional[str] = None
    ) -> List[LocationData]:
        """Search using Wikipedia's geosearch API (list=geosearch)"""

        # Wikipedia's geosearch caps gsradius at 10,000 meters.
        gsradius = min(radius_meters, 10000)

        try:
            client = get_http_client()
            response = await client.get(
                "https://en.wikipedia.org/w/api.php",
                params={
                    "action": "query",
                    "list": "geosearch",
                    "gscoord": f"{latitude}|{longitude}",
                    "gsradius": gsradius,
                    "gslimit": 20,
                    "format": "json",
                },
            )

            if response.status_code != 200:
                logger.error(f"Wikipedia geosearch error: {response.status_code}")
                return []

            data = response.json()
            results = data.get("query", {}).get("geosearch", [])

            locations = []
            for r in results:
                title = r.get("title")
                if not title:
                    continue
                locations.append(LocationData(
                    name=title,
                    latitude=r.get("lat", latitude),
                    longitude=r.get("lon", longitude),
                    location_type="point_of_interest",
                    address="",
                    # pageid is stable and unique — safer than slugifying
                    # the title, which can contain characters place_id
                    # lookups elsewhere don't expect.
                    place_id=f"wikipedia_{r.get('pageid')}",
                    wikipedia_url=f"https://en.wikipedia.org/wiki/{title.replace(' ', '_')}",
                    source="wikipedia",
                ))

            return locations[:20]

        except Exception as e:
            logger.error(f"Error querying Wikipedia geosearch: {e}")
            return []

    async def enrich_location(
        self,
        location: LocationData,
        subject: Optional[str] = None
    ) -> LocationData:
        """Enrich a Wikipedia-discovered place with Wikidata + full extract"""

        # This method is reached via two different entry paths with
        # different starting state, and both must end up with a Wikipedia
        # synopsis whenever one exists:
        #   A) Straight from search_nearby() in the same request —
        #      wikipedia_url is already set (every WikipediaGeosearchBackend
        #      result carries it), wikidata_id is not.
        #   B) Reconstructed from the CachedLocation DB row by place_id (the
        #      GET /locations/{place_id}/enrich cache-miss path, see
        #      routes/privacy_locations.py) — CachedLocation has no
        #      wikipedia_url column, so BOTH fields start unset and only the
        #      name is known.
        #
        # Path B needs a Wikidata QID resolved by name first, so that
        # enrich_with_wikidata's sitelinks cross-link can populate
        # wikipedia_url — only then can Wikipedia be queried at all. Skipping
        # straight to "if location.wikipedia_url" (as a prior version of this
        # method did, for a modest perf win on Path A) silently no-ops on
        # Path B: wikipedia_url never gets set, so the real synopsis is
        # never fetched — regressing to Wikidata's terse one-line
        # description, which is what broke Central Park Conservancy and the
        # Lincoln Memorial (both reached via the /enrich cache-miss path).
        wikidata_enriched = False
        if not location.wikipedia_url and not location.wikidata_id:
            location = await fetch_wikidata_id_by_name(location)
            if location.wikidata_id:
                location = await enrich_with_wikidata(location)
                wikidata_enriched = True

        # Path A (wikipedia_url already set) lands here directly; Path B
        # lands here only if the block above successfully resolved a
        # sitelinked Wikipedia article. Either way, this also picks up a
        # Wikidata QID via pageprops in the same request when one wasn't
        # already found, saving the separate name-search below.
        if location.wikipedia_url:
            location = await enrich_with_wikipedia(location)

        # Final fallback: still no QID (e.g. Path A where the article has no
        # linked Wikidata item, or Path B where the name search above found
        # nothing), or a QID was found but not yet enriched. Guarded by
        # wikidata_enriched so Path B — which already fetched and enriched
        # via the block above — doesn't pay for a second, redundant
        # Special:EntityData round trip.
        if not wikidata_enriched:
            if not location.wikidata_id:
                location = await fetch_wikidata_id_by_name(location)
            if location.wikidata_id:
                location = await enrich_with_wikidata(location)

        location = add_educational_metadata(location, subject)

        location.source = "wikipedia"
        return location


class MultiBackendLocationService:
    """
    Multi-backend location service
    Tries backends in order specified by LOCATION_BACKEND env var
    """
    
    def __init__(self):
        backend_config = os.getenv(
            "LOCATION_BACKEND",
            # Try Overpass first (best when it's reachable — structured POI
            # types), then Wikipedia geosearch (reliable, real enrichable
            # places, no OSM dependency), then bare Nominatim geocoding as
            # the last resort (name/address only, never enriched — this is
            # what was producing the "placeholder" panels).
            "openstreetmap,wikipedia,nominatim"  # Free defaults
        )
        
        self.backend_names = [b.strip() for b in backend_config.split(",")]
        self.backends = self._initialize_backends()
        
        logger.info(f"MultiBackendLocationService using backends: {self.backend_names}")
    
    def _initialize_backends(self) -> Dict[str, LocationBackend]:
        """Initialize requested backends"""
        backends = {}
        
        backend_classes = {
            "openstreetmap": OpenStreetMapBackend,
            "wikipedia": WikipediaGeosearchBackend,
            "nominatim": NominatimBackend,
        }
        
        for backend_name in self.backend_names:
            if backend_name in backend_classes:
                try:
                    backends[backend_name] = backend_classes[backend_name]()
                except Exception as e:
                    logger.error(f"Error initializing {backend_name}: {e}")
        
        return backends
    
    async def search_nearby(
        self,
        latitude: float,
        longitude: float,
        radius_meters: int = 5000,
        location_types: Optional[List[str]] = None,
        query: Optional[str] = None
    ) -> List[LocationData]:
        """
        Search all configured backends concurrently, then pick a result by
        LOCATION_BACKEND priority order.

        This used to try backends strictly one at a time, `await`-ing each in
        turn — when the first (Overpass) was slow or unreachable, every
        single search paid its FULL timeout before Wikipedia/Nominatim even
        started, even though those don't depend on Overpass's outcome at
        all. That serial wait was the main source of "it loads slowly."
        Running them concurrently bounds total latency to the slowest
        backend instead of the sum of all of them, while keeping the exact
        same priority behavior (prefer Overpass's results when available).
        """
        active_names = [n for n in self.backend_names if n in self.backends]
        if not active_names:
            logger.warning("No backends available for search")
            return []

        results = await asyncio.gather(
            *[
                self.backends[name].search_nearby(
                    latitude, longitude, radius_meters, location_types, query
                )
                for name in active_names
            ],
            return_exceptions=True,
        )

        for name, result in zip(active_names, results):
            if isinstance(result, Exception):
                logger.warning(f"Error with {name} backend: {result}")
                continue
            if result:
                logger.info(f"Using results from {name} backend ({len(result)} found)")
                return result

        logger.warning("No backends returned results")
        return []
    
    async def enrich_location(
        self,
        location: LocationData,
        subject: Optional[str] = None
    ) -> LocationData:
        """Enrich using location's source backend or first available"""
        
        backend_to_use = location.source if location.source in self.backends else self.backend_names[0]
        
        if backend_to_use in self.backends:
            try:
                return await self.backends[backend_to_use].enrich_location(location, subject)
            except Exception as e:
                logger.warning(f"Error enriching with {backend_to_use}: {e}")
        
        return location


# Singleton instance
_location_service: Optional[MultiBackendLocationService] = None


def get_location_service() -> MultiBackendLocationService:
    """Get or create location service singleton"""
    global _location_service
    
    if _location_service is None:
        _location_service = MultiBackendLocationService()
    
    return _location_service
