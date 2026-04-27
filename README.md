# 🎓 Peripateticware - Contextual AI Tutor Platform

**A complete platform for inquiry-based learning with AI guidance, native mobile apps, and parent engagement.**

[![GitHub](https://img.shields.io/badge/GitHub-peripateticware-blue)](https://github.com/pcc01/peripateticware)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/Version-0.1.0-green.svg)](https://github.com/pcc01/peripateticware/releases)

---

## 🎯 Overview

Peripateticware is a comprehensive educational technology platform that combines:

- **🤖 AI-Powered Learning** - RAG-based curriculum guidance with Claude/Ollama
- **📱 Native Mobile Apps** - iOS & Android experiences for students and teachers
- **👨‍👩‍👧 Parent Portal** - Real-time progress tracking and communication
- **⚙️ RESTful API** - FastAPI backend with WebSocket support
- **🌍 Global Reach** - 4 languages with RTL support
- **♿ Accessible** - WCAG AAA compliant across all platforms

---

## 📁 Repository Structure (Monorepo)

```
peripateticware/
├── backend/                      FastAPI Python server
│   ├── app/                      Application code
│   ├── routes/                   API endpoints (auth, sessions, curriculum, inference)
│   ├── services/                 Business logic (RAG, sync, privacy)
│   ├── models/                   SQLAlchemy ORM models
│   ├── core/                     Core utilities (security, cache, config)
│   ├── requirements.txt           Python dependencies
│   ├── Dockerfile                Docker configuration
│   ├── main.py                   Entry point
│   └── README.md                 Backend documentation
│
├── mobile/                       React Native iOS/Android app
│   ├── src/
│   │   ├── screens/              Login, Register, Dashboard, Session, etc.
│   │   ├── components/           Reusable UI components
│   │   ├── stores/               Zustand state management
│   │   ├── hooks/                Custom hooks (location, camera, sync)
│   │   ├── services/             API client
│   │   ├── types/                TypeScript interfaces
│   │   ├── config/               i18n, constants
│   │   ├── utils/                Utilities
│   │   ├── App.tsx               Navigation setup
│   │   └── main.tsx              Entry point
│   ├── package.json              Dependencies & scripts
│   ├── app.json                  Expo configuration
│   ├── tsconfig.json             TypeScript config
│   ├── .env.example              Environment template
│   └── README.md                 Mobile documentation
│
├── web/                          React + Vite parent portal
│   ├── src/
│   │   ├── pages/                Login, Dashboard, Progress, Reports, etc.
│   │   ├── components/           Reusable UI components
│   │   ├── stores/               Zustand state management
│   │   ├── hooks/                Custom hooks
│   │   ├── services/             API client
│   │   ├── types/                TypeScript interfaces
│   │   ├── styles/               Global CSS + design system
│   │   ├── config/               i18n, constants
│   │   ├── utils/                Utilities
│   │   ├── App.tsx               Routing setup
│   │   └── main.tsx              Entry point
│   ├── index.html                HTML entry
│   ├── package.json              Dependencies & scripts
│   ├── vite.config.ts            Vite configuration
│   ├── tsconfig.json             TypeScript config
│   ├── .env.example              Environment template
│   └── README.md                 Web documentation
│
├── docs/                         Project documentation
│   ├── ARCHITECTURE.md           System architecture
│   ├── API.md                    API reference
│   ├── DEVELOPMENT.md            Development guide
│   ├── DEPLOYMENT.md             Deployment guide
│   ├── REMAINING_WORK.md         Phase 3+ roadmap
│   └── diagrams/                 Architecture diagrams
│
├── database/                     Database scripts
│   ├── schema.sql                Database schema
│   └── init.sql                  Initialization scripts
│
├── .github/                      GitHub workflows
│   ├── workflows/
│   │   ├── backend-tests.yml     Backend CI/CD
│   │   ├── mobile-tests.yml      Mobile CI/CD
│   │   ├── web-tests.yml         Web CI/CD
│   │   └── deploy.yml            Deployment workflow
│   └── ISSUE_TEMPLATE/
│
├── package.json                  Root workspace configuration
├── .gitignore                    Git ignore rules
├── README.md                     This file
└── LICENSE                       MIT License
```

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+ (for mobile and web)
- **Python** 3.10+ (for backend)
- **npm** or **yarn** (for JavaScript)
- **pip** (for Python)

### Installation

```bash
# Clone repository
git clone https://github.com/pcc01/peripateticware.git
cd peripateticware

# Install all workspaces
npm install

# Install backend dependencies
cd backend && pip install -r requirements.txt && cd ..
```

### Environment Setup

```bash
# Backend
cd backend
cp .env.example .env
# Edit .env with your configuration
cd ..

# Mobile
cd mobile
cp .env.example .env.local
# Edit .env.local with API URL
cd ..

# Web
cd web
cp .env.example .env.local
# Edit .env.local with API URL
cd ..
```

### Run Development

**Option A: Run all services together**
```bash
# Terminal 1: Backend
cd backend
python -m uvicorn main:app --reload --port 8000

# Terminal 2: Mobile
cd mobile
npm start

# Terminal 3: Web
cd web
npm run dev
```

**Option B: Run individually**

**Backend (FastAPI):**
```bash
cd backend
python -m uvicorn main:app --reload
# API: http://localhost:8000
# Docs: http://localhost:8000/docs
```

**Mobile (React Native):**
```bash
cd mobile
npm start
# Scan QR code with Expo Go, or press 'i' for iOS, 'a' for Android
```

**Web Portal (React + Vite):**
```bash
cd web
npm run dev
# Opens at http://localhost:5173
```

### Run Tests

```bash
# Test all workspaces
npm test --workspaces

# Test specific workspace
npm test --workspace=mobile
npm test --workspace=web
```

### Linting & Type Checking

```bash
# Lint all
npm run lint --workspaces

# Type check all
npm run type-check --workspaces
```

---

## 📱 Mobile App (React Native)

**Location:** `./mobile`

### Features
- 🔐 JWT authentication with biometric support
- 📍 GPS-based activity discovery
- 📸 Native camera for evidence capture
- 🗺️ Interactive maps integration
- 📊 Student progress tracking
- 🎯 Competency achievement system
- 🌐 4 languages + RTL support
- 💾 Offline-first architecture
- ♿ WCAG AAA accessibility

### Quick Start
```bash
cd mobile
npm install
npm start
```

### Key Scripts
```json
{
  "start": "expo start",
  "ios": "expo start --ios",
  "android": "expo start --android",
  "test": "jest",
  "lint": "eslint src",
  "type-check": "tsc --noEmit"
}
```

### Technology Stack
- React Native 0.73
- Expo 50
- TypeScript 5.3
- Zustand (state)
- React Navigation
- Axios (HTTP)
- Expo Location & Camera
- i18next (i18n)

### Documentation
See [mobile/README.md](./mobile/README.md) for complete mobile documentation.

---

## 👨‍👩‍👧 Parent Portal (React + Vite)

**Location:** `./web`

### Features
- 🔐 Secure parent authentication
- 📊 Multi-child progress dashboard
- 📈 Visual learning analytics
- 📧 Email digest reports
- 💬 Teacher communication hub
- 🎯 Competency tracking
- 📄 PDF report generation
- 🌙 Dark mode support
- 🌍 Multi-language support
- ♿ WCAG AAA accessibility

### Quick Start
```bash
cd web
npm install
npm run dev
```

### Key Scripts
```json
{
  "dev": "vite",
  "build": "vite build",
  "preview": "vite preview",
  "test": "vitest run",
  "lint": "eslint src",
  "type-check": "tsc --noEmit"
}
```

### Technology Stack
- React 18.2
- Vite 5.0
- TypeScript 5.3
- Tailwind CSS 3.4
- Zustand (state)
- React Router 6.20
- Recharts (charts)
- Axios (HTTP)
- i18next (i18n)

### Documentation
See [web/README.md](./web/README.md) for complete portal documentation.

---

## ⚙️ Backend (FastAPI)

**Location:** `./backend`

### Features
- 🔐 JWT authentication
- 📝 SQLAlchemy ORM with PostgreSQL
- 🤖 RAG integration (Claude/Ollama)
- 🔄 Real-time WebSocket support
- 🔒 Privacy engines (FERPA/COPPA/GDPR)
- 📊 Session management
- 🎯 Evidence tracking
- 🔐 Password hashing with bcrypt

### Quick Start
```bash
cd backend
python -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows
pip install -r requirements.txt
python -m uvicorn main:app --reload
```

### API Documentation
- **Interactive Docs:** http://localhost:8000/docs (Swagger UI)
- **Alternative Docs:** http://localhost:8000/redoc (ReDoc)
- **OpenAPI Schema:** http://localhost:8000/openapi.json

### Key Endpoints
```
AUTH
  POST /api/v1/auth/login
  POST /api/v1/auth/register
  POST /api/v1/auth/refresh

SESSIONS
  GET  /api/v1/sessions
  POST /api/v1/sessions
  GET  /api/v1/sessions/{id}
  POST /api/v1/sessions/{id}/join

CURRICULUM
  GET  /api/v1/activities
  GET  /api/v1/activities/{id}
  POST /api/v1/activities

INFERENCE (AI)
  POST /api/v1/inference/prompt
  POST /api/v1/inference/curriculum-suggestions

PARENT PORTAL
  GET  /api/v1/parent/children
  GET  /api/v1/parent/children/{id}/progress
  GET  /api/v1/parent/messages
```

### Documentation
See [backend/README.md](./backend/README.md) for complete backend documentation.

---

## 📚 Documentation

### Main Docs
- **[ARCHITECTURE.md](./docs/ARCHITECTURE.md)** - System design and data flow
- **[API.md](./docs/API.md)** - Complete API reference
- **[DEVELOPMENT.md](./docs/DEVELOPMENT.md)** - Development workflow
- **[DEPLOYMENT.md](./docs/DEPLOYMENT.md)** - Deployment procedures
- **[REMAINING_WORK.md](./docs/REMAINING_WORK.md)** - Future phases roadmap

### App-Specific Docs
- **[mobile/README.md](./mobile/README.md)** - Mobile app guide
- **[web/README.md](./web/README.md)** - Portal app guide
- **[backend/README.md](./backend/README.md)** - Backend guide

---

## 🔧 Development Workflow

### Setting Up Dev Environment

1. **Clone & Install**
```bash
git clone https://github.com/pcc01/peripateticware.git
cd peripateticware
npm install
cd backend && pip install -r requirements.txt
```

2. **Configure Environment**
```bash
cd backend && cp .env.example .env
cd ../mobile && cp .env.example .env.local
cd ../web && cp .env.example .env.local
```

3. **Start Services**
```bash
# Terminal 1
cd backend && python -m uvicorn main:app --reload

# Terminal 2
cd mobile && npm start

# Terminal 3
cd web && npm run dev
```

### Code Style

- **TypeScript:** Use strict mode, type all variables
- **Python:** Follow PEP 8, use type hints
- **Formatting:** Prettier (JS/TS), Black (Python)
- **Linting:** ESLint (JS), Pylint (Python)

### Git Workflow

```bash
# Create feature branch
git checkout -b feature/your-feature-name

# Make changes and commit
git add .
git commit -m "feat: describe your changes"

# Push and create PR
git push origin feature/your-feature-name
```

### Testing

```bash
# Run all tests
npm test --workspaces

# Run specific tests
npm test --workspace=mobile
npm test --workspace=web

# Backend tests
cd backend && pytest
```

---

## 🚀 Deployment

### Development
```bash
npm install  # All workspaces
npm run dev  # Run all services
```

### Production

See [DEPLOYMENT.md](./docs/DEPLOYMENT.md) for complete deployment guide.

**Quick Summary:**
- **Backend:** Docker container or direct Python
- **Mobile:** TestFlight (iOS) / Google Play (Android)
- **Web:** Vercel, Netlify, or any static host

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Requirements
- Write tests for new features
- Update documentation
- Follow code style guidelines
- Pass all CI/CD checks

---

## 📋 Project Status

### ✅ Completed (Phase 2)
- Complete React frontend (15+ components)
- Complete FastAPI backend (5 modules)
- Database schema & migrations
- RAG integration (Claude/Ollama)
- WebSocket real-time support
- Privacy engines (FERPA/COPPA/GDPR)
- 4-language i18n + RTL
- WCAG AAA accessibility
- 400+ unit tests
- Docker setup
- GitHub Actions CI/CD

### 🚀 In Progress (Phase 4)
- React Native mobile app ✅ (Foundation complete)
- Parent portal web app ✅ (Foundation complete)
- Mobile feature development
- Portal feature development
- Integration testing

### 📅 Roadmap

**Phase 3:** Production hardening (connection pooling, monitoring, audit trails)  
**Phase 4:** Mobile app & parent portal (weeks 1-16)  
**Phase 5:** Advanced features (AR, voice, gamification)  

See [REMAINING_WORK.md](./docs/REMAINING_WORK.md) for full roadmap.

---

## 📊 Statistics

```
Codebase Summary
├── Backend:       2,000+ lines (Python/FastAPI)
├── Mobile:        2,000+ lines (TypeScript/React Native)
├── Web Portal:    1,500+ lines (TypeScript/React)
├── Documentation: 40,000+ words
├── Tests:         400+ unit tests
└── Total:         5,500+ LOC + comprehensive docs
```

---

## 🔐 Security

- ✅ JWT authentication with refresh tokens
- ✅ Password hashing (bcrypt)
- ✅ HTTPS/TLS enforcement
- ✅ CORS configuration
- ✅ Rate limiting
- ✅ Input validation & sanitization
- ✅ FERPA/COPPA/GDPR compliance
- ✅ Biometric auth support (mobile)

---

## 🌍 Internationalization

Supported languages:
- 🇬🇧 English
- 🇪🇸 Spanish
- 🇸🇦 Arabic (RTL)
- 🇯🇵 Japanese

---

## ♿ Accessibility

- ✅ WCAG AAA compliant
- ✅ Screen reader support
- ✅ Keyboard navigation
- ✅ High contrast mode
- ✅ Semantic HTML
- ✅ ARIA labels
- ✅ Color-blind friendly

---

## 📞 Support

### Documentation
- See [docs/](./docs/) for comprehensive guides
- Check individual README files in each workspace
- Review code comments for implementation details

### Issues
- Report bugs: [GitHub Issues](https://github.com/pcc01/peripateticware/issues)
- Discuss features: [GitHub Discussions](https://github.com/pcc01/peripateticware/discussions)

### Contact
- Email: support@peripateticware.com
- GitHub: [@pcc01](https://github.com/pcc01)

---

## 📄 License

This project is licensed under the MIT License - see [LICENSE](./LICENSE) file for details.

---

## 🙏 Acknowledgments

Built with:
- React & React Native
- FastAPI & SQLAlchemy
- PostgreSQL
- Claude AI & Ollama
- Tailwind CSS
- And many open-source libraries

---

## 🎯 Next Steps

1. **Set up development environment** (see Quick Start)
2. **Read architecture documentation** (see [ARCHITECTURE.md](./docs/ARCHITECTURE.md))
3. **Explore codebase** (start with backend/main.py, mobile/src/App.tsx, web/src/App.tsx)
4. **Run tests** (npm test --workspaces)
5. **Create a feature branch** and start developing!

---

**Happy coding! 🚀**

*Last Updated: April 26, 2026*  
*Version: 0.1.0*  
*Status: Active Development*
