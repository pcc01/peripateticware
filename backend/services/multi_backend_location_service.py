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
import logging
import httpx
from datetime import datetime
from abc import ABC, abstractmethod
import os
import json

logger = logging.getLogger(__name__)


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
        [bbox:{latitude - radius_degrees},{longitude - radius_degrees},{latitude + radius_degrees},{longitude + radius_degrees}];
        (
            {location_filters}
        );
        out geom;
        """
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    self.overpass_url,
                    content=overpass_query,
                    timeout=30
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
            location = await self._fetch_wikidata_id(location)
        
        # Fetch from Wikidata
        if location.wikidata_id:
            location = await self._enrich_with_wikidata(location)
        
        # Fetch from Wikipedia
        if location.wikipedia_url:
            location = await self._enrich_with_wikipedia(location)
        
        # Add educational metadata
        location = self._add_educational_metadata(location, subject)
        
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
        
        # Map location types to OSM tags
        type_mapping = {
            "museum": 'node["tourism"="museum"]',
            "historic": 'node["historic"]',
            "monument": 'node["historic"="monument"]',
            "artwork": 'node["artwork"]',
            "park": 'node["leisure"="park"]',
            "library": 'node["amenity"="library"]',
            "school": 'node["amenity"="school"]',
            "university": 'node["amenity"="university"]',
            "statue": 'node["artwork_type"="statue"]',
            "building": 'node["building:type"]',
            "garden": 'node["leisure"="garden"]',
            "memorial": 'node["historic"="memorial"]',
        }
        
        for loc_type in location_types:
            if loc_type in type_mapping:
                filters.append(type_mapping[loc_type])
        
        # Add custom query if provided
        if query:
            filters.append(f'node["name"~"{query}"]')
        
        return ";".join(filters) if filters else 'node["tourism"]'
    
    def _parse_osm_response(self, data: Dict) -> List[LocationData]:
        """Parse Overpass API response"""
        locations = []
        
        for element in data.get("elements", []):
            if element.get("type") == "node":
                tags = element.get("tags", {})
                
                location = LocationData(
                    name=tags.get("name", "Unnamed Location"),
                    latitude=element.get("lat", 0),
                    longitude=element.get("lon", 0),
                    location_type=self._classify_osm_location(tags),
                    address=self._build_osm_address(tags),
                    place_id=f"osm_{element.get('id')}",
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
    
    async def _fetch_wikidata_id(self, location: LocationData) -> LocationData:
        """Fetch Wikidata ID from Wikipedia or by searching"""
        if location.wikipedia_url:
            # Extract title from Wikipedia URL
            title = location.wikipedia_url.split("/wiki/")[-1]
            
            try:
                async with httpx.AsyncClient() as client:
                    # Query Wikidata for the page
                    response = await client.get(
                        "https://www.wikidata.org/w/api.php",
                        params={
                            "action": "wbsearchentities",
                            "search": location.name,
                            "language": "en",
                            "format": "json"
                        },
                        timeout=10
                    )
                    
                    if response.status_code == 200:
                        data = response.json()
                        if data.get("search"):
                            location.wikidata_id = data["search"][0]["id"]
            except Exception as e:
                logger.warning(f"Could not fetch Wikidata ID: {e}")
        
        return location
    
    async def _enrich_with_wikidata(self, location: LocationData) -> LocationData:
        """Fetch enrichment data from Wikidata"""
        if not location.wikidata_id:
            return location
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    "https://www.wikidata.org/wiki/Special:EntityData/{}.json".format(
                        location.wikidata_id
                    ),
                    timeout=10
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
                    
                    # Get description
                    if "en" in entity.get("descriptions", {}):
                        location.description = entity["descriptions"]["en"]["value"]
                    
                    # Get inception date
                    if "P571" in claims:  # inception
                        try:
                            location.construction_date = claims["P571"][0]["mainsnak"]["datavalue"]["value"]["time"]
                        except:
                            pass
                    
                    # Get creator/artist
                    if "P170" in claims:  # creator
                        try:
                            creator_id = claims["P170"][0]["mainsnak"]["datavalue"]["value"]["id"]
                            location.architect_or_artist = creator_id
                        except:
                            pass
        
        except Exception as e:
            logger.warning(f"Error enriching with Wikidata: {e}")
        
        return location
    
    async def _enrich_with_wikipedia(self, location: LocationData) -> LocationData:
        """Fetch enrichment from Wikipedia"""
        if not location.wikipedia_url:
            return location
        
        try:
            # Extract page title
            title = location.wikipedia_url.split("/wiki/")[-1]
            
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    "https://en.wikipedia.org/w/api.php",
                    params={
                        "action": "query",
                        "titles": title,
                        "prop": "extracts|pageimages",
                        "exintro": True,
                        "explaintext": True,
                        "format": "json"
                    },
                    timeout=10
                )
                
                if response.status_code == 200:
                    data = response.json()
                    pages = data.get("query", {}).get("pages", {})
                    
                    for page_id, page in pages.items():
                        if page_id != "-1":
                            if "extract" in page:
                                location.description = page["extract"][:500]
                            if "thumbnail" in page:
                                location.image_url = page["thumbnail"]["source"]
        
        except Exception as e:
            logger.warning(f"Error enriching with Wikipedia: {e}")
        
        return location
    
    def _add_educational_metadata(self, location: LocationData, subject: Optional[str]) -> LocationData:
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
            async with httpx.AsyncClient() as client:
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
                    headers={"User-Agent": "PeripateticwareApp/1.0"}
                )
                
                if response.status_code == 200:
                    data = response.json()
                    # Nominatim returns single result, use with OSM for better results
                    location = LocationData(
                        name=data.get("name", "Location"),
                        latitude=float(data.get("lat")),
                        longitude=float(data.get("lon")),
                        location_type="point_of_interest",
                        address=data.get("address", ""),
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


class MultiBackendLocationService:
    """
    Multi-backend location service
    Tries backends in order specified by LOCATION_BACKEND env var
    """
    
    def __init__(self):
        backend_config = os.getenv(
            "LOCATION_BACKEND",
            "openstreetmap,nominatim"  # Free defaults
        )
        
        self.backend_names = [b.strip() for b in backend_config.split(",")]
        self.backends = self._initialize_backends()
        
        logger.info(f"MultiBackendLocationService using backends: {self.backend_names}")
    
    def _initialize_backends(self) -> Dict[str, LocationBackend]:
        """Initialize requested backends"""
        backends = {}
        
        backend_classes = {
            "openstreetmap": OpenStreetMapBackend,
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
        """Search using first available backend"""
        
        for backend_name in self.backend_names:
            if backend_name not in self.backends:
                continue
            
            try:
                logger.info(f"Searching with {backend_name} backend")
                locations = await self.backends[backend_name].search_nearby(
                    latitude, longitude, radius_meters, location_types, query
                )
                
                if locations:
                    return locations
            
            except Exception as e:
                logger.warning(f"Error with {backend_name} backend: {e}")
                continue
        
        logger.warning("No backends available for search")
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
