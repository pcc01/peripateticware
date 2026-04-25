# Architecture & System Design

## Overview

Peripateticware is a **location-based AI tutoring platform** that combines GPS-enabled learning activities with intelligent inference and privacy-first design.

```
Student at Park → GPS Location → Learning Session
                       ↓
                  AI Inquiry Processing
                       ↓
                 Socratic Guidance
                       ↓
            Privacy-Filtered Evidence Storage
```

## System Components

### 1. Frontend (React/TypeScript)

**Purpose:** User-facing interface for teachers and students

**Key Features:**
- **Teacher Dashboard** - Curriculum management, live monitoring
- **Student Session** - Inquiry interface, evidence tracking
- **Maps** - Leaflet-based location visualization
- **Internationalization** - 4 languages with RTL support
- **Real-time** - WebSocket for live updates

**Architecture:**
```
React Components
    ↓
Zustand Stores (auth, session, ui)
    ↓
API Services (axios)
    ↓
FastAPI Backend
```

**Key Files:**
- `src/pages/` - Page-level components
- `src/components/` - Reusable UI components
- `src/services/` - API client layer
- `src/hooks/` - Custom React hooks
- `src/stores/` - Zustand state management

### 2. Backend (FastAPI)

**Purpose:** API server, business logic, AI inference

**Key Features:**
- **Authentication** - JWT-based user auth
- **Session Management** - Track learning sessions
- **Curriculum CRUD** - Create/manage units and activities
- **RAG Orchestration** - Process student inquiries
- **Real-time** - WebSocket for live monitoring
- **Privacy Engine** - FERPA/COPPA/GDPR compliance

**Routes:**
```
/api/v1/auth/*           → User authentication
/api/v1/sessions/*       → Learning session management
/api/v1/curriculum/*     → Curriculum CRUD
/api/v1/inference/*      → AI inference endpoints
/api/v1/observability/*  → Health checks, metrics
/ws/session/{id}         → WebSocket real-time updates
```

**Key Components:**
```
main.py              → FastAPI app entry point
core/
  ├── config.py      → Settings management
  ├── database.py    → SQLAlchemy setup
  ├── cache.py       → Redis caching
  ├── security.py    → JWT authentication
  └── dependencies.py → Dependency injection
  
models/
  └── database.py    → SQLAlchemy ORM models
  
services/
  ├── rag_orchestrator.py    → RAG pipeline
  └── sync_engine.py         → WebSocket sync
  
routes/
  ├── auth.py        → Authentication endpoints
  ├── sessions.py    → Session endpoints
  ├── curriculum.py  → Curriculum endpoints
  ├── inference.py   → Inference endpoints
  └── observability.py → Health, metrics
```

### 3. Database (PostgreSQL)

**Purpose:** Persistent data storage

**Key Tables:**
```
users              → Teachers, students, admins
curriculum_units   → Learning units (subjects, standards)
activities         → Geo-tagged activities
learning_sessions  → Student learning sessions
inquiries          → Student questions/prompts
evidence           → Learning evidence (responses)
audit_logs         → Compliance audit trail
```

**Relationships:**
```
Teacher
  └── CurriculumUnits
       └── Activities
            └── LearningSession
                 └── Inquiries
                      └── Evidence
```

### 4. LLM Providers (Switchable)

**Option A: Ollama (Local)**
- Run on host machine
- Port 11434
- Models: llama2 (text), llava (vision), whisper (audio)
- No API keys needed
- Lower latency
- Full privacy (data stays local)

**Option B: Claude API**
- Anthropic's Claude model
- Cloud-hosted
- Requires API key
- Higher latency
- Better for complex reasoning

**Configuration:**
```env
LLM_PROVIDER=ollama    # or "claude"
OLLAMA_BASE_URL=http://localhost:11434
CLAUDE_API_KEY=sk-...
```

### 5. RAG Pipeline

**Process:**
```
1. Student Inquiry
   ↓
2. Retrieve Context
   - Location
   - Curriculum
   - Learning history
   ↓
3. Document Retrieval
   - Query knowledge base
   - Find relevant resources
   ↓
4. Generate Response
   - Combine context + documents
   - Create Socratic prompt
   ↓
5. Store Evidence
   - Save to database
   - Apply privacy filters
   ↓
6. Return to Student
```

## Data Flow

### Session Creation Flow

```
Student
  ↓
Frontend: Start Session (GPS location capture)
  ↓
Backend: Create Session record
  ↓
Database: Store session + location
  ↓
Cache: Store active session
  ↓
WebSocket: Notify teacher (if monitoring)
```

### Inquiry Processing Flow

```
Student: Ask Question (text/image/audio)
  ↓
Frontend: Send to backend via HTTP/WebSocket
  ↓
Backend: Process inquiry
  - Extract context (location, curriculum)
  - Classify question type
  - Retrieve relevant documents (RAG)
  - Generate response (LLM)
  ↓
Privacy Filter: Apply FERPA/COPPA/GDPR rules
  ↓
Database: Store evidence + competency assessment
  ↓
WebSocket: Send response to student + teacher
  ↓
Cache: Update session state
```

### Privacy Filter Flow

```
Raw Evidence
  ├── Student View → Filter
  │    └── Hide competency_assessment
  │    └── Hide original_ai_draft
  │    └── Show only public fields
  │
  └── Teacher View → No filter
       └── Show all fields
       └── Competency assessment visible
       └── Original AI draft visible
```

## Deployment Architecture

### Development

```
Frontend (http://localhost:5173)
Backend (http://localhost:8010)
PostgreSQL (localhost:5432)
Redis (localhost:6379)
Ollama (localhost:11434)
```

### Docker Compose

```yaml
services:
  frontend:
    - React dev server
    - Port 5173
  
  backend:
    - FastAPI app
    - Port 8010
  
  postgres:
    - Database
    - Port 5432
  
  redis:
    - Cache
    - Port 6379
  
  nginx:
    - Reverse proxy
    - Port 80/443
```

### Production

```
GitHub Actions
  ↓
Build Docker images
  ↓
Push to Docker Hub / AWS ECR
  ↓
Deploy to:
  - AWS ECS / Kubernetes
  - Or self-hosted with Docker Compose
  
Frontend:
  - Cloudflare Pages (recommended)
  - S3 + CloudFront
  
Backend:
  - Docker container on Ubuntu/EC2
  - Load balanced with nginx
  
Database:
  - RDS (AWS) or self-managed PostgreSQL
  - Regular backups
  - Multi-region replication
```

## Authentication & Authorization

### JWT Flow

```
1. User logs in
   ↓
2. Backend: Verify credentials
   ↓
3. Generate JWT token
   ↓
4. Return token to frontend
   ↓
5. Store in localStorage
   ↓
6. Include in all subsequent requests
   ↓
7. Backend: Verify token signature
   ↓
8. Extract user info from token
```

### Roles & Permissions

```
Teacher:
  - Create curriculum units
  - Create activities
  - View all student evidence
  - View competency assessments
  - Manage student roster

Student:
  - Create sessions
  - Submit inquiries
  - View own evidence (public only)
  - Cannot see competency assessment
  - Cannot see other students' data

Admin:
  - All permissions
  - System configuration
  - User management
  - Report access

Parent (Future):
  - View child's progress
  - View child's sessions
  - Communicate with teacher
```

## Scalability Considerations

### Database Scaling
```
Level 1: Single PostgreSQL instance
Level 2: Replication (primary + read replicas)
Level 3: Sharding by user/school
Level 4: Geo-distributed databases
```

### Backend Scaling
```
Level 1: Single instance
Level 2: Load balanced (2-3 instances)
Level 3: Kubernetes (auto-scaling)
Level 4: Multi-region deployment
```

### Frontend Scaling
```
- Cloudflare Pages (global CDN)
- Image optimization
- Code splitting
- Service worker caching
- Lazy loading
```

## Security Measures

### Frontend
- ✅ HTTPS only
- ✅ CSRF protection
- ✅ XSS prevention (React escaping)
- ✅ Secure token storage
- ✅ Content Security Policy

### Backend
- ✅ Input validation (Pydantic)
- ✅ SQL injection prevention (ORM)
- ✅ Rate limiting
- ✅ JWT token validation
- ✅ CORS configuration
- ✅ Error handling (no stack traces to client)

### Data
- ✅ HTTPS/TLS encryption
- ✅ Database encryption (planned)
- ✅ Password hashing (bcrypt)
- ✅ PII sanitization in logs
- ✅ Audit trail for compliance

## Monitoring & Observability

### Metrics
- API response times
- Database query performance
- Error rates
- WebSocket connection count
- Cache hit/miss ratio
- LLM inference latency

### Logging
- Structured logging (JSON)
- Request/response logging
- Error tracking (Sentry)
- Audit logging (FERPA/GDPR)

### Health Checks
```
GET /health
→ {
    "status": "healthy",
    "database": "connected",
    "redis": "connected",
    "llm": "ready"
  }
```

## Testing Strategy

### Unit Tests
- Frontend: Vitest + React Testing Library (400+ tests)
- Backend: Pytest (200+ tests)
- Coverage target: 80%+

### Integration Tests
- API contract tests
- Database transaction tests
- Auth flow tests
- Privacy filter tests

### E2E Tests
- User workflows (Playwright)
- Cross-browser testing
- Mobile responsiveness
- Accessibility verification

## Deployment Checklist

### Pre-deployment
- [ ] All tests passing
- [ ] Code reviewed
- [ ] Security scan passed
- [ ] Performance benchmarked
- [ ] Database migrations tested
- [ ] Environment variables configured

### Deployment
- [ ] Database backed up
- [ ] Zero-downtime deployment (blue-green)
- [ ] Health checks passing
- [ ] Smoke tests executed
- [ ] Monitoring alerts active

### Post-deployment
- [ ] User feedback collected
- [ ] Performance metrics checked
- [ ] Error rates monitored
- [ ] Rollback plan ready

## Performance Targets

```
Frontend
├── Page load: < 2s
├── Interactive: < 3s
├── API response: < 200ms
└── WebSocket latency: < 100ms

Backend
├── API response: < 100ms (avg)
├── Database query: < 50ms (avg)
├── LLM inference: < 2s
└── WebSocket throughput: 1000+ concurrent

Database
├── Query response: < 50ms (p95)
├── Throughput: 1000+ QPS
└── Connection pool: 20-50 connections
```

---

See `docs/REMAINING_WORK.md` for future enhancements.
