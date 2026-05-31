// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import React, { useEffect, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { proposalApi } from '../../services/phase7Api'
import type { Proposal } from '../../types/phase7'

const SUBJECTS = [
  'General', 'Science', 'Geography', 'Social Studies',
  'Environmental Studies', 'History', 'Art', 'Language Arts', 'Math',
]

const ProposalFormPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [form, setForm] = useState({
    title: '',
    challenge_description: '',
    location_hint: '',
    subject: 'General',
    note_to_teacher: '',
  })
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [saved, setSaved]       = useState(false)

  useEffect(() => {
    if (!id) return
    proposalApi.get(id)
      .then(p => {
        setProposal(p)
        setForm({
          title: p.title,
          challenge_description: p.challenge_description,
          location_hint: p.location_hint,
          subject: p.subject,
          note_to_teacher: p.note_to_teacher,
        })
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  const isEditable = proposal?.status === 'draft' || proposal?.status === 'rejected'
  const isPending  = proposal?.status === 'pending'
  const isApproved = proposal?.status === 'approved'

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }))
    setSaved(false)
  }

  const handleSave = async () => {
    if (!id || !isEditable) return
    setSaving(true)
    setError(null)
    try {
      await proposalApi.update(id, form)
      setSaved(true)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const handleSubmit = async () => {
    if (!id || !isEditable) return
    if (!form.title.trim() || !form.challenge_description.trim()) {
      setError('Title and challenge description are required.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      // Save latest edits first, then submit
      await proposalApi.update(id, form)
      await proposalApi.submit(id)
      setProposal(p => p ? { ...p, status: 'pending' } : p)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!id || !window.confirm('Delete this challenge? This cannot be undone.')) return
    setDeleting(true)
    try {
      await proposalApi.remove(id)
      navigate('/student/proposals')
    } catch (e: any) {
      setError(e.message)
      setDeleting(false)
    }
  }

  if (loading) return <div className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>Loading…</div>
  if (!proposal) return <div className="p-8 text-center text-red-600">{error ?? 'Not found'}</div>

  return (
    <div className="max-w-2xl mx-auto p-6">
      {/* Back link */}
      <Link to="/student/proposals" className="text-sm mb-4 inline-block" style={{ color: 'var(--primary)' }}>
        ← My Challenges
      </Link>

      {/* Status banner */}
      {isPending && (
        <div className="mb-4 p-3 rounded-lg bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm">
          ⏳ <strong>Waiting for teacher review.</strong> You'll be notified when it's approved or returned.
        </div>
      )}
      {isApproved && (
        <div className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200 text-green-800 text-sm">
          ✅ <strong>Approved!</strong> Your challenge is now live for your classmates.
          {proposal.approved_activity_id && (
            <> <Link to={`/student/activities/${proposal.approved_activity_id}`} className="underline ml-1">View activity →</Link></>
          )}
        </div>
      )}
      {proposal.status === 'rejected' && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">
          📝 <strong>Needs revision.</strong>
          {proposal.teacher_feedback && <span className="ml-1">Teacher said: <em>{proposal.teacher_feedback}</em></span>}
          <span className="ml-1">Edit below and resubmit.</span>
        </div>
      )}

      <h1 className="text-2xl font-bold mb-6" style={{ color: 'var(--text)' }}>
        {isEditable ? 'Edit Challenge' : 'Challenge Details'}
      </h1>

      {error && (
        <div className="mb-4 p-3 rounded bg-red-100 text-red-700 text-sm">{error}</div>
      )}

      <div className="space-y-5">
        {/* Title */}
        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>
            Challenge Title <span className="text-red-500">*</span>
          </label>
          <input
            name="title"
            value={form.title}
            onChange={handleChange}
            disabled={!isEditable}
            placeholder="e.g. Find a stream with native plants"
            className="w-full px-3 py-2 rounded-lg border text-sm"
            style={{
              background: 'var(--surface)',
              borderColor: 'var(--border)',
              color: 'var(--text)',
              opacity: isEditable ? 1 : 0.7,
            }}
          />
        </div>

        {/* Challenge description */}
        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>
            Challenge Description <span className="text-red-500">*</span>
          </label>
          <p className="text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>
            Tell students what to find, observe, or do. Be specific.
          </p>
          <textarea
            name="challenge_description"
            value={form.challenge_description}
            onChange={handleChange}
            disabled={!isEditable}
            rows={4}
            placeholder="e.g. Visit a local stream and identify at least 3 native plants growing along the bank. Photograph each one and note what makes it native."
            className="w-full px-3 py-2 rounded-lg border text-sm resize-y"
            style={{
              background: 'var(--surface)',
              borderColor: 'var(--border)',
              color: 'var(--text)',
              opacity: isEditable ? 1 : 0.7,
            }}
          />
        </div>

        {/* Location hint */}
        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>
            Location Hint
          </label>
          <p className="text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>
            A general hint — don't give away exact coordinates.
          </p>
          <input
            name="location_hint"
            value={form.location_hint}
            onChange={handleChange}
            disabled={!isEditable}
            placeholder="e.g. Any stream or creek, a local park, near a wooded trail"
            className="w-full px-3 py-2 rounded-lg border text-sm"
            style={{
              background: 'var(--surface)',
              borderColor: 'var(--border)',
              color: 'var(--text)',
              opacity: isEditable ? 1 : 0.7,
            }}
          />
        </div>

        {/* Subject */}
        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>
            Subject
          </label>
          <select
            name="subject"
            value={form.subject}
            onChange={handleChange}
            disabled={!isEditable}
            className="w-full px-3 py-2 rounded-lg border text-sm"
            style={{
              background: 'var(--surface)',
              borderColor: 'var(--border)',
              color: 'var(--text)',
              opacity: isEditable ? 1 : 0.7,
            }}
          >
            {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {/* Note to teacher */}
        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>
            Note to Teacher <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>(optional)</span>
          </label>
          <textarea
            name="note_to_teacher"
            value={form.note_to_teacher}
            onChange={handleChange}
            disabled={!isEditable}
            rows={2}
            placeholder="Anything you'd like your teacher to know about this challenge…"
            className="w-full px-3 py-2 rounded-lg border text-sm resize-y"
            style={{
              background: 'var(--surface)',
              borderColor: 'var(--border)',
              color: 'var(--text)',
              opacity: isEditable ? 1 : 0.7,
            }}
          />
        </div>
      </div>

      {/* Actions */}
      {isEditable && (
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-lg border text-sm font-medium"
            style={{ borderColor: 'var(--border)', color: 'var(--text)', background: 'var(--surface)' }}
          >
            {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Draft'}
          </button>

          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-5 py-2 rounded-lg text-white text-sm font-medium"
            style={{ background: 'var(--primary)' }}
          >
            {submitting ? 'Submitting…' : proposal.status === 'rejected' ? 'Resubmit for Review' : 'Submit for Teacher Review'}
          </button>

          <button
            onClick={handleDelete}
            disabled={deleting}
            className="ml-auto px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50"
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      )}

      {isPending && (
        <div className="mt-8 flex gap-3">
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50"
          >
            {deleting ? 'Withdrawing…' : 'Withdraw Proposal'}
          </button>
        </div>
      )}
    </div>
  )
}

export default ProposalFormPage
