# Copyright (c) 2026 Paul Christopher Cerda
# Business Source License 1.1

"""
Batch Processor — Anthropic Batch API orchestration.

Responsibilities:
  1. run_batch()          — collect pending queue items → submit to Anthropic → mark submitted
  2. poll_and_collect()   — check submitted batches → fetch results → write back → notify
  3. run_full_cycle()     — run_batch() then poll_and_collect() (used by scheduler + manual trigger)

The APScheduler job in main.py calls run_full_cycle() nightly (configurable cron).
The admin "Run batch now" endpoint calls run_full_cycle() directly.

Results for submission_assessment are written back to:
  - ai_batch_queue.result  (always)
  - teacher notification   (in-app badge via teacher_submission_notifications table)
"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

from core.config import settings
from models.ai_batch import AiBatchQueue, AiApiKey, BatchStatus
from services import anthropic_client as _anthropic
from services.ai_router import decrypt_key, _call_ollama

logger = logging.getLogger(__name__)


# ── DB session factory (used by scheduler which runs outside request context) ──

def _make_session() -> async_sessionmaker:
    engine = create_async_engine(settings.DATABASE_URL, echo=False, pool_pre_ping=True)
    return async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def _get_anthropic_key(db: AsyncSession) -> Optional[str]:
    row = (await db.execute(select(AiApiKey).where(AiApiKey.provider == "anthropic"))).scalar_one_or_none()
    if row and row.encrypted_key:
        try:
            return decrypt_key(row.encrypted_key)
        except Exception:
            pass
    return settings.CLAUDE_API_KEY or settings.ANTHROPIC_API_KEY or None


async def _get_anthropic_model(db: AsyncSession) -> str:
    row = (await db.execute(select(AiApiKey).where(AiApiKey.provider == "anthropic"))).scalar_one_or_none()
    if row and row.model:
        return row.model
    return settings.ANTHROPIC_MODEL


# ── Step 1: Submit pending items to Anthropic Batch API ───────────────────────

async def run_batch(db: Optional[AsyncSession] = None) -> dict:
    """
    Collect all PENDING items → submit to Anthropic Batch API → mark SUBMITTED.
    Returns a summary dict.
    """
    own_session = db is None
    if own_session:
        factory = _make_session()
        db = factory()

    summary = {"submitted": 0, "skipped": 0, "fallback": 0, "error": None}

    try:
        # Load pending items
        result = await db.execute(
            select(AiBatchQueue).where(AiBatchQueue.status == BatchStatus.PENDING)
        )
        items: list[AiBatchQueue] = result.scalars().all()

        if not items:
            logger.info("[batch_processor] No pending items.")
            return summary

        logger.info(f"[batch_processor] {len(items)} pending items to submit.")

        api_key = await _get_anthropic_key(db)
        model   = await _get_anthropic_model(db)

        if not api_key:
            logger.warning("[batch_processor] No Anthropic API key — falling back all pending items to Ollama.")
            for item in items:
                await _fallback_item(item, db)
                summary["fallback"] += 1
            return summary

        # Build batch request list
        requests = [
            {
                "custom_id": str(item.id),
                "prompt":    item.prompt,
                "model":     model,
            }
            for item in items
        ]

        try:
            batch_id = await _anthropic.submit_batch(requests, api_key, model)
            now = datetime.now(timezone.utc)

            for item in items:
                item.status              = BatchStatus.SUBMITTED
                item.anthropic_batch_id  = batch_id
                item.anthropic_request_id= str(item.id)
                item.submitted_at        = now

            await db.commit()
            summary["submitted"] = len(items)
            logger.info(f"[batch_processor] Submitted batch_id={batch_id} with {len(items)} items.")

        except Exception as exc:
            logger.error(f"[batch_processor] Batch submit FAILED: {exc}. Falling back to Ollama.")
            for item in items:
                await _fallback_item(item, db)
                summary["fallback"] += 1

    except Exception as exc:
        logger.error(f"[batch_processor] run_batch error: {exc}")
        summary["error"] = str(exc)
    finally:
        if own_session:
            await db.close()

    return summary


# ── Step 2: Poll submitted batches and write results ──────────────────────────

async def poll_and_collect(db: Optional[AsyncSession] = None) -> dict:
    """
    Poll all SUBMITTED batches. For completed ones, fetch results and write back.
    """
    own_session = db is None
    if own_session:
        factory = _make_session()
        db = factory()

    summary = {"completed_batches": 0, "results_written": 0, "still_processing": 0, "error": None}

    try:
        # Find unique batch IDs that are still SUBMITTED
        result = await db.execute(
            select(AiBatchQueue.anthropic_batch_id)
            .where(AiBatchQueue.status == BatchStatus.SUBMITTED)
            .distinct()
        )
        batch_ids = [row[0] for row in result.all() if row[0]]

        if not batch_ids:
            logger.info("[batch_processor] No submitted batches to poll.")
            return summary

        api_key = await _get_anthropic_key(db)
        if not api_key:
            logger.warning("[batch_processor] No Anthropic API key — cannot poll.")
            return summary

        for batch_id in batch_ids:
            try:
                status_obj = await _anthropic.poll_batch(batch_id, api_key)
                processing_status = status_obj.get("processing_status", "in_progress")

                if processing_status != "ended":
                    logger.info(f"[batch_processor] batch_id={batch_id} still in_progress.")
                    summary["still_processing"] += 1
                    continue

                # Fetch and write results
                raw_results = await _anthropic.fetch_batch_results(batch_id, api_key)
                result_map  = {r["custom_id"]: r for r in raw_results}

                # Load our queue items for this batch
                items_result = await db.execute(
                    select(AiBatchQueue).where(
                        AiBatchQueue.anthropic_batch_id == batch_id,
                        AiBatchQueue.status == BatchStatus.SUBMITTED,
                    )
                )
                items = items_result.scalars().all()
                now   = datetime.now(timezone.utc)

                for item in items:
                    r = result_map.get(str(item.id))
                    if r and r["result_text"]:
                        item.status       = BatchStatus.COMPLETED
                        item.result       = {"text": r["result_text"]}
                        item.processed_at = now
                        summary["results_written"] += 1
                    elif r and r["error"]:
                        logger.warning(f"[batch_processor] Item {item.id} Anthropic error: {r['error']}. Falling back.")
                        await _fallback_item(item, db, commit=False)
                    else:
                        item.status       = BatchStatus.FAILED
                        item.error_message= "No result returned"
                        item.processed_at = now

                await db.commit()
                summary["completed_batches"] += 1

                # Send teacher notifications for submission_assessment items
                await _notify_teachers(items, db)

            except Exception as exc:
                logger.error(f"[batch_processor] Error processing batch_id={batch_id}: {exc}")

    except Exception as exc:
        logger.error(f"[batch_processor] poll_and_collect error: {exc}")
        summary["error"] = str(exc)
    finally:
        if own_session:
            await db.close()

    return summary


# ── Full cycle (scheduler + manual trigger) ───────────────────────────────────

async def run_full_cycle() -> dict:
    """Submit pending → poll submitted. Called by scheduler and admin manual trigger."""
    factory = _make_session()
    async with factory() as db:
        submit_summary = await run_batch(db)
        # Small delay so Anthropic has a moment to register the batch before we poll
        await asyncio.sleep(2)
        poll_summary   = await poll_and_collect(db)

    return {"submit": submit_summary, "poll": poll_summary}


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _fallback_item(item: AiBatchQueue, db: AsyncSession, commit: bool = True):
    """Run the item through Ollama and mark it completed with fallback flag."""
    try:
        text = await _call_ollama(item.prompt, settings.OLLAMA_MODEL_TEXT)
        item.status       = BatchStatus.COMPLETED
        item.result       = {"text": text}
        item.fallback_used= True
        item.processed_at = datetime.now(timezone.utc)
    except Exception as exc:
        item.status        = BatchStatus.FAILED
        item.error_message = f"Ollama fallback also failed: {exc}"
        item.processed_at  = datetime.now(timezone.utc)

    if commit:
        await db.commit()


async def _notify_teachers(items: list[AiBatchQueue], db: AsyncSession):
    """
    Create in-app notifications for teachers whose submission assessments completed.
    Increments the unread badge count visible on the Submissions page.
    """
    from sqlalchemy import text

    submission_items = [
        i for i in items
        if i.task_type == "submission_assessment"
        and i.status == BatchStatus.COMPLETED
        and not i.notified
    ]
    if not submission_items:
        return

    for item in submission_items:
        try:
            # Look up the submission's teacher
            row = await db.execute(
                text("""
                    SELECT a.teacher_id
                    FROM student_submissions ss
                    JOIN activities a ON a.id = ss.activity_id
                    WHERE ss.id = :sid
                """),
                {"sid": item.entity_id},
            )
            teacher_row = row.first()
            if not teacher_row:
                continue

            teacher_id = str(teacher_row[0])

            # Upsert a notification row (simple JSON blob, rendered in teacher UI)
            await db.execute(
                text("""
                    INSERT INTO teacher_notifications
                        (teacher_id, type, payload, is_read, created_at)
                    VALUES
                        (:tid, 'ai_assessment_ready',
                         jsonb_build_object(
                             'submission_id', :sid,
                             'entity_type', :etype,
                             'queue_id', :qid
                         ),
                         false,
                         NOW())
                    ON CONFLICT DO NOTHING
                """),
                {
                    "tid":   teacher_id,
                    "sid":   item.entity_id,
                    "etype": item.entity_type,
                    "qid":   item.id,
                },
            )
            item.notified = True

        except Exception as exc:
            logger.warning(f"[batch_processor] Notification failed for item {item.id}: {exc}")

    await db.commit()
