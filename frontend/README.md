# Peripateticware Dashboard System

**Version:** 1.0.0  
**Last Updated:** June 2026  
**Status:** Production-Ready

## 🎯 Overview

This is a **comprehensive, production-ready dashboard system** for Peripateticware, a teacher-judgment-first outdoor and peripatetic learning platform. The system provides role-based dashboards for:

- **👧 Students** — Track activities, reflections, and progress
- **🧭 Teachers** — Manage sessions, review submissions, monitor live field work
- **🪶 Parents** — View child's evidence, receive insights, communicate with teachers
- **⌂ Admins** — System configuration, user management, analytics

### ✨ Key Features

✅ **Design System** with 3 visual directions (Field Guide, Terrain, Atmosphere)  
✅ **Role-based Dashboards** — 4 complete dashboard experiences  
✅ **Auth Flow** — Landing, Sign In, Sign Up screens  
✅ **Component Library** — 11 production-ready UI components  
✅ **Token System** — Colors, typography, spacing, motion, z-index  
✅ **Responsive Design** — Desktop-first, mobile-friendly  
✅ **TypeScript** — Full type safety throughout  
✅ **Docker Ready** — Containerized frontend with orchestration  
✅ **LLM Switching** — .env controls Ollama (host) or Claude API  
✅ **Windows Compatible** — PowerShell automation included  

---

## 📁 Project Structure

```
frontend/
├── src/
│   ├── design/
│   │   └── tokens.ts                # Design system tokens (colors, typography, spacing)
│   ├── components/
│   │   └── index.tsx                # Reusable UI components (Button, Card, Avatar, etc.)
│   ├── dashboards/
│   │   └── index.tsx                # Role-specific dashboard pages
│   ├── App.tsx                      # Main app with routing & state management
│   ├── main.tsx                     # React entry point
│   ├── design-system.css            # Production CSS with design tokens
│   └── (other files)
├── index.html                       # HTML entry point
├── package.json                     # Dependencies & scripts
├── vite.config.ts                   # Vite build configuration
├── tsconfig.json                    # TypeScript configuration
├── .env.example                     # Environment template
├── Dockerfile                       # Docker container configuration
└── README.md                        # This file

docker/
├── docker-compose.yml               # Full stack orchestration
├── docker-compose.dev.yml           # Development overrides
├── docker-compose.prod.yml          # Production overrides
├── .dockerignore                    # Docker build optimization
└── nginx/
    └── nginx.conf                   # Reverse proxy configuration (Caddy)
```

---

## 🚀 Quick Start

### 1. Prerequisites

- **Node.js 18+** (for frontend development)
- **Docker & Docker Compose** (for containerized deployment)
- **PowerShell 5.0+** (Windows development)
- **Ollama** running on your Windows host (optional, for local LLM)

### 2. Local Development (Windows)

```powershell
# Clone the repository (or extract the zip)
cd peripateticware

# Navigate to frontend
cd frontend

# Install dependencies
npm install

# Create .env.local from template
Copy-Item .env.example .env.local

# Start development server
npm run dev

# Open http://localhost:3000 in your browser
```

**Testing the System:**
- Use the theme/role switcher in the bottom-right corner
- Try all 4 roles: Student, Teacher, Parent, Admin
- Try all 3 directions: Field Guide, Terrain, Atmosphere
- Cycle through auth flows: Landing → Sign Up → Sign In → Dashboard

### 3. Docker Deployment (Recommended)

```powershell
# From project root

# Development mode (hot reload, debugging)
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d

# OR production mode (optimized builds)
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# View logs
docker-compose logs -f frontend

# Stop services
docker-compose down
```

**URLs:**
- Dashboard: http://localhost:3000
- API: http://localhost:8000
- Ollama (if running): http://localhost:11434

### 4. Environment Configuration

Copy `.env.example` to `.env.local` and customize:

```bash
# Frontend API endpoint
VITE_API_URL=http://localhost:8000

# LLM Provider
VITE_LLM_PROVIDER=ollama           # or 'claude'
VITE_OLLAMA_BASE_URL=http://localhost:11434

# If using Claude API
# VITE_CLAUDE_API_KEY=sk-ant-...

# Design system defaults
VITE_DEFAULT_DIRECTION=fieldguide  # or 'terrain', 'atmosphere'
VITE_DEFAULT_ROLE=student          # or 'teacher', 'parent', 'admin'
```

---

## 🎨 Design System

### Three Directions (Visual Personalities)

**Field Guide** — Warm, scholarly, classic  
- Font: Lora (serif)
- Background: #faf7f2 (warm white)
- Accents: Earthy greens, browns, blues

**Terrain** — Bold, graphic, expedition poster  
- Font: Zilla Slab (geometric serif)
- Background: #f5f0e6 (light tan)
- Accents: Muted earth tones

**Atmosphere** — Dark, cinematic, golden hour  
- Font: Spectral (serif)
- Background: #141c17 (dark forest)
- Accents: Luminous greens, golds, blues

### Four Role Accents

Each role gets its own hue within the chosen direction:

- **Student** 🌿 — Green (growth, learning)
- **Teacher** 🧭 — Brown (guidance, navigation)
- **Parent** 🪶 — Purple (care, balance)
- **Admin** ⌂ — Blue (structure, reliability)

### Tokens System

All styling is controlled by design tokens:

```typescript
// src/design/tokens.ts
export interface Tokens {
  // Typography
  fontHead: string;
  fontBody: string;
  fontMono: string;
  textXs: string;        // 11px
  textSm: string;        // 12px
  textBase: string;      // 14px
  // ... and more

  // Colors
  bg: string;           // Background
  surface: string;      // Card/panel surface
  accent: string;       // Role-specific primary color
  success: string;      // Semantic: success state
  warn: string;         // Semantic: warning state
  danger: string;       // Semantic: danger state
  // ... and more

  // Spacing, radius, shadows, motion, z-index
  space1: string;       // 4px
  radius: string;       // 12px
  shadow: string;       // 0 1px 3px rgba(...)
  durFast: string;      // 150ms
  // ... and more
}

// Get tokens for a direction + role
const d = getTokens('fieldguide', 'student');
d.bg;           // '#faf7f2'
d.accent;       // '#4a7c59'
d.textLg;       // '18px'
```

### Using Tokens in Components

```typescript
// All components receive tokens as `d: Tokens`
const MyComponent: React.FC<{ d: Tokens }> = ({ d }) => (
  <div style={{
    background: d.bg,
    color: d.text,
    padding: d.space4,
    borderRadius: d.radius,
    boxShadow: d.shadow,
  }}>
    Hello
  </div>
);
```

---

## 🔧 Component Library

### Available Components

1. **Button** — Primary, secondary, ghost variants
2. **Card** — Container with border and shadow
3. **StatTile** — Key metric display with trend indicator
4. **Avatar** — User initials in colored circle
5. **ProgressBar** — Visual progress with label
6. **Badge** — Status indicator (success, warn, danger, info)
7. **SidebarLayout** — Left sidebar + main content
8. **SidebarItem** — Sidebar navigation item
9. **Topbar** — Page header with title and actions
10. **MainContent** — Scrollable main area
11. **Grid** — Responsive grid layout

### Example Usage

```typescript
import { Card, Button, Avatar, StatTile } from './components';

const MyDashboard: React.FC<{ d: Tokens }> = ({ d }) => (
  <SidebarLayout d={d} brand={<span>Logo</span>} nav={<SidebarItem />}>
    <Topbar d={d} title="Dashboard" subtitle="Welcome back" />
    <MainContent d={d}>
      <Grid d={d} cols={3}>
        <StatTile d={d} label="Users" value="1,242" trend="up" />
        <StatTile d={d} label="Active" value="892" />
        <StatTile d={d} label="Growth" value="+8.2%" />
      </Grid>
      <Card d={d}>
        <h2 style={{ color: d.text }}>Summary</h2>
        <Button d={d} onClick={() => {}}>Learn More</Button>
      </Card>
    </MainContent>
  </SidebarLayout>
);
```

---

## 🧭 LLM Integration (Ollama or Claude)

### Ollama Setup (Recommended for Development)

**On Windows Host:**
1. Download Ollama from https://ollama.ai
2. Run it (stays running in background)
3. In terminal, pull a model: `ollama pull neural-chat`
4. Verify: `curl http://localhost:11434/api/tags`

**In Docker:**
```powershell
# Frontend can reach Ollama via host.docker.internal on Windows
# docker-compose.yml already configures this
VITE_LLM_PROVIDER=ollama
VITE_OLLAMA_BASE_URL=http://localhost:11434  # For local dev
# OR
VITE_OLLAMA_BASE_URL=http://host.docker.internal:11434  # For Docker on Windows
```

### Claude API Setup (Production)

1. Get API key from https://console.anthropic.com/
2. Set in `.env.local`:
   ```
   VITE_LLM_PROVIDER=claude
   VITE_CLAUDE_API_KEY=sk-ant-xxxxx...
   ```
3. Frontend will use Claude for inference

### Switching Between Providers

Edit `.env.local`:
```bash
# Use Ollama (runs on host, free)
VITE_LLM_PROVIDER=ollama
VITE_OLLAMA_BASE_URL=http://localhost:11434

# OR use Claude API (cloud-based, pay-per-token)
VITE_LLM_PROVIDER=claude
VITE_CLAUDE_API_KEY=sk-ant-...
```

**No code changes needed!** The app reads this at startup.

---

## 🐳 Docker & Compose

### docker-compose.yml (Base)

```yaml
version: '3.9'

services:
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      VITE_API_URL: http://backend:8000
      VITE_LLM_PROVIDER: ollama
      VITE_OLLAMA_BASE_URL: http://host.docker.internal:11434
    depends_on:
      - backend

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    ports:
      - "8000:8000"
    environment:
      DATABASE_URL: postgresql://user:password@postgres:5432/peripateticware
      REDIS_URL: redis://redis:6379
      LLM_PROVIDER: ollama
      OLLAMA_BASE_URL: http://host.docker.internal:11434
    depends_on:
      - postgres
      - redis

  postgres:
    image: postgres:15
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      POSTGRES_USER: user
      POSTGRES_PASSWORD: password
      POSTGRES_DB: peripateticware

  redis:
    image: redis:7

volumes:
  postgres_data:
```

### docker-compose.dev.yml (Development Overrides)

Adds:
- Hot reload for frontend
- Debug logging
- Volume mounts for code
- Removed build caching

### docker-compose.prod.yml (Production Overrides)

Adds:
- Optimized builds (minified, no source maps)
- Environment-based configuration
- Resource limits
- Health checks

### Commands

```powershell
# Development (with hot reload)
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d

# Production (optimized)
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Stop all services
docker-compose down

# View specific service logs
docker-compose logs -f frontend

# Rebuild images
docker-compose build --no-cache

# Prune old images (free disk space)
docker system prune -f
```

---

## 📱 Responsive Design

The dashboard system is **desktop-first** but includes mobile considerations:

- **Sidebar collapses** on screens < 768px
- **Grid adjusts columns** for smaller screens
- **Touch-friendly buttons** (minimum 44px height)
- **Font sizes scale** appropriately

For full mobile experience, see the **React Native mobile app** in `/mobile/`.

---

## 🔐 Security Considerations

✅ **JWT Authentication** (handled by backend API)  
✅ **HTTPS in Production** (use reverse proxy like Caddy or Nginx)  
✅ **Environment Variables** for sensitive data (API keys, URLs)  
✅ **No Hardcoded Secrets** (use `.env` files)  
✅ **CORS Configuration** (backend controls allowed origins)  
✅ **XSS Protection** (React's built-in escaping)  

---

## 🧪 Automated E2E Testing

The project uses **Playwright** for end-to-end testing against the live Docker stack.

### Running Tests

```powershell
# Start the stack first
docker compose up -d

# Run the full suite (~218 tests, Chromium)
cd frontend
npx playwright test --project=chromium

# Run a specific spec
npx playwright test tests/e2e/targeted-flows.spec.ts --project=chromium

# Open the HTML report
npx playwright show-report
```

### Test Coverage

| Spec | Tests | Role |
|------|------:|------|
| `teacher-flows.spec.ts` | 49 | Teacher |
| `targeted-flows.spec.ts` | 38 | Teacher, Homeschool, Admin |
| `student-flows.spec.ts` | 36 | Student |
| `platform-flows.spec.ts` | 22 | Platform admin |
| `parent-flows.spec.ts` | 20 | Parent |
| `admin-flows.spec.ts` | 20 | Admin |
| `homeschool-flows.spec.ts` | 18 | Homeschool |
| `auth-flows.spec.ts` | 10 | Unauthenticated |
| `public-pages.spec.ts` | 4 | Public |

All test accounts use password **`SecurePass123!`** and are seeded at startup.
See `tests/e2e/TESTING.md` for full documentation, known issues, and the backlog
of tests to write next.

---

## 📦 Integration with Existing Monorepo

### Folder Structure

```
peripateticware/
├── frontend/                # ← This dashboard system
│   ├── src/
│   ├── public/
│   ├── Dockerfile
│   └── package.json
├── backend/                 # FastAPI server (unchanged)
│   ├── app/
│   ├── main.py
│   └── requirements.txt
├── mobile/                  # React Native app (unchanged)
│   ├── src/
│   ├── package.json
│   └── ...
├── docker-compose.yml       # ← Updated for new frontend
├── .env.example
└── README.md
```

### How to Integrate

1. **Backup existing frontend** (if any)
2. **Copy `frontend/` folder** from this package into your monorepo root
3. **Update `docker-compose.yml`** to reference new structure
4. **Update `.env` files** with your API URLs and LLM settings
5. **Rebuild and test**: `docker-compose up -d`

---

## 🛠️ Development Workflow

### Adding a New Dashboard

1. Create page in `src/dashboards/NewDashboard.tsx`
2. Export from `src/dashboards/index.tsx`
3. Add route in `src/App.tsx`
4. Use design tokens: `const d = getTokens(direction, role);`

### Adding a New Component

1. Create in `src/components/NewComponent.tsx`
2. Accept `d: Tokens` as prop
3. Use tokens for all styling
4. Export from `src/components/index.tsx`

### Adding a New Token

1. Edit `src/design/tokens.ts`
2. Add to `Tokens` interface
3. Add to `getTokens()` return value
4. Update CSS in `design-system.css`

---

## 🚨 Troubleshooting

### Issue: "Cannot find module" errors

```powershell
# Clear node_modules and reinstall
Remove-Item -Recurse node_modules
npm install
npm run build
```

### Issue: Docker "port already in use"

```powershell
# Find and stop conflicting service
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Or use different port
docker-compose -e PORT=3001 up -d
```

### Issue: Ollama not accessible from Docker

```powershell
# Ensure Ollama is running on Windows host
ollama list

# Update docker-compose.yml or .env.local
VITE_OLLAMA_BASE_URL=http://host.docker.internal:11434

# Restart containers
docker-compose restart frontend
```

### Issue: "VITE_API_URL is not defined"

```powershell
# Create .env.local from template
Copy-Item .env.example .env.local

# Ensure variables are set
notepad .env.local

# Restart dev server
npm run dev
```

---

## 📚 Documentation

- **Design System** → See tokens in `src/design/tokens.ts`
- **Components** → See exports in `src/components/index.tsx`
- **Dashboards** → See role-specific code in `src/dashboards/index.tsx`
- **Styling** → See CSS in `src/design-system.css`

---

## 📋 Checklist for Production

- [ ] Set `VITE_ENV=production` in `.env`
- [ ] Set proper API URL (not localhost)
- [ ] Configure LLM provider (Ollama or Claude API)
- [ ] Set up HTTPS/SSL certificate
- [ ] Configure reverse proxy (Caddy/Nginx)
- [ ] Set resource limits in docker-compose
- [ ] Enable health checks
- [ ] Set up monitoring and logging
- [ ] Test all 4 roles and 3 directions
- [ ] Load test with concurrent users
- [ ] Security audit (XSS, CSRF, auth)

---

## 📞 Support & Contributing

For issues or questions:
1. Check troubleshooting section above
2. Review design tokens in `src/design/tokens.ts`
3. Check component examples in source files
4. Reference the existing dashboard implementations

---

## 📄 License

**Business Source License 1.1 (BSL 1.1)**

The code in this repository is licensed under BSL 1.1, with a commercial license available for production use. See LICENSE file for details.

---

**Last Updated:** May 2026  
**Version:** 1.0.0  
**Built with:** React 18, TypeScript, Vite, Docker
