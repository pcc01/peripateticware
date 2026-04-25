# Peripateticware Frontend

> **Location-based contextual AI tutor for K-12 students**
>
> React.js + TypeScript frontend with integrated privacy engines (Marzano + Playlab FERPA/COPPA/GDPR)

![Status](https://img.shields.io/badge/status-production--ready-brightgreen)
![React](https://img.shields.io/badge/React-18.2-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)
![License](https://img.shields.io/badge/license-MIT-green)

---

## 📋 Overview

Peripateticware's frontend enables teachers and students to conduct location-based contextual learning sessions. Teachers create curriculum units with geo-tagged activities; students conduct field investigations while receiving Socratic prompts powered by RAG-augmented AI inference.

**Key Features:**
- 🌍 **Location-Based Learning** - Activities tied to real-world GPS coordinates
- 🧠 **Socratic AI Tutor** - Context-aware prompts based on student location, curriculum, and learning style
- 📊 **Evidence of Learning** - Automatic assessment with Bloom/Marzano taxonomy alignment
- 🔐 **Privacy by Design** - Teacher-only competency assessment, FERPA/COPPA/GDPR compliant
- 🌐 **Internationalized** - English, Spanish, Arabic (RTL), Japanese support
- 📱 **Mobile-First** - Works on phones, tablets, and desktop browsers
- ♿ **WCAG AAA Accessible** - Screen readers, keyboard navigation, high contrast

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- npm 9+
- Backend running on `http://localhost:8010`

### Installation

```bash
# Clone repository
git clone https://github.com/yourusername/peripateticware-frontend
cd peripateticware-frontend

# Install dependencies
npm install

# Create environment file
cp .env.example .env.local

# Start development server
npm run dev
```

Frontend will open at `http://localhost:5173`

### Backend Setup

Make sure your Peripateticware backend is running:

```bash
# In backend directory
python -m uvicorn main:app --reload --port 8010
```

---

## 📁 Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── common/         # Button, Card, Modal, Input, Select, Badge, Map
│   ├── teacher/        # CurriculumEditor, ActivityManager, SessionMonitor
│   └── student/        # InquiryInterface
├── pages/              # Page components (Dashboard, Session, etc.)
├── services/           # API client services
│   ├── curriculumService.ts    # Curriculum CRUD
│   ├── sessionService.ts       # Session + evidence (privacy-filtered)
│   └── inferenceService.ts     # RAG, multimodal, embeddings
├── hooks/              # Custom React hooks
│   ├── useAuth.ts              # Authentication
│   ├── useGeolocation.ts       # GPS location tracking
│   └── useSessionWebSocket.ts  # Real-time monitoring
├── stores/             # Zustand state management
│   ├── authStore.ts
│   ├── sessionStore.ts
│   └── uiStore.ts
├── types/              # TypeScript interfaces
│   ├── auth.ts
│   ├── curriculum.ts
│   ├── session.ts
│   └── api.ts
├── utils/              # Utilities
│   ├── privacy.ts              # Privacy filtering + FERPA/COPPA/GDPR
│   ├── localization.ts         # i18n + pseudo-localization
│   ├── batchImport.ts          # CSV/JSON parsing
│   └── ...
├── locales/            # Translation JSON files
│   ├── en/             # English (complete)
│   ├── es/             # Spanish (complete)
│   ├── ar/             # Arabic skeleton
│   └── ja/             # Japanese skeleton
├── config/             # Configuration
│   ├── i18n.ts                 # i18next setup with RTL
│   ├── api.ts                  # Axios instance
│   └── constants.ts            # App constants
├── styles/             # Global CSS
│   └── globals.css             # Logical properties, RTL support
└── tests/              # Test utilities
    ├── privacy.test.ts         # Privacy filtering tests
    ├── localization.test.ts    # i18n + string externalization tests
    └── setup.ts                # Vitest configuration

```

---

## 🔑 Key Modules

### Privacy Engine (`src/utils/privacy.ts`)

Integrates **two privacy engines** from your other projects:

1. **Marzano Privacy Engine:**
   - Stores original AI responses immutably
   - Generates teacher-only competency assessments
   - Students never see competency data

2. **Playlab Privacy Engine:**
   - FERPA: Student privacy (US)
   - COPPA: Under-13 data handling
   - GDPR: Data residency & retention (EU)
   - EU AI Act: Transparency in AI systems

**Example:**
```typescript
// Teachers see competency assessment
const evidence = await sessionService.getEvidence(sessionId, 'teacher')
// evidence.competency_assessment is populated

// Students see only safe data
const evidence = await sessionService.getEvidence(sessionId, 'student')
// evidence.competency_assessment is undefined
```

### Internationalization (`src/utils/localization.ts`)

- **4 languages:** English, Spanish, Arabic (RTL), Japanese
- **Pseudo-localization:** Test with scrambled text to verify all strings externalized
- **Logical CSS properties:** Automatically mirrors layout for RTL

**Testing pseudo-loc:**
```bash
# In browser console
localStorage.setItem('pseudo-loc', 'true')
location.reload()
```

All UI text becomes: `[Ħēļļōxxxxxxxxx]` to verify string coverage

### Batch Import (`src/utils/batchImport.ts`)

Teachers can bulk-import activities from CSV/JSON:

```typescript
const result = BatchImport.validateImport(rows, curriculumId)
// result.valid: ActivityCreateRequest[] ready to create
// result.errors: validation failures with line numbers
```

CSV format:
```
name,latitude,longitude,location_name,difficulty,duration_minutes,objectives,instructions
Park Walk,40.7128,-74.0060,Central Park,easy,30,"Observation,Classification","Find 5 plants"
```

---

## 🧪 Testing

```bash
# Run all tests
npm run test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage

# UI for interactive testing
npm run test:ui
```

**Test coverage includes:**
- ✅ Privacy filtering (students can't see teacher data)
- ✅ Localization (pseudo-loc, RTL, formatters)
- ✅ String externalization (no hardcoded text)
- ✅ Compliance profiles (FERPA, COPPA, GDPR)
- ✅ Batch import validation
- ✅ API response types

---

## 📚 Component Documentation

```bash
npm run storybook
```

Visit `http://localhost:6006` to see interactive component documentation

**Featured components:**
- Button (6 variants: primary, secondary, success, warning, error, ghost)
- Card (with title, subtitle, footer)
- Input, Select, Modal, Badge
- Map (Leaflet integration)

---

## 🌐 Internationalization

### Supported Languages

| Language | Code | Status | Notes |
|----------|------|--------|-------|
| English | `en` | ✅ Complete | LTR |
| Spanish | `es` | ✅ Complete | LTR |
| Arabic | `ar` | 🚧 Skeleton | RTL - needs completion |
| Japanese | `ja` | 🚧 Skeleton | LTR - needs completion |

### Translation Keys Structure

```
locales/
├── en/
│   ├── common.json      # Shared UI text
│   ├── teacher.json     # Teacher-specific
│   ├── student.json     # Student-specific
│   └── curriculum.json  # Curriculum/standards content
```

### Add a New Language

1. Create `src/locales/{lang}/` directory
2. Copy English JSON files
3. Translate content
4. Add to `src/config/i18n.ts`

---

## 🔐 Security & Compliance

### FERPA (US - Student Privacy)
- Student data isolated from other students
- Teachers can only see their students' data
- Audit logging sanitizes PII

### COPPA (US - Under-13)
- Email removed from display for under-13 users
- Age-appropriate content filtering
- Parental consent tracked

### GDPR (EU - Data Protection)
- Data residency: eu-west-1
- Retention: 3 years max
- Right to be forgotten supported
- Consent management

### EU AI Act Compliance
- Original AI responses stored immutably
- Teacher-only competency assessments
- Transparency in AI decision-making

---

## 📊 Teacher Features

- **Curriculum Management:** Create units with Bloom/Marzano taxonomy alignment
- **Activity Creator:** Geo-tag activities with customizable zones (circle, rectangle, polygon)
- **Batch Import:** Import 100s of activities from CSV
- **Live Monitoring:** Real-time map with student locations
- **Evidence Viewer:** Competency assessment + original AI artifacts
- **Student Roster:** View enrolled students and their progress

---

## 👨‍🎓 Student Features

- **Session Creation:** Start learning with GPS location capture
- **Inquiry Interface:** Ask questions via text, image, or audio
- **Socratic Prompts:** Contextual AI guidance based on location + curriculum
- **Evidence Viewer:** See learning outcomes (no teacher-only data)
- **Session History:** Review past sessions and progress

---

## 📲 Mobile Support

Frontend is **mobile-first** and fully responsive:

- ✅ Works on iOS Safari, Android Chrome
- ✅ Touch-optimized buttons (48px minimum)
- ✅ GPS location access
- ✅ Camera/microphone for multimodal input
- ✅ Offline support (planned PWA)

---

## 🚀 Deployment

### Local Development
```bash
npm run dev
```

### Build for Production
```bash
npm run build
```

### Deploy to Cloudflare Pages

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed instructions:

1. Connect GitHub repo to Cloudflare Pages
2. Set environment variables
3. Configure custom domains (teacher.pcerda.me, student.pcerda.me)
4. Enable Cloudflare Access for authentication

### Deploy to Self-Hosted (Ubuntu + Tailscale)

See [DEPLOYMENT.md](./DEPLOYMENT.md) for Nginx configuration

---

## 🔌 API Integration

See [API.md](./API.md) for comprehensive API documentation

**Core endpoints:**
- `/auth/*` - User authentication
- `/curriculum/*` - Curriculum CRUD
- `/sessions/*` - Learning sessions
- `/sessions/{id}/inquiry` - Socratic inquiry
- `/inference/*` - RAG + AI reasoning
- `/ws/sessions/{id}/monitor` - Real-time updates

---

## 📝 Environment Configuration

Create `.env.local`:
```env
VITE_API_URL=http://localhost:8010/api/v1
VITE_WEBSOCKET_URL=ws://localhost:8010/api/v1
VITE_DEFAULT_LANGUAGE=en
VITE_ENABLE_PRIVACY_ENGINE=true
VITE_ENABLE_BATCH_IMPORT=true
VITE_ENABLE_REAL_TIME_MONITORING=true
NODE_ENV=development
```

See `.env.example` for all available options

---

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| **API connection fails** | Check backend running on port 8010, verify VITE_API_URL |
| **Tests fail** | `npm install`, then `npm run test -- --clearCache` |
| **Build fails** | Update Node.js to 18+, clear `node_modules` |
| **Pseudo-loc not working** | `localStorage.setItem('pseudo-loc', 'true')` then refresh |
| **Map not showing** | Verify Leaflet CSS imported, check coordinates |

---

## 📦 Dependencies

**Core:**
- React 18.2 - UI library
- React Router 6 - Navigation
- React i18next 13 - Internationalization
- Zustand 4 - State management
- Axios 1.6 - HTTP client

**UI & Maps:**
- Leaflet 1.9 - Open-source mapping
- Tailwind CSS 3 - Styling
- clsx 2 - Conditional classnames

**Testing:**
- Vitest 1 - Fast unit testing
- React Testing Library 14 - Component testing
- Playwright - E2E testing (planned)

**Documentation:**
- Storybook 7 - Component documentation

---

## ✅ Checklist for Production

- [ ] Backend running with HTTPS
- [ ] Environment variables configured
- [ ] All tests passing (`npm run test`)
- [ ] No console errors
- [ ] Privacy filters verified
- [ ] WCAG accessibility checked
- [ ] Mobile tested on real device
- [ ] Translations complete (or skeleton ready)
- [ ] Deployment tested on staging

---

## 📄 License

MIT - See LICENSE file

---

## 🤝 Contributing

See CONTRIBUTING.md (coming soon)

---

## 📞 Support

- **Issues:** GitHub Issues
- **Docs:** See DEPLOYMENT.md and API.md
- **Tests:** Run `npm run test` for diagnostics

---

**Version:** 0.1.0  
**Last Updated:** 2024-04-25

Build with ❤️ for location-based contextual learning
