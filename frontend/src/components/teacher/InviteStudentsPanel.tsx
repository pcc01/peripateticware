// Copyright (c) 2026 Paul Christopher Cerda
// Business Source License 1.1

/**
 * InviteStudentsPanel
 *
 * Used inside the classroom detail / management page.
 * Three invite paths:
 *   1. Open link — copy a link anyone can use (no email needed)
 *   2. Email invites — enter one or more emails, send individually
 *   3. CSV upload — upload a spreadsheet of student emails for bulk invites
 */

import React, { useState, useRef } from 'react';
import { Link2, Mail, Upload, Copy, Check, AlertTriangle, X } from 'lucide-react';
import apiClient from '@/config/api';
import { useTranslation } from 'react-i18next';

interface Invite {
  email:      string | null;
  token:      string;
  join_url:   string;
  expires_at: string;
  status?:    string;
}

interface Props {
  classroomId: string;
  onDone?: () => void;  // called after any successful invite batch
}

export default function InviteStudentsPanel({ classroomId, onDone }: Props) {
  const { t } = useTranslation();
  const [tab, setTab]             = useState<'link' | 'email' | 'csv'>('link');
  const [emails, setEmails]       = useState('');
  const [loading, setLoading]     = useState(false);
  const [results, setResults]     = useState<Invite[] | null>(null);
  const [error, setError]         = useState('');
  const [copied, setCopied]       = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const baseUrl = window.location.origin;

  const copyToClipboard = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 2500);
    } catch {
      // Fallback for non-HTTPS
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(key);
      setTimeout(() => setCopied(null), 2500);
    }
  };

  const createOpenLink = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await apiClient.post(`/api/v1/classrooms/${classroomId}/invites`, {
        emails: [],
      });
      setResults(data.invites);
      onDone?.();
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? 'Failed to create invite link.');
    } finally {
      setLoading(false);
    }
  };

  const sendEmailInvites = async () => {
    const list = emails
      .split(/[\n,;]/)
      .map(s => s.trim().toLowerCase())
      .filter(s => s.includes('@'));

    if (!list.length) {
      setError('Please enter at least one valid email address.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const { data } = await apiClient.post(`/api/v1/classrooms/${classroomId}/invites`, {
        emails: list,
      });
      setResults(data.invites);
      setEmails('');
      onDone?.();
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? 'Failed to send invites.');
    } finally {
      setLoading(false);
    }
  };

  const uploadCsv = async (file: File) => {
    setLoading(true);
    setError('');
    const fd = new FormData();
    fd.append('file', file);
    try {
      const { data } = await apiClient.post(
        `/api/v1/classrooms/${classroomId}/invites/bulk-csv`,
        fd,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      );
      setResults(data.invites);
      onDone?.();
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? 'CSV upload failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="font-semibold text-gray-900 mb-4">{t('components_teacher_invitestudentspanel.invite_students', 'Invite Students')}</h3>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-gray-100 rounded-lg p-1">
        {([
          { key: 'link',  icon: Link2,   label: 'Open Link' },
          { key: 'email', icon: Mail,    label: 'By Email' },
          { key: 'csv',   icon: Upload,  label: 'CSV Upload' },
        ] as const).map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={() => { setTab(key); setResults(null); setError(''); }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-sm font-medium transition ${
              tab === key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Open Link tab */}
      {tab === 'link' && (
        <div>
          <p className="text-sm text-gray-500 mb-4">{t('components_teacher_invitestudentspanel.generate_a_link_anyone_can_use_to_join_t', 'Generate a link anyone can use to join this classroom. Good for in-person signup — show it on a screen or print it as a QR code.')}</p>
          {!results ? (
            <button
              onClick={createOpenLink}
              disabled={loading}
              className="w-full py-2.5 bg-green-700 hover:bg-green-800 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
            >
              {loading ? 'Generating…' : 'Generate Open Link'}
            </button>
          ) : (
            <div className="space-y-3">
              {results.map((inv) => (
                <div key={inv.token} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                  <code className="flex-1 text-xs text-gray-700 truncate">
                    {baseUrl}/join/{inv.token}
                  </code>
                  <button
                    onClick={() => copyToClipboard(`${baseUrl}/join/${inv.token}`, inv.token)}
                    className="flex-shrink-0 text-gray-400 hover:text-green-700"
                    title="Copy link"
                  >
                    {copied === inv.token
                      ? <Check className="w-4 h-4 text-green-600" />
                      : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              ))}
              <p className="text-xs text-gray-400">
                Expires {results[0]?.expires_at ? new Date(results[0].expires_at).toLocaleDateString() : '14 days from now'}
              </p>
              <button
                onClick={() => { setResults(null); }}
                className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
              >
                <X className="w-3 h-3" /> Generate new link
              </button>
            </div>
          )}
        </div>
      )}

      {/* Email tab */}
      {tab === 'email' && (
        <div>
          <p className="text-sm text-gray-500 mb-3">{t('components_teacher_invitestudentspanel.enter_student_emails_one_per_line_or_com', 'Enter student emails (one per line, or comma-separated). Each student gets their own invite link by email.')}</p>
          {!results ? (
            <>
              <textarea
                value={emails}
                onChange={e => setEmails(e.target.value)}
                placeholder="alex@email.com&#10;maria@email.com&#10;james@email.com"
                rows={5}
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 mb-3"
              />
              <button
                onClick={sendEmailInvites}
                disabled={loading || !emails.trim()}
                className="w-full py-2.5 bg-green-700 hover:bg-green-800 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
              >
                {loading ? 'Sending…' : 'Send Invites'}
              </button>
            </>
          ) : (
            <div className="space-y-2">
              {results.map((inv, i) => (
                <div key={i} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                  <div>
                    <p className="text-sm text-gray-800">{inv.email}</p>
                    <p className="text-xs text-gray-400">{t('components_teacher_invitestudentspanel.invite_sent', 'Invite sent')}</p>
                  </div>
                  <button
                    onClick={() => copyToClipboard(`${baseUrl}/join/${inv.token}`, inv.token)}
                    className="text-gray-400 hover:text-green-700"
                    title="Copy join link"
                  >
                    {copied === inv.token
                      ? <Check className="w-4 h-4 text-green-600" />
                      : <Copy className="w-4 h-4" />}
                  </button>
                </div>
              ))}
              <button
                onClick={() => setResults(null)}
                className="text-xs text-gray-400 hover:text-gray-600 mt-2"
              >
                + Invite more students
              </button>
            </div>
          )}
        </div>
      )}

      {/* CSV tab */}
      {tab === 'csv' && (
        <div>
          <p className="text-sm text-gray-500 mb-3">{t('components_teacher_invitestudentspanel.upload_a_csv_or_spreadsheet_with_one_stu', 'Upload a CSV or spreadsheet with one student email per row in the first column. Names, headers, and extra columns are ignored.')}</p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.xlsx,.xls,.txt"
            className="hidden"
            onChange={e => { if (e.target.files?.[0]) uploadCsv(e.target.files[0]); }}
          />
          {!results ? (
            <button
              onClick={() => fileRef.current?.click()}
              disabled={loading}
              className="w-full py-8 border-2 border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:border-green-500 hover:text-green-700 transition disabled:opacity-50 flex flex-col items-center gap-2"
            >
              <Upload className="w-6 h-6" />
              {loading ? 'Uploading…' : 'Click to upload CSV'}
            </button>
          ) : (
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {results.map((inv, i) => (
                <div key={i} className="flex items-center justify-between text-sm bg-gray-50 rounded-lg px-3 py-1.5">
                  <span className="text-gray-700">{inv.email}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                    (inv as any).status === 'already_invited'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-green-100 text-green-700'
                  }`}>
                    {(inv as any).status === 'already_invited' ? 'Already invited' : 'Invited'}
                  </span>
                </div>
              ))}
              <button
                onClick={() => { setResults(null); if (fileRef.current) fileRef.current.value = ''; }}
                className="text-xs text-gray-400 hover:text-gray-600 mt-2"
              >
                Upload another file
              </button>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="mt-3 flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
          <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
    </div>
  );
}
