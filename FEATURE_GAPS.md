# Copyright (c) 2026 Paul Christopher Cerda
# Business Source License 1.1

# Peripateticware — Feature Gap Register
> Audit date: 2026-06-27 (updated Session 33) | Source: codebase audit vs. README/FAQ claims

---

## P0 — Block public access (data loss or false advertising)

| # | Feature | What's wrong | File(s) | Est. hours |
|---|---------|-------------|---------|-----------|
| P0-1 | **File upload persistence** | `_save_file()` writes to `/app/uploads/` local volume. Any container restart or stateless deploy loses all student evidence, standards PDFs, and portfolio exports. Comment reads "Replace with S3 logic for production." | `backend/routes/student_activities.py`, `backend/services/export_service.py` | 8 |
| P0-2 | **FAQ false claims — SSO/Canvas/Clever** | FAQ lines 549–550 list "SSO via OIDC/SAML" and "Canvas/Clever roster sync" as current capabilities. Zero implementation exists. Misleading to any school evaluating the product. | `FAQ.md` | 1 (doc fix) |
| P0-3 | **FAQ false claims — Grade sync** | FAQ line 549 claims grade sync to Canvas/Schoology/Infinite Campus. Not started. | `FAQ.md` | 1 (doc fix) |
| P0-4 | **Parent messaging/notifications fully stubbed** | Parent Dashboard exists in the frontend. All message/notification API endpoints return `[]`. Any teacher or parent who tries to message will see nothing with no error. | `backend/routes/parent.py` | 16 |

**P0 action:** Fix P0-2/P0-3 immediately (FAQ edits, move to roadmap section). Fix P0-1 before any file that matters is uploaded. Fix P0-4 before inviting parents.

---

## P1 — Fix before general release (broken UX in shipped flows)

| # | Feature | What's wrong | File(s) | Est. hours |
|---|---------|-------------|---------|-----------|
| P1-1 | **Parent child activities list** | Explicitly stubbed: "returning empty list until child linking is built." Parent can link a child but then sees no activities. | `backend/routes/parent.py` | 4 |
| P1-2 | **Parent report export** | Returns fake `download_url: /api/v1/downloads/{id}.pdf` — 404 on click. Real export service exists at `/api/v1/export/` but isn't wired here. | `backend/routes/parent.py` | 3 |
| P1-3 | **Parent weekly/monthly reports** | Routes exist, return hardcoded zeros (`activities_completed: 0`, `total_hours: 0.0`). | `backend/routes/parent.py` | 6 |
| P1-4 | **Student Journal wiring** | `StudentJournalPage.tsx` exists but is not confirmed wired to a backend timeline endpoint. Needs verification and wiring if broken. | `frontend/src/pages/student/StudentJournalPage.tsx`, `backend/routes/phase7_student_initiated.py` | 3 |
| P1-5 | **Homeschool state_code not stored** | Coverage export has `# TODO: wire to homeschool user profile`. The state a homeschool family is in isn't stored, so state reporting PDFs have no state. | `backend/routes/homeschool.py`, `backend/routes/export.py` | 4 |
| P1-6 | **Standards coverage competencies_count = 0** | Export shows `competencies_count: 0` due to `# TODO: wire to competencies table`. Paid feature (homeschool_family tier) returning broken data. | `backend/services/export_service.py` | 4 |
| P1-7 | **AI inference rate limit (tracking only)** | `check_ai_rate_limit()` in `backend/core/rate_limit.py` tracks usage but doesn't enforce it. A single user can exhaust the Ollama/Claude budget. | `backend/core/rate_limit.py` | 2 |

---

## P2 — Fix before charging money (paid tier features)

| # | Feature | What's wrong | File(s) | Est. hours |
|---|---------|-------------|---------|-----------|
| P2-1 | **Activity media upload (teacher)** | No file upload endpoint for activity hero images/attachments. Student evidence upload works; teacher content authoring has no image/media attach. Paid feature implication (richer activities). | `backend/routes/activities.py` | 6 |
| P2-2 | **Admin general audit log** | Privacy audit log works. A general admin-panel activity log (who created/deleted users, changed orgs) has no table and no implementation. Needed for enterprise/district tiers. | `backend/routes/admin.py`, new migration | 8 |
| P2-3 | **RBAC fine-grained** | Role-string checks only. No per-resource ownership enforcement beyond ad-hoc. Teacher A can potentially access Teacher B's content if they know the UUID. IDOR risk. | `backend/core/dependencies.py`, multiple route files | 12 |

---

## P3 — Fix in first month post-launch

| # | Feature | What's wrong | Est. hours |
|---|---------|-------------|-----------|
| P3-1 | **WCAG 2.1 AA audit** | README claims WCAG AAA; only 30 aria-* attributes across the entire SPA. Run axe-core scan, fix highest impact findings. Target AA (not AAA) for launch. | 24 |
| P3-2 | **White-labeling deployment guide** | FAQ says guide exists in deployment docs. No `docs/deployment/` directory. Write the guide. | 4 |
| P3-3 | **Consent management system** | `privacy_notices`, `consent_records` tables and ConsentManager class specified in PRIVACY_ACCESSIBILITY_REVISED.md. Not yet implemented. Required for GDPR/CCPA users. | 20 |
| P3-4 | **Data Subject Rights portal** | 5 new endpoints required: access-request, download-my-data, deletion-request, correction-request, opt-out. Required for GDPR compliance. | 16 |
| P3-5 | **"Do Not Sell" link** | CCPA/CPRA requires prominent "Do Not Sell or Share My Personal Information" link on homepage. Not present. | 3 |
| P3-6 | **Data retention + soft delete scheduler** | Privacy doc specifies 30-day soft delete → hard delete. No scheduler exists. | 8 |

---

## P4 — Roadmap (remove from FAQ claims, add as honest future plans)

| Feature | Action |
|---------|--------|
| SSO via OIDC/SAML | Remove from FAQ capabilities list; add to "Roadmap" section. Estimated: 3 weeks to implement properly. |
| Canvas/Clever roster sync | Same — roadmap item, not current. |
| Grade sync to grade book (LTI) | Same. |
| Pre-loaded CCSS/NGSS/TEKS standards | README implies bundled; teachers must upload PDFs. Clarify in README. Adding bundled sets: 2-3 weeks. |
| OpenAI GPT support | Already in FAQ as "planned." Keep there. M complexity. |
| Parent notifications (push) | L complexity — requires FCM/APNs integration. |
| Field-level encryption | XL — key management + migration of existing data. Required for full GDPR compliance. |
| Breach notification system (GDPR Art. 33) | L — 72-hour notification workflow to DPA + users. |

---

## Privacy compliance gap summary (from PRIVACY_ACCESSIBILITY_REVISED.md)

The privacy handoff document specifies 10 jurisdictions. Current state:

| Jurisdiction | Config JSON | Engine active | Data subject rights | Consent records | Field encryption |
|---|---|---|---|---|---|
| FERPA | ✅ | ✅ | ✅ | ✅ | ❌† |
| COPPA | ✅ | ✅ | ✅ | ✅ | ❌† |
| GDPR | ✅ | ✅ | ✅ | ✅ | ❌† |
| CCPA | ✅ | ✅ | ✅ | ✅ | ❌† |
| LGPD | ✅ | ✅ | ✅ | Partial | ❌† |
| PIPEDA | ✅ | ✅ | ✅ | Partial | ❌† |
| PDPA (SG) | ✅ | ✅ | ✅ | Partial | ❌† |
| POPIA (ZA) | ✅ | ✅* | ✅ | Partial | ❌† |
| LPDC (MX) | ✅ | ✅* | ✅ | Partial | ❌† |
| AEPD (AR) | ✅ | ✅* | ✅ | Partial | ❌† |

**Minimum viable compliance for launch (US + EU market):** FERPA ✅, COPPA ✅, GDPR data subject rights ✅ (P3-4 complete), CCPA "Do Not Sell" link ✅ (P3-5 complete), consent records ✅ (P3-3 complete), breach notification ✅ (Session 33).

> † = Field encryption engine exists (`backend/core/encryption.py`, Session 33). Setting `FIELD_ENCRYPTION_KEY` env var activates it. Covered fields: `users.email`, `users.full_name`, GPS coordinates, notification payloads. **Not yet covered:** `student_captures.file_path`, `MultimodalInput.raw_data`, `consent_records.granted_by`.

> * = Config JSON added Session 33 (Dev-J). Engine activates automatically when the privacy seeder runs for an org with country code ZA/MX/AR on first registration.

## Session Changelog — 2026-06-27

| Item | Status | Agent |
|------|--------|-------|
| P0-1 File persistence → Cloudflare R2 | ✅ Complete | Dev-A |
| P0-2/P0-3 FAQ false claims | ✅ Complete | Dev-A |
| P0-4 Parent messaging/notifications | ✅ Complete | Dev-B |
| P1-1 Parent child activities | ✅ Complete | Dev-B |
| P1-2 Parent report export | ✅ Complete | Dev-B |
| P1-3 Parent weekly/monthly reports | ✅ Complete | Dev-B |
| P1-4/P1-5/P1-6 Student journal, state_code, competencies | ✅ Already implemented | Dev-C |
| P1-7 AI rate limit enforcement | ✅ Complete | Dev-C |
| P2-1 Activity media upload | ✅ Complete | Dev-D |
| P2-2 Admin audit log | ✅ Complete | Dev-D |
| P2-3 RBAC fine-grained | ✅ Complete | Dev-E |
| P3-3 Consent management | ✅ Complete | Dev-F |
| P3-4 DSR portal | ✅ Complete | Dev-F |
| P3-5 Do Not Sell link | ✅ Complete | Dev-G |
| P3-6 Soft-delete retention | ✅ Complete | Dev-G |
| P3-1 WCAG 2.1 AA audit | ✅ Complete | Dev-H |
| P3-2 White-labeling guide | ✅ Complete | Dev-I |
| P4 Roadmap docs | ✅ Complete | Dev-I |
| Privacy: POPIA/LPDC/AEPD configs | ✅ Complete | Dev-J |
| Field-level encryption (Fernet + HMAC blind index) | ✅ Complete | Dev-K |
| Breach notification (GDPR Art. 33/34) | ✅ Complete | Dev-K |
