// Copyright (c) 2026 Paul Christopher Cerda
// Business Source License 1.1

/**
 * TeacherMessagesPage — /teacher/messages
 *
 * Two tabs:
 *  - Announcements: post a classroom-wide broadcast (POST/GET
 *    /teacher/classrooms/:id/announcements) — a distinct, persisted entity
 *    from 1:1 messages, visible to every student+parent in the classroom
 *    (see routes/parent.py::get_parent_announcements and
 *    routes/student.py::get_student_announcements for the read side).
 *  - Messages: 1:1 conversation threads (list/open/reply/start new), plus a
 *    fan-out "send to all parents/all students" option for ad-hoc broadcasts
 *    that land as individual parent_messages rows (distinct from the
 *    Announcements tab's single persisted announcement row).
 * Uses the /teacher/* endpoints in routes/teacher_communication.py, which
 * write into the same parent_messages / notifications tables the parent
 * portal already reads — so a message sent here shows up immediately in
 * ParentMessagesPage.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Send, MessageSquare, Megaphone, User as UserIcon, X, ChevronLeft } from 'lucide-react';
import apiClient from '@/config/api';
import { getErrorMessage } from '@/utils/errorMessage';

interface Classroom { id: string; name: string; }
interface Recipient { id: string; name: string; email: string; }
interface ParentRecipient extends Recipient { student_id: string; student_name: string; }
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

const TeacherMessagesPage: React.FC = () => {
  const { t } = useTranslation('landing');

  const [tab, setTab] = useState<'announcements' | 'messages'>('announcements');

  // ── Announcements tab state ───────────────────────────────────────────
  const [annClassrooms, setAnnClassrooms] = useState<Classroom[]>([]);
  const [annClassroomId, setAnnClassroomId] = useState('');
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [annLoading, setAnnLoading] = useState(false);
  const [annError, setAnnError] = useState<string | null>(null);
  const [annComposing, setAnnComposing] = useState(false);
  const [annTitle, setAnnTitle] = useState('');
  const [annBody, setAnnBody] = useState('');
  const [annSending, setAnnSending] = useState(false);
  const [annSendError, setAnnSendError] = useState<string | null>(null);

  useEffect(() => {
    apiClient.get('/classrooms')
      .then(r => {
        const list = Array.isArray(r.data) ? r.data : [];
        setAnnClassrooms(list);
        if (list.length) setAnnClassroomId(list[0].id);
      })
      .catch(() => setAnnClassrooms([]));
  }, []);

  const loadAnnouncements = useCallback(async (classroomId: string) => {
    if (!classroomId) return;
    setAnnLoading(true);
    setAnnError(null);
    try {
      const r = await apiClient.get(`/teacher/classrooms/${classroomId}/announcements`);
      setAnnouncements(Array.isArray(r.data) ? r.data : []);
    } catch (e: any) {
      setAnnError(getErrorMessage(e, 'Could not load announcements'));
    } finally {
      setAnnLoading(false);
    }
  }, []);

  useEffect(() => { if (annClassroomId) loadAnnouncements(annClassroomId); }, [annClassroomId, loadAnnouncements]);

  const sendAnnouncement = async () => {
    if (!annClassroomId || !annTitle.trim() || !annBody.trim()) {
      setAnnSendError('Please fill in a title and message.');
      return;
    }
    setAnnSending(true);
    setAnnSendError(null);
    try {
      await apiClient.post(`/teacher/classrooms/${annClassroomId}/announcements`, {
        title: annTitle.trim(),
        body: annBody.trim(),
      });
      setAnnTitle('');
      setAnnBody('');
      setAnnComposing(false);
      await loadAnnouncements(annClassroomId);
    } catch (e: any) {
      setAnnSendError(getErrorMessage(e, 'Failed to post announcement.'));
    } finally {
      setAnnSending(false);
    }
  };

  // ── Messages tab state ────────────────────────────────────────────────
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Thread view
  const [openConvo, setOpenConvo] = useState<Conversation | null>(null);
  const [thread, setThread] = useState<ThreadMessage[]>([]);
  const [replyBody, setReplyBody] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  // Compose
  const [composing, setComposing] = useState(false);
  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [classroomId, setClassroomId] = useState('');
  const [students, setStudents] = useState<Recipient[]>([]);
  const [parents, setParents] = useState<ParentRecipient[]>([]);
  const [audience, setAudience] = useState<'all_parents' | 'all_students' | 'parent' | 'student'>('all_parents');
  const [studentId, setStudentId] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendOk, setSendOk] = useState<string | null>(null);

  const loadConversations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await apiClient.get('/teacher/messages');
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
      const r = await apiClient.get(`/teacher/messages/${c.conversation_id}`);
      setThread(Array.isArray(r.data) ? r.data : []);
    } catch (e: any) {
      setError(getErrorMessage(e, 'Could not load conversation'));
    }
  };

  const sendReply = async () => {
    if (!openConvo || !replyBody.trim()) return;
    setSendingReply(true);
    try {
      await apiClient.post(`/teacher/messages/${openConvo.conversation_id}/reply`, { body: replyBody.trim() });
      setReplyBody('');
      await openThread(openConvo);
      await loadConversations();
    } catch (e: any) {
      setError(getErrorMessage(e, 'Could not send reply'));
    } finally {
      setSendingReply(false);
    }
  };

  const startCompose = () => {
    setComposing(true);
    setSendError(null);
    setSendOk(null);
    apiClient.get('/classrooms')
      .then(r => {
        const list = Array.isArray(r.data) ? r.data : [];
        setClassrooms(list);
        if (list.length) setClassroomId(list[0].id);
      })
      .catch(() => setClassrooms([]));
  };

  useEffect(() => {
    if (!classroomId) return;
    apiClient.get(`/teacher/classrooms/${classroomId}/recipients`)
      .then(r => {
        setStudents(r.data?.students ?? []);
        setParents(r.data?.parents ?? []);
        setStudentId('');
      })
      .catch(() => { setStudents([]); setParents([]); });
  }, [classroomId]);

  const send = async () => {
    if (!classroomId || !subject.trim() || !body.trim()) {
      setSendError('Please fill in a subject and message.');
      return;
    }
    if ((audience === 'student' || audience === 'parent') && !studentId) {
      setSendError('Please choose a student.');
      return;
    }
    setSending(true);
    setSendError(null);
    setSendOk(null);
    try {
      const r = await apiClient.post('/teacher/messages', {
        classroom_id: classroomId,
        audience,
        student_id: studentId || undefined,
        subject: subject.trim(),
        body: body.trim(),
      });
      setSendOk(`Sent to ${r.data.sent_count} recipient${r.data.sent_count === 1 ? '' : 's'}.`);
      setSubject('');
      setBody('');
      loadConversations();
    } catch (e: any) {
      setSendError(getErrorMessage(e, 'Failed to send message.'));
    } finally {
      setSending(false);
    }
  };

  // ── Thread view ────────────────────────────────────────────────────────
  if (openConvo) {
    return (
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '2rem 1.5rem' }}>
        <button
          onClick={() => setOpenConvo(null)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', marginBottom: 16, fontSize: '0.9rem' }}
        >
          <ChevronLeft size={16} /> Back to messages
        </button>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: 4 }}>{openConvo.other_user_name}</h1>
        <p style={{ color: 'var(--text-muted)', marginBottom: 20, fontSize: '0.85rem' }}>{openConvo.subject}</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
          {thread.map(m => (
            <div
              key={m.id}
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
                {m.is_mine ? 'You' : m.from_name} · {timeAgo(m.created_at)}
              </div>
              <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{m.body}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <textarea
            value={replyBody}
            onChange={e => setReplyBody(e.target.value)}
            placeholder={t('pages_teacher_teachermessagespage.placeholder_write_a_reply', 'Write a reply…')}
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
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>{t('pages_teacher_teachermessagespage.title', 'Messages')}</h1>
        <p style={{ color: 'var(--text-muted)', marginTop: 4, fontSize: '0.9rem' }}>
          {t('pages_teacher_teachermessagespage.subtitle', 'Post announcements to a whole class, or message students and parents directly.')}
        </p>
      </div>

      <div role="tablist" style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 24 }}>
        <button
          role="tab"
          aria-selected={tab === 'announcements'}
          data-testid="tab-announcements"
          onClick={() => setTab('announcements')}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', background: 'none', border: 'none',
            borderBottom: `2px solid ${tab === 'announcements' ? 'var(--primary)' : 'transparent'}`,
            color: tab === 'announcements' ? 'var(--primary)' : 'var(--text-muted)',
            fontWeight: 600, cursor: 'pointer', fontSize: '0.92rem',
          }}
        >
          <Megaphone size={16} /> Announcements
        </button>
        <button
          role="tab"
          aria-selected={tab === 'messages'}
          data-testid="tab-messages"
          onClick={() => setTab('messages')}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', background: 'none', border: 'none',
            borderBottom: `2px solid ${tab === 'messages' ? 'var(--primary)' : 'transparent'}`,
            color: tab === 'messages' ? 'var(--primary)' : 'var(--text-muted)',
            fontWeight: 600, cursor: 'pointer', fontSize: '0.92rem',
          }}
        >
          <MessageSquare size={16} /> Messages
        </button>
      </div>

      {tab === 'announcements' && (
        <div data-testid="announcements-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
            <div style={{ minWidth: 200 }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>{t('pages_teacher_teachermessagespage.classroom', 'Classroom')}</label>
              <select
                value={annClassroomId}
                onChange={e => setAnnClassroomId(e.target.value)}
                data-testid="announcement-classroom-select"
                style={{ padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', minWidth: 220 }}
              >
                {annClassrooms.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <button
              onClick={() => (annComposing ? setAnnComposing(false) : setAnnComposing(true))}
              data-testid="new-announcement-button"
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.6rem 1.2rem', borderRadius: 8, background: 'var(--primary)', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer' }}
            >
              {annComposing ? <><X size={16} /> Cancel</> : <><Megaphone size={16} /> New Announcement</>}
            </button>
          </div>

          {annComposing && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '1.25rem', marginBottom: 24 }}>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>{t('pages_teacher_teachermessagespage.title', 'Title')}</label>
                <input
                  value={annTitle}
                  onChange={e => setAnnTitle(e.target.value)}
                  placeholder={t('pages_teacher_teachermessagespage.placeholder_eg_field_trip_friday', 'e.g. Field trip Friday')}
                  data-testid="announcement-title-input"
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', boxSizing: 'border-box' }}
                />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>{t('pages_teacher_teachermessagespage.message', 'Message')}</label>
                <textarea
                  value={annBody}
                  onChange={e => setAnnBody(e.target.value)}
                  rows={5}
                  data-testid="announcement-body-input"
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
                />
              </div>

              {annSendError && <div style={{ background: '#fee2e2', color: '#b91c1c', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: '0.85rem' }}>{annSendError}</div>}

              <button
                onClick={sendAnnouncement}
                disabled={annSending}
                data-testid="send-announcement-button"
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.6rem 1.4rem', borderRadius: 8, background: 'var(--primary)', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', opacity: annSending ? 0.6 : 1 }}
              >
                <Send size={16} /> {annSending ? 'Posting…' : 'Post Announcement'}
              </button>
            </div>
          )}

          {annError && <div style={{ background: '#fee2e2', color: '#b91c1c', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>{annError}</div>}
          {annLoading && <p style={{ color: 'var(--text-muted)' }}>{t('pages_teacher_teachermessagespage.loading', 'Loading…')}</p>}

          {!annLoading && announcements.length === 0 && !annError && (
            <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
              <Megaphone size={32} style={{ marginBottom: 10, opacity: 0.5 }} />
              <p>{t('pages_teacher_teachermessagespage.no_announcements_yet_for_this_classroom', 'No announcements yet for this classroom.')}</p>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {announcements.map(a => (
              <div key={a.id} data-testid="announcement-item" style={{ padding: '14px 18px', background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                  <div style={{ fontWeight: 700 }}>{a.title}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', flexShrink: 0 }}>{timeAgo(a.created_at)}</div>
                </div>
                <div style={{ marginTop: 8, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{a.body}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'messages' && (
      <div data-testid="messages-panel">
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button
          onClick={() => (composing ? setComposing(false) : startCompose())}
          data-testid="new-message-button"
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.6rem 1.2rem', borderRadius: 8, background: 'var(--primary)', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer' }}
        >
          {composing ? <><X size={16} /> Cancel</> : <><MessageSquare size={16} /> New Message</>}
        </button>
      </div>

      {composing && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '1.25rem', marginBottom: 24 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>{t('pages_teacher_teachermessagespage.classroom', 'Classroom')}</label>
              <select value={classroomId} onChange={e => setClassroomId(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)' }}>
                {classrooms.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>{t('pages_teacher_teachermessagespage.send_to', 'Send to')}</label>
              <select value={audience} onChange={e => setAudience(e.target.value as any)} data-testid="message-audience-select"
                style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)' }}>
                <option value="parent">{t('pages_teacher_teachermessagespage.a_specific_students_parent', 'A specific student\'s parent')}</option>
                <option value="student">{t('pages_teacher_teachermessagespage.a_specific_student', 'A specific student')}</option>
                <option value="all_parents">{t('pages_teacher_teachermessagespage.all_parents_bulk_message', '👨‍👩‍👧 All parents (bulk message)')}</option>
                <option value="all_students">{t('pages_teacher_teachermessagespage.all_students_bulk_message', '🧑‍🎓 All students (bulk message)')}</option>
              </select>
            </div>
          </div>

          {(audience === 'student' || audience === 'parent') && (
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>{t('pages_teacher_teachermessagespage.student', 'Student')}</label>
              <select value={studentId} onChange={e => setStudentId(e.target.value)}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)' }}>
                <option value="">{t('pages_teacher_teachermessagespage.choose_a_student', 'Choose a student…')}</option>
                {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              {audience === 'parent' && studentId && !parents.some(p => p.student_id === studentId) && (
                <p style={{ color: '#b45309', fontSize: '0.78rem', marginTop: 6 }}>{t('pages_teacher_teachermessagespage.no_linked_parent_found_for_this_student_', 'No linked parent found for this student yet.')}</p>
              )}
            </div>
          )}

          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>{t('pages_teacher_teachermessagespage.subject', 'Subject')}</label>
            <input value={subject} onChange={e => setSubject(e.target.value)} placeholder={t('pages_teacher_teachermessagespage.placeholder_eg_field_trip_reminder', 'e.g. Field trip reminder')}
              data-testid="message-subject-input"
              style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', boxSizing: 'border-box' }} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>{t('pages_teacher_teachermessagespage.message', 'Message')}</label>
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={5}
              data-testid="message-body-input"
              style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }} />
          </div>

          {sendError && <div style={{ background: '#fee2e2', color: '#b91c1c', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: '0.85rem' }}>{sendError}</div>}
          {sendOk && <div data-testid="message-send-ok" style={{ background: '#dcfce7', color: '#166534', borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: '0.85rem' }}>{sendOk}</div>}

          <button onClick={send} disabled={sending} data-testid="send-message-button"
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0.6rem 1.4rem', borderRadius: 8, background: 'var(--primary)', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', opacity: sending ? 0.6 : 1 }}>
            <Send size={16} /> {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      )}

      {error && <div style={{ background: '#fee2e2', color: '#b91c1c', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>{error}</div>}
      {loading && <p style={{ color: 'var(--text-muted)' }}>{t('pages_teacher_teachermessagespage.loading', 'Loading…')}</p>}

      {!loading && conversations.length === 0 && !error && (
        <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
          <MessageSquare size={32} style={{ marginBottom: 10, opacity: 0.5 }} />
          <p>{t('pages_teacher_teachermessagespage.no_messages_yet_use_new_message_to_reach', 'No messages yet. Use "New Message" to reach a student, a parent, or the whole class.')}</p>
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
      )}
    </div>
  );
};

export default TeacherMessagesPage;
