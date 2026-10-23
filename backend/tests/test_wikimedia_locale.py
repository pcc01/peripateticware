# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Tests for locale-aware Wikipedia/Wikidata content
(docs/handoff-peripateticware-localized-wikipedia.md):

- UI locale -> Wikipedia edition code normalization (no fr-ca.wikipedia.org)
- The cache-key bug the design doc explicitly calls out: adding a `lang`
  axis to a fetch without also adding it to the cache key would silently
  serve an English-cached result to a Spanish request for the same
  coordinate (and vice versa).
- enrich_with_wikipedia()'s English fallback when the requested-language
  edition has no article/empty extract, with honest content_language
  reporting (never silently relabeled as the requested language).
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from services.multi_backend_location_service import (
    normalize_wiki_lang,
    enrich_with_wikipedia,
    LocationData,
)
from services.wikimedia_service import WikimediaLocationService


# ===========================================================================
# normalize_wiki_lang
# ===========================================================================

@pytest.mark.parametrize(
    "locale,expected",
    [
        ("fr-CA", "fr"),
        ("pt-BR", "pt"),
        ("zh", "zh"),
        ("ZH", "zh"),
        ("he_IL", "he"),
        (None, "en"),
        ("", "en"),
    ],
)
def test_normalize_wiki_lang(locale, expected):
    assert normalize_wiki_lang(locale) == expected


# ===========================================================================
# Cache key must incorporate lang (section 4 of the design doc)
# ===========================================================================

def test_create_location_hash_differs_by_language():
    """Same coordinate, different requested language -> different hash, so
    an English-cached row is never silently served to a Spanish request
    for that same coordinate (and vice versa)."""
    lat, lon = 48.8584, 2.2945

    hash_en = WikimediaLocationService.create_location_hash(lat, lon, "en")
    hash_es = WikimediaLocationService.create_location_hash(lat, lon, "es")

    assert hash_en != hash_es


def test_create_location_hash_stable_for_same_language():
    lat, lon = 48.8584, 2.2945
    assert (
        WikimediaLocationService.create_location_hash(lat, lon, "fr")
        == WikimediaLocationService.create_location_hash(lat, lon, "fr")
    )


# ===========================================================================
# enrich_with_wikipedia(): English fallback + honest content_language
# ===========================================================================

def _fake_response(status_code, pages):
    resp = MagicMock()
    resp.status_code = status_code
    resp.json.return_value = {"query": {"pages": pages}}
    return resp


@pytest.mark.asyncio
async def test_enrich_with_wikipedia_uses_requested_language_when_available():
    location = LocationData(
        name="Tour Eiffel",
        latitude=48.8584,
        longitude=2.2945,
        location_type="landmark",
        address="",
        place_id="osm_1",
        wikipedia_url="https://fr.wikipedia.org/wiki/Tour_Eiffel",
    )

    fr_response = _fake_response(200, {"123": {"extract": "La tour Eiffel est...", "pageprops": {}}})
    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=fr_response)

    with patch("services.multi_backend_location_service.get_http_client", return_value=mock_client):
        result = await enrich_with_wikipedia(location, lang="fr")

    assert result.description == "La tour Eiffel est..."
    assert result.content_language == "fr"
    # Only the fr.wikipedia.org edition was ever called -- no fallback needed.
    mock_client.get.assert_awaited_once()
    assert "fr.wikipedia.org" in mock_client.get.call_args[0][0]


@pytest.mark.asyncio
async def test_enrich_with_wikipedia_falls_back_to_english_when_requested_lang_empty():
    """The requested-language edition returns no usable extract -> retry
    against English, and honestly report content_language="en" rather
    than silently claiming the requested language."""
    location = LocationData(
        name="Maxwelton, Washington",
        latitude=47.93722,
        longitude=-122.44444,
        location_type="point_of_interest",
        address="",
        place_id="osm_2",
        wikipedia_url="https://fr.wikipedia.org/wiki/Maxwelton,_Washington",
    )

    empty_fr_response = _fake_response(200, {"-1": {"missing": True}})
    en_response = _fake_response(200, {"456": {"extract": "Maxwelton is an unincorporated community...", "pageprops": {}}})

    mock_client = AsyncMock()
    mock_client.get = AsyncMock(side_effect=[empty_fr_response, en_response])

    with patch("services.multi_backend_location_service.get_http_client", return_value=mock_client):
        result = await enrich_with_wikipedia(location, lang="fr")

    assert result.description == "Maxwelton is an unincorporated community..."
    assert result.content_language == "en"
    assert mock_client.get.await_count == 2
    first_url = mock_client.get.call_args_list[0][0][0]
    second_url = mock_client.get.call_args_list[1][0][0]
    assert "fr.wikipedia.org" in first_url
    assert "en.wikipedia.org" in second_url


@pytest.mark.asyncio
async def test_enrich_with_wikipedia_no_fallback_when_already_english():
    """When the requested language is already English, a missing article
    must not trigger a second (redundant) request."""
    location = LocationData(
        name="Nonexistent Place",
        latitude=0.0,
        longitude=0.0,
        location_type="point_of_interest",
        address="",
        place_id="osm_3",
        wikipedia_url="https://en.wikipedia.org/wiki/Nonexistent_Place",
    )

    missing_response = _fake_response(200, {"-1": {"missing": True}})
    mock_client = AsyncMock()
    mock_client.get = AsyncMock(return_value=missing_response)

    with patch("services.multi_backend_location_service.get_http_client", return_value=mock_client):
        result = await enrich_with_wikipedia(location, lang="en")

    assert result.description is None
    mock_client.get.assert_awaited_once()
