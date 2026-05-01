# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

"""
Phase 2 Integration Tests - WebSocket Notification Service
Tests real-time notifications and WebSocket functionality
"""

import pytest
import asyncio
from datetime import datetime
from services.websocket_service import (
    WebSocketNotificationService, Notification, NotificationType,
    NotificationPreferences
)


class MockWebSocket:
    """Mock WebSocket for testing"""
    
    def __init__(self):
        self.sent_messages = []
        self.closed = False
    
    async def send_json(self, data):
        """Mock send_json"""
        self.sent_messages.append(data)
    
    async def receive_json(self):
        """Mock receive_json"""
        return {}


class TestWebSocketNotificationService:
    """WebSocket notification service integration tests"""

    @pytest.fixture
    def ws_service(self):
        """Create WebSocket service instance"""
        return WebSocketNotificationService()

    # Test Connection Management
    @pytest.mark.asyncio
    async def test_connect_parent(self, ws_service):
        """Test parent WebSocket connection"""
        websocket = MockWebSocket()
        
        await ws_service.connect("parent1", websocket)
        
        assert "parent1" in ws_service.active_connections
        assert websocket in ws_service.active_connections["parent1"]

    @pytest.mark.asyncio
    async def test_disconnect_parent(self, ws_service):
        """Test parent WebSocket disconnection"""
        websocket = MockWebSocket()
        
        await ws_service.connect("parent1", websocket)
        await ws_service.disconnect("parent1", websocket)
        
        assert "parent1" not in ws_service.active_connections

    @pytest.mark.asyncio
    async def test_multiple_connections_same_parent(self, ws_service):
        """Test multiple connections for same parent"""
        ws1 = MockWebSocket()
        ws2 = MockWebSocket()
        
        await ws_service.connect("parent1", ws1)
        await ws_service.connect("parent1", ws2)
        
        assert len(ws_service.active_connections["parent1"]) == 2

    @pytest.mark.asyncio
    async def test_disconnect_one_of_multiple(self, ws_service):
        """Test disconnecting one of multiple connections"""
        ws1 = MockWebSocket()
        ws2 = MockWebSocket()
        
        await ws_service.connect("parent1", ws1)
        await ws_service.connect("parent1", ws2)
        await ws_service.disconnect("parent1", ws1)
        
        assert len(ws_service.active_connections["parent1"]) == 1
        assert ws2 in ws_service.active_connections["parent1"]

    # Test Notification Sending
    @pytest.mark.asyncio
    async def test_send_notification(self, ws_service):
        """Test sending a notification"""
        websocket = MockWebSocket()
        await ws_service.connect("parent1", websocket)
        
        notification = Notification(
            id="notif1",
            parent_id="parent1",
            child_id="child1",
            type=NotificationType.ACHIEVEMENT,
            title="Achievement Unlocked",
            body="Emma completed photosynthesis module",
            created_at=datetime.utcnow()
        )
        
        result = await ws_service.send_notification(notification)
        assert result is True
        assert len(websocket.sent_messages) == 1

    @pytest.mark.asyncio
    async def test_notification_queued_if_offline(self, ws_service):
        """Test notification is queued if parent offline"""
        notification = Notification(
            id="notif1",
            parent_id="parent1",
            child_id="child1",
            type=NotificationType.ACHIEVEMENT,
            title="Achievement",
            body="Test",
            created_at=datetime.utcnow()
        )
        
        result = await ws_service.send_notification(notification)
        assert result is False
        assert notification in ws_service.notification_queue

    @pytest.mark.asyncio
    async def test_notification_to_multiple_connections(self, ws_service):
        """Test notification sent to all connections for parent"""
        ws1 = MockWebSocket()
        ws2 = MockWebSocket()
        
        await ws_service.connect("parent1", ws1)
        await ws_service.connect("parent1", ws2)
        
        notification = Notification(
            id="notif1",
            parent_id="parent1",
            type=NotificationType.ACHIEVEMENT,
            title="Achievement",
            body="Test",
            created_at=datetime.utcnow()
        )
        
        await ws_service.send_notification(notification)
        
        assert len(ws1.sent_messages) == 1
        assert len(ws2.sent_messages) == 1

    # Test Specific Notification Types
    @pytest.mark.asyncio
    async def test_send_achievement_notification(self, ws_service):
        """Test sending achievement notification"""
        websocket = MockWebSocket()
        await ws_service.connect("parent1", websocket)
        
        await ws_service.send_achievement(
            parent_id="parent1",
            child_id="child1",
            achievement="Photosynthesis Expert"
        )
        
        assert len(websocket.sent_messages) == 1
        assert "achievement" in websocket.sent_messages[0]["notification_type"]

    @pytest.mark.asyncio
    async def test_send_concern_notification(self, ws_service):
        """Test sending concern notification"""
        websocket = MockWebSocket()
        await ws_service.connect("parent1", websocket)
        
        await ws_service.send_concern(
            parent_id="parent1",
            child_id="child1",
            concern="Struggling with fractions"
        )
        
        assert len(websocket.sent_messages) == 1
        assert "concern" in websocket.sent_messages[0]["notification_type"]

    @pytest.mark.asyncio
    async def test_send_activity_complete_notification(self, ws_service):
        """Test sending activity completion notification"""
        websocket = MockWebSocket()
        await ws_service.connect("parent1", websocket)
        
        await ws_service.send_activity_complete(
            parent_id="parent1",
            child_id="child1",
            activity_name="Daily Math Practice"
        )
        
        assert len(websocket.sent_messages) == 1
        assert "activity_complete" in websocket.sent_messages[0]["notification_type"]

    @pytest.mark.asyncio
    async def test_send_message_notification(self, ws_service):
        """Test sending message notification"""
        websocket = MockWebSocket()
        await ws_service.connect("parent1", websocket)
        
        await ws_service.send_message(
            parent_id="parent1",
            sender_name="Ms. Smith",
            message_preview="Emma is doing great!"
        )
        
        assert len(websocket.sent_messages) == 1
        assert "message" in websocket.sent_messages[0]["notification_type"]

    # Test Get Notifications
    def test_get_notifications(self, ws_service):
        """Test retrieving notifications"""
        # Add notifications
        for i in range(5):
            notification = Notification(
                id=f"notif{i}",
                parent_id="parent1",
                type=NotificationType.ACHIEVEMENT,
                title=f"Achievement {i}",
                body="Test",
                created_at=datetime.utcnow(),
                read=i % 2 == 0
            )
            if "parent1" not in ws_service.notifications:
                ws_service.notifications["parent1"] = []
            ws_service.notifications["parent1"].append(notification)
        
        notifications = ws_service.get_notifications("parent1")
        assert len(notifications) == 5

    def test_get_unread_notifications(self, ws_service):
        """Test retrieving only unread notifications"""
        # Add notifications
        for i in range(5):
            notification = Notification(
                id=f"notif{i}",
                parent_id="parent1",
                type=NotificationType.ACHIEVEMENT,
                title=f"Achievement {i}",
                body="Test",
                created_at=datetime.utcnow(),
                read=i % 2 == 0
            )
            if "parent1" not in ws_service.notifications:
                ws_service.notifications["parent1"] = []
            ws_service.notifications["parent1"].append(notification)
        
        notifications = ws_service.get_notifications("parent1", unread_only=True)
        assert len(notifications) == 2

    # Test Mark as Read
    @pytest.mark.asyncio
    async def test_mark_notification_as_read(self, ws_service):
        """Test marking notification as read"""
        websocket = MockWebSocket()
        await ws_service.connect("parent1", websocket)
        
        notification = Notification(
            id="notif1",
            parent_id="parent1",
            type=NotificationType.ACHIEVEMENT,
            title="Achievement",
            body="Test",
            created_at=datetime.utcnow()
        )
        
        ws_service.notifications["parent1"] = [notification]
        
        result = await ws_service.mark_as_read("parent1", "notif1")
        assert result is True
        assert notification.read is True
        assert notification.read_at is not None

    # Test Notification Preferences
    def test_get_default_preferences(self, ws_service):
        """Test getting default notification preferences"""
        prefs = ws_service.get_preferences("parent1")
        
        assert prefs.parent_id == "parent1"
        assert prefs.email_enabled is True
        assert prefs.push_enabled is True
        assert prefs.in_app_enabled is True

    def test_update_preferences(self, ws_service):
        """Test updating notification preferences"""
        prefs = NotificationPreferences(
            parent_id="parent1",
            email_enabled=False,
            push_enabled=True,
            in_app_enabled=False
        )
        
        result = ws_service.update_preferences("parent1", prefs)
        assert result is True
        
        updated_prefs = ws_service.get_preferences("parent1")
        assert updated_prefs.email_enabled is False
        assert updated_prefs.in_app_enabled is False

    def test_preferences_quiet_hours(self, ws_service):
        """Test notification preferences with quiet hours"""
        prefs = NotificationPreferences(
            parent_id="parent1",
            quiet_hours_start="22:00",
            quiet_hours_end="08:00"
        )
        
        ws_service.update_preferences("parent1", prefs)
        
        updated_prefs = ws_service.get_preferences("parent1")
        assert updated_prefs.quiet_hours_start == "22:00"
        assert updated_prefs.quiet_hours_end == "08:00"

    # Test Queued Notification Delivery
    @pytest.mark.asyncio
    async def test_deliver_queued_notifications(self, ws_service):
        """Test delivering notifications that were queued"""
        # Queue some notifications
        for i in range(3):
            notification = Notification(
                id=f"notif{i}",
                parent_id="parent1",
                type=NotificationType.ACHIEVEMENT,
                title=f"Achievement {i}",
                body="Test",
                created_at=datetime.utcnow()
            )
            ws_service.notification_queue.append(notification)
        
        # Connect parent
        websocket = MockWebSocket()
        await ws_service.connect("parent1", websocket)
        
        # Deliver queued
        delivered = await ws_service.deliver_queued_notifications("parent1")
        assert delivered == 3

    # Test Connection Statistics
    def test_get_connection_count(self, ws_service):
        """Test getting connection count"""
        asyncio.run(ws_service.connect("parent1", MockWebSocket()))
        asyncio.run(ws_service.connect("parent1", MockWebSocket()))
        asyncio.run(ws_service.connect("parent2", MockWebSocket()))
        
        assert ws_service.get_connection_count("parent1") == 2
        assert ws_service.get_connection_count("parent2") == 1

    def test_get_system_stats(self, ws_service):
        """Test getting system statistics"""
        asyncio.run(ws_service.connect("parent1", MockWebSocket()))
        asyncio.run(ws_service.connect("parent2", MockWebSocket()))
        
        stats = ws_service.get_system_stats()
        assert stats["active_parents"] == 2
        assert stats["total_connections"] == 2


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
