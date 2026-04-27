# 📝 Development Guide - Peripateticware Monorepo

**Last Updated:** April 26, 2026  
**Status:** Active Development

---

## 🎯 Overview

This guide covers development workflow for the Peripateticware monorepo containing:
- **Backend:** FastAPI Python server
- **Mobile:** React Native iOS/Android app
- **Web:** React Vite parent portal

---

## 🛠️ Environment Setup

### Prerequisites

```bash
# Required versions
- Node.js 18+
- npm 9+
- Python 3.10+
- Git 2.30+
- PostgreSQL 13+ (for backend)
- Redis (optional, for caching)
```

### Install Prerequisites

**macOS:**
```bash
# Using Homebrew
brew install node@18 python@3.11 postgresql redis
```

**Ubuntu/Debian:**
```bash
apt-get update
apt-get install nodejs npm python3.11 python3-pip postgresql redis-server
```

**Windows:**
- [Node.js](https://nodejs.org/) - Download and install
- [Python](https://www.python.org/) - Download and install
- [PostgreSQL](https://www.postgresql.org/) - Download and install
- [Git Bash](https://git-scm.com/) - For bash commands

### Initial Setup

```bash
# 1. Clone repository
git clone https://github.com/pcc01/peripateticware.git
cd peripateticware

# 2. Create virtual environments
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# 3. Install all dependencies
cd backend && pip install -r requirements.txt && cd ..
npm install
```

### Configure Environment Files

**Backend (.env):**
```bash
cd backend
cp .env.example .env
```

Edit `backend/.env`:
```env
DATABASE_URL=postgresql://user:password@localhost/peripateticware
SECRET_KEY=your-secret-key-here
DEBUG=True
OLLAMA_API_URL=http://localhost:11434
REDIS_URL=redis://localhost:6379
```

**Mobile (.env.local):**
```bash
cd mobile
cp .env.example .env.local
```

Edit `mobile/.env.local`:
```env
EXPO_PUBLIC_API_URL=http://localhost:8000/api/v1
EXPO_PUBLIC_WS_URL=ws://localhost:8000
```

**Web (.env.local):**
```bash
cd web
cp .env.example .env.local
```

Edit `web/.env.local`:
```env
VITE_API_URL=http://localhost:8000/api/v1
```

---

## 🚀 Running Services

### All Services (Terminal Multiplexing)

**Using tmux (recommended):**
```bash
# Install tmux
brew install tmux  # or apt-get install tmux

# Create new session with 3 windows
tmux new-session -d -s peripateticware -n backend
tmux new-window -t peripateticware -n mobile
tmux new-window -t peripateticware -n web

# Run services
tmux send-keys -t peripateticware:backend "cd backend && python -m uvicorn main:app --reload" Enter
tmux send-keys -t peripateticware:mobile "cd mobile && npm start" Enter
tmux send-keys -t peripateticware:web "cd web && npm run dev" Enter

# View all windows
tmux attach-session -t peripateticware
```

**Using separate terminals (simpler):**

Terminal 1 - Backend:
```bash
cd backend
source venv/bin/activate  # Activate virtual environment
python -m uvicorn main:app --reload --port 8000
# API: http://localhost:8000
# Docs: http://localhost:8000/docs
```

Terminal 2 - Mobile:
```bash
cd mobile
npm start
# Scan QR code with Expo Go or press 'i'/'a'
```

Terminal 3 - Web:
```bash
cd web
npm run dev
# Opens http://localhost:5173
```

---

## 📂 Project Structure Reference

### Backend Structure

```
backend/
├── app/
│   ├── __init__.py
│   └── models.py          SQLAlchemy models
├── routes/
│   ├── auth.py            Authentication endpoints
│   ├── sessions.py        Session management
│   ├── curriculum.py      Activity management
│   ├── inference.py       AI/RAG endpoints
│   └── observability.py   Monitoring endpoints
├── services/
│   ├── rag_orchestrator.py    RAG logic
│   ├── sync_engine.py         Data sync
│   └── privacy_engine.py      FERPA/COPPA compliance
├── core/
│   ├── security.py        Authentication logic
│   ├── database.py        DB connection
│   ├── cache.py           Caching logic
│   ├── config.py          Configuration
│   └── dependencies.py    FastAPI dependencies
├── main.py                Application entry point
├── requirements.txt       Python dependencies
└── Dockerfile             Docker configuration
```

### Mobile Structure

```
mobile/
├── src/
│   ├── screens/
│   │   ├── auth/
│   │   │   ├── LoginScreen.tsx
│   │   │   └── RegisterScreen.tsx
│   │   ├── student/
│   │   │   ├── StudentDashboard.tsx
│   │   │   ├── ActivityScreen.tsx
│   │   │   └── SessionScreen.tsx
│   │   └── teacher/
│   │       ├── TeacherDashboard.tsx
│   │       └── MonitoringScreen.tsx
│   ├── components/
│   │   ├── common/
│   │   │   ├── Button.tsx
│   │   │   ├── Card.tsx
│   │   │   └── LoadingSpinner.tsx
│   │   ├── student/
│   │   └── teacher/
│   ├── hooks/
│   │   ├── useNativeLocation.ts
│   │   ├── useNativeCamera.ts
│   │   └── useOfflineSync.ts
│   ├── services/
│   │   └── api.ts
│   ├── stores/
│   │   ├── authStore.ts
│   │   ├── sessionStore.ts
│   │   └── locationStore.ts
│   ├── types/
│   │   └── index.ts
│   ├── App.tsx
│   └── main.tsx
├── app.json               Expo config
└── package.json
```

### Web Structure

```
web/
├── src/
│   ├── pages/
│   │   ├── LoginPage.tsx
│   │   ├── DashboardPage.tsx
│   │   ├── ChildProgressPage.tsx
│   │   ├── CommunicationPage.tsx
│   │   ├── ReportsPage.tsx
│   │   └── SettingsPage.tsx
│   ├── components/
│   │   ├── common/
│   │   │   ├── Button.tsx
│   │   │   ├── Card.tsx
│   │   │   └── LoadingSpinner.tsx
│   │   ├── parent/
│   │   │   ├── ChildProgressWidget.tsx
│   │   │   ├── RecentActivities.tsx
│   │   │   └── MessageCenter.tsx
│   │   └── dashboard/
│   │       └── ProgressChart.tsx
│   ├── hooks/
│   │   ├── useChildProgress.ts
│   │   ├── useMessages.ts
│   │   └── useFetch.ts
│   ├── services/
│   │   └── api.ts
│   ├── stores/
│   │   ├── parentAuthStore.ts
│   │   ├── progressStore.ts
│   │   └── uiStore.ts
│   ├── types/
│   │   └── parent.ts
│   ├── styles/
│   │   └── globals.css
│   ├── App.tsx
│   └── main.tsx
├── vite.config.ts
└── package.json
```

---

## 🔧 Common Development Tasks

### Adding a New Endpoint (Backend)

1. **Create route function in `backend/routes/`:**
```python
# backend/routes/students.py
from fastapi import APIRouter, Depends

router = APIRouter(prefix="/students", tags=["students"])

@router.get("/")
async def list_students(db = Depends(get_db)):
    """Get all students"""
    return {"students": []}

@router.get("/{student_id}")
async def get_student(student_id: str, db = Depends(get_db)):
    """Get a specific student"""
    return {"id": student_id}
```

2. **Register in `backend/main.py`:**
```python
from routes import students

app.include_router(students.router, prefix="/api/v1")
```

3. **Add tests in `backend/tests/`:**
```python
def test_list_students(client):
    response = client.get("/api/v1/students/")
    assert response.status_code == 200
```

### Adding a New Component (Mobile or Web)

1. **Create component file:**
```typescript
// mobile/src/components/student/ActivityCard.tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface ActivityCardProps {
  title: string;
  description: string;
  onPress: () => void;
}

export const ActivityCard: React.FC<ActivityCardProps> = ({
  title,
  description,
  onPress,
}) => {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  description: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
  },
});
```

2. **Export from index:**
```typescript
// mobile/src/components/student/index.ts
export { ActivityCard } from './ActivityCard';
```

3. **Use in screens:**
```typescript
import { ActivityCard } from '../../components/student';

// In your screen component
<ActivityCard 
  title="Explore Nature" 
  onPress={() => navigation.navigate('Activity')} 
/>
```

### Adding a New Page/Screen

**Mobile Screen:**
```typescript
// mobile/src/screens/student/ActivitiesScreen.tsx
import React, { useState, useEffect } from 'react';
import { ScrollView, Text } from 'react-native';
import { LoadingSpinner } from '../../components/common';

export const ActivitiesScreen = ({ navigation }: any) => {
  const [activities, setActivities] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Fetch activities
    setIsLoading(false);
  }, []);

  if (isLoading) return <LoadingSpinner />;

  return (
    <ScrollView>
      <Text>Activities</Text>
    </ScrollView>
  );
};
```

**Web Page:**
```typescript
// web/src/pages/ActivitiesPage.tsx
import React, { useState, useEffect } from 'react';
import { LoadingSpinner } from '../components/common';

export default function ActivitiesPage() {
  const [activities, setActivities] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Fetch activities
    setIsLoading(false);
  }, []);

  if (isLoading) return <LoadingSpinner />;

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-6">Activities</h1>
    </div>
  );
}
```

---

## 🧪 Testing

### Run All Tests
```bash
npm test --workspaces
```

### Run Specific Tests
```bash
# Mobile tests
cd mobile && npm test

# Web tests
cd web && npm test

# Backend tests
cd backend && pytest
```

### Write Tests

**Mobile (Jest):**
```typescript
// mobile/src/__tests__/stores/authStore.test.ts
import { useAuthStore } from '../../stores/authStore';

describe('authStore', () => {
  it('should login user', async () => {
    const { login } = useAuthStore.getState();
    await login('test@example.com', 'password');
    const { user } = useAuthStore.getState();
    expect(user).toBeDefined();
  });
});
```

**Web (Vitest):**
```typescript
// web/src/__tests__/stores/parentAuthStore.test.ts
import { describe, it, expect } from 'vitest';
import { useParentAuthStore } from '../../stores/parentAuthStore';

describe('parentAuthStore', () => {
  it('should login parent', async () => {
    const { login } = useParentAuthStore.getState();
    await login('parent@example.com', 'password');
    const { parent } = useParentAuthStore.getState();
    expect(parent).toBeDefined();
  });
});
```

**Backend (Pytest):**
```python
# backend/tests/test_auth.py
def test_login(client):
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "test@example.com", "password": "password"}
    )
    assert response.status_code == 200
    assert "token" in response.json()
```

---

## 🔍 Debugging

### Backend Debugging

```bash
# Enable debug mode
export FLASK_ENV=development
export FLASK_DEBUG=1

# Use debugger
python -m pdb backend/main.py

# Or use IDE debugger (VS Code)
# Add to .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Python: FastAPI",
      "type": "python",
      "request": "launch",
      "module": "uvicorn",
      "args": ["main:app", "--reload"],
      "cwd": "${workspaceFolder}/backend"
    }
  ]
}
```

### Mobile Debugging

```bash
# Use Expo DevTools
# Press 'j' in terminal while app is running

# Or connect debugger in Expo Go app
# Shake device and select "Debug remote JS"
```

### Web Debugging

```bash
# Use browser DevTools
# Press F12 in browser

# Or use VS Code debugger
# Install "Debugger for Chrome" extension
```

---

## 📦 Dependency Management

### Adding Dependencies

**Backend:**
```bash
cd backend
pip install new-package
pip freeze > requirements.txt
```

**Mobile:**
```bash
cd mobile
npm install new-package
```

**Web:**
```bash
cd web
npm install new-package
```

### Updating Dependencies

```bash
# Update all
npm update --workspaces

# Update specific workspace
npm update --workspace=mobile
```

---

## 🎨 Code Style

### JavaScript/TypeScript

**Prettier config** (auto-formats on save):
```json
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5"
}
```

**ESLint config** (enforces rules):
```bash
npm run lint --workspaces
```

### Python

**Black** (auto-formatter):
```bash
cd backend
black .
```

**Pylint** (linter):
```bash
cd backend
pylint app/
```

---

## 🔄 Git Workflow

### Creating a Feature Branch

```bash
# Create branch from main
git checkout -b feature/add-activity-filters

# Make changes
git add .
git commit -m "feat: add activity filters to discovery screen"

# Push to remote
git push origin feature/add-activity-filters

# Create Pull Request on GitHub
```

### Commit Message Format

Follow Conventional Commits:
```
feat: add user authentication
fix: resolve session timeout issue
docs: update API documentation
style: format code with prettier
refactor: reorganize store structure
test: add tests for auth flow
chore: update dependencies
```

### Branch Naming Convention

```
feature/add-something          New feature
fix/resolve-bug                Bug fix
docs/update-readme             Documentation
refactor/reorganize-code       Code reorganization
test/add-tests-for-feature     Tests
```

---

## 🚀 Performance Optimization

### Backend
- Use database indexes
- Implement caching (Redis)
- Optimize queries
- Use async/await properly

### Mobile
- Code splitting by route
- Image optimization
- Lazy loading screens
- Minimize bundle size

### Web
- Code splitting by route
- Image optimization
- CSS-in-JS optimization
- Bundle analysis

---

## 🆘 Troubleshooting

### Common Issues

**"Port already in use"**
```bash
# Kill process on port
lsof -ti:8000 | xargs kill -9
# or
npx kill-port 8000
```

**"npm ERR! peer dep missing"**
```bash
npm install --save-peer
```

**"ModuleNotFoundError" in Python**
```bash
cd backend
source venv/bin/activate
pip install -r requirements.txt
```

**"expo not found" in mobile**
```bash
npm install -g expo-cli
npm start
```

---

## 📚 Resources

- [FastAPI Docs](https://fastapi.tiangolo.com/)
- [React Native Docs](https://reactnative.dev/)
- [React Docs](https://react.dev/)
- [TypeScript Docs](https://www.typescriptlang.org/)
- [Zustand Docs](https://github.com/pmndrs/zustand)

---

## 💡 Tips & Best Practices

1. **Always create feature branches** - Never commit to main
2. **Write tests first** - TDD improves code quality
3. **Keep commits small** - Easier to review and revert
4. **Document as you code** - Future you will thank present you
5. **Run all tests before pushing** - Catch issues early
6. **Use meaningful variable names** - Code is read more than written
7. **Reuse components** - DRY principle
8. **Keep functions small** - Single responsibility
9. **Use types** - TypeScript catches bugs early
10. **Review your own code** - Before asking others

---

**Happy coding! 🚀**

*For questions, check [README.md](../README.md) or create an issue on GitHub.*
