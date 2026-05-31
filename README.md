# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

# 🌍 Peripateticware: Location-Based Learning Platform

**From Vision (2007) to Reality (2026)**

> "Peripateticware is a name I've coined to identify products designed for mobile devices. It points to the term that is used to identify Aristotle's method of teaching as he walked with his students in the Lyceum."
>
> — Original Vision, February 2007

---

## 📜 The Vision: Why Build This?

### The Problem (2007)
Students learn in isolated classrooms disconnected from the real world. Education is confined to textbooks and desktops, missing the rich context that physical locations provide. We ask students to memorize facts instead of explore places.

### The Solution
**Peripateticware**: Mobile education software that leverages location and mobility as core design features. Students learn by exploring their physical environment with guided, AI-enhanced lessons rooted in real places.

### The Moment of Inspiration
In February 2007, the insight was clear:
> "Rather than mandating instructional design and leading students kicking and screaming their way to knowledge, these products could prompt students to follow their passions and learn along the way. What if educational products allowed students to explore ideas? What if a math product presented a discussion of an arch when a student stood inside a cathedral?"

### The Promise (Then and Now)
- **Individualized Learning:** Students follow their passions, not mandated curricula
- **Location Awareness:** Activities triggered by physical location (GPS)
- **Contextual Richness:** Real places provide authentic learning context
- **Kinesthetic Education:** Learning through movement and exploration
- **Accessibility:** Works on any mobile device
- **Teacher Empowerment:** Teachers (not corporations) control the content

### The Unresolved Challenge
In 2007, one problem remained unsolved:
> "Assessment is clearly the most difficult part of 'unleashed education'."

**In 2026, we've solved it with AI:**
- AI-generated rubrics aligned with Bloom's taxonomy
- Portfolio evidence tracking built-in
- Competency-based assessment
- Meaningful, holistic evaluation

---

## ✨ What's Built (May 2026)

This is a full-stack, production-grade application with a web frontend, REST API backend, and React Native mobile app. It is currently in active stabilization and field testing.

### Backend — FastAPI + PostgreSQL
- **Authentication:** JWT-based login/signup, email verification, password reset, role-based access
- **Roles:** Teacher, Student, Parent, Admin, Homeschool
- **Activity Engine:** Full CRUD for location-based learning activities with Bloom's taxonomy levels
- **Phase 7 Student Features:** Field notes, self-initiated projects, peer projects, reverse scavenger hunt proposals
- **AI Integration:** Ollama (local) for inference, Whisper for audio transcription (ASR), standards parsing
- **Privacy & Compliance Engine:** FERPA, COPPA, GDPR, CCPA, LGPD, PIPEDA rule enforcement
- **Email Service:** SMTP-backed transactional email (verification, password reset, parent consent)
- **Standards & Rubrics:** Upload PDFs/CSVs of curriculum standards; AI extracts criteria; coverage reporting
- **Export Service:** Portfolio PDF and activity log CSV generation
- **Admin Panel:** User management, audit logs, env editor, privacy config
- **Homeschool Persona:** Multi-child management, state reporting standards, coverage dashboards

### Frontend — React + TypeScript + Vite
- **Five Role Dashboards:** Teacher, Student, Parent, Admin, Homeschool — each with sidebar nav, stat cards, and role-specific tools
- **Activity Manager:** Full create/edit/publish flow with map-based location picker
- **Field Notes & Projects:** Student-initiated field note editor, self-project view, peer project collaboration
- **Proposals (Reverse Scavenger Hunt):** Students propose activities; teachers review and approve
- **Standards Library:** Upload, review, and map curriculum standards (CCSS, NGSS, TEKS, state reporting)
- **Homeschool Tools:** Child management, requirements setup via ExtractionWizard, coverage dashboard, portfolio export
- **Student Journal:** Chronological timeline of field notes grouped by month
- **Parent Dashboard:** Child progress, link-child flow, coming-soon sections for messages and calendar
- **Auth Flows:** Signup → email verification → login; forgot/reset password; cookie consent banner
- **Internationalization:** 11 locales (en, es, fr, de, it, pt-br, zh, ja, ar, he, tu) with RTL support
- **Design System:** Three visual themes (Field Guide, Terrain, Atmosphere); WCAG AAA accessible

### Mobile — React Native (Expo SDK 54)
- Located in `mobile/` subdirectory
- **Full Activity Flow:** Discovery map → Brief → Orient → Inquiry → Reflect
- **Capture Tools:** Photo (expo-image-picker), audio (expo-av) with ASR transcript polling, text note
- **Peri AI Chat:** Socratic inquiry chat with the crow mascot, wired to `/api/v1/inference/chat`
- **Offline-First:** SQLite local cache for questions and activities; capture/note queue; auto-sync on reconnect
- **Journal & Progress:** API-wired journal and competency/badge progress screens
- **Geofence Guard:** Haversine-based proximity check; non-blocking toast when student leaves activity radius
- **Teacher Monitoring:** Session events (phase transitions, captures, geofence exits) posted to backend
- **Age-Band Adaptive Copy:** Three age bands (K–2, 3–6, 7–12) with distinct Peri speech and vocabulary
- **Three Visual Themes:** Field Guide (r:12px), Terrain (4px), Atmosphere (20px); city skin overlay

---

## 🚀 Quick Start (Docker)

### Prerequisites
- Docker Desktop
- Git
- Ollama running on the host (`ollama serve`)

### 1. Clone
```bash
git clone https://github.com/paulcerda/peripateticware.git
cd peripateticware
```

### 2. Configure environment
```bash
cp .env.example .env
# Edit .env — at minimum set SMTP_* vars if you want email,
# or leave EMAIL_DRY_RUN=true to skip sending.
```

### 3. Start
```bash
docker compose up -d
```

### 4. Access
| Service | URL |
|---------|-----|
| Web app | http://localhost:3000 |
| API docs | http://localhost:8000/docs |
| API health | http://localhost:8000/health |

### 5. Demo accounts
| Role | Email | Password |
|------|-------|----------|
| Teacher | teacher@example.com | SecurePassword123 |
| Student | student@example.com | SecurePassword123 |
| Parent | parent@example.com | SecurePassword123 |
| Homeschool | homeschool@example.com | SecurePassword123 |
| Admin | admin@example.com | SecurePassword123 |

> **Note:** If the database volume is fresh, `database/init.sql` seeds these accounts automatically. If the volume already existed with an older schema, run `docker compose down -v && docker compose up -d` to rebuild it.

---

## 🛠️ Development

### Rebuild after code changes
```bash
# Backend only (Python — no rebuild needed; bind-mounted)
docker compose restart backend

# Frontend only (Vite hot-reloads; only needed after package.json changes)
docker compose restart frontend

# Both
docker compose restart backend frontend

# Full rebuild (after Dockerfile changes)
docker compose build --no-cache backend frontend
docker compose up -d
```

### View logs
```bash
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f        # all services
```

### Database
```bash
# Connect to Postgres inside container
docker compose exec postgres psql -U peripateticware_user -d peripateticware

# Fresh database (wipes all data)
docker compose down -v
docker compose up -d
```

### Clear Python bytecode cache (if backend shows stale errors)
```bash
docker compose exec backend find /app -name "*.pyc" -delete
docker compose restart backend
```

---

## 📱 Mobile Development

The mobile app lives in `mobile/` and uses Expo SDK 54.

### Install dependencies
```bash
cd mobile
npm install
```

### Configure API endpoint
```bash
# mobile/.env
API_BASE_URL=http://<your-host-ip>:8000
```

### Run with Expo Go
```bash
npx expo start
```

> **Note:** Expo Go may time out on large bundles over LAN. For a reliable test build use EAS:

### Build with EAS (recommended for device testing)
```bash
npm install -g eas-cli
eas login
eas build --platform android --profile preview   # produces .apk
eas build --platform ios --profile preview        # requires Apple Developer account
```

---

## 🧱 Architecture

```
peripateticware/
├── backend/                 # FastAPI application
│   ├── main.py              # App entry point, router registration
│   ├── routes/              # All API route modules
│   ├── models/              # SQLAlchemy ORM models
│   ├── services/            # Business logic (email, ASR, export, etc.)
│   ├── core/                # Auth, database, security, dependencies
│   └── templates/email/     # HTML email templates
├── frontend/                # React + TypeScript + Vite
│   └── src/
│       ├── pages/           # Route-level pages by role
│       ├── components/      # Shared and role-specific components
│       ├── layouts/         # DashboardShell + role layouts
│       ├── stores/          # Zustand state stores
│       ├── services/        # API service modules
│       └── types/           # TypeScript interfaces
├── mobile/                  # React Native (Expo SDK 54)
│   └── src/
│       ├── app/             # Expo Router screens
│       ├── components/      # CaptureSheet, PeriChatSheet, CrowAvatar, etc.
│       ├── api/             # API client and service modules
│       ├── db/              # SQLite offline cache
│       └── bands/           # Age-band adaptive copy (copy.ts) and tokens
├── database/
│   └── init.sql             # Full schema (30+ tables) + seed data
├── backend/alembic/         # Database migrations
└── docker-compose.yml       # All services
```

### Tech stack
| Layer | Technology |
|-------|-----------|
| Backend | FastAPI, SQLAlchemy (async), PostgreSQL + pgvector, Redis, Alembic |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, Zustand, react-router-dom v6 |
| Mobile | React Native, Expo SDK 54, Expo Router, SQLite, expo-av, expo-location |
| AI | Ollama (local LLM + Whisper ASR), optional Claude API fallback |
| Infrastructure | Docker Compose, Nginx, pgbouncer (config ready) |

---

## 🤖 AI Configuration

### Ollama (local — default)
```bash
# On host machine
ollama pull mistral                          # text inference
ollama pull karanchopda333/whisper:latest   # audio transcription
ollama serve
```

```env
# .env
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://host.docker.internal:11434
OLLAMA_MODEL_TEXT=mistral
ASR_ENABLED=true
OLLAMA_MODEL_AUDIO=karanchopda333/whisper:latest
```

### Claude API (cloud fallback)
```env
LLM_PROVIDER=claude
ANTHROPIC_API_KEY=sk-ant-xxxxx
CLAUDE_MODEL=claude-sonnet-4-20250514
```

### Switch providers
```bash
# Edit .env, then:
docker compose restart backend
```

---

## 📧 Email Configuration

The backend uses `aiosmtplib` for transactional email. Set `EMAIL_DRY_RUN=true` (default) to print emails to logs instead of sending.

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASSWORD=your-app-password    # Gmail: use an App Password, not account password
SMTP_USE_TLS=true
EMAIL_FROM=noreply@yourdomain.com
EMAIL_FROM_NAME=Peripateticware
EMAIL_DRY_RUN=false
FRONTEND_URL=http://localhost:3000
```

> After changing `.env`, always run `docker compose up -d --force-recreate backend` — `restart` does not re-read env vars.

---

## 🔐 Security Notes (Pre-Deploy Checklist)

Before any non-local deployment:

- [ ] Rotate `SECRET_KEY` and `AUDIT_HASH_SALT` from dev defaults in `.env`
- [ ] Set `EMAIL_DRY_RUN=false` and configure real SMTP
- [ ] Set `DEBUG=False` and `ENVIRONMENT=production`
- [ ] Review `nginx.conf` for production routing and SSL
- [ ] Enable HTTPS (Let's Encrypt or institutional cert)
- [ ] Run `docker compose down -v && docker compose up -d` on a fresh volume for production DB

---

## 📜 Licensing

Peripateticware is **source-available** under the **Business Source License 1.1 (BSL 1.1)**.

| Who | Terms |
|-----|-------|
| Individual educators | Free forever — use in your own classroom, modify as needed |
| Non-commercial projects | Free forever — research, prototyping, personal use |
| School districts / CMOs / multi-site operators (>5 classrooms) | Commercial license required — contact Paul Christopher Cerda |
| SaaS / resale | Not permitted under BSL 1.1 |

On **May 1, 2030**, the license automatically converts to **Apache 2.0** (fully open-source).

**Contact:** admin@thewordinbits.com

---

## 📚 Additional Documentation

| File | Contents |
|------|---------|
| `work_tracking.md` | Full feature status, bug list, remaining build items |
| `BUG_CHECKLIST.md` | Active bug tracking |
| `FIXPLAN.md` | Prioritized fix queue |
| `docs/guides/USER_GUIDE.md` | End-user guide |
| `docs/diagrams/ARCHITECTURE.md` | System architecture diagrams |
| `backend/docs/` | Phase build summaries and specs |
| `FAQ.md` | Frequently asked questions |

---

## 📞 Contact & Contributions

**Paul Christopher Cerda**
Email: admin@thewordinbits.com

Bug reports: open an issue in the repository with a description, reproduction steps, and expected vs. actual behavior.

Contributions: fork → feature branch → pull request → sign the CLA.

---

## 📜 The 20-Year Journey

**February 2007:** Vision conceived.
A teacher walks with students through the city, the museum, the park. Learning isn't confined to classrooms. Education happens everywhere.

**2007–2025:** The world catches up.
Mobile devices become ubiquitous. Machine learning becomes practical. Cloud computing becomes affordable. API ecosystems emerge.

**2026:** Vision realized.
Peripateticware launches. Teachers create location-based activities. Students explore with guidance. AI generates contextually-rich lessons. The assessment problem — unsolved in 2007 — is solved with AI rubrics, portfolio evidence, and competency tracking.

> "Peripateticware will open new opportunities for learning and engaging students."
>
> — The Original Vision, Now Fulfilled

---

**Build Date:** May 2026
**Status:** Active stabilization — core flows working, mobile testing in progress
**License:** Business Source License 1.1 → Apache 2.0 (May 2030)

**Welcome to the future of location-based learning. 🌍📚**

---

## 🔗 Publishing to GitHub

If this is your first time pushing this project to GitHub, follow these steps exactly.

### First-time setup

```bash
# 1. Navigate to the project root
cd "C:\Users\pcerd\Downloads\peripateticware_complete__202605081840\peripateticware_complete_202605081840"

# 2. Initialize git (skip if already initialized)
git init

# 3. Set your identity (first time only)
git config user.name "Paul Christopher Cerda"
git config user.email "admin@thewordinbits.com"

# 4. Add a .gitignore if not already present
#    (node_modules, __pycache__, .env, uploads, media, etc.)
#    A .gitignore is already in the repo — verify before committing.

# 5. Stage everything
git add .

# 6. Initial commit
git commit -m "Initial commit: Peripateticware full-stack platform (May 2026)"

# 7. Create the repo on GitHub first (https://github.com/new)
#    Name it: peripateticware
#    Visibility: Private (recommended until ready for public)
#    Do NOT initialize with README, .gitignore, or license — you already have them.

# 8. Add the remote
git remote add origin https://github.com/paulcerda/peripateticware.git

# 9. Push
git branch -M main
git push -u origin main
```

### Subsequent pushes (normal workflow)

```bash
# Stage all changes
git add .

# Commit with a descriptive message
git commit -m "Fix: resolve homeschool.py truncation and layout sync issues"

# Push to GitHub
git push
```

### Pushing a specific set of files

```bash
# Stage only specific files
git add backend/routes/homeschool.py frontend/src/layouts/ParentLayout.tsx

# Commit
git commit -m "Fix: homeschool coverage return dict and ParentLayout duplicate"

# Push
git push
```

### Branch workflow (for larger features)

```bash
# Create a new feature branch
git checkout -b feature/mobile-testing

# ... make changes ...

git add .
git commit -m "Add EAS build config and mobile .env documentation"

# Push the branch
git push -u origin feature/mobile-testing

# When ready to merge, open a pull request on GitHub
# or merge locally:
git checkout main
git merge feature/mobile-testing
git push
```

### Tagging a release

```bash
git tag -a v0.1.0-beta -m "Beta release: core web app stable, mobile testing in progress"
git push origin v0.1.0-beta
```

### Check status at any time

```bash
git status          # what's changed
git log --oneline   # recent commits
git remote -v       # confirm remote URL
```
