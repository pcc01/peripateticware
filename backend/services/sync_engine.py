"""Asynchronous Sync Engine - WAL-based state machine for offline resilience"""

import logging
import asyncio
from typing import Optional, List
from datetime import datetime
from core.database import SessionLocal
from models.database import SyncLog
from sqlalchemy import select, update

logger = logging.getLogger(__name__)


class SyncEngine:
    """
    WAL (Write-Ahead Log) based synchronization engine.
    Manages offline-first state machine and reconciliation.
    """
    
    def __init__(self):
        self.is_running = False
        self.sync_interval = 30  # seconds
        self.max_retries = 3
        self.sync_task: Optional[asyncio.Task] = None
    
    async def start(self):
        """Start the sync engine background task"""
        if self.is_running:
            logger.warning("Sync engine already running")
            return
        
        self.is_running = True
        self.sync_task = asyncio.create_task(self._sync_loop())
        logger.info("Sync engine started")
    
    async def stop(self):
        """Stop the sync engine"""
        self.is_running = False
        if self.sync_task:
            self.sync_task.cancel()
            try:
                await self.sync_task
            except asyncio.CancelledError:
                pass
        logger.info("Sync engine stopped")
    
    async def _sync_loop(self):
        """Main sync loop that periodically syncs pending changes"""
        while self.is_running:
            try:
                await asyncio.sleep(self.sync_interval)
                await self.sync_pending_changes()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Sync loop error: {e}")
    
    async def log_operation(
        self,
        device_id: str,
        session_id: Optional[str],
        operation: str,
        entity_type: str,
        entity_id: str,
        data: dict
    ) -> bool:
        """Log an operation to the WAL"""
        async with SessionLocal() as session:
            try:
                sync_log = SyncLog(
                    device_id=device_id,
                    session_id=session_id,
                    operation=operation,
                    entity_type=entity_type,
                    entity_id=entity_id,
                    data=data,
                    is_synced=False
                )
                session.add(sync_log)
                await session.commit()
                logger.debug(f"Logged {operation} for {entity_type}:{entity_id}")
                return True
            except Exception as e:
                logger.error(f"Failed to log operation: {e}")
                await session.rollback()
                return False
    
    async def sync_pending_changes(self) -> int:
        """Sync all pending changes from WAL"""
        async with SessionLocal() as session:
            try:
                # Get unsynced logs
                query = select(SyncLog).where(SyncLog.is_synced == False)
                result = await session.execute(query)
                pending_logs = result.scalars().all()
                
                synced_count = 0
                for log in pending_logs:
                    if log.sync_attempts >= self.max_retries:
                        logger.warning(
                            f"Max retries exceeded for {log.entity_type}:{log.entity_id}"
                        )
                        continue
                    
                    # Attempt to sync
                    success = await self._sync_log(session, log)
                    if success:
                        synced_count += 1
                    else:
                        # Increment retry count
                        log.sync_attempts += 1
                
                await session.commit()
                
                if synced_count > 0:
                    logger.info(f"Synced {synced_count} pending changes")
                
                return synced_count
                
            except Exception as e:
                logger.error(f"Sync error: {e}")
                await session.rollback()
                return 0
    
    async def _sync_log(self, session, log: SyncLog) -> bool:
        """Apply a single log entry to the server"""
        try:
            # In production: send to server API
            # For now: simulate successful sync
            
            log.is_synced = True
            log.synced_at = datetime.utcnow()
            
            logger.debug(f"Synced {log.entity_type}:{log.entity_id}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to sync log {log.id}: {e}")
            return False
    
    async def get_unsynced_count(self, device_id: str) -> int:
        """Get count of unsynced changes for a device"""
        async with SessionLocal() as session:
            try:
                query = select(SyncLog).where(
                    (SyncLog.device_id == device_id) & 
                    (SyncLog.is_synced == False)
                )
                result = await session.execute(query)
                logs = result.scalars().all()
                return len(logs)
            except Exception as e:
                logger.error(f"Failed to get unsynced count: {e}")
                return 0
    
    async def get_sync_status(self, device_id: str) -> dict:
        """Get sync status for a device"""
        async with SessionLocal() as session:
            try:
                # Get unsynced count
                unsynced_query = select(SyncLog).where(
                    (SyncLog.device_id == device_id) & 
                    (SyncLog.is_synced == False)
                )
                unsynced_result = await session.execute(unsynced_query)
                unsynced_logs = unsynced_result.scalars().all()
                
                # Get last sync time
                synced_query = select(SyncLog).where(
                    (SyncLog.device_id == device_id) & 
                    (SyncLog.is_synced == True)
                ).order_by(SyncLog.synced_at.desc()).limit(1)
                synced_result = await session.execute(synced_query)
                last_synced = synced_result.scalar()
                
                return {
                    "device_id": device_id,
                    "is_connected": True,  # Would check actual connection
                    "unsynced_count": len(unsynced_logs),
                    "last_sync": last_synced.synced_at.isoformat() if last_synced else None,
                    "pending_operations": [
                        {
                            "operation": log.operation,
                            "entity_type": log.entity_type,
                            "entity_id": log.entity_id,
                        }
                        for log in unsynced_logs[:10]  # Last 10
                    ]
                }
            except Exception as e:
                logger.error(f"Failed to get sync status: {e}")
                return {"error": str(e)}
