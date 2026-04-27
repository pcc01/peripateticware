# 🏗️ Architecture - Peripateticware Monorepo

**Last Updated:** April 26, 2026  
**Version:** Phase 4

---

## 📊 System Overview

Peripateticware is a three-tier educational platform:

```
┌─────────────────────────────────────────────────────────────┐
│                    USER INTERFACES                          │
├──────────────────────┬──────────────────┬──────────────────┤
│   Mobile App         │    Web Portal    │   Admin Panel    │
│  (React Native)      │   (React+Vite)   │     (Future)     │
│  iOS/Android         │  Parent Portal   │                  │
│  Students/Teachers   │  Parent Tracking │                  │
└──────────────┬───────┴────────┬─────────┴──────────────────┘
               │                │
               └────────┬───────┘
                        │ REST + WebSocket
┌───────────────────────▼─────────────────────────────────────┐
│                    API LAYER                                │
│                   (FastAPI)                                 │
├───────────────────────────────────────────────────────────┤
│  Auth    │ Sessions │ Curriculum │ Inference │ Observability│
│  Routes  │ Routes   │  Routes    │  Routes   │  Routes      │
└────────────────┬────────────────────────────────────────┬───┘
                 │                                        │
    ┌────────────▼──────────────┐              ┌─────────▼────┐
    │   Business Logic Layer    │              │  Services    │
    │  (Services)               │              │  (Utilities) │
    ├───────────────────────────┤              ├──────────────┤
    │ • RAG Orchestrator        │              │ • Cache      │
    │ • Sync Engine             │              │ • Security   │
    │ • Privacy Engine          │              │ • Validation │
    │ • Session Manager         │              │ • Email      │
    │ • Activity Manager        │              │ • WebSocket  │
    └────────────┬──────────────┘              └──────────────┘
                 │
┌────────────────▼──────────────────────────────────────────────┐
│                   DATA LAYER                                  │
├────────────────────────────────────────────────────────────┤
│  PostgreSQL Database        │  Redis Cache  │  File Storage │
│  ├─ Users                   │  ├─ Sessions  │  ├─ Evidence  │
│  ├─ Students                │  ├─ Tokens    │  ├─ Artifacts │
│  ├─ Teachers                │  └─ Queries   │  └─ Media     │
│  ├─ Sessions                │               │               │
│  ├─ Activities              │               │               │
│  ├─ Evidence                │               │               │
│  └─ Competencies            │               │               │
└────────────────────────────────────────────────────────────┘
```

---

## 🗂️ Monorepo Structure

```
peripateticware/
│
├── backend/                    Python FastAPI Server
│   ├── app/
│   │   └── models.py          SQLAlchemy ORM Models
│   ├── routes/                 API Endpoints
│   │   ├── auth.py            JWT, Login, Register
│   │   ├── sessions.py        Session Management
│   │   ├── curriculum.py      Activity Management
│   │   ├── inference.py       AI/RAG Endpoints
│   │   └── observability.py   Monitoring
│   ├── services/               Business Logic
│   │   ├── rag_orchestrator.py     RAG with Claude/Ollama
│   │   ├── sync_engine.py          Data Synchronization
│   │   └── privacy_engine.py       FERPA/COPPA/GDPR
│   ├── core/                   Core Utilities
│   │   ├── security.py        Auth & Encryption
│   │   ├── database.py        DB Connection
│   │   ├── cache.py           Redis Caching
│   │   ├── config.py          Configuration
│   │   └── dependencies.py    FastAPI Dependencies
│   ├── main.py               Application Entry
│   ├── requirements.txt       Python Dependencies
│   └── Dockerfile            Container Config
│
├── mobile/                    React Native iOS/Android
│   ├── src/
│   │   ├── screens/
│   │   │   ├── auth/         Login & Registration
│   │   │   ├── student/      Student Features
│   │   │   └── teacher/      Teacher Features
│   │   ├── components/
│   │   │   └── common/       Reusable UI Components
│   │   ├── hooks/             Custom React Hooks
│   │   │   ├── useNativeLocation.ts
│   │   │   ├── useNativeCamera.ts
│   │   │   └── useOfflineSync.ts
│   │   ├── stores/            Zustand State Management
│   │   ├── services/          API Client
│   │   ├── types/             TypeScript Interfaces
│   │   └── App.tsx            Navigation & Root
│   ├── app.json              Expo Configuration
│   └── package.json
│
├── web/                       React + Vite Parent Portal
│   ├── src/
│   │   ├── pages/            Page Components
│   │   │   ├── LoginPage.tsx
│   │   │   └── DashboardPage.tsx
│   │   ├── components/        Reusable UI Components
│   │   │   ├── common/
│   │   │   └── parent/
│   │   ├── hooks/             Custom React Hooks
│   │   ├── stores/            Zustand State Management
│   │   ├── services/          API Client
│   │   ├── types/             TypeScript Interfaces
│   │   ├── styles/            Global CSS & Design System
│   │   └── App.tsx            Routing & Root
│   ├── vite.config.ts
│   └── package.json
│
├── docs/                      Documentation
│   ├── ARCHITECTURE.md        This file
│   ├── API.md                 API Reference
│   ├── DEVELOPMENT.md         Development Guide
│   ├── DEPLOYMENT.md          Deployment Guide
│   └── diagrams/              Visual Diagrams
│
├── .github/
│   ├── workflows/            CI/CD Pipelines
│   └── ISSUE_TEMPLATE/       Issue Templates
│
├── package.json              Root Workspace Config
├── README.md                 Project Overview
└── LICENSE                   MIT License
```

---

## 🔄 Data Flow Architecture

### User Registration & Authentication

```
User (Mobile/Web)
    │
    ├─ Submits: email, password, name, role
    │
    ▼
┌─────────────────────────────────────┐
│  Backend: POST /api/v1/auth/register│
└─────────────────────────────────────┘
    │
    ├─ Validate input
    ├─ Hash password (bcrypt)
    ├─ Create User in DB
    ├─ Create JWT tokens
    │
    ▼
┌─────────────────────────────────────┐
│  Response: {                         │
│    access_token,                    │
│    refresh_token,                   │
│    user: {...}                      │
│  }                                  │
└─────────────────────────────────────┘
    │
    ▼
Client stores tokens in AsyncStorage (Mobile) / localStorage (Web)
    │
    ▼
All subsequent requests include: Authorization: Bearer {token}
```

### Session Flow (Student Perspective)

```
Student Opens App
    │
    ├─ Check localStorage for auth token
    │
    ▼
GET /api/v1/sessions
    │
    ├─ Return active sessions
    ├─ Cache in Zustand store
    │
    ▼
Student sees list of sessions
    │
    ├─ Student clicks "Join Session"
    │
    ▼
POST /api/v1/sessions/{id}/join
    │
    ├─ Validate student
    ├─ Add student to session
    ├─ Get GPS location (mobile)
    ├─ Open WebSocket connection
    │
    ▼
WebSocket: /ws/sessions/{id}
    │
    ├─ Receive real-time updates
    ├─ Send evidence uploads
    ├─ Sync with other students/teachers
    │
    ▼
Student completes activity
    │
    ├─ POST /api/v1/evidence
    │   └─ Upload photos, GPS, metadata
    │
    ▼
AI Inference
    │
    ├─ POST /api/v1/inference/prompt
    │   └─ Claude/Ollama processes evidence
    │
    ▼
Session Ends
    │
    ├─ Calculate competencies achieved
    ├─ Update student progress
    ├─ Close WebSocket
```

### Parent Portal Flow

```
Parent Logs In
    │
    ├─ POST /api/v1/parent/auth/login
    │
    ▼
GET /api/v1/parent/children
    │
    ├─ Fetch linked children
    ├─ Cache in progressStore
    │
    ▼
Parent Selects Child
    │
    ├─ GET /api/v1/parent/children/{id}/progress
    ├─ GET /api/v1/parent/children/{id}/activities
    ├─ GET /api/v1/parent/children/{id}/competencies
    │
    ▼
Display Dashboard
    │
    ├─ Progress charts (Recharts)
    ├─ Recent activities list
    ├─ Competency badges
    │
    ▼
Parent Clicks "Reports"
    │
    ├─ GET /api/v1/parent/reports/weekly
    ├─ GET /api/v1/parent/reports/monthly
    │
    ▼
Generate PDF
    │
    ├─ Use @react-pdf/renderer
    ├─ Include charts, tables, insights
    │
    ▼
Parent Clicks "Messages"
    │
    ├─ GET /api/v1/parent/messages
    ├─ POST /api/v1/parent/messages/{id}/reply
    │
    ▼
Email Digest
    │
    ├─ Scheduled job (node-schedule)
    ├─ Sends weekly/monthly reports
    ├─ Configurable frequency per parent
```

---

## 🗄️ Database Schema (PostgreSQL)

### Core Tables

```sql
-- Users & Authentication
users
├─ id (UUID)
├─ email (String, Unique)
├─ password_hash (String)
├─ first_name (String)
├─ last_name (String)
├─ role (Enum: student, teacher, parent, admin)
├─ created_at (DateTime)
└─ updated_at (DateTime)

-- Students (extends Users)
students
├─ id (UUID, FK: users.id)
├─ grade_level (String)
├─ school (String)
├─ linked_teacher_ids (Array<UUID>)
├─ linked_parent_ids (Array<UUID>)
└─ created_at (DateTime)

-- Teachers (extends Users)
teachers
├─ id (UUID, FK: users.id)
├─ school (String)
├─ classes (Array<String>)
├─ student_ids (Array<UUID>)
└─ created_at (DateTime)

-- Parents
parents
├─ id (UUID, FK: users.id)
├─ child_ids (Array<UUID>)
├─ email_frequency (Enum: daily, weekly, monthly)
└─ created_at (DateTime)

-- Sessions
sessions
├─ id (UUID)
├─ teacher_id (UUID, FK: teachers.id)
├─ curriculum_topic (String)
├─ location (Point)
├─ start_time (DateTime)
├─ end_time (DateTime)
├─ status (Enum: planning, active, completed)
├─ student_ids (Array<UUID>)
└─ created_at (DateTime)

-- Activities
activities
├─ id (UUID)
├─ curriculum_topic (String)
├─ description (Text)
├─ grade_level (String)
├─ duration_minutes (Int)
├─ competencies (Array<String>)
└─ created_at (DateTime)

-- Evidence (Student submissions)
evidence
├─ id (UUID)
├─ student_id (UUID, FK: students.id)
├─ session_id (UUID, FK: sessions.id)
├─ activity_id (UUID, FK: activities.id)
├─ evidence_type (Enum: photo, video, text, gps)
├─ content_url (String)
├─ metadata (JSON)
├─ created_at (DateTime)
└─ updated_at (DateTime)

-- Competencies (Student achievements)
competencies
├─ id (UUID)
├─ student_id (UUID, FK: students.id)
├─ competency_name (String)
├─ proficiency_level (Int: 0-5)
├─ evidence_ids (Array<UUID>)
├─ achieved_at (DateTime)
└─ updated_at (DateTime)

-- Messages (Parent-Teacher communication)
messages
├─ id (UUID)
├─ sender_id (UUID, FK: users.id)
├─ recipient_id (UUID, FK: users.id)
├─ subject (String)
├─ content (Text)
├─ read_at (DateTime)
├─ created_at (DateTime)
└─ updated_at (DateTime)
```

---

## 🔌 API Architecture

### Authentication Flow

```
┌─────────────────────────────┐
│   Client (Mobile/Web)       │
└──────────────┬──────────────┘
               │
               │ 1. POST /api/v1/auth/login
               │    {email, password}
               │
               ▼
┌─────────────────────────────┐
│  Backend Auth Route         │
│  - Verify credentials       │
│  - Generate JWT tokens      │
└──────────────┬──────────────┘
               │
               │ 2. Return {accessToken, refreshToken}
               │
               ▼
┌─────────────────────────────┐
│   Client Storage            │
│   AsyncStorage (mobile)     │
│   localStorage (web)        │
└─────────────────────────────┘

Subsequent Requests:
┌─────────────────────────────┐
│   GET /api/v1/resource      │
│   Authorization:            │
│   Bearer {accessToken}      │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│  Backend Dependency         │
│  - Extract token            │
│  - Verify JWT signature     │
│  - Check expiration         │
│  - Validate claims          │
└──────────────┬──────────────┘
               │
               ├─ Valid? ✓
               │  └─> Process request
               │
               └─ Expired?
                  └─> POST /api/v1/auth/refresh
                      {refreshToken}
                      └─> Return new accessToken
```

### API Endpoint Categories

**Authentication:**
```
POST   /api/v1/auth/login         - User login
POST   /api/v1/auth/register      - Create account
POST   /api/v1/auth/refresh       - Refresh JWT
GET    /api/v1/auth/me            - Current user
```

**Sessions:**
```
GET    /api/v1/sessions           - List sessions
POST   /api/v1/sessions           - Create session
GET    /api/v1/sessions/{id}      - Get session details
POST   /api/v1/sessions/{id}/join - Join session
GET    /api/v1/sessions/{id}/participants - List participants
```

**Curriculum:**
```
GET    /api/v1/activities         - List activities
POST   /api/v1/activities         - Create activity
GET    /api/v1/activities/{id}    - Get activity
```

**Evidence & Tracking:**
```
POST   /api/v1/evidence           - Submit evidence
GET    /api/v1/evidence           - List evidence
GET    /api/v1/competencies       - Get competencies
```

**AI Inference:**
```
POST   /api/v1/inference/prompt   - Chat with AI
POST   /api/v1/inference/curriculum - Get suggestions
```

**Parent Portal:**
```
POST   /api/v1/parent/auth/login          - Parent login
GET    /api/v1/parent/children            - Get linked children
GET    /api/v1/parent/children/{id}/progress    - Progress
GET    /api/v1/parent/messages            - Get messages
POST   /api/v1/parent/messages/{id}/reply - Send reply
GET    /api/v1/parent/reports/weekly      - Weekly report
GET    /api/v1/parent/reports/monthly     - Monthly report
```

---

## 🌐 Client Architecture

### Mobile App State Management

```
┌──────────────────────────────────────┐
│        Zustand Stores                │
├──────────────────────────────────────┤
│                                      │
│  authStore                           │
│  ├─ user: User | null                │
│  ├─ token: AuthToken | null          │
│  ├─ isLoading: boolean               │
│  ├─ login(email, password)           │
│  ├─ register(...)                    │
│  ├─ logout()                         │
│  └─ refreshToken()                   │
│                                      │
│  sessionStore                        │
│  ├─ activeSessions: Session[]        │
│  ├─ currentSession: Session | null   │
│  ├─ fetchSessions()                  │
│  ├─ joinSession(id)                  │
│  └─ updateSession(id, data)          │
│                                      │
│  locationStore                       │
│  ├─ currentLocation: Location        │
│  ├─ trackingEnabled: boolean         │
│  ├─ startTracking()                  │
│  ├─ stopTracking()                   │
│  └─ getLocation()                    │
│                                      │
└──────────────────────────────────────┘
         │
         │ Used by Screens & Components
         │
         ▼
    ┌─────────────┐
    │   Screens   │
    ├─────────────┤
    │ - useStore()│
    │ - Render UI │
    │ - Handle UI │
    │   events    │
    └─────────────┘
         │
         ├─ useNativeLocation() Hook
         ├─ useNativeCamera() Hook
         ├─ useOfflineSync() Hook
         │
         ▼
    ┌──────────────┐
    │  API Client  │
    ├──────────────┤
    │ - Axios      │
    │ - REST calls │
    │ - Auth       │
    │ - Error      │
    │   handling   │
    └──────────────┘
```

### Web Portal State Management

```
┌──────────────────────────────────────┐
│        Zustand Stores                │
├──────────────────────────────────────┤
│                                      │
│  parentAuthStore                     │
│  ├─ parent: Parent | null            │
│  ├─ token: AuthToken | null          │
│  ├─ login(email, password)           │
│  ├─ register(...)                    │
│  ├─ logout()                         │
│  └─ refreshToken()                   │
│                                      │
│  progressStore                       │
│  ├─ children: ChildProgress[]        │
│  ├─ selectedChild: Child | null      │
│  ├─ activities: Activity[]           │
│  ├─ competencies: Competency[]       │
│  ├─ messages: Message[]              │
│  └─ fetchProgress(childId)           │
│                                      │
│  uiStore                             │
│  ├─ darkMode: boolean                │
│  ├─ language: string                 │
│  ├─ sidebarOpen: boolean             │
│  └─ toggleDarkMode()                 │
│                                      │
└──────────────────────────────────────┘
         │
         │ Used by Pages & Components
         │
         ▼
    ┌──────────────┐
    │    Pages     │
    ├──────────────┤
    │ - useStore() │
    │ - Render UI  │
    │ - React      │
    │   Router     │
    └──────────────┘
         │
         ├─ useChildProgress() Hook
         ├─ useMessages() Hook
         ├─ useWeeklyReport() Hook
         │
         ▼
    ┌──────────────┐
    │  API Client  │
    ├──────────────┤
    │ - Axios      │
    │ - REST calls │
    │ - Auth       │
    │ - Error      │
    │   handling   │
    └──────────────┘
```

---

## 🔐 Security Architecture

### Authentication & Authorization

```
┌────────────────┐
│    Client      │
│  (Mobile/Web)  │
└────────┬───────┘
         │
         │ 1. Send credentials
         │
         ▼
┌────────────────────────────┐
│  Backend Auth Service      │
│  - Hash validation         │
│  - JWT generation          │
└────────────────────────────┘
         │
         │ 2. Return tokens
         │
         ▼
┌────────────────────────────┐
│  Client Storage            │
│  - accessToken (short)     │
│  - refreshToken (long)     │
└────────────────────────────┘
         │
         │ 3. All requests
         │
         ▼
┌────────────────────────────┐
│  Backend Middleware        │
│  - Verify JWT              │
│  - Check claims            │
│  - Validate role           │
└────────────────────────────┘
         │
         ├─ Valid → Process
         └─ Invalid → 401 Unauthorized
```

### Data Privacy

```
┌─────────────────────────────────┐
│   Privacy Engine                │
├─────────────────────────────────┤
│                                 │
│  FERPA (Student Records)        │
│  ├─ Mask student IDs            │
│  ├─ Restrict parent access      │
│  └─ Audit all accesses          │
│                                 │
│  COPPA (Under 13)               │
│  ├─ Require parental consent    │
│  ├─ Limit data collection       │
│  └─ Delete on request           │
│                                 │
│  GDPR (EU Citizens)             │
│  ├─ Explicit consent            │
│  ├─ Right to be forgotten       │
│  └─ Data portability            │
│                                 │
└─────────────────────────────────┘
```

---

## 📈 Scalability & Performance

### Caching Strategy

```
                Client Request
                     │
                     ▼
        ┌─────────────────────────┐
        │  Check Redis Cache      │
        └────┬────────────────────┘
             │
             ├─ Hit → Return (fast)
             │
             └─ Miss ↓
                 │
                 ▼
        ┌──────────────────────┐
        │  Query Database      │
        └────┬─────────────────┘
             │
             ├─ Update Cache
             ├─ Set TTL
             │
             ▼
        ┌──────────────────────┐
        │  Return to Client    │
        └──────────────────────┘
```

### Database Optimization

```
Strategies:
├─ Connection pooling (PgBouncer)
├─ Query optimization (indexes)
├─ Pagination (limit 50)
├─ Lazy loading (n+1 prevention)
├─ Denormalization (caching)
└─ Partitioning (large tables)
```

### API Rate Limiting

```
┌─────────────────────────────┐
│  Rate Limiter Middleware    │
├─────────────────────────────┤
│  Per IP Address:            │
│  - 100 requests/minute      │
│  - 10 requests/second       │
│                             │
│  Per User (authenticated):  │
│  - 1000 requests/hour       │
│  - 100 requests/minute      │
│                             │
│  Response: 429 Too Many     │
│  Retry-After header         │
└─────────────────────────────┘
```

---

## 🌍 Internationalization (i18n)

### Language Support

```
Mobile:
├─ English (en)
├─ Spanish (es)
├─ Arabic (ar) - RTL
└─ Japanese (ja)

Web:
├─ English (en)
├─ Spanish (es)
├─ Arabic (ar) - RTL
└─ Japanese (ja)

Backend:
├─ i18n keys in database
├─ Language selection stored per user
└─ Responses adapted per language
```

---

## 📊 Monitoring & Observability

### Observability Routes

```
GET /api/v1/health              - Service health
GET /api/v1/metrics             - Prometheus metrics
GET /api/v1/readiness           - Ready for requests
GET /api/v1/liveness            - Still alive
```

### Logging Strategy

```
Levels:
├─ DEBUG: Development
├─ INFO: Important events
├─ WARNING: Potential issues
├─ ERROR: Failures
└─ CRITICAL: System down

Format:
├─ Timestamp
├─ Level
├─ Service
├─ Request ID
├─ Message
└─ Stack trace
```

---

## 🔄 WebSocket Real-Time Architecture

```
┌─────────────────────────────────────┐
│      Client (Mobile/Web)            │
└────────────────┬────────────────────┘
                 │
                 │ WebSocket /ws/sessions/{id}
                 │
                 ▼
    ┌────────────────────────────────┐
    │  Backend WebSocket Handler     │
    │  - Accept connection           │
    │  - Store client reference      │
    │  - Listen for messages         │
    └────────────────────────────────┘
                 │
    ┌────────────┴────────────┐
    │                         │
    ▼                         ▼
Broadcast to:          Update Database:
├─ All students        ├─ Evidence table
├─ All teachers        ├─ Session table
└─ Teacher monitor     └─ Activity progress
```

---

## 📱 Mobile App Offline Architecture

### Offline-First Design

```
┌──────────────────────────────┐
│  User Takes Action (Offline) │
└────────────┬─────────────────┘
             │
             ▼
┌──────────────────────────────┐
│  Capture in Local Queue      │
│  (AsyncStorage)              │
│  {                           │
│    action: 'submitEvidence', │
│    data: {...},              │
│    timestamp: Date,          │
│    synced: false             │
│  }                           │
└────────────┬─────────────────┘
             │
             ▼
┌──────────────────────────────┐
│  Optimistic Update (UI)      │
│  Show as if successful       │
└────────────┬─────────────────┘
             │
             ▼
┌──────────────────────────────┐
│  Monitor Connection          │
│  (NetInfo API)               │
└────────────┬─────────────────┘
             │
    ┌────────┴────────┐
    │                 │
    ▼ Online          ▼ Offline
┌────────────┐   ┌──────────┐
│  Sync with │   │ Continue │
│  Backend   │   │  queue   │
│  - Upload  │   │ locally  │
│  - Verify  │   │          │
│  - Commit  │   └──────────┘
└────────────┘
```

---

## 🚀 Deployment Architecture

### Infrastructure

```
┌─────────────────────────────────┐
│      GitHub / Version Control   │
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│   GitHub Actions (CI/CD)        │
│  - Run tests                    │
│  - Build images                 │
│  - Deploy                       │
└────────────────┬────────────────┘
                 │
    ┌────────────┼────────────┐
    │            │            │
    ▼            ▼            ▼
┌────────┐  ┌────────┐  ┌────────┐
│Backend │  │Mobile  │  │ Web    │
│Docker  │  │App     │  │Vercel/ │
│Render/ │  │Store   │  │Netlify │
│Heroku  │  │Build   │  │        │
└────────┘  └────────┘  └────────┘
```

---

## 🔗 Component Dependencies

### Mobile Component Tree

```
App
├─ RootNavigator
│  ├─ AuthStack
│  │  ├─ LoginScreen
│  │  └─ RegisterScreen
│  └─ AppStack
│     ├─ StudentNavigator
│     │  ├─ StudentDashboard
│     │  ├─ ActivityScreen
│     │  └─ SessionScreen
│     └─ TeacherNavigator
│        ├─ TeacherDashboard
│        └─ MonitoringScreen
│
└─ Shared Components
   ├─ Button
   ├─ Card
   └─ LoadingSpinner
```

### Web Component Tree

```
App
├─ Router
│  ├─ PublicRoutes
│  │  ├─ LoginPage
│  │  └─ RegisterPage
│  └─ ProtectedRoutes
│     ├─ DashboardLayout
│     │  ├─ DashboardPage
│     │  ├─ ChildProgressPage
│     │  ├─ CommunicationPage
│     │  ├─ ReportsPage
│     │  └─ SettingsPage
│     └─ Shared Components
│        ├─ Sidebar
│        ├─ Header
│        ├─ Button
│        ├─ Card
│        └─ Charts
```

---

## 🎯 Design Patterns Used

### Patterns

```
Frontend:
├─ Container/Presentational
├─ Higher-Order Components (HOCs)
├─ Hooks (Custom)
├─ Pub/Sub (Zustand)
├─ Provider Pattern (Context)
└─ Render Props

Backend:
├─ MVC (Models, Routes, Services)
├─ Dependency Injection
├─ Factory Pattern
├─ Middleware Pattern
├─ Repository Pattern (DB)
└─ Service Locator
```

---

## 📚 Summary

The architecture follows:
- ✅ **Three-tier architecture** (UI, API, Data)
- ✅ **Monorepo structure** (backend, mobile, web)
- ✅ **RESTful API** with WebSocket support
- ✅ **State management** with Zustand
- ✅ **Type safety** with TypeScript
- ✅ **Security first** (JWT, encryption, FERPA/COPPA/GDPR)
- ✅ **Offline-first mobile** (AsyncStorage, sync queue)
- ✅ **Responsive web** (Tailwind, mobile-first)
- ✅ **Scalable backend** (caching, indexing, pooling)
- ✅ **Observable** (logging, metrics, health checks)

---

**For more details, see:**
- [README.md](../README.md) - Project overview
- [DEVELOPMENT.md](./DEVELOPMENT.md) - Development guide
- [API.md](./API.md) - API reference
- [DEPLOYMENT.md](./DEPLOYMENT.md) - Deployment guide

**Last Updated:** April 26, 2026
