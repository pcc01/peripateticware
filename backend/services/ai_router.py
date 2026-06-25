# Copyright (c) 2026 Paul Christopher Cerda
# Business Source License 1.1

"""
AI Router — single entry point for all AI calls in Peripateticware.

Usage:
    from services.ai_router import ai_router, TaskType

    result = await ai_router.complete(
        task_type   = TaskType.ACTIVITY_SUGGESTIONS,
        prompt      = "...",
        db          = db,
        entity_id   = activity.id,
        entity_type = "activity",
        org_id      = str(request.state.org.id),   # pass for ledger tracking
    )
    # result.text       — the AI response text
    # result.provider   — which provider actually ran
    # result.queued     — True if submission_assessment was queued for batch
    # result.tokens_in  — input tokens (actual for Anthropic, estimated for Ollama)
    # result.tokens_out — output tokens
    # result.cost_usd   — calculated USD cost for this call

Provider routing rules (all configurable per task via Admin UI):
    - ollama            → Ollama local, instant, zero cost
    - anthropic_instant → Haiku direct API, instant
    - anthropic_batch   → enqueue in ai_batch_queue; batch_processor submits overnight
                          (only valid for submission_assessment)

Failure behaviour:
    - Anthropic instant fails → log warning, fall back to Ollama
    - Ollama fails             → return a safe empty result with error logged
    - Anthropic batch enqueue  → always succeeds (just writes to DB)

Ledger behaviour (Task 1B):
    - Every completed call writes one row to platform_ai_ledger (fire-and-forget).
    - Ollama calls are recorded with cost_usd=0.
    - Batch enqueue writes an estimated row; batch_processor updates with actuals.
    - Ledger failures are logged as warnings and never affect the AI call result.
"""

import asyncio
import logging
from dataclasses import dataclass
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.config import settings
from models.ai_batch import AiBatchQueue, AiTaskConfig, AiApiKey, TaskType, AIProvider, BatchStatus
from services import anthropic_client as _anthropic

logger = logging.getLogger(__name__)

# ── Token cost rates (USD per million tokens) ─────────────────────────────────
# Update these when Anthropic pricing changes.

RATES: dict[str, dict[str, float]] = {
    AIProvider.ANTHROPIC_INSTANT: {"in": 1.00, "out": 5.00},
    AIProvider.ANTHROPIC_BATCH:   {"in": 0.50, "out": 2.50},
    AIProvider.OLLAMA:            {"in": 0.00, "out": 0.00},
    AIProvider.OPENAI:            {"in": 0.15, "out": 0.60},  # GPT-4o mini
}

# ── Default monthly dollar caps by license tier ───────────────────────────────
TIER_BUDGET_DEFAULTS: dict[str, float] = {
    "free":              5.00,
    "trial":             5.00,
    "starter":           5.00,
    "homeschool_family": 5.00,
    "homeschool_coop":   5.00,
    "school":           20.00,
    "school_byok":      20.00,
    "district":        100.00,
    "district_byok":   100.00,
    "enterprise":      500.00,
}


def _calc_cost(provider: str, tokens_in: int, tokens_out: int) -> float:
    """Return USD cost rounded to 6 decimal places."""
    r = RATES.get(provider, {"in": 0.0, "out": 0.0})
    return round((tokens_in * r["in"] + tokens_out * r["out"]) / 1_000_000, 6)


# ── Key store ─────────────────────────────────────────────────────────────────

def _fernet():
    """Return a Fernet instance keyed from SECRET_KEY (padded to 32 bytes)."""
    import base64, hashlib
    from cryptography.fernet import Fernet
    raw = settings.SECRET_KEY.encode()
    key = base64.urlsafe_b64encode(hashlib.sha256(raw).digest())
    return Fernet(key)


def encrypt_key(plaintext: str) -> str:
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt_key(ciphertext: str) -> str:
    return _fernet().decrypt(ciphertext.encode()).decode()


async def _get_api_key(db: AsyncSession, provider: str) -> Optional[str]:
    """Load decrypted API key from DB, falling back to env/config."""
    # 1. Try DB (admin-entered via UI)
    row = (await db.execute(select(AiApiKey).where(AiApiKey.provider == provider))).scalar_one_or_none()
    if row and row.encrypted_key:
        try:
            return decrypt_key(row.encrypted_key)
        except Exception:
            logger.warning(f"Could not decrypt stored API key for {provider}")

    # 2. Fall back to env / config
    if provider == "anthropic":
        return settings.CLAUDE_API_KEY or settings.ANTHROPIC_API_KEY or None
    return None


# Tiers that may use their own API key — budget cap is skipped for these orgs
# when they have a key registered in org_api_keys.
BYOK_TIERS = {
    "school", "school_byok",
    "district", "district_byok",
    "enterprise",
    "homeschool_family", "homeschool_coop",
}


async def _get_org_key(db: AsyncSession, org_id: Optional[str], provider: str) -> Optional[str]:
    """
    Return decrypted API key for a specific org, or None if not set.
    Only called for orgs on BYOK-eligible tiers that have submitted their own key.
    """
    if not org_id:
        return None
    from sqlalchemy import text as _text
    try:
        row = (await db.execute(
            _text("SELECT encrypted_key FROM org_api_keys WHERE org_id = :oid AND provider = :p"),
            {"oid": org_id, "p": provider},
        )).fetchone()
        if row and row[0]:
            return decrypt_key(row[0])
    except Exception as exc:
        logger.warning(f"[ai_router] org key lookup failed (fail open): {exc}")
    return None


async def _get_model(db: AsyncSession, provider: str, task_type: str) -> str:
    """Resolve model: task-level override → provider-level default → hardcoded default."""
    task_cfg = (
        await db.execute(select(AiTaskConfig).where(AiTaskConfig.task_type == task_type))
    ).scalar_one_or_none()
    if task_cfg and task_cfg.model:
        return task_cfg.model

    key_row = (await db.execute(select(AiApiKey).where(AiApiKey.provider == provider))).scalar_one_or_none()
    if key_row and key_row.model:
        return key_row.model

    if provider == "anthropic":
        return settings.ANTHROPIC_MODEL
    return settings.OLLAMA_MODEL_TEXT


# ── Ollama helper ─────────────────────────────────────────────────────────────

async def _call_ollama(prompt: str, model: str) -> str:
    import httpx as _httpx
    async with _httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            f"{settings.OLLAMA_BASE_URL}/api/generate",
            json={"model": model, "prompt": prompt, "stream": False},
        )
    if resp.status_code == 200:
        return resp.json().get("response", "")
    raise RuntimeError(f"Ollama error {resp.status_code}: {resp.text[:200]}")


# ── Ledger writer (fire-and-forget, Task 1B) ──────────────────────────────────

async def _write_ledger(
    org_id: Optional[str],
    task_type: str,
    provider: str,
    tokens_in: int,
    tokens_out: int,
    cost_usd: float,
) -> None:
    """
    Insert one row into platform_ai_ledger using its own DB session.
    Never raises — a ledger failure must never affect the AI call result.
    Called via asyncio.create_task() so it never blocks the response path.
    """
    from sqlalchemy import text as _text
    from core.database import get_session_factory
    try:
        factory = get_session_factory()
        async with factory() as session:
            await session.execute(_text("""
                INSERT INTO platform_ai_ledger
                    (org_id, task_type, provider, tokens_in, tokens_out, cost_usd)
                VALUES
                    (:org_id, :task_type, :provider, :tokens_in, :tokens_out, :cost_usd)
            """), {
                "org_id":     org_id,
                "task_type":  task_type,
                "provider":   provider,
                "tokens_in":  tokens_in,
                "tokens_out": tokens_out,
                "cost_usd":   cost_usd,
            })
            await session.commit()
    except Exception as exc:
        logger.warning(f"[ai_router] Ledger write failed (non-fatal): {exc}")


# ── Result type ───────────────────────────────────────────────────────────────

@dataclass
class AIResult:
    text:       Optional[str] = None
    provider:   str = "ollama"
    queued:     bool = False            # True when batch-queued (no text yet)
    queue_id:   Optional[int] = None    # ai_batch_queue.id
    error:      Optional[str] = None
    tokens_in:  int = 0                 # actual (Anthropic) or estimated (Ollama)
    tokens_out: int = 0
    cost_usd:   float = 0.0             # USD cost for this call
    capped:     bool  = False            # True when org monthly budget is exhausted


# ── Task config loader (hot-reload from DB) ───────────────────────────────────

_DEFAULTS: dict[str, str] = {
    TaskType.ACTIVITY_SUGGESTIONS:  AIProvider.OLLAMA,
    TaskType.STANDARDS_MAPPING:     AIProvider.OLLAMA,
    TaskType.RUBRIC_MAPPING:        AIProvider.OLLAMA,
    TaskType.TAXONOMY_MAPPING:      AIProvider.OLLAMA,
    TaskType.SUBMISSION_ASSESSMENT: AIProvider.OLLAMA,
}


async def _get_provider(db: AsyncSession, task_type: str) -> str:
    """Return configured provider for task, falling back to OLLAMA."""
    row = (
        await db.execute(select(AiTaskConfig).where(AiTaskConfig.task_type == task_type))
    ).scalar_one_or_none()
    if row and row.enabled:
        return row.provider
    return _DEFAULTS.get(task_type, AIProvider.OLLAMA)


# ── Budget enforcement (Task 1D) ─────────────────────────────────────────────

async def _budget_check_async(db: AsyncSession, org_id: Optional[str]) -> None:
    """
    Fire-and-forget wrapper called via asyncio.create_task().
    Opens its own session so the caller's session can close independently.
    Swallows all exceptions — monitoring must never affect request path.
    """
    from core.database import get_session_factory
    try:
        factory = get_session_factory()
        async with factory() as own_db:
            await _budget_check(own_db, org_id)
    except Exception as exc:
        logger.warning(f"[ai_router] _budget_check_async failed (non-fatal): {exc}")


async def _budget_check(
    db: AsyncSession,
    org_id: Optional[str],
) -> tuple[bool, str]:
    # Returns (is_over_cap, license_tier).
    # The return value is informational only — callers never use it to block.
    # Service always continues. The cap is an observation threshold, not a gate.
    # High-usage orgs are a product signal; budget_monitor.py alerts admin.
    """
    Returns True if the org has exceeded their monthly dollar cap.
    Also sets a Redis alert flag (24h TTL, once per day) if they have reached
    the alert threshold (default 80% of cap).

    If org_id is None (platform/system call) always returns False.
    Fails open on any error so a DB or Redis hiccup never blocks AI calls.

    Performance: monthly spend is cached in Redis for 60 seconds so the DB
    is queried at most once per minute per org.
    """
    if not org_id:
        return False, "free"

    import datetime
    from sqlalchemy import text as _text
    from core.rate_limit import _get_redis

    redis = await _get_redis()
    now   = datetime.datetime.now(datetime.timezone.utc)
    month_key = f"{now.year}-{now.month:02d}"
    cache_key = f"budget:monthly:{org_id}:{month_key}"

    # ── 1. Try 60-second Redis cache ─────────────────────────────────────────
    monthly_spend: Optional[float] = None
    if redis:
        try:
            cached = await redis.get(cache_key)
            if cached is not None:
                monthly_spend = float(cached)
        except Exception:
            pass

    # ── 2. Query DB if not in cache ───────────────────────────────────────────
    if monthly_spend is None:
        try:
            row = (await db.execute(
                _text("""
                    SELECT COALESCE(SUM(cost_usd), 0)
                    FROM   platform_ai_ledger
                    WHERE  org_id = :org_id
                      AND  created_at >= date_trunc('month', NOW() AT TIME ZONE 'UTC')
                """),
                {"org_id": org_id},
            )).scalar()
            monthly_spend = float(row or 0.0)
            if redis:
                try:
                    await redis.setex(cache_key, 60, str(monthly_spend))
                except Exception:
                    pass
        except Exception as exc:
            logger.warning(f"[ai_router] Budget spend query failed (fail open): {exc}")
            return False, "free"

    # ── 3. Get or auto-create budget row ─────────────────────────────────────
    try:
        budget_row = (await db.execute(
            _text("SELECT monthly_dollar_cap, alert_threshold_pct FROM platform_ai_budgets WHERE org_id = :oid"),
            {"oid": org_id},
        )).fetchone()

        if budget_row is None:
            tier_row = (await db.execute(
                _text("SELECT license_tier FROM organizations WHERE id = :oid"),
                {"oid": org_id},
            )).scalar()
            tier = tier_row or "free"
            cap  = TIER_BUDGET_DEFAULTS.get(tier, 5.00)
            await db.execute(
                _text("""
                    INSERT INTO platform_ai_budgets (org_id, monthly_dollar_cap, alert_threshold_pct)
                    VALUES (:oid, :cap, 80)
                    ON CONFLICT (org_id) DO NOTHING
                """),
                {"oid": org_id, "cap": cap},
            )
            await db.commit()
            monthly_cap = cap
            alert_pct   = 80
        else:
            monthly_cap = float(budget_row[0])
            alert_pct   = int(budget_row[1])
    except Exception as exc:
        logger.warning(f"[ai_router] Budget row lookup failed (fail open): {exc}")
        return False, "free"

    # ── 4. Set Redis alert flag at threshold (fires at most once per day) ─────
    alert_threshold = monthly_cap * (alert_pct / 100.0)
    if monthly_spend >= alert_threshold and redis:
        try:
            await redis.set(f"budget_alert:{org_id}:{month_key}", "1", ex=86400, nx=True)
        except Exception:
            pass

    # ── 5. BYOK orgs — never cap, still track spend for analytics ───────────────
    if tier in BYOK_TIERS:
        # Check if org actually has their own key registered
        try:
            from sqlalchemy import text as _t2
            byok_row = (await db.execute(
                _t2("SELECT 1 FROM org_api_keys WHERE org_id = :oid LIMIT 1"),
                {"oid": org_id},
            )).fetchone()
            if byok_row:
                logger.debug(f"[ai_router] BYOK org {org_id} — cap check skipped")
                return False, tier
        except Exception:
            pass  # fail open

    # ── 6. Return whether the org is over cap ────────────────────────────────
    is_capped = monthly_spend >= monthly_cap
    if is_capped:
        logger.warning(
            f"[ai_router] Org {org_id} over monthly budget "
            f"(${monthly_spend:.4f} >= ${monthly_cap:.2f}) "
            f"tier={tier}"
        )
    return is_capped, tier


# ── Main router ───────────────────────────────────────────────────────────────

class AIRouter:

    async def complete(
        self,
        task_type: str,
        prompt: str,
        db: AsyncSession,
        entity_id: Optional[str] = None,
        entity_type: Optional[str] = None,
        system: Optional[str] = None,
        org_id: Optional[str] = None,   # pass for ledger tracking; None = platform/system call
    ) -> AIResult:
        """
        Route an AI call based on live task configuration.
        Never raises — on total failure returns AIResult with error set.
        Writes one row to platform_ai_ledger after every call (fire-and-forget).
        """
        provider = await _get_provider(db, task_type)

        # ── Budget monitoring (non-blocking, instant calls only) ───────────────────
        # Cap is an observation threshold, not a service gate. High-usage orgs are
        # valuable signals — they reveal estimate gaps, caching opportunities, and
        # pricing fit. Service is NEVER interrupted. _budget_check() sets a Redis
        # flag that budget_monitor.py picks up to email admin@peripateticware.com.
        if provider != AIProvider.ANTHROPIC_BATCH:
            asyncio.create_task(_budget_check_async(db, org_id))

        # ── Anthropic Batch (enqueue only) ─────────────────────────────────
        if provider == AIProvider.ANTHROPIC_BATCH:
            return await self._enqueue_batch(
                task_type=task_type, prompt=prompt, db=db,
                entity_id=entity_id, entity_type=entity_type,
                org_id=org_id,
            )

        # ── Anthropic Instant ──────────────────────────────────────────────
        if provider == AIProvider.ANTHROPIC_INSTANT:
            # Prefer org's own key (BYOK) when available
            api_key = (await _get_org_key(db, org_id, "anthropic")
                       or await _get_api_key(db, "anthropic"))
            if not api_key:
                logger.warning(
                    f"[ai_router] No Anthropic API key for task={task_type}. "
                    "Falling back to Ollama."
                )
            else:
                model = await _get_model(db, "anthropic", task_type)
                try:
                    text, tokens_in, tokens_out = await _anthropic.complete_instant_with_usage(
                        prompt=prompt, api_key=api_key, model=model, system=system
                    )
                    cost = _calc_cost(AIProvider.ANTHROPIC_INSTANT, tokens_in, tokens_out)
                    asyncio.create_task(_write_ledger(
                        org_id, task_type, AIProvider.ANTHROPIC_INSTANT,
                        tokens_in, tokens_out, cost,
                    ))
                    logger.info(
                        f"[ai_router] anthropic_instant ok task={task_type} model={model} "
                        f"tokens={tokens_in}+{tokens_out} cost=${cost:.6f}"
                    )
                    return AIResult(
                        text=text, provider=AIProvider.ANTHROPIC_INSTANT,
                        tokens_in=tokens_in, tokens_out=tokens_out, cost_usd=cost,
                    )
                except Exception as exc:
                    logger.warning(
                        f"[ai_router] Anthropic instant FAILED for task={task_type}: {exc}. "
                        "Falling back to Ollama."
                    )
                    # fall through to Ollama

        # ── Ollama (default / fallback) ────────────────────────────────────
        model = settings.OLLAMA_MODEL_TEXT
        try:
            text = await _call_ollama(prompt=prompt, model=model)
            # Estimate token counts for usage tracking (cost is always $0 for Ollama)
            tokens_in  = len(prompt) // 4
            tokens_out = len(text) // 4 if text else 0
            asyncio.create_task(_write_ledger(
                org_id, task_type, AIProvider.OLLAMA, tokens_in, tokens_out, 0.0,
            ))
            logger.info(f"[ai_router] ollama ok task={task_type} model={model}")
            return AIResult(
                text=text, provider=AIProvider.OLLAMA,
                tokens_in=tokens_in, tokens_out=tokens_out, cost_usd=0.0,
            )
        except Exception as exc:
            logger.error(f"[ai_router] Ollama FAILED for task={task_type}: {exc}")
            return AIResult(
                text=None, provider=AIProvider.OLLAMA, error=str(exc),
            )

    async def _enqueue_batch(
        self,
        task_type: str,
        prompt: str,
        db: AsyncSession,
        entity_id: Optional[str],
        entity_type: Optional[str],
        org_id: Optional[str] = None,
    ) -> AIResult:
        """
        Insert a row into ai_batch_queue. Returns immediately.
        Writes an estimated ledger entry (batch cost tracked by batch_processor
        when actual tokens are returned by Anthropic).
        """
        item = AiBatchQueue(
            task_type   = task_type,
            entity_type = entity_type or "unknown",
            entity_id   = str(entity_id) if entity_id else "unknown",
            prompt      = prompt,
            status      = BatchStatus.PENDING,
        )
        db.add(item)
        await db.commit()
        await db.refresh(item)

        # Write estimated ledger entry — batch_processor updates with actuals on completion
        estimated_in = len(prompt) // 4
        asyncio.create_task(_write_ledger(
            org_id, task_type, AIProvider.ANTHROPIC_BATCH,
            estimated_in, 0, 0.0,   # cost=0 until actual tokens known
        ))

        logger.info(
            f"[ai_router] Queued batch item id={item.id} task={task_type} "
            f"entity={entity_type}:{entity_id}"
        )
        return AIResult(queued=True, queue_id=item.id, provider=AIProvider.ANTHROPIC_BATCH)


# Singleton
ai_router = AIRouter()
