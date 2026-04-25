# Peripateticware Frontend - Deployment & Setup Guide

## Table of Contents
1. [Local Development](#local-development)
2. [Cloudflare Deployment](#cloudflare-deployment)
3. [Environment Configuration](#environment-configuration)
4. [Backend Integration](#backend-integration)
5. [Troubleshooting](#troubleshooting)

---

## Local Development

### Prerequisites
- Node.js 18+ ([download](https://nodejs.org/))
- npm 9+ (comes with Node.js)
- Git
- Your backend running on `http://localhost:8010`

### Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Create environment file:**
   ```bash
   cp .env.example .env.local
   ```

3. **Update `.env.local` with your settings:**
   ```env
   VITE_API_URL=http://localhost:8010/api/v1
   VITE_DEFAULT_LANGUAGE=en
   NODE_ENV=development
   ```

4. **Start development server:**
   ```bash
   npm run dev
   ```
   Frontend will be available at `http://localhost:5173`

5. **In another terminal, start your backend:**
   ```bash
   # From your Peripateticware backend directory
   python -m uvicorn main:app --reload --port 8010
   ```

### Running Tests

```bash
# Run all tests
npm run test

# Watch mode for development
npm run test:watch

# With coverage report
npm run test:coverage

# UI for test results
npm run test:ui
```

### Component Documentation with Storybook

```bash
npm run storybook
```
Visit `http://localhost:6006` to see component documentation

### Code Quality

```bash
# Format code
npm run format

# Lint code
npm run lint

# Type checking
npm run type-check
```

---

## Cloudflare Deployment

### Option 1: Cloudflare Pages (Recommended)

**Prerequisites:**
- Cloudflare account with your domain (`pcerda.me`)
- Git repository (GitHub, GitLab, or Gitea)

#### Step 1: Build the Frontend

```bash
npm run build
```

This creates a `dist/` directory with production-ready files.

#### Step 2: Connect to Cloudflare Pages

1. Go to **Cloudflare Dashboard** → **Pages**
2. Click **Create a project** → **Connect to Git**
3. Select your Git provider and repository
4. Configure build settings:
   - **Framework preset:** Vite
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`

#### Step 3: Set Environment Variables

In Cloudflare Pages settings:

1. Go to **Settings** → **Environment variables**
2. Add for **Production:**
   ```
   VITE_API_URL=https://api.pcerda.me/api/v1
   VITE_WEBSOCKET_URL=wss://api.pcerda.me/api/v1
   VITE_DEFAULT_LANGUAGE=en
   NODE_ENV=production
   ```

3. Add for **Preview/Staging:**
   ```
   VITE_API_URL=http://localhost:8010/api/v1
   VITE_WEBSOCKET_URL=ws://localhost:8010/api/v1
   ```

#### Step 4: Configure Custom Domains

After first deployment:

1. **For teacher interface:** `teacher.pcerda.me`
   - Routes to Cloudflare Pages
   - Redeploy with route `/teacher/*`

2. **For student interface:** `student.pcerda.me`
   - Routes to same Cloudflare Pages deployment
   - Routing handled in React Router

3. **Root API:** `api.pcerda.me`
   - Routes to your backend (Ubuntu host via Tailscale)

#### Step 5: Enable Firewall Rules (Optional)

Restrict access to your domain:

```
(cf.country != "US") -> Block
```

Or require Cloudflare Access:

1. Go to **Access** → **Applications**
2. Create rule: Allow only your email/IP
3. Require authentication before accessing app

### Option 2: Self-Hosted (On Tailscale LAN)

If deploying to your Ubuntu host via Tailscale:

```bash
# On your Ubuntu host
cd /var/www/peripateticware

# Copy built files
npm run build
sudo cp -r dist/* /var/www/peripateticware/

# Serve with Nginx
sudo systemctl start nginx
```

**Nginx config** (`/etc/nginx/sites-available/peripateticware`):
```nginx
server {
    listen 80;
    server_name peripateticware.local;
    root /var/www/peripateticware;
    
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    location /api/v1 {
        proxy_pass http://localhost:8010;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

Access at `http://peripateticware.local` from your Tailscale network.

---

## Environment Configuration

### Key Variables Explained

| Variable | Purpose | Example |
|----------|---------|---------|
| `VITE_API_URL` | Backend API endpoint | `http://localhost:8010/api/v1` |
| `VITE_WEBSOCKET_URL` | Real-time updates | `ws://localhost:8010/api/v1` |
| `VITE_DEFAULT_LANGUAGE` | Initial language | `en`, `es`, `ar`, `ja` |
| `VITE_MAP_CENTER` | Default map location | `40.7128,-74.0060` |
| `VITE_ENABLE_PRIVACY_ENGINE` | Teacher-only data filtering | `true` |
| `NODE_ENV` | Build optimization | `development`, `production` |

### Local Override

Create `.env.local` (git-ignored):
```bash
VITE_API_URL=http://localhost:8010/api/v1
VITE_DEFAULT_LANGUAGE=en
```

---

## Backend Integration

### API Expectations

Your backend should provide these endpoints (already typed in frontend):

```
POST   /auth/login                    → User authentication
POST   /auth/register                 → User registration
GET    /auth/me                       → Current user info

GET    /curriculum                    → List curriculum units
POST   /curriculum                    → Create unit
GET    /curriculum/{id}               → Get unit details
PATCH  /curriculum/{id}               → Update unit
DELETE /curriculum/{id}               → Delete unit

POST   /sessions                      → Start session
GET    /sessions/{id}                 → Get session
PATCH  /sessions/{id}                 → Update session
GET    /sessions                      → List sessions

POST   /sessions/{id}/inquiry        → Submit inquiry
GET    /sessions/{id}/evidence       → Get evidence (privacy-filtered)
GET    /sessions/{id}/inquiry-log    → Get inquiry history

POST   /inference/inquiry             → Process inquiry with RAG
POST   /inference/multimodal-process  → Process image/audio
GET    /inference/rag-retrieve        → Retrieve documents

WS     /sessions/{id}/monitor        → Real-time session updates
```

### CORS Configuration

Your backend must allow requests from your frontend domain:

```python
# FastAPI backend
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",  # Local dev
        "https://teacher.pcerda.me",  # Production
        "https://student.pcerda.me",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### WebSocket Integration

For real-time monitoring, backend should emit events:

```json
{
  "type": "location_update",
  "session_id": "session-123",
  "timestamp": "2024-04-25T10:30:00Z",
  "data": {
    "student_id": "student-456",
    "latitude": 40.7128,
    "longitude": -74.0060,
    "accuracy": 10.5
  }
}
```

---

## Troubleshooting

### Frontend won't start
```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
npm run dev
```

### API connection failing
1. Check backend is running: `http://localhost:8010/docs`
2. Verify `VITE_API_URL` in `.env.local`
3. Check CORS headers in browser DevTools

### WebSocket connection failing
1. Verify WebSocket URL: `VITE_WEBSOCKET_URL`
2. Check backend WebSocket handler is implemented
3. Look for errors in browser console

### Build fails on Cloudflare
1. Check Node.js version: `npm --version` (needs 18+)
2. Verify build command: `npm run build`
3. Check all environment variables are set
4. Review Cloudflare build logs

### Pseudo-localization not working
```bash
# Enable in localStorage
localStorage.setItem('pseudo-loc', 'true')
# Or add to URL: ?pseudo-loc=true
```

### Tests failing
```bash
# Clear test cache
npm run test -- --clearCache

# Run specific test
npm run test -- privacy.test.ts
```

---

## Production Checklist

- [ ] Backend running with SSL (`https://api.pcerda.me`)
- [ ] CORS configured for production domains
- [ ] Environment variables set in Cloudflare
- [ ] SSL certificates installed
- [ ] Rate limiting enabled on API
- [ ] Database backups automated
- [ ] Error logging configured (Sentry, etc.)
- [ ] Analytics enabled (optional)
- [ ] Privacy policy accessible
- [ ] Run `npm run build` successfully
- [ ] All tests passing: `npm run test`

---

## Support

For issues or questions:
1. Check browser console for errors
2. Look at network requests in DevTools
3. Review backend logs
4. Check Cloudflare Analytics
5. Run tests: `npm run test`

---

**Version:** 0.1.0  
**Last Updated:** 2024-04-25
