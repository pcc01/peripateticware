# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Regression test for a 2026-09 bug: routes/privacy.py had
`from __future__ import annotations` (PEP 563 — every type hint becomes a
plain string), and its /consent route was decorated with slowapi's
@limiter.limit(...), which wraps the endpoint via functools.wraps. FastAPI
resolves a route's string-form type hints using the callable it was actually
given's __globals__ — but a functools.wraps wrapper's __globals__ is the
DECORATOR's module (slowapi.extension), not routes.privacy, even though
inspect.signature() still correctly unwraps to the real parameter list via
__wrapped__. Names not present in slowapi.extension's globals (ConsentRequest,
AsyncSession) failed to resolve, and FastAPI silently fell back to treating
the ConsentRequest body as an ordinary Query parameter instead.

This broke /openapi.json (and therefore /docs) for the WHOLE app — not just
this one route — the first time anything tried to generate the OpenAPI
schema, with a traceback that doesn't mention routes/privacy.py, the
decorator, or PEP 563 anywhere in it. It was invisible to every other test
in this suite, none of which import the real `main.app` or exercise OpenAPI
generation at all. These two tests close that gap.

Only app.openapi() is exercised here, deliberately — that's schema
generation from already-registered routes, and doesn't require the app's
ASGI lifespan (DB/Redis/scheduler startup) to have run.
"""

from __future__ import annotations


def test_openapi_schema_generates_without_error():
    """The core regression: app.openapi() must not raise. This alone would
    have caught the 2026-09 bug."""
    from main import app

    schema = app.openapi()
    assert schema["paths"]


def test_consent_endpoint_body_is_a_request_body_not_query_params():
    """The specific failure mode: ConsentRequest must appear as a
    requestBody, never as query parameters — the misresolved ForwardRef
    silently produced the latter, which would have broken real
    POST /consent calls sending a JSON body, not just the docs page."""
    from main import app

    schema = app.openapi()
    consent = schema["paths"]["/api/v1/privacy/consent"]["post"]
    assert "requestBody" in consent
    assert not consent.get("parameters")


def test_all_rate_limited_routes_resolve_their_body_params():
    """Broader net: every route this codebase decorates with
    @limiter.limit(...) must resolve its Pydantic body param as a
    requestBody. Catches the same class of bug on auth.py/reset.py's
    decorated routes too, even though those files don't currently use
    `from __future__ import annotations` (so aren't affected today) — if
    one of them ever adds it, or slowapi's wrapping changes, this still
    catches it instead of relying on someone remembering to check
    /openapi.json by hand.
    """
    from main import app

    schema = app.openapi()
    rate_limited_post_endpoints = {
        "/api/v1/auth/login": "LoginRequest",
        "/api/v1/auth/signup": "SignupRequest",
        "/api/v1/public/password/forgot": "ForgotPasswordRequest",
        "/api/v1/public/password/reset": "ResetPasswordRequest",
        "/api/v1/privacy/consent": "ConsentRequest",
    }
    for path, _body_model_name in rate_limited_post_endpoints.items():
        assert path in schema["paths"], f"{path} missing from OpenAPI schema entirely"
        operation = schema["paths"][path]["post"]
        assert "requestBody" in operation, (
            f"{path}: body param not resolved as requestBody — "
            f"parameters={operation.get('parameters')}"
        )
