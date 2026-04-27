"""
WebSocket Notification Service - Real-time parent notifications
Handles WebSocket connections, message delivery, and persistence
"""

from datetime import datetime
from typing import Optional, List, Dict, Set
from enum import Enum
import asyncio
import json
from pydantic import BaseModel


class NotificationType(str, Enum):
    """Types of notifications"""
    ACHIEVEMENT = "achievement"
    CONCERN = "concern"
    ACTIVITY_COMPLETE = "activity_complete"
    MESSAGE = "message"
    REMINDER = "reminder"
    SYSTEM = "system"


class Notification(BaseModel):
    """A single notification"""
    id: str
    parent_id: str
    child_id: Optional[str] = None
    type: NotificationType
    title: str
    body: str
    created_at: datetime
    read_at: Optional[datetime] = None
    read: bool = False


class NotificationPreferences(BaseModel):
    """Parent's notification preferences"""
    parent_id: str
    email_enabled: bool = True
    push_enabled: bool = True
    in_app_enabled: bool = True
    achievement_notifications: bool = True
    concern_notifications: bool = True
    activity_notifications: bool = True
    message_notifications: bool = True
    quiet_hours_start: Optional[str] = None  # HH:MM format
    quiet_hours_end: Optional[str] = None


class WebSocketNotificationService:
    """Manages real-time WebSocket notifications"""
    
    def __init__(self):
        self.active_connections: Dict[str, Set[any]] = {}  # parent_id -> Set[websockets]
        self.notifications: Dict[str, List[Notification]] = {}  # parent_id -> List[Notification]
        self.preferences: Dict[str, NotificationPreferences] = {}  # parent_id -> preferences
        self.notification_queue = []  # Queue of pending notifications
    
    async def connect(self, parent_id: str, websocket: any) -> None:
        """Register a WebSocket connection"""
        if parent_id not in self.active_connections:
            self.active_connections[parent_id] = set()
        
        self.active_connections[parent_id].add(websocket)
        print(f"📡 Connected: {parent_id} ({len(self.active_connections[parent_id])} connection(s))")
    
    async def disconnect(self, parent_id: str, websocket: any) -> None:
        """Unregister a WebSocket connection"""
        if parent_id in self.active_connections:
            self.active_connections[parent_id].discard(websocket)
            
            if not self.active_connections[parent_id]:
                del self.active_connections[parent_id]
            
            print(f"📴 Disconnected: {parent_id}")
    
    async def send_notification(self, notification: Notification) -> bool:
        """Send a notification in real-time"""
        parent_id = notification.parent_id
        
        # Store notification
        if parent_id not in self.notifications:
            self.notifications[parent_id] = []
        self.notifications[parent_id].append(notification)
        
        # Send to all active connections
        if parent_id in self.active_connections:
            message = {
                "type": "notification",
                "id": notification.id,
                "notification_type": notification.type,
                "title": notification.title,
                "body": notification.body,
                "child_id": notification.child_id,
                "created_at": notification.created_at.isoformat(),
                "read": notification.read
            }
            
            for websocket in self.active_connections[parent_id]:
                try:
                    await websocket.send_json(message)
                    print(f"📨 Sent notification to {parent_id}")
                except Exception as e:
                    print(f"❌ Error sending to {parent_id}: {e}")
                    self.active_connections[parent_id].discard(websocket)
            
            return True
        else:
            # Queue for delivery when connection is restored
            self.notification_queue.append(notification)
            print(f"📋 Queued notification for {parent_id} (not connected)")
            return False
    
    async def send_achievement(self, parent_id: str, child_id: str, achievement: str) -> None:
        """Send achievement notification"""
        notification = Notification(
            id=f"notif_{parent_id}_{child_id}_{datetime.utcnow().timestamp()}",
            parent_id=parent_id,
            child_id=child_id,
            type=NotificationType.ACHIEVEMENT,
            title=f"🏆 Achievement Unlocked!",
            body=f"Your child achieved: {achievement}",
            created_at=datetime.utcnow()
        )
        
        await self.send_notification(notification)
    
    async def send_concern(self, parent_id: str, child_id: str, concern: str) -> None:
        """Send concern notification"""
        notification = Notification(
            id=f"notif_{parent_id}_{child_id}_{datetime.utcnow().timestamp()}",
            parent_id=parent_id,
            child_id=child_id,
            type=NotificationType.CONCERN,
            title=f"⚠️ Learning Concern",
            body=f"We've noticed: {concern}",
            created_at=datetime.utcnow()
        )
        
        await self.send_notification(notification)
    
    async def send_activity_complete(self, parent_id: str, child_id: str, activity_name: str) -> None:
        """Send activity completion notification"""
        notification = Notification(
            id=f"notif_{parent_id}_{child_id}_{datetime.utcnow().timestamp()}",
            parent_id=parent_id,
            child_id=child_id,
            type=NotificationType.ACTIVITY_COMPLETE,
            title=f"✅ Activity Completed",
            body=f"Completed: {activity_name}",
            created_at=datetime.utcnow()
        )
        
        await self.send_notification(notification)
    
    async def send_message(self, parent_id: str, sender_name: str, message_preview: str) -> None:
        """Send message notification"""
        notification = Notification(
            id=f"notif_{parent_id}_{datetime.utcnow().timestamp()}",
            parent_id=parent_id,
            type=NotificationType.MESSAGE,
            title=f"💬 Message from {sender_name}",
            body=message_preview,
            created_at=datetime.utcnow()
        )
        
        await self.send_notification(notification)
    
    def get_notifications(self, parent_id: str, unread_only: bool = False) -> List[Notification]:
        """Get notifications for a parent"""
        if parent_id not in self.notifications:
            return []
        
        notifications = self.notifications[parent_id]
        
        if unread_only:
            notifications = [n for n in notifications if not n.read]
        
        # Return most recent first
        return sorted(notifications, key=lambda n: n.created_at, reverse=True)
    
    async def mark_as_read(self, parent_id: str, notification_id: str) -> bool:
        """Mark a notification as read"""
        if parent_id not in self.notifications:
            return False
        
        for notification in self.notifications[parent_id]:
            if notification.id == notification_id:
                notification.read = True
                notification.read_at = datetime.utcnow()
                
                # Broadcast read status to all connections
                message = {
                    "type": "notification_read",
                    "notification_id": notification_id
                }
                
                if parent_id in self.active_connections:
                    for websocket in self.active_connections[parent_id]:
                        try:
                            await websocket.send_json(message)
                        except:
                            pass
                
                print(f"✅ Marked notification {notification_id} as read")
                return True
        
        return False
    
    def get_preferences(self, parent_id: str) -> NotificationPreferences:
        """Get notification preferences for parent"""
        if parent_id not in self.preferences:
            # Create default preferences
            self.preferences[parent_id] = NotificationPreferences(
                parent_id=parent_id
            )
        
        return self.preferences[parent_id]
    
    def update_preferences(self, parent_id: str, preferences: NotificationPreferences) -> bool:
        """Update notification preferences"""
        self.preferences[parent_id] = preferences
        print(f"✅ Updated preferences for {parent_id}")
        return True
    
    async def deliver_queued_notifications(self, parent_id: str) -> int:
        """Deliver notifications that were queued while offline"""
        delivered = 0
        
        # Find queued notifications for this parent
        remaining_queue = []
        
        for notification in self.notification_queue:
            if notification.parent_id == parent_id:
                success = await self.send_notification(notification)
                if success:
                    delivered += 1
                else:
                    remaining_queue.append(notification)
            else:
                remaining_queue.append(notification)
        
        self.notification_queue = remaining_queue
        
        if delivered > 0:
            print(f"📨 Delivered {delivered} queued notification(s) to {parent_id}")
        
        return delivered
    
    def get_connection_count(self, parent_id: str) -> int:
        """Get number of active connections for a parent"""
        return len(self.active_connections.get(parent_id, set()))
    
    def get_system_stats(self) -> dict:
        """Get system statistics"""
        total_connections = sum(len(conns) for conns in self.active_connections.values())
        total_notifications = sum(len(notifs) for notifs in self.notifications.values())
        
        return {
            "active_parents": len(self.active_connections),
            "total_connections": total_connections,
            "total_notifications": total_notifications,
            "queued_notifications": len(self.notification_queue)
        }


# Global WebSocket notification service instance
websocket_service = WebSocketNotificationService()
