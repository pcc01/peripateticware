// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

/**
 * StudentMessagesPage — /student/messages
 *
 * Mirrors the mobile app's student messaging screens (mobile/app/
 * student-messages.tsx + student-message-thread/[id].tsx +
 * student-announcements.tsx) in a single web page, following the
 * ParentMessagesPage.tsx convention of combining an announcements section
 * with a messages list on one route rather than splitting into two pages.
 *
 * Scope matches the backend: a student can only read/reply within threads a
 * teacher already started (routes/student.py — list_student_conversations,
 * get_student_conversation_thread, reply_to_student_conversation) — there is
 * no student-initiated "compose new message" endpoint, so this page has no
 * compose UI. Announcements (GET /student/announcements) are one-way
 * broadcasts with no reply.
 *
 * The thread view (open a conversation -> full back-and-forth with a reply
 * box) is adapted almost exactly from TeacherMessagesPage.tsx's Messages tab
 * thread view, since that's the more correct pattern for an ongoing 1:1
 * conversation (and matches what the mobile app does).
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Send, MessageSquare, Megaphone, User as UserIcon, ChevronLeft } from 'lucide-react';
import apiClient from '@/config/api';
import { getErrorMessage } from '@/utils/errorMessage';

interface Conversation {
  conversation_id: string;
  other_user_id: string;
  other_user_name: string;
  subject: string;
  last_message: string;
  last_message_at: string | null;
  unread: boolean;
}
interface ThreadMessage {
  id: string;
  from_user_id: string;
  from_name: string;
  is_mine: boolean;
  subject: string;
  body: string;
  created_at: string | null;
}
interface Announcement {
  id: string;
  classroom_id: string;
  classroom_name: string;
  teacher_id: string;
  teacher_name: string;
  title: string;
  body: string;
  created_at: string;
}

function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

const StudentMessagesPage: React.FC = () => {
  const { t } = useTranslation('landing');

  // ── Announcements ──────────────────────────────────────────────────────
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [annLoading, setAnnLoading] = useState(true);
  const [annError, setAnnError] = useState<string | null>(null);

  const loadAnnouncements = useCallback(async () => {
    setAnnLoading(true);
    setAnnError(null);
    try {
      const r = await apiClient.get('/student/announcements');
      setAnnouncements(Array.isArray(r.data) ? r.data : []);
    } catch (e: any) {
      setAnnError(getErrorMessage(e, 'Could not load announcements'));
    } finally {
      setAnnLoading(false);
    }
  }, []);

  useEffect(() => { loadAnnouncements(); }, [loadAnnouncements]);

  // ── Messages ───────────────────────────────────────────────────────────
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Thread view
  const [openConvo, setOpenConvo] = useState<Conversation | null>(null);
  const [thread, setThread] = useState<ThreadMessage[]>([]);
  const [replyBody, setReplyBody] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  const loadConversations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await apiClient.get('/student/messages');
      setConversations(Array.isArray(r.data) ? r.data : []);
    } catch (e: any) {
      setError(getErrorMessage(e, 'Could not load messages'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  const openThread = async (c: Conversation) => {
    setOpenConvo(c);
    setThread([]);
    try {
      const r = await apiClient.get(`/student/messages/${c.conversation_id}`);
      setThread(Array.isArray(r.data) ? r.data : []);
    } catch (e: any) {
      setError(getErrorMessage(e, 'Could not load conversation'));
    }
  };

  const sendReply = async () => {
    if (!openConvo || !replyBody.trim()) return;
    setSendingReply(true);
    try {
      await apiClient.post(`/student/messages/${openConvo.conversation_id}/reply`, { body: replyBody.trim() });
      setReplyBody('');
      await openThread(openConvo);
      await loadConversations();
    } catch (e: any) {
      setError(getErrorMessage(e, 'Could not send reply'));
    } finally {
      setSendingReply(false);
    }
  };

  // ── Thread view ────────────────────────────────────────────────────────
  if (openConvo) {
    return (
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '2rem 1.5rem' }}>
        <button
          onClick={() => setOpenConvo(null)}
          data-testid="back-to-messages"
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', marginBottom: 16, fontSize: '0.9rem' }}
        >
          <ChevronLeft size={16} /> {t('pages_student_studentmessagespage.back_to_messages', 'Back to messages')}
        </button>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: 4 }}>{openConvo.other_user_name}</h1>
        <p style={{ color: 'var(--text-muted)', marginBottom: 20, fontSize: '0.85rem' }}>{openConvo.subject}</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
          {thread.map(m => (
            <div
              key={m.id}
              data-testid="thread-message"
              style={{
                alignSelf: m.is_mine ? 'flex-end' : 'flex-start',
                maxWidth: '80%',
                background: m.is_mine ? 'var(--primary)' : 'var(--surface)',
                color: m.is_mine ? '#fff' : 'var(--text)',
                border: m.is_mine ? 'none' : '1px solid var(--border)',
                borderRadius: 12,
                padding: '10px 14px',
              }}
            >
              <div style={{ fontSize: '0.72rem', opacity: 0.75, marginBottom: 4 }}>
                {m.is_mine ? t('pages_student_studentmessagespage.you', 'You') : m.from_name} · {timeAgo(m.created_at)}
              </div>
              <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{m.body}</div>
            </div>
          ))}
        </div>

        {error && <div style={{ background: '#fee2e2', color: '#b91c1c', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 10 }}>
          <textarea
            value={replyBody}
            onChange={e => setReplyBody(e.target.value)}
            placeholder={t('pages_student_studentmessagespage.placeholder_write_a_reply', 'Write a reply…')}
            rows={3}
            data-testid="reply-body-input"
            style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', fontFamily: 'inherit', resize: 'vertical' }}
          />
          <button
            onClick={sendReply}
            disabled={sendingReply || !replyBody.trim()}
            data-testid="send-reply-button"
            style={{ padding: '0 18px', borderRadius: 8, border: 'none', background: 'var(--primary)', color: '#fff', fontWeight: 600, cursor: 'pointer', opacity: sendingReply || !replyBody.trim() ? 0.6 : 1 }}
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '2rem 1.5rem' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>{t('pages_student_studentmessagespage.title', 'Messages')}</h1>
        <p style={{ color: 'var(--text-muted)', marginTop: 4, fontSize: '0.9rem' }}>
          {t('pages_student_studentmessagespage.subtitle', 'See announcements from your teachers and reply to messages sent to you.')}
        </p>
      </div>

      {/* Announcements */}
      <div data-testid="announcements-section" style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Megaphone size={16} /> {t('pages_student_studentmessagespage.announcements_title', 'Classroom Announcements')}
        </h2>

        {annError && <div style={{ background: '#fee2e2', color: '#b91c1c', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: '0.85rem' }}>{annError}</div>}
        {annLoading && <p style={{ color: 'var(--text-muted)' }}>{t('pages_student_studentmessagespage.loading', 'Loading…')}</p>}

        {!annLoading && announcements.length === 0 && !annError && (
          <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-muted)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
            <p>{t('pages_student_studentmessagespage.no_announcements_yet', 'No announcements yet.')}</p>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {announcements.map(a => (
            <div key={a.id} data-testid="student-announcement-item" style={{ padding: '14px 18px', background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)', borderLeft: '4px solid #f59e0b' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ fontWeight: 700 }}>{a.title}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', flexShrink: 0 }}>{timeAgo(a.created_at)}</div>
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: 2 }}>
                {a.classroom_name} · {a.teacher_name}
              </div>
              <div style={{ marginTop: 8, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{a.body}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div data-testid="messages-section">
        <h2 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
          <MessageSquare size={16} /> {t('pages_student_studentmessagespage.messages_title', 'Messages')}
        </h2>

        {error && <div style={{ background: '#fee2e2', color: '#b91c1c', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>{error}</div>}
        {loading && <p style={{ color: 'var(--text-muted)' }}>{t('pages_student_studentmessagespage.loading', 'Loading…')}</p>}

        {!loading && conversations.length === 0 && !error && (
          <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
            <MessageSquare size={32} style={{ marginBottom: 10, opacity: 0.5 }} />
            <p>{t('pages_student_studentmessagespage.no_messages_yet', 'No messages from teachers yet.')}</p>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {conversations.map(c => (
            <div
              key={c.conversation_id}
              onClick={() => openThread(c)}
              data-testid="conversation-item"
              style={{
                padding: '14px 18px', background: 'var(--surface)', borderRadius: 10,
                border: '1px solid var(--border)', borderLeft: `4px solid ${c.unread ? 'var(--primary)' : 'var(--border)'}`,
                cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <UserIcon size={14} /> {c.other_user_name}
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.subject} — {c.last_message}
                </div>
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', flexShrink: 0 }}>{timeAgo(c.last_message_at)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default StudentMessagesPage;
