// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

/**
 * ParentNotificationsPage
 * Route: /parent/notifications
 * Uses: GET /api/v1/parent/notifications  and  PUT /api/v1/parent/notifications/:id/read
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { getErrorMessage } from '@/utils/errorMessage';

const API = '/api/v1';
const getAuth = () => {
  const token = localStorage.getItem('auth_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

interface Notification {
  id: string;
  title?: string;
  message?: string;
  is_read?: boolean;
  created_at?: string;
  notification_type?: string;
}

function fmtTime(iso?: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHrs = Math.floor(diffMins / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    const diffDays = Math.floor(diffHrs / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString();
  } catch {
    return '';
  }
}

const ParentNotificationsPage: React.FC = () => {
  const { t } = useTranslation('landing');
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [parentId, setParentId] = useState<string | null>(null);

  // Get current user id for parent_id param
  useEffect(() => {
    const raw = localStorage.getItem('auth_user');
    if (raw) {
      try { setParentId(JSON.parse(raw).id); } catch { /* ignore */ }
    }
  }, []);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, any> = { limit: 50 };
      if (parentId) params.parent_id = parentId;
      if (filter === 'unread') params.unread_only = true;
      const r = await axios.get(`${API}/parent/notifications`, { headers: getAuth(), params });
      setNotifications(Array.isArray(r.data) ? r.data : []);
    } catch (e: any) {
      setError(getErrorMessage(e, 'Could not load notifications'));
    } finally {
      setLoading(false);
    }
  }, [filter, parentId]);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  const markRead = async (id: string) => {
    try {
      await axios.put(`${API}/parent/notifications/${id}/read`,
        {},
        { headers: getAuth(), params: parentId ? { parent_id: parentId } : {} }
      );
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    } catch { /* non-critical */ }
  };

  const markAllRead = async () => {
    try {
      const unread = notifications.filter(n => !n.is_read);
      await Promise.allSettled(unread.map(n => markRead(n.id)));
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch { /* non-critical */ }
  };

  const displayed = filter === 'unread' ? notifications.filter(n => !n.is_read) : notifications;
  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <div style={{ padding: '32px 0', maxWidth: 720, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 10 }}>
            🔔 {t('notifications', 'Notifications')}
            {unreadCount > 0 && (
              <span style={{
                background: 'var(--primary)',
                color: '#fff',
                borderRadius: '999px',
                padding: '2px 10px',
                fontSize: '0.85rem',
                fontWeight: 700,
              }}>
                {unreadCount}
              </span>
            )}
          </h1>
          <p style={{ margin: '4px 0 0', color: 'var(--text-muted)' }}>
            {t('activity_updates', 'Updates about your children\'s activities')}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              style={{ padding: '8px 14px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-muted)' }}
            >
              Mark all read
            </button>
          )}
          <button
            onClick={fetchNotifications}
            disabled={loading}
            style={{ padding: '8px 18px', background: 'var(--primary)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}
          >
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '12px 16px', marginBottom: 20, color: '#991b1b' }}>
          {error}
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', width: 'fit-content' }}>
        {(['all', 'unread'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '8px 20px',
              border: 'none',
              background: filter === f ? 'var(--primary)' : 'var(--surface)',
              color: filter === f ? '#fff' : 'var(--text-muted)',
              fontWeight: filter === f ? 700 : 400,
              cursor: 'pointer',
              fontSize: '0.88rem',
            }}
          >
            {f === 'all' ? `All (${notifications.length})` : `Unread (${unreadCount})`}
          </button>
        ))}
      </div>

      {/* Notification list */}
      {displayed.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 24px', color: 'var(--text-muted)', background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>🔕</div>
          <p style={{ margin: 0, fontWeight: 600 }}>
            {filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
          </p>
          <p style={{ margin: '8px 0 0', fontSize: '0.85rem' }}>{t('pages_parentnotificationspage.youll_be_notified_when_your_children_com', 'You\'ll be notified when your children complete activities, receive feedback, or have upcoming sessions.')}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {displayed.map(notif => (
            <div
              key={notif.id}
              onClick={() => !notif.is_read && markRead(notif.id)}
              style={{
                background: notif.is_read ? 'var(--surface)' : '#eff6ff',
                border: `1px solid ${notif.is_read ? 'var(--border)' : '#bfdbfe'}`,
                borderLeft: `4px solid ${notif.is_read ? 'var(--border)' : 'var(--primary)'}`,
                borderRadius: 10,
                padding: '14px 18px',
                cursor: notif.is_read ? 'default' : 'pointer',
                transition: 'background 0.15s',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    {!notif.is_read && (
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--primary)', flexShrink: 0 }} />
                    )}
                    <span style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text)' }}>
                      {notif.title || 'Notification'}
                    </span>
                  </div>
                  {notif.message && (
                    <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                      {notif.message}
                    </p>
                  )}
                </div>
                <div style={{ marginLeft: 16, flexShrink: 0, fontSize: '0.78rem', color: 'var(--text-faint)' }}>
                  {fmtTime(notif.created_at)}
                </div>
              </div>
              {!notif.is_read && (
                <div style={{ marginTop: 10, textAlign: 'right' }}>
                  <button
                    onClick={e => { e.stopPropagation(); markRead(notif.id); }}
                    style={{ fontSize: '0.78rem', color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                  >
                    Mark as read
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ParentNotificationsPage;
