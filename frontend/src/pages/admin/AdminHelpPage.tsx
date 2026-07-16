// Copyright (c) 2026 Paul Christopher Cerda
// Business Source License 1.1

import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'

interface FAQ { q: string; a: string }

const FAQS: FAQ[] = [
  { q: 'How do I add a new teacher account?', a: 'Go to Admin → Users → New User, set role to Teacher, and send the invite email. The teacher completes signup via the link.' },
  { q: 'How do I reset a student password?', a: 'Admin → Users → find the student → Reset Password. A temporary link is emailed to the parent or guardian on file.' },
  { q: 'How do privacy regulations (FERPA/COPPA) work?', a: 'Admin → Privacy Config shows all active frameworks. Toggle a regulation on/off. COPPA requires parental consent for under-13 accounts — enabling it activates the consent flow at signup.' },
  { q: 'How do I switch between Ollama (local AI) and Claude (cloud AI)?', a: 'Admin → AI Config. Set the provider and model per task type. Ollama runs on your local machine; Claude requires an API key in the .env file.' },
  { q: 'Why is the audit log showing a 500 error?', a: 'This was fixed — restart your Docker containers to pick up the updated DDL. Run: docker compose restart backend.' },
  { q: 'How do I import curriculum standards?', a: 'Admin → Standards → Import. Upload a CSV with columns: code, description, subject, grade_level. Download the template for the correct format.' },
  { q: 'How do I add a class and invite students?', a: 'Admin → Classes → New Class. Assign a teacher. Students join via the invite link at /join/:token, or the teacher can share the class code.' },
  { q: 'Where do I find error logs?', a: 'Admin → Audit Logs. Filter by level (error/warning/info) and date range. For Docker logs, run: docker compose logs backend --tail=100.' },
  { q: 'How do I back up the database?', a: 'Run: docker compose exec db pg_dump -U peripateticware peripateticware > backup.sql. See DEPLOY_GUIDE.md for automated backup setup.' },
  { q: 'What ports does the app use?', a: 'Frontend: 5173 (dev) / 80 (prod via Caddy). Backend API: 8000. PostgreSQL: 5432. Redis: 6379. Ollama: 11434. See docker-compose.yml for the full mapping.' },
]

export default function AdminHelpPage() {
  const { t } = useTranslation()
  const [open, setOpen] = useState<number | null>(null)
  const [search, setSearch] = useState('')

  const filtered = FAQS.filter(f =>
    f.q.toLowerCase().includes(search.toLowerCase()) ||
    f.a.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div style={{ padding: '2rem', maxWidth: '860px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text)' }}>{t('pages_admin_adminhelppage.admin_help_documentation', 'Admin Help & Documentation')}</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>{t('pages_admin_adminhelppage.frequently_asked_questions_and_quick_ref', 'Frequently asked questions and quick reference for administrators.')}</p>

      <input
        type="search"
        placeholder={t('pages_admin_adminhelppage.placeholder_search_help_topics', 'Search help topics…')}
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{
          width: '100%', padding: '0.6rem 1rem', marginBottom: '1.5rem',
          border: '1px solid var(--border)', borderRadius: '8px',
          background: 'var(--surface)', color: 'var(--text)', fontSize: '0.95rem',
        }}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {filtered.map((faq, i) => (
          <div key={i} style={{ border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
            <button
              onClick={() => setOpen(open === i ? null : i)}
              style={{
                width: '100%', textAlign: 'left', padding: '0.9rem 1.2rem',
                background: open === i ? 'var(--surface-alt)' : 'var(--surface)',
                color: 'var(--text)', fontWeight: 600, fontSize: '0.95rem',
                border: 'none', cursor: 'pointer', display: 'flex', justifyContent: 'space-between',
              }}
            >
              {faq.q}
              <span style={{ marginLeft: '1rem', flexShrink: 0 }}>{open === i ? '▲' : '▼'}</span>
            </button>
            {open === i && (
              <div style={{ padding: '0.9rem 1.2rem', background: 'var(--surface)', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                {faq.a}
              </div>
            )}
          </div>
        ))}
        {filtered.length === 0 && (
          <p style={{ color: 'var(--text-muted)', padding: '1rem' }}>No results for "{search}"</p>
        )}
      </div>

      <div style={{ marginTop: '2rem', padding: '1.2rem', background: 'var(--surface-alt)', borderRadius: '8px', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
        <strong style={{ color: 'var(--text)' }}>Need more help?</strong><br />
        Check <code>DEPLOY_GUIDE.md</code> and <code>WORK_TRACKING.md</code> in the repo root,
        or review the Docker logs: <code>docker compose logs --tail=50</code>
      </div>
    </div>
  )
}
