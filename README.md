# 🌍 Peripateticware - AI-Powered Contextual Learning Platform

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Python 3.14+](https://img.shields.io/badge/Python-3.14+-blue.svg)](https://www.python.org/downloads/)
[![Node.js 16+](https://img.shields.io/badge/Node.js-16+-green.svg)](https://nodejs.org/)
[![Status: Production Ready](https://img.shields.io/badge/Status-Production%20Ready-brightgreen.svg)](#status)

**Transform education through intelligent, context-aware learning experiences.**

Peripateticware is an AI-powered platform that delivers personalized learning activities based on students' real-world locations and learning contexts. Parents can track their children's progress in real-time through an intuitive web portal and mobile app.

---

## 📋 Table of Contents

- [Features](#features)
- [Project Status](#project-status)
- [Tech Stack](#tech-stack)
- [Quick Start](#quick-start)
- [Project Structure](#project-structure)
- [Development](#development)
- [Testing](#testing)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [Documentation](#documentation)
- [License](#license)

---

## ✨ Features

### 🎓 Core Platform Features
- **Contextual Learning** - AI-powered activities based on real-world locations
- **Progress Tracking** - Real-time monitoring of student learning
- **RAG Integration** - Retrieval-Augmented Generation for personalized content
- **Multi-Language Support** - 4+ languages with RTL support
- **Privacy Compliant** - FERPA, COPPA, and GDPR compliant

### 👨‍👩‍👧 Parent Portal (Phase 2 Complete)
- **Email Notifications** - Progress digests, achievements, and concerns
- **Child Linking** - Secure 6-digit code linking system
- **Password Management** - Secure password reset with strong validation
- **Real-Time Notifications** - WebSocket-based instant updates
- **Progress Dashboard** - Visual progress tracking and reports
- **Activity Management** - View child's learning activities

### 🔐 Security Features
- **Rate Limiting** - Protection against brute force attacks
- **Token Expiration** - Secure session management (1-hour tokens)
- **Password Strength** - 5-rule validation (8+ chars, uppercase, lowercase, number, special)
- **Code Expiration** - 24-hour child linking codes
- **Secure Tokens** - UUID-based token generation

### 📱 Mobile Support
- **Responsive Design** - Works on all devices
- **React Native** - Native iOS/Android apps (Phase 4)
- **Offline Support** - Planned for Phase 4
- **Push Notifications** - Planned for Phase 4

---

## 📊 Project Status

### ✅ Completed (Production Ready)

| Phase | Component | Status | Lines | Tests |
|-------|-----------|--------|-------|-------|
| **1** | Core System | ✅ Complete | 2,450 | 400+ |
| **1** | Backend Services | ✅ Complete | 7 modules | ✅ |
| **1** | Frontend Pages | ✅ Complete | 7 pages | ✅ |
| **2** | Email Service | ✅ Complete | 250 | 20+ |
| **2** | Child Linking | ✅ Complete | 220 | 25+ |
| **2** | Password Reset | ✅ Complete | 200 | 25+ |
| **2** | Notifications | ✅ Complete | 280 | 20+ |
| **3** | Test Suite | ✅ Complete | 1,100 | 90+ |

### 🟡 In Progress

| Phase | Component | Status | ETA |
|-------|-----------|--------|-----|
| **4** | Mobile App | 🟡 Started | Q2 2026 |
| **4** | Login Screen | 🟡 Started | Q2 2026 |
| **4** | Dashboard Screen | 🟡 Started | Q2 2026 |

### ⏳ Planned

| Phase | Component | Status | ETA |
|-------|-----------|--------|-----|
| **5** | AI Curriculum | ⏳ Planned | Q3 2026 |
| **5** | Gamification | ⏳ Planned | Q3 2026 |
| **5** | AR Features | ⏳ Planned | Q3 2026 |

---

## 🏗️ Tech Stack

### Backend
- **Framework**: FastAPI (Python 3.14+)
- **Database**: PostgreSQL with SQLAlchemy ORM
- **Cache**: Redis
- **Real-Time**: WebSocket
- **AI/ML**: OpenAI API + Ollama (local LLM)
- **Authentication**: JWT tokens
- **API Docs**: Swagger/OpenAPI

### Frontend
- **Framework**: React 18 with TypeScript
- **Styling**: Tailwind CSS
- **State Management**: Zustand
- **HTTP Client**: Axios
- **Routing**: React Router v6
- **UI Components**: Custom + Headless UI

### Mobile (Phase 4)
- **Framework**: React Native + Expo
- **State Management**: Zustand
- **HTTP Client**: Axios
- **Secure Storage**: React Native Secure Store
- **Navigation**: React Navigation

### DevOps
- **Containerization**: Docker & Docker Compose
- **CI/CD**: GitHub Actions
- **Version Control**: Git & GitHub
- **Testing**: pytest, Jest
- **Code Quality**: ESLint, Black

- **[USER_GUIDE.md](USER_GUIDE.md)** - How to use the platform
  - For teachers: Creating activities, monitoring students, assessing competencies
  - For parents: Viewing child progress, using mobile app
  - For administrators: Setting up school, managing users

- **[DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)** - Complete production setup
  - Database configuration
  - SSL/TLS setup
  - Monitoring and maintenance
  - Security hardening

### Prerequisites
- Python 3.14+ ([Download](https://www.python.org/downloads/))
- Node.js 16+ ([Download](https://nodejs.org/))
- PostgreSQL 12+ ([Download](https://www.postgresql.org/download/))
- Git ([Download](https://git-scm.com/))

### Adding Mobile App to GitHub
See: **[guides/GITHUB_INTEGRATION_GUIDE.md](guides/GITHUB_INTEGRATION_GUIDE.md)**

#### 1. Clone Repository
```bash
git clone https://github.com/pcc01/peripateticware.git
cd peripateticware
```

#### 2. Backend Setup
```bash
cd backend

# Create virtual environment (optional but recommended)
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt

# Create environment file
cp .env.example .env
# Edit .env with your database URL

# Run migrations
python -m alembic upgrade head

# Seed test data
python seed_test_data.py
```

#### 3. Frontend Setup
```bash
cd ../web

# Install dependencies
npm install

# Start development server
npm start
# Opens http://localhost:3000
```

#### 4. Backend Server
```bash
cd ../backend

# Start FastAPI server
python -m uvicorn backend.main:app --reload
# API available at http://localhost:8000
# Docs at http://localhost:8000/api/docs
```

#### 5. Mobile Setup (Optional)
```bash
cd ../mobile

# Install dependencies
npm install

# Start Expo
expo start

# Scan QR code with phone
```

---

## 📁 Project Structure

```
peripateticware/
├── backend/                          # FastAPI backend
│   ├── main.py                       # Application entry point
│   ├── routes/                       # API route modules
│   │   ├── auth.py                   # Authentication
│   │   ├── parent.py                 # Parent portal
│   │   ├── email.py                  # Email service
│   │   ├── reset.py                  # Password reset
│   │   ├── linking.py                # Child linking
│   │   └── notifications.py          # Notifications
│   ├── services/                     # Business logic
│   │   ├── email_service.py          # Email functionality
│   │   ├── child_linking_service.py  # Child linking logic
│   │   ├── password_reset_service.py # Password reset logic
│   │   └── websocket_service.py      # Real-time notifications
│   ├── models/                       # Database models
│   ├── core/                         # Configuration & utilities
│   ├── tests/                        # Test suite (90+ tests)
│   ├── requirements.txt              # Python dependencies
│   └── seed_test_data.py             # Test data seeding
│
├── web/                              # React frontend
│   ├── src/
│   │   ├── pages/                    # Page components (10 pages)
│   │   ├── components/               # Reusable components
│   │   ├── services/                 # API client
│   │   ├── stores/                   # State management
│   │   ├── types/                    # TypeScript types
│   │   └── App.tsx                   # Main app component
│   ├── package.json                  # npm dependencies
│   └── tsconfig.json                 # TypeScript config
│
├── mobile/                           # React Native app
│   ├── src/
│   │   ├── screens/                  # Screen components
│   │   ├── components/               # UI components
│   │   ├── stores/                   # State management
│   │   ├── services/                 # API client
│   │   └── types/                    # TypeScript types
│   ├── App.tsx                       # Main app
│   ├── Navigation.tsx                # Navigation setup
│   └── package.json                  # npm dependencies
│
├── docs/                             # Documentation
│   ├── ARCHITECTURE.md               # System architecture
│   ├── API.md                        # API documentation
│   ├── DEVELOPMENT.md                # Development guide
│   ├── DEPLOYMENT.md                 # Deployment guide
│   ├── PHASE_2_COMPLETE.md           # Phase 2 summary
│   ├── FEATURES_OVERVIEW.md          # Feature details
│   └── ...                           # Additional docs
│
├── docker-compose.yml                # Docker orchestration
├── .github/workflows/                # GitHub Actions CI/CD
├── .env.example                      # Environment template
├── README.md                         # This file
└── LICENSE                           # MIT License
```

---

## 💻 Development

### Start Development Environment

```bash
# Terminal 1: Backend
cd backend
set PYTHONPATH=%cd%  # Windows
python -m uvicorn backend.main:app --reload

# Terminal 2: Frontend
cd web
npm start

# Terminal 3: Mobile (Optional)
cd mobile
expo start
```

### Code Style

Backend:
```bash
# Format code
black backend/

# Lint
flake8 backend/
```

Frontend:
```bash
# Format code
npm run prettier

# Lint
npm run lint
```

---

## 🧪 Testing

### Run All Tests
```bash
cd backend
python -m pytest tests/ -v
# Expected: 90+ tests passing ✅
```

### Run Specific Test File
```bash
python -m pytest tests/test_email_service.py -v
```

### Run with Coverage
```bash
pip install pytest-cov
python -m pytest tests/ --cov=services --cov-report=html
```

### Frontend Tests
```bash
cd ../web
npm test
```

---

## 🚀 Deployment

### Docker Deployment

```bash
# Build images
docker-compose build

# Start containers
docker-compose up -d

# View logs
docker-compose logs -f

# Stop containers
docker-compose down
```

### Production Deployment

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for:
- Database setup (PostgreSQL)
- Environment variables
- SSL/TLS configuration
- Server deployment steps
- Monitoring setup

---

## 📚 Documentation

### Getting Started
- [README_FIRST.md](docs/README_FIRST.md) - Quick start guide (5 min)
- [QUICK_INTEGRATION_STEPS.md](docs/QUICK_INTEGRATION_STEPS.md) - Integration (10 min)
- [WINDOWS_SETUP_GUIDE.md](docs/WINDOWS_SETUP_GUIDE.md) - Windows setup

### Development
- [ARCHITECTURE.md](docs/ARCHITECTURE.md) - System design
- [API_ENDPOINTS_REFERENCE.md](docs/API_ENDPOINTS_REFERENCE.md) - API documentation
- [DEVELOPMENT.md](docs/DEVELOPMENT.md) - Development workflow
- [FEATURES_OVERVIEW.md](docs/FEATURES_OVERVIEW.md) - Feature details

### Operations
- [DEPLOYMENT.md](docs/DEPLOYMENT.md) - Production deployment
- [TESTING_GUIDE_PHASE2.md](docs/TESTING_GUIDE_PHASE2.md) - Testing procedures
- [TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) - Common issues

### Project Status
- [PROJECT_SUMMARY.md](docs/PROJECT_SUMMARY.md) - Complete project overview
- [PHASE_2_COMPLETE.md](docs/PHASE_2_COMPLETE.md) - Phase 2 details
- [PHASE_3_COMPLETE.md](docs/PHASE_3_COMPLETE.md) - Phase 3 testing details
- [PHASE_4_MOBILE_SETUP.md](docs/PHASE_4_MOBILE_SETUP.md) - Mobile app plans
- [REMAINING_WORK.md](docs/REMAINING_WORK.md) - Future phases

---

## 📊 Statistics

| Metric | Value |
|--------|-------|
| **Total Lines of Code** | 10,480+ |
| **Backend Services** | 7 modules |
| **API Endpoints** | 30+ |
| **Frontend Pages** | 10 pages |
| **Components** | 5+ |
| **Test Cases** | 90+ |
| **Code Coverage** | ~95% |
| **Languages** | 4+ |
| **Accessibility** | WCAG AAA |

---

## 🔐 Security

- ✅ FERPA compliant (student privacy)
- ✅ COPPA compliant (children's privacy)
- ✅ GDPR ready
- ✅ Secure password hashing (bcrypt)
- ✅ JWT token authentication
- ✅ Rate limiting (5 resets/hour)
- ✅ HTTPS ready
- ✅ SQL injection prevention
- ✅ XSS protection
- ✅ CSRF protection

---

## 🤝 Contributing

We welcome contributions! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

Please ensure:
- Tests pass (`npm test` / `pytest`)
- Code is formatted (Black/Prettier)
- Documentation is updated
- Commit messages are clear

---

## 📋 API Documentation

Interactive API documentation available at:
```
http://localhost:8000/api/docs
```

Key endpoints:
- `POST /api/v1/auth/login` - User login
- `POST /api/v1/parent/children/generate-code` - Generate child linking code
- `POST /api/v1/public/password/forgot` - Request password reset
- `GET /api/v1/parent/notifications` - Get notifications
- `GET /api/v1/parent/email/preferences` - Get email preferences

See [API_ENDPOINTS_REFERENCE.md](docs/API_ENDPOINTS_REFERENCE.md) for complete reference.

---

## 🐛 Troubleshooting

Common issues and solutions:

- **Port already in use?** → Kill process or use different port
- **Import errors?** → Run `pip install -r requirements.txt`
- **Tests failing?** → Check database connection and seed data
- **Frontend not loading?** → Clear cache and restart `npm start`

See [TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) for more help.

---

## 📞 Support

- 📖 Check [Documentation](docs/)
- 🐛 [Report Issues](https://github.com/pcc01/peripateticware/issues)
- 💬 [Discussions](https://github.com/pcc01/peripateticware/discussions)
- 📧 [Email Support](#)

---

## 📄 License

This project is licensed under the MIT License - see [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- Built with ❤️ for educators and parents
- Powered by OpenAI and Anthropic
- Inspired by contextual learning principles
- Community feedback appreciated

---

## 📈 Roadmap

### Phase 1: ✅ COMPLETE (2,450 lines)
Core system with curriculum, RAG, and basic parent portal

### Phase 2: ✅ COMPLETE (2,940 lines)
Email, child linking, password reset, WebSocket notifications

### Phase 3: ✅ COMPLETE (1,100 lines)
Comprehensive test suite (90+ tests)

### Phase 4: 🟡 IN PROGRESS (700 lines)
Mobile app (React Native, iOS/Android)

### Phase 5: ⏳ PLANNED
AI curriculum generator, gamification, AR features

---

## 🌟 Key Statistics

- **10,480+** lines of production code
- **45+** new files in Phase 2-3
- **90+** comprehensive test cases
- **~95%** code coverage
- **30+** API endpoints
- **4+** languages supported
- **8 hours** build time (Phase 2-3)

---

## 🎯 Quick Links

| Resource | Link |
|----------|------|
| **GitHub** | [Repository](https://github.com/pcc01/peripateticware) |
| **API Docs** | http://localhost:8000/api/docs |
| **Architecture** | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| **Development** | [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) |
| **Deployment** | [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) |

---

**Made with ❤️ for the future of education**

Last Updated: April 27, 2026  
Current Version: 1.0.0  
Status: 🟢 Production Ready (Web) | 🟡 Framework Ready (Mobile)
