import React, { useState, useEffect } from 'react';

interface Notification {
  id: string;
  type: 'achievement' | 'concern' | 'activity_complete' | 'message' | 'reminder' | 'system';
  title: string;
  body: string;
  child_id?: string;
  created_at: string;
  read: boolean;
  read_at?: string;
}

interface NotificationCenterProps {
  onClose?: () => void;
  onReadNotification?: (notificationId: string) => void;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
  onClose,
  onReadNotification
}) => {
  const [notifications, setNotifications] = useState<Notification[]>([
    {
      id: 'notif1',
      type: 'achievement',
      title: '🏆 Achievement Unlocked!',
      body: 'Emma completed the "Photosynthesis" module and earned a badge!',
      child_id: 'child1',
      created_at: '2026-04-27T10:30:00Z',
      read: false
    },
    {
      id: 'notif2',
      type: 'activity_complete',
      title: '✅ Activity Completed',
      body: 'Lucas completed "Daily Math Practice" with 92% accuracy',
      child_id: 'child2',
      created_at: '2026-04-27T09:15:00Z',
      read: false
    },
    {
      id: 'notif3',
      type: 'message',
      title: '💬 Message from Teacher',
      body: 'Ms. Smith sent you a message about Emma\'s progress',
      created_at: '2026-04-26T15:45:00Z',
      read: true
    }
  ]);

  const [filter, setFilter] = useState<Notification['type'] | 'all'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const unreadCount = notifications.filter(n => !n.read).length;

  const filteredNotifications = filter === 'all'
    ? notifications
    : notifications.filter(n => n.type === filter);

  const handleMarkAsRead = (notificationId: string) => {
    setNotifications(notifications.map(n =>
      n.id === notificationId
        ? { ...n, read: true, read_at: new Date().toISOString() }
        : n
    ));
    onReadNotification?.(notificationId);
  };

  const handleMarkAllAsRead = () => {
    setNotifications(notifications.map(n => ({
      ...n,
      read: true,
      read_at: new Date().toISOString()
    })));
  };

  const handleDelete = (notificationId: string) => {
    setNotifications(notifications.filter(n => n.id !== notificationId));
  };

  const handleClearAll = () => {
    if (window.confirm('Are you sure you want to clear all notifications?')) {
      setNotifications([]);
    }
  };

  const getNotificationIcon = (type: Notification['type']) => {
    switch (type) {
      case 'achievement':
        return '🏆';
      case 'concern':
        return '⚠️';
      case 'activity_complete':
        return '✅';
      case 'message':
        return '💬';
      case 'reminder':
        return '🔔';
      default:
        return '📌';
    }
  };

  const getNotificationColor = (type: Notification['type']) => {
    switch (type) {
      case 'achievement':
        return 'bg-yellow-50 border-yellow-200';
      case 'concern':
        return 'bg-red-50 border-red-200';
      case 'activity_complete':
        return 'bg-green-50 border-green-200';
      case 'message':
        return 'bg-blue-50 border-blue-200';
      default:
        return 'bg-gray-50 border-gray-200';
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="w-full max-w-2xl bg-white rounded-lg shadow-lg flex flex-col max-h-[600px]">
      {/* Header */}
      <div className="border-b border-gray-200 p-6 flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Notifications</h2>
          {unreadCount > 0 && (
            <p className="text-sm text-gray-600">
              {unreadCount} unread notification{unreadCount !== 1 ? 's' : ''}
            </p>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-700 text-2xl"
        >
          ✕
        </button>
      </div>

      {/* Filters */}
      <div className="border-b border-gray-200 px-6 py-4 flex gap-2 overflow-x-auto">
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2 rounded-full whitespace-nowrap ${
            filter === 'all'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          All
        </button>
        <button
          onClick={() => setFilter('achievement')}
          className={`px-4 py-2 rounded-full whitespace-nowrap ${
            filter === 'achievement'
              ? 'bg-yellow-500 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          🏆 Achievements
        </button>
        <button
          onClick={() => setFilter('activity_complete')}
          className={`px-4 py-2 rounded-full whitespace-nowrap ${
            filter === 'activity_complete'
              ? 'bg-green-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          ✅ Activities
        </button>
        <button
          onClick={() => setFilter('concern')}
          className={`px-4 py-2 rounded-full whitespace-nowrap ${
            filter === 'concern'
              ? 'bg-red-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          ⚠️ Concerns
        </button>
        <button
          onClick={() => setFilter('message')}
          className={`px-4 py-2 rounded-full whitespace-nowrap ${
            filter === 'message'
              ? 'bg-blue-500 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
        >
          💬 Messages
        </button>
      </div>

      {/* Notifications List */}
      <div className="flex-1 overflow-y-auto">
        {filteredNotifications.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-gray-600">
              {filter === 'all' ? 'No notifications yet' : `No ${filter} notifications`}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {filteredNotifications.map((notification) => (
              <div
                key={notification.id}
                className={`border-l-4 ${
                  notification.read ? 'opacity-60' : ''
                } ${getNotificationColor(notification.type)} border-l-0 p-4 hover:bg-gray-50 transition`}
              >
                <div className="flex gap-4">
                  <span className="text-2xl flex-shrink-0">
                    {getNotificationIcon(notification.type)}
                  </span>

                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start gap-2">
                      <div>
                        <h3 className="font-semibold text-gray-900">
                          {notification.title}
                        </h3>
                        <p className="text-sm text-gray-700 mt-1">
                          {notification.body}
                        </p>
                      </div>

                      {!notification.read && (
                        <span className="flex-shrink-0 w-2 h-2 bg-blue-600 rounded-full mt-1" />
                      )}
                    </div>

                    <div className="mt-3 text-xs text-gray-500">
                      {formatTime(notification.created_at)}
                    </div>

                    {expandedId === notification.id && (
                      <div className="mt-4 space-y-2">
                        <button
                          onClick={() => handleMarkAsRead(notification.id)}
                          className="text-sm bg-white text-gray-700 px-3 py-1 rounded hover:bg-gray-100 border border-gray-200"
                        >
                          {notification.read ? 'Mark as unread' : 'Mark as read'}
                        </button>
                        <button
                          onClick={() => handleDelete(notification.id)}
                          className="text-sm bg-red-50 text-red-600 px-3 py-1 rounded hover:bg-red-100 border border-red-200 ml-2"
                        >
                          Delete
                        </button>
                      </div>
                    )}

                    <button
                      onClick={() =>
                        setExpandedId(expandedId === notification.id ? null : notification.id)
                      }
                      className="text-xs text-blue-600 hover:text-blue-700 mt-2"
                    >
                      {expandedId === notification.id ? 'Hide' : 'More'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      {notifications.length > 0 && (
        <div className="border-t border-gray-200 p-4 flex gap-2 justify-end">
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllAsRead}
              className="px-4 py-2 text-sm text-blue-600 hover:text-blue-700"
            >
              Mark all as read
            </button>
          )}
          <button
            onClick={handleClearAll}
            className="px-4 py-2 text-sm text-red-600 hover:text-red-700"
          >
            Clear all
          </button>
        </div>
      )}
    </div>
  );
};

export default NotificationCenter;
