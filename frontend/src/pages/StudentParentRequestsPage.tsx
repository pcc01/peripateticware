// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

/**
 * StudentParentRequestsPage — /student/parent-requests
 *
 * A parent can request to link to a student's account (see LinkChildPage /
 * POST /parent/link-child), but that request only creates a status='pending'
 * row — routes/student.py's approve/deny endpoints require the STUDENT to
 * act on it, and until now nothing in the frontend ever called them. A
 * parent could request a link and the student would get no way to see or
 * approve it, leaving every request stuck pending forever. This page is
 * that missing half of the flow.
 */

import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { studentApi } from '@/services/api';
import type { ParentLinkRequest } from '@/services/types';

export const StudentParentRequestsPage: React.FC = () => {
  const { t } = useTranslation('common');
  const [requests, setRequests] = useState<ParentLinkRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actingOn, setActingOn] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await studentApi.getParentRequests();
      setRequests(data);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to load parent requests.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleDecision = async (parentId: string, decision: 'approve' | 'deny') => {
    setActingOn(parentId);
    setError(null);
    try {
      if (decision === 'approve') {
        await studentApi.approveParentRequest(parentId);
      } else {
        await studentApi.denyParentRequest(parentId);
      }
      setRequests((prev) => prev.filter((r) => r.parent_id !== parentId));
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to update the request.');
    } finally {
      setActingOn(null);
    }
  };

  return (
    <div style={{ maxWidth: 560, margin: '0 auto', padding: '24px 0' }}>
      <h1 style={{ fontFamily: 'var(--font-head)', marginBottom: 8 }}>
        👪 {t('parent_requests', 'Parent Requests')}
      </h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 32, lineHeight: 1.6 }}>
        {t(
          'parent_requests_description',
          "A parent or guardian can ask to follow your progress. Approving lets them see your activities and reports — you can revoke access from their profile at any time. Denying declines the request."
        )}
      </p>

      {error && (
        <div style={{
          background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: 8,
          padding: '10px 14px', marginBottom: 16, color: '#be123c', fontSize: '0.9rem',
        }}>
          {error}
        </div>
      )}

      {loading ? (
        <p style={{ color: 'var(--text-muted)' }}>{t('loading', 'Loading…')}</p>
      ) : requests.length === 0 ? (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 12, padding: '24px', textAlign: 'center', color: 'var(--text-muted)',
        }}>
          {t('no_pending_parent_requests', 'No pending parent requests right now.')}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {requests.map((req) => (
            <div key={req.parent_id} style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 12, padding: '16px 20px',
            }}>
              <div style={{ fontWeight: 600, marginBottom: 2 }}>{req.parent_name}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 4 }}>
                {req.parent_email} · {req.relationship}
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginBottom: 14 }}>
                {t('requested_on', 'Requested')} {new Date(req.requested_at).toLocaleDateString()}
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => handleDecision(req.parent_id, 'approve')}
                  disabled={actingOn === req.parent_id}
                  style={{
                    flex: 1, padding: '10px', borderRadius: 8, border: 'none',
                    background: 'var(--primary)', color: 'white', fontWeight: 600,
                    cursor: actingOn === req.parent_id ? 'wait' : 'pointer',
                    opacity: actingOn === req.parent_id ? 0.6 : 1,
                  }}
                >
                  {t('approve', 'Approve')}
                </button>
                <button
                  onClick={() => handleDecision(req.parent_id, 'deny')}
                  disabled={actingOn === req.parent_id}
                  style={{
                    flex: 1, padding: '10px', borderRadius: 8, border: '1px solid var(--border)',
                    background: 'var(--surface)', fontWeight: 600,
                    cursor: actingOn === req.parent_id ? 'wait' : 'pointer',
                    opacity: actingOn === req.parent_id ? 0.6 : 1,
                  }}
                >
                  {t('deny', 'Deny')}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default StudentParentRequestsPage;
