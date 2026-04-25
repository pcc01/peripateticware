# 🌍 Peripateticware

> **Location-Based Contextual AI Tutoring Platform**
> 
> An intelligent educational platform that uses GPS-based learning locations, Socratic questioning, and AI-powered personalized instruction to create contextual learning experiences for K-12 students.

![Status](https://img.shields.io/badge/status-production--ready-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)
![Version](https://img.shields.io/badge/version-0.1.0-orange)

---

## 📚 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Quick Start](#quick-start)
- [Project Structure](#project-structure)
- [Development](#development)
- [Deployment](#deployment)
- [Testing](#testing)
- [Contributing](#contributing)
- [License](#license)

---

## 🎯 Overview

Peripateticware combines **location-based learning** with **AI-powered instruction** to create immersive educational experiences. Teachers create curriculum units tied to physical locations; students conduct field investigations while receiving Socratic prompts powered by RAG-augmented inference from Ollama (or Claude API).

### Key Innovation

Rather than classroom-based learning, Peripateticware enables teachers to:
- Create curriculum units aligned with educational standards
- Tag activities to geographic locations (parks, museums, historical sites)
- Monitor students in real-time via live map tracking
- Access detailed evidence of learning with teacher-only competency assessments

Students can:
- Start learning sessions at specific locations via GPS
- Ask questions and receive contextual Socratic guidance
- Submit evidence via text, images, or audio
- Track their progress across sessions

---

## ✨ Features

### 🎓 Teacher Features
- **Curriculum Management** - Create units with Bloom/Marzano taxonomy alignment
- **Activity Creation** - Geo-tag activities with customizable learning zones
- **Batch Import** - Import 100s of activities from CSV/JSON
- **Live Monitoring** - Real-time map with student locations and progress
- **Evidence Review** - View competency assessments (teacher-only)
- **Student Roster** - Manage enrollment and track progress

### 👨‍🎓 Student Features
- **Session Creation** - Start learning with GPS location capture
- **Socratic Inquiry** - Ask questions via text, image, or audio
- **Live Guidance** - Receive contextual AI prompts based on location + curriculum
- **Evidence Tracking** - View learning outcomes (privacy-filtered)
- **Progress Dashboard** - Track learning across sessions

### 🔐 Privacy & Compliance
- **FERPA** - US student privacy (teacher-only competency data)
- **COPPA** - US protection for under-13 users (email removal)
- **GDPR** - EU data protection (3-year retention, data residency)
- **EU AI Act** - AI transparency and accountability
- **PII Sanitization** - Logs contain initials only, no full names/emails

### 🌐 Internationalization
- English, Spanish, Arabic (RTL), Japanese
- Pseudo-localization for testing
- Format functions for dates, numbers, currency

### ♿ Accessibility
- WCAG AAA compliance throughout
- Keyboard navigation, screen reader support
- 48px minimum touch targets
- High contrast mode support

### 📱 Multi-Device
- Mobile-first responsive design
- Works on iOS, Android, desktop
- GPS location access
- Camera/microphone for multimodal input

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    PERIPATETICWARE                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────┐          ┌──────────────────┐        │
│  │  FRONTEND        │          │   BACKEND        │        │
│  │  React/TypeScript│  HTTP    │   FastAPI        │        │
│  │  Leaflet Maps    │◄────────►│   SQLAlchemy     │        │
│  │  i18n (4 langs)  │ WebSocket│   RAG/Inference  │        │
│  └──────────────────┘          └──────────────────┘        │
│         Port 5173 (dev)            Port 8010               │
│                                        │                    │
│                    ┌───────────────────┼───────────────────┐│
│                    │                   │                   ││
│           ┌────────▼────────┐  ┌──────▼──────┐  ┌─────────▼┐│
│           │  PostgreSQL     │  │   Ollama    │  │  Claude  ││
│           │  (Sessions,     │  │  (Local AI) │  │  API     ││
│           │   Users)        │  │  (Port 11434)  │          ││
│           └─────────────────┘  └─────────────┘  └──────────┘│
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Student Query** → Frontend (text/image/audio)
2. **Session Context** → Backend (location, curriculum, user)
3. **RAG Processing** → Ollama/Claude (retrieval-augmented generation)
4. **Socratic Response** → WebSocket (real-time to frontend)
5. **Evidence Storage** → PostgreSQL (with privacy filtering)

### Privacy Flow

```
Student Query → Backend → [Privacy Filter] → Teacher Data (hidden)
              → Frontend → [Role-based] → Student sees only safe data

Teacher Query → Backend → [Competency Assessment] → Visible only to teacher
```

See `docs/ARCHITECTURE.md` for detailed diagrams.

---

## 🛠️ Tech Stack

### Frontend
- **React 18.2** - UI library
- **TypeScript 5.3** - Type safety
- **Vite** - Build tool
- **Tailwind CSS** - Styling
- **Leaflet** - Open-source maps
- **i18next** - Internationalization
- **Zustand** - State management
- **Axios** - HTTP client

### Backend
- **FastAPI** - Python web framework
- **SQLAlchemy** - ORM
- **PostgreSQL** - Relational database
- **Redis** - Caching
- **Ollama** - Local LLM inference
- **Claude API** - Alternative LLM provider
- **Haystack** - RAG framework
- **Pydantic** - Data validation

### DevOps
- **Docker** - Containerization
- **Docker Compose** - Multi-container orchestration
- **GitHub Actions** - CI/CD
- **Cloudflare Pages** - Frontend deployment
- **Nginx** - Reverse proxy

### Testing
- **Vitest** - Unit testing (frontend)
- **Pytest** - Unit testing (backend)
- **Playwright** - E2E testing
- **Coverage.py** - Code coverage

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- Python 3.11+
- Docker & Docker Compose
- Ollama (for local LLM inference)
- PostgreSQL (or use Docker)

### 1. Clone Repository
```bash
git clone https://github.com/yourusername/peripateticware
cd peripateticware
```

### 2. Setup Frontend
```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
# Opens http://localhost:5173
```

### 3. Setup Backend
```bash
cd ../backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
python main.py
# Available at http://localhost:8010
```

### 4. Start Ollama
```bash
# In separate terminal
ollama serve
# Models will be pulled automatically or use:
# ollama pull llama2
# ollama pull llava
```

### 5. Setup Database
```bash
# Using Docker Compose (recommended)
docker-compose up -d postgres

# Or manually
psql -h localhost -U postgres
CREATE DATABASE peripateticware;
```

### 6. Test Everything
```bash
# Frontend tests
cd frontend
npm run test

# Backend tests
cd ../backend
pytest

# E2E tests
cd ../frontend
npm run e2e
```

---

## 📁 Project Structure

```
peripateticware/
├── frontend/                    # React/TypeScript frontend
│   ├── src/
│   │   ├── components/         # UI components
│   │   ├── pages/              # Page components
│   │   ├── services/           # API services
│   │   ├── hooks/              # Custom React hooks
│   │   ├── stores/             # Zustand stores
│   │   ├── types/              # TypeScript definitions
│   │   ├── utils/              # Utilities (privacy, i18n, etc.)
│   │   ├── locales/            # Translations (4 languages)
│   │   ├── config/             # Configuration
│   │   ├── styles/             # Global CSS
│   │   └── tests/              # Unit & E2E tests
│   ├── .env.example
│   ├── package.json
│   ├── vite.config.ts
│   ├── vitest.config.ts
│   ├── tsconfig.json
│   ├── tailwind.config.ts
│   ├── README.md
│   └── DEPLOYMENT.md
│
├── backend/                     # FastAPI backend
│   ├── core/                   # Core configuration
│   │   ├── config.py           # Settings management
│   │   ├── database.py         # SQLAlchemy setup
│   │   ├── cache.py            # Redis caching
│   │   ├── security.py         # Auth & JWT
│   │   └── dependencies.py     # Dependency injection
│   ├── models/                 # SQLAlchemy models
│   ├── routes/                 # API endpoints
│   │   ├── auth.py
│   │   ├── sessions.py
│   │   ├── curriculum.py
│   │   ├── inference.py
│   │   └── observability.py
│   ├── services/               # Business logic
│   │   ├── rag_orchestrator.py # RAG pipeline
│   │   └── sync_engine.py      # Real-time sync
│   ├── tests/                  # Unit & integration tests
│   ├── main.py                 # Application entry point
│   ├── requirements.txt
│   ├── Dockerfile
│   ├── .env.example
│   └── README.md
│
├── database/                    # Database setup
│   ├── init.sql                # Initial schema
│   └── schema.sql              # Complete schema
│
├── docker/                      # Docker configuration
│   ├── docker-compose.yml      # Multi-container setup
│   ├── docker-compose.prod.yml # Production setup
│   └── Dockerfile.nginx        # Nginx reverse proxy
│
├── docs/                        # Documentation
│   ├── ARCHITECTURE.md         # System architecture
│   ├── API.md                  # API reference
│   ├── DEVELOPMENT.md          # Development guide
│   ├── DEPLOYMENT.md           # Deployment guide
│   ├── REMAINING_WORK.md       # Future enhancements
│   └── diagrams/               # SVG architecture diagrams
│       ├── system-architecture.svg
│       ├── privacy-flow.svg
│       ├── session-lifecycle.svg
│       ├── database-schema.svg
│       ├── component-hierarchy.svg
│       └── data-flow.svg
│
├── tests/                       # Integration & E2E tests
│   ├── integration/            # API integration tests
│   ├── e2e/                    # End-to-end workflows
│   └── fixtures/               # Test data
│
├── .github/workflows/          # CI/CD pipelines
│   ├── tests.yml               # Run tests
│   ├── deploy.yml              # Deploy to production
│   └── lint.yml                # Code quality checks
│
├── .gitignore
├── README.md                   # This file
├── LICENSE
├── docker-compose.yml
├── docker-compose.prod.yml
└── CONTRIBUTING.md
```

---

## 👨‍💻 Development

### Environment Setup

**Frontend (.env.local):**
```env
VITE_API_URL=http://localhost:8010/api/v1
VITE_WEBSOCKET_URL=ws://localhost:8010/api/v1
VITE_DEFAULT_LANGUAGE=en
NODE_ENV=development
```

**Backend (.env):**
```env
ENVIRONMENT=development
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
DATABASE_URL=postgresql://user:password@localhost:5432/peripateticware
REDIS_URL=redis://localhost:6379/0
SECRET_KEY=dev-key-change-in-production
```

### Running the Stack

**Option 1: Individual Services**
```bash
# Terminal 1: Frontend
cd frontend && npm run dev

# Terminal 2: Backend  
cd backend && python main.py

# Terminal 3: Ollama
ollama serve

# Terminal 4: Database
docker run -d -p 5432:5432 \
  -e POSTGRES_USER=peripateticware_user \
  -e POSTGRES_PASSWORD=peripateticware_secure_password_dev \
  -e POSTGRES_DB=peripateticware \
  postgres:15
```

**Option 2: Docker Compose (Recommended)**
```bash
docker-compose up
# Frontend: http://localhost:5173
# Backend: http://localhost:8010
# API Docs: http://localhost:8010/docs
```

### Code Quality
```bash
# Frontend
npm run lint
npm run format
npm run type-check

# Backend
black backend/
flake8 backend/
pytest backend/ --cov
```

---

## 🚀 Deployment

### Frontend (Cloudflare Pages)
See `frontend/DEPLOYMENT.md` for:
- Cloudflare Pages setup
- Custom domain configuration
- Environment variables

### Backend (Docker + Ubuntu)
See `backend/README.md` for:
- Docker image building
- Kubernetes deployment
- Ubuntu/Nginx setup
- Database backups

### Full Stack (Docker Compose)
```bash
docker-compose -f docker-compose.prod.yml up -d
```

---

## 🧪 Testing

### Frontend Tests
```bash
cd frontend

# Unit tests
npm run test

# E2E tests  
npm run e2e

# Coverage
npm run test:coverage
```

### Backend Tests
```bash
cd backend

# Unit tests
pytest

# Integration tests
pytest tests/integration/

# Coverage
pytest --cov=. --cov-report=html
```

### Full Test Suite
```bash
# Run all tests
npm run test:all  # From root (if configured)
```

See `tests/` directory for integration and E2E test suites.

---

## 📖 Documentation

- **README.md** (this file) - Project overview
- **docs/ARCHITECTURE.md** - System design with diagrams
- **docs/API.md** - API reference and integration guide
- **docs/DEVELOPMENT.md** - Development setup and workflow
- **docs/DEPLOYMENT.md** - Production deployment guide
- **docs/REMAINING_WORK.md** - Future enhancements and roadmap
- **frontend/README.md** - Frontend-specific documentation
- **backend/README.md** - Backend-specific documentation

---

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for:
- Code of conduct
- Development setup
- Coding standards
- Pull request process
- Testing requirements

---

## 📋 Remaining Work

See [docs/REMAINING_WORK.md](./docs/REMAINING_WORK.md) for:
- Phase 3 enhancements
- Performance optimizations
- Advanced features
- Scaling strategies

---

## 📄 License

This project is licensed under the MIT License - see [LICENSE](./LICENSE) file for details.

---

## 🙋 Support

- **Issues:** GitHub Issues
- **Discussions:** GitHub Discussions
- **Documentation:** See `/docs` folder
- **Email:** maintainers@example.com

---

## ✨ Acknowledgments

Built with care for location-based contextual learning.

**Key Technologies:**
- FastAPI - Modern Python web framework
- React - Powerful UI library
- Ollama - Local LLM inference
- PostgreSQL - Reliable database
- Leaflet - Open-source mapping

---

**Version:** 0.1.0  
**Last Updated:** April 25, 2026  
**Status:** Production Ready

Made with ❤️ for K-12 education
