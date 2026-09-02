// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

/**
 * ParentMessagesPage
 * Route: /parent/messages
 * Uses: GET /api/v1/parent/messages  and  POST /api/v1/parent/messages/:id/reply
 *
 * Built following the same pattern as ParentNotificationsPage (session 15):
 * resilient fetch, array guard, and string-coerced error display so an API error
 * object can never be rendered as a React child.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { getErrorMessage } from '@/utils/errorMessage';
import { useEscapeKey } from '@/hooks/useEscapeKey';

const API = '/api/v1';
const getAuth = () => {
  const token = localStorage.getItem('auth_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

interface Message {
  id: string;
  from_teacher_id: string;
  from_teacher_name: string;
  to_parent_id: string;
  subject: string;
  body: string;
  read_at: string | null;
  created_at: string;
  conversation_id: string;
}

interface Announcement {
  id: string;
  classroom_id: string;
  classroom_name: string;
  teacher_id: string;
  teacher_name: string;
  child_id: string;
  child_name: string;
  title: string;
  body: string;
  created_at: string;
}

function timeAgo(iso: string): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export const ParentMessagesPage: React.FC = () => {
  const { t } = useTranslation('landing');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parentId, setParentId] = useState<string | null>(null);

  // Announcements
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [announcementsError, setAnnouncementsError] = useState<string | null>(null);

  // Reply state
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  useEscapeKey(!!replyTo, () => setReplyTo(null));
  const [replyBody, setReplyBody] = useState('');
  const [sending, setSending] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [replyOk, setReplyOk] = useState(false);

  useEffect(() => {
    const raw = localStorage.getItem('auth_user');
    if (raw) {
      try { setParentId(JSON.parse(raw).id); } catch { /* ignore */ }
    }
  }, []);

  const fetchMessages = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, any> = { limit: 50 };
      if (parentId) params.parent_id = parentId;
      const r = await axios.get(`${API}/parent/messages`, { headers: getAuth(), params });
      setMessages(Array.isArray(r.data) ? r.data : []);
    } catch (e: any) {
      setError(getErrorMessage(e, 'Could not load messages'));
    } finally {
      setLoading(false);
    }
  }, [parentId]);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);

  const fetchAnnouncements = useCallback(async () => {
    try {
      const r = await axios.get(`${API}/parent/announcements`, { headers: getAuth(), params: { limit: 20 } });
      setAnnouncements(Array.isArray(r.data) ? r.data : []);
    } catch (e: any) {
      setAnnouncementsError(getErrorMessage(e, 'Could not load announcements'));
    }
  }, []);

  useEffect(() => { fetchAnnouncements(); }, [fetchAnnouncements]);

  const openReply = (m: Message) => {
    setReplyTo(m);
    setReplyBody('');
    setReplyError(null);
    setReplyOk(false);
  };

  const sendReply = async () => {
    if (!replyTo || !replyBody.trim()) { setReplyError('Write a message first.'); return; }
    setSending(true);
    setReplyError(null);
    try {
      await axios.post(
        `${API}/parent/messages/${replyTo.id}/reply`,
        { body: replyBody.trim() },
        { headers: getAuth(), params: parentId ? { parent_id: parentId } : {} },
      );
      setReplyOk(true);
      setReplyBody('');
    } catch (e: any) {
      setReplyError(getErrorMessage(e, 'Could not send reply'));
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ fontFamily: 'var(--font-body)', maxWidth: 720 }}>
      <h1 style={{ fontFamily: 'var(--font-head)', marginBottom: 8 }}>
        {t('pages_parentmessagespage.messages', 'Messages')}
      </h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>
        {t('pages_parentmessagespage.subtitle', 'Messages from your child’s teachers. Reply to stay in touch.')}
      </p>

      {announcements.length > 0 && (
        <div data-testid="announcements-section" style={{ marginBottom: 28 }}>
          <h2 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: 10 }}>
            {t('pages_parentmessagespage.announcements_title', 'Classroom Announcements')}
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {announcements.map(a => (
              <div
                key={a.id}
                data-testid="announcement-banner-item"
                style={{
                  padding: '14px 18px', background: 'var(--surface)', borderRadius: 10,
                  border: '1px solid var(--border)', borderLeft: '4px solid #f59e0b',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ fontWeight: 700 }}>{a.title}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>{timeAgo(a.created_at)}</div>
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: 2 }}>
                  {a.classroom_name} · {a.teacher_name} · {a.child_name}
                </div>
                <div style={{ marginTop: 8, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{a.body}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {announcementsError && (
        <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', color: '#be123c', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: '0.85rem' }}>
          {announcementsError}
        </div>
      )}

      {error && (
        <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', color: '#be123c', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: '0.9rem' }}>
          {error}
        </div>
      )}
      {loading && <p style={{ color: 'var(--text-muted)' }}>{t('pages_parentmessagespage.loading', 'Loading…')}</p>}

      {!loading && messages.length === 0 && !error && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>💬</div>
          <p>{t('pages_parentmessagespage.empty', 'No messages yet. When a teacher reaches out, it will appear here.')}</p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {messages.map(m => {
          const unread = !m.read_at;
          return (
            <div
              key={m.id}
              style={{
                padding: '16px 20px', background: 'var(--surface)', borderRadius: 10,
                border: '1px solid var(--border)',
                borderLeft: `4px solid ${unread ? 'var(--primary)' : 'var(--border)'}`,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                <div style={{ fontWeight: 700 }}>{m.subject || '(no subject)'}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', flexShrink: 0 }}>{timeAgo(m.created_at)}</div>
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: 2 }}>
                {t('pages_parentmessagespage.from', 'From')}: {m.from_teacher_name || 'Teacher'}
              </div>
              <div style={{ marginTop: 10, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{m.body}</div>
              <button
                onClick={() => openReply(m)}
                style={{ marginTop: 12, padding: '6px 14px', borderRadius: 6, border: '1px solid var(--primary)', background: 'transparent', color: 'var(--primary)', fontWeight: 600, cursor: 'pointer', fontSize: '0.82rem' }}
              >
                {t('pages_parentmessagespage.reply', 'Reply')}
              </button>
            </div>
          );
        })}
      </div>

      {replyTo && (
        <div
          onClick={() => setReplyTo(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
        >
          <div role="dialog" aria-modal="true" aria-labelledby="reply-dialog-title" onClick={e => e.stopPropagation()} style={{ background: 'var(--surface, #fff)', borderRadius: 12, padding: 28, width: 520, maxWidth: '92vw' }}>
            <h2 id="reply-dialog-title" style={{ margin: '0 0 6px', fontFamily: 'var(--font-head)' }}>{t('pages_parentmessagespage.reply', 'Reply')}</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 0, marginBottom: 16 }}>
              {t('pages_parentmessagespage.to', 'To')}: {replyTo.from_teacher_name || 'Teacher'} · {replyTo.subject}
            </p>

            <textarea
              value={replyBody}
              onChange={e => setReplyBody(e.target.value)}
              autoFocus
              rows={6}
              placeholder={t('pages_parentmessagespage.write_placeholder', 'Write your reply…')}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', marginBottom: 16, boxSizing: 'border-box', fontFamily: 'inherit', fontSize: '0.95rem', resize: 'vertical' }}
            />

            {replyOk && <div style={{ background: '#dcfce7', border: '1px solid #86efac', color: '#166534', borderRadius: 8, padding: '8px 12px', marginBottom: 16, fontSize: '0.85rem' }}>{t('pages_parentmessagespage.sent', 'Reply sent.')}</div>}
            {replyError && <div style={{ background: '#fff1f2', border: '1px solid #fecdd3', color: '#be123c', borderRadius: 8, padding: '8px 12px', marginBottom: 16, fontSize: '0.85rem' }}>{replyError}</div>}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button onClick={() => setReplyTo(null)} style={{ padding: '10px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', fontWeight: 500 }}>
                {replyOk ? t('pages_parentmessagespage.done', 'Done') : t('pages_parentmessagespage.cancel', 'Cancel')}
              </button>
              {!replyOk && (
                <button onClick={sendReply} disabled={sending || !replyBody.trim()} style={{ padding: '10px 18px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#fff', fontWeight: 600, cursor: sending ? 'wait' : 'pointer', opacity: sending || !replyBody.trim() ? 0.6 : 1 }}>
                  {sending ? t('pages_parentmessagespage.sending', 'Sending…') : t('pages_parentmessagespage.send', 'Send Reply')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ParentMessagesPage;
