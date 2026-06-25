# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

# Wikimedia Location Service
# File: backend/services/wikimedia_service.py

"""Service for fetching location context from Wikipedia and Wikidata APIs"""

import httpx
import logging
import hashlib
from typing import Optional, Dict, Any
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import select

logger = logging.getLogger(__name__)


class WikimediaLocationService:
    """
    Fetches location context from Wikimedia APIs (Wikipedia, Wikidata)
    
    Uses:
    - Wikipedia API for articles and extracts
    - Wikidata API for structured data
    - Reverse geocoding to find nearby articles
    """
    
    WIKIPEDIA_API_URL = "https://en.wikipedia.org/w/api.php"
    WIKIDATA_API_URL = "https://www.wikidata.org/w/api.php"
    REVERSE_GEOCODE_API_URL = "https://en.wikipedia.org/w/api.php"
    
    TIMEOUT = 10  # seconds
    
    @staticmethod
    def create_location_hash(latitude: float, longitude: float) -> str:
        """Create consistent hash for lat/lng coordinates"""
        rounded = f"{latitude:.4f}_{longitude:.4f}"
        return hashlib.md5(rounded.encode()).hexdigest()
    
    @classmethod
    async def get_location_context(
        cls,
        latitude: float,
        longitude: float,
        location_name: str,
        db: Session = None,
        use_cache: bool = True
    ) -> Dict[str, Any]:
        """
        Get comprehensive location context from Wikimedia
        
        Args:
            latitude: Location latitude
            longitude: Location longitude
            location_name: Human-readable location name
            db: SQLAlchemy session (for caching)
            use_cache: Whether to use cached results
        
        Returns:
            {
                "location_name": "San Francisco",
                "wikipedia": {
                    "title": "San Francisco",
                    "extract": "San Francisco is the cultural, commercial...",
                    "url": "https://en.wikipedia.org/wiki/San_Francisco",
                    "image_url": "..."
                },
                "wikidata": {
                    "id": "Q62",
                    "description": "city in California, United States",
                    "claims": {...}
                },
                "geographic_features": {
                    "elevation_m": 52,
                    "population": 873965,
                    "timezone": "America/Los_Angeles"
                },
                "educational_value": "San Francisco offers excellent opportunities...",
                "success": true
            }
        """
        
        try:
            # Check cache first if database available
            if db and use_cache:
                location_hash = cls.create_location_hash(latitude, longitude)
                from models.assessment import LocationContext
                
                cached = db.query(LocationContext).filter(
                    LocationContext.location_hash == location_hash
                ).first()
                
                if cached and cached.cache_valid_until and cached.cache_valid_until > datetime.utcnow():
                    logger.info(f"Cache hit for {location_name}")
                    return cls._format_location_context(cached)
            
            # Fetch from APIs
            async with httpx.AsyncClient(timeout=cls.TIMEOUT) as client:
                # 1. Reverse geocode to find nearby Wikipedia article
                nearby_articles = await cls._find_nearby_articles(
                    client, latitude, longitude
                )
                
                wikipedia_data = None
                wikidata_data = None
                
                if nearby_articles:
                    article_title = nearby_articles[0]
                    
                    # 2. Fetch Wikipedia article
                    wikipedia_data = await cls._fetch_wikipedia_article(
                        client, article_title
                    )
                    
                    # 3. Get Wikidata ID and fetch Wikidata
                    if wikipedia_data:
                        wikidata_id = await cls._get_wikidata_id(
                            client, article_title
                        )
                        if wikidata_id:
                            wikidata_data = await cls._fetch_wikidata(
                                client, wikidata_id
                            )
                
                # 4. Compile context
                context = {
                    "location_name": location_name,
                    "latitude": latitude,
                    "longitude": longitude,
                    "wikipedia": wikipedia_data or {},
                    "wikidata": wikidata_data or {},
                    "geographic_features": await cls._extract_geographic_features(
                        wikidata_data or {}
                    ),
                    "educational_value": cls._generate_educational_summary(
                        wikipedia_data, wikidata_data
                    ),
                    "success": bool(wikipedia_data or wikidata_data)
                }
                
                # 5. Cache result if database available
                if db and (wikipedia_data or wikidata_data):
                    await cls._cache_location_context(
                        db, latitude, longitude, location_name, context
                    )
                
                return context
        
        except Exception as e:
            logger.error(f"Error fetching location context for {location_name}: {e}")
            return {
                "location_name": location_name,
                "latitude": latitude,
                "longitude": longitude,
                "wikipedia": {},
                "wikidata": {},
                "geographic_features": {},
                "educational_value": None,
                "success": False,
                "error": str(e)
            }
    
    @staticmethod
    async def _find_nearby_articles(
        client: httpx.AsyncClient,
        latitude: float,
        longitude: float,
        radius_km: int = 10
    ) -> list:
        """
        Find Wikipedia articles near coordinates using geosearch
        
        Returns list of article titles, ordered by distance
        """
        try:
            params = {
                "action": "query",
                "list": "geosearch",
                "gscoord": f"{latitude}|{longitude}",
                "gsradius": radius_km * 1000,  # Convert km to meters
                "gslimit": 5,
                "format": "json"
            }
            
            response = await client.get(
                "https://en.wikipedia.org/w/api.php",
                params=params
            )
            response.raise_for_status()
            data = response.json()
            
            articles = [
                item["title"]
                for item in data.get("query", {}).get("geosearch", [])
            ]
            
            logger.info(f"Found {len(articles)} nearby articles: {articles}")
            return articles
        
        except Exception as e:
            logger.error(f"Error in reverse geocode: {e}")
            return []
    
    @staticmethod
    async def _fetch_wikipedia_article(
        client: httpx.AsyncClient,
        title: str
    ) -> Optional[Dict[str, Any]]:
        """Fetch Wikipedia article data"""
        try:
            params = {
                "action": "query",
                "titles": title,
                "prop": "extracts|pageimages|info",
                "explaintext": True,
                "exintro": True,  # Only introduction
                "piprop": "original",
                "format": "json"
            }
            
            response = await client.get(
                "https://en.wikipedia.org/w/api.php",
                params=params
            )
            response.raise_for_status()
            data = response.json()
            
            pages = data.get("query", {}).get("pages", {})
            page = next(iter(pages.values()), None)
            
            if not page or "missing" in page:
                return None
            
            return {
                "title": page.get("title"),
                "extract": page.get("extract", ""),
                "url": f"https://en.wikipedia.org/wiki/{page.get('title', '').replace(' ', '_')}",
                "image_url": page.get("original", {}).get("source") if page.get("original") else None
            }
        
        except Exception as e:
            logger.error(f"Error fetching Wikipedia article '{title}': {e}")
            return None
    
    @staticmethod
    async def _get_wikidata_id(
        client: httpx.AsyncClient,
        title: str
    ) -> Optional[str]:
        """Get Wikidata ID (Q-number) for Wikipedia article"""
        try:
            params = {
                "action": "query",
                "titles": title,
                "prop": "pageprops",
                "format": "json"
            }
            
            response = await client.get(
                "https://en.wikipedia.org/w/api.php",
                params=params
            )
            response.raise_for_status()
            data = response.json()
            
            pages = data.get("query", {}).get("pages", {})
            page = next(iter(pages.values()), None)
            
            if page:
                wikidata_id = page.get("pageprops", {}).get("wikibase_item")
                return wikidata_id
            
            return None
        
        except Exception as e:
            logger.error(f"Error getting Wikidata ID for '{title}': {e}")
            return None
    
    @staticmethod
    async def _fetch_wikidata(
        client: httpx.AsyncClient,
        wikidata_id: str
    ) -> Optional[Dict[str, Any]]:
        """Fetch structured data from Wikidata"""
        try:
            params = {
                "action": "wbgetentities",
                "ids": wikidata_id,
                "props": "descriptions|claims",
                "languages": "en",
                "format": "json"
            }
            
            response = await client.get(
                "https://www.wikidata.org/w/api.php",
                params=params
            )
            response.raise_for_status()
            data = response.json()
            
            entity = data.get("entities", {}).get(wikidata_id, {})
            
            if not entity or "missing" in entity:
                return None
            
            return {
                "id": wikidata_id,
                "description": entity.get("descriptions", {}).get("en", {}).get("value"),
                "claims": entity.get("claims", {})
            }
        
        except Exception as e:
            logger.error(f"Error fetching Wikidata '{wikidata_id}': {e}")
            return None
    
    @staticmethod
    async def _extract_geographic_features(wikidata_data: Dict[str, Any]) -> Dict[str, Any]:
        """Extract geographic features from Wikidata claims"""
        features = {}
        
        try:
            claims = wikidata_data.get("claims", {})
            
            # P625 = coordinate location
            if "P625" in claims:
                coords = claims["P625"][0].get("mainsnak", {}).get("datavalue", {}).get("value")
                if coords:
                    features["latitude"] = coords.get("latitude")
                    features["longitude"] = coords.get("longitude")
            
            # P1566 = GeoNames ID (useful for geographic context)
            if "P1566" in claims:
                features["geonames_id"] = claims["P1566"][0].get("mainsnak", {}).get("datavalue", {}).get("value")
            
            # P1082 = population
            if "P1082" in claims:
                try:
                    features["population"] = int(
                        claims["P1082"][0].get("mainsnak", {}).get("datavalue", {}).get("value", {}).get("amount", 0)
                    )
                except (TypeError, ValueError, KeyError) as pop_err:  # NASA Rule 7: no bare except
                    logger.debug("Could not parse Wikidata population claim: %s", pop_err)
            
            # P17 = country
            if "P17" in claims:
                features["country_id"] = claims["P17"][0].get("mainsnak", {}).get("datavalue", {}).get("value", {}).get("id")
            
            # P625 could also have elevation
            if "P625" in claims:
                precision = claims["P625"][0].get("mainsnak", {}).get("datavalue", {}).get("value", {}).get("precision")
                features["coordinate_precision"] = precision
            
        except Exception as e:
            logger.warning(f"Error extracting geographic features: {e}")
        
        return features
    
    @staticmethod
    def _generate_educational_summary(
        wikipedia_data: Optional[Dict[str, Any]],
        wikidata_data: Optional[Dict[str, Any]]
    ) -> Optional[str]:
        """Generate educational value summary from Wikipedia/Wikidata"""
        
        if not wikipedia_data and not wikipedia_data.get("extract"):
            return None
        
        extract = wikipedia_data.get("extract", "")
        
        if not extract:
            return None
        
        # Use first 2-3 sentences as summary
        sentences = extract.split(". ")[:3]
        summary = ". ".join(sentences)
        
        if summary and not summary.endswith("."):
            summary += "."
        
        return summary
    
    @staticmethod
    def _format_location_context(location_context) -> Dict[str, Any]:
        """Format cached LocationContext model for API response"""
        return {
            "location_name": location_context.location_name,
            "latitude": location_context.latitude,
            "longitude": location_context.longitude,
            "wikipedia": {
                "title": location_context.wikipedia_title,
                "extract": location_context.wikipedia_extract,
                "url": location_context.wikipedia_url,
                "image_url": location_context.wikipedia_image_url
            },
            "wikidata": {
                "id": location_context.wikidata_id,
                "description": location_context.wikidata_description,
                "claims": location_context.wikidata_claims
            },
            "geographic_features": location_context.geographic_features,
            "educational_value": location_context.educational_value,
            "from_cache": True,
            "success": True
        }
    
    @staticmethod
    async def _cache_location_context(
        db: Session,
        latitude: float,
        longitude: float,
        location_name: str,
        context: Dict[str, Any]
    ):
        """Cache location context in database"""
        try:
            from models.assessment import LocationContext
            
            location_hash = WikimediaLocationService.create_location_hash(latitude, longitude)
            
            cached = LocationContext(
                latitude=latitude,
                longitude=longitude,
                location_name=location_name,
                location_hash=location_hash,
                wikipedia_title=context.get("wikipedia", {}).get("title"),
                wikipedia_extract=context.get("wikipedia", {}).get("extract"),
                wikipedia_url=context.get("wikipedia", {}).get("url"),
                wikipedia_image_url=context.get("wikipedia", {}).get("image_url"),
                wikidata_id=context.get("wikidata", {}).get("id"),
                wikidata_description=context.get("wikidata", {}).get("description"),
                wikidata_claims=context.get("wikidata", {}).get("claims"),
                geographic_features=context.get("geographic_features"),
                educational_value=context.get("educational_value"),
                cache_valid_until=datetime.utcnow() + timedelta(days=30)
            )
            
            db.add(cached)
            db.commit()
            logger.info(f"Cached location context for {location_name}")
        
        except Exception as e:
            logger.error(f"Error caching location context: {e}")
            db.rollback()


# Helper function for routes
async def get_location_context_for_activity(
    latitude: float,
    longitude: float,
    location_name: str,
    db: Session = None
) -> Dict[str, Any]:
    """Convenience function for routes"""
    service = WikimediaLocationService()
    return await service.get_location_context(
        latitude, longitude, location_name, db, use_cache=True
    )
