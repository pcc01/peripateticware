# 🚀 Peripateticware Deployment & DevOps Guide

**Version**: 1.0  
**Last Updated**: April 27, 2026  
**For**: DevOps Engineers, System Administrators, Technical Teams

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Prerequisites](#prerequisites)
4. [Local Development Setup](#local-development-setup)
5. [Staging Deployment](#staging-deployment)
6. [Production Deployment](#production-deployment)
7. [Mobile App Deployment](#mobile-app-deployment)
8. [Monitoring & Maintenance](#monitoring--maintenance)
9. [Security](#security)
10. [Troubleshooting](#troubleshooting)

---

## Overview

Peripateticware is a full-stack educational platform with three main components:

1. **Frontend** (React/Vite): Web application for teachers/admins
2. **Backend** (FastAPI): REST API with RAG integration
3. **Mobile** (React Native): Parent portal for iOS/Android

This guide covers deploying all three components.

---

## Architecture

### Technology Stack

**Frontend**
- React 18.2 + Vite
- TypeScript
- Tailwind CSS
- Responsive design

**Backend**
- FastAPI
- PostgreSQL
- Redis
- Ollama (local ML)
- Python 3.10+

**Mobile**
- React Native + Expo
- TypeScript
- Zustand state management

**Infrastructure**
- Docker & Docker Compose
- GitHub Actions (CI/CD)
- AWS/GCP/DigitalOcean
- Nginx (reverse proxy)
- Let's Encrypt (SSL)

### System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Users                                 │
└──────────┬──────────────────────┬──────────────────────┬─────┘
           │                      │                      │
      Web Browser            Mobile App             Admin Tools
           │                      │                      │
           ▼                      ▼                      ▼
┌─────────────────────────────────────────────────────────────┐
│              CloudFlare / CDN / Load Balancer               │
└──────────────────────────────┬────────────────────────────┘
                               │
                    ┌──────────┴──────────┐
                    │                     │
         ┌──────────▼──────────┐  ┌──────▼──────────┐
         │   Nginx Reverse     │  │  Nginx Reverse  │
         │   Proxy (SSL)       │  │  Proxy (SSL)    │
         └──────────┬──────────┘  └──────┬──────────┘
                    │                    │
        ┌───────────┴────────────┐       │
        │                        │       │
   ┌────▼──────┐    ┌──────────▼─┐  ┌──▼───────────┐
   │ Frontend  │    │   Backend  │  │   Mobile     │
   │ Container │    │  Container │  │   API        │
   └────┬──────┘    └──────┬─────┘  │   (Backend)  │
        │                  │        └──────────────┘
        │            ┌─────┴─────────┐
        │            │               │
        │        ┌───▼────┐     ┌────▼────┐
        │        │   DB   │     │  Redis  │
        │        │(Postgre│     │ (Cache) │
        │        └───┬────┘     └─────────┘
        │            │
        │        ┌───▼──────┐
        │        │ Ollama   │
        │        │ (Local)  │
        │        └──────────┘
```

---

## Prerequisites

### Required Software

**Local Development**
- Docker 20.10+
- Docker Compose 2.0+
- Git
- Node.js 18+
- Python 3.10+
- npm 8+

**For Production Deployment**
- Server with 4+ CPU cores
- 16+ GB RAM
- 100+ GB storage
- Ubuntu 20.04 LTS or similar
- SSH access
- Root or sudo access

### Required Accounts

**For Cloud Deployment**
- AWS account (or GCP/DigitalOcean)
- Docker Hub account
- GitHub account
- Domain name (optional but recommended)

**For App Store Deployment**
- Apple Developer account ($99/year)
- Google Play Developer account ($25)
- EAS account (free)

### Domain & SSL

- Domain name: `example.com`
- SSL certificate from Let's Encrypt (automatic with Nginx)
- Email for SSL renewal notifications

---

## Local Development Setup

### 1. Clone Repository

```bash
git clone https://github.com/yourusername/peripateticware.git
cd peripateticware
```

### 2. Environment Configuration

```bash
# Create .env files
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
cp mobile/.env.example mobile/.env

# Edit each .env with your local settings
# For local development, defaults should work
```

### 3. Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows

# Install dependencies
pip install -r requirements.txt

# Initialize database
python -m alembic upgrade head

# Start development server
uvicorn main:app --reload
# Runs on http://localhost:8000
```

### 4. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
# Runs on http://localhost:5173
```

### 5. Mobile Setup

```bash
cd mobile

# Install dependencies
npm install

# Start Expo dev server
npm start
# Choose: i for iOS, a for Android

# Or use simulators directly
npm run ios
npm run android
```

### 6. Using Docker Compose (Recommended)

```bash
# From root directory
docker-compose up -d

# Check services
docker-compose ps

# View logs
docker-compose logs -f

# Stop all services
docker-compose down
```

---

## Staging Deployment

### 1. Prepare Staging Server

```bash
# SSH into server
ssh ubuntu@staging.example.com

# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/download/v2.20.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Verify installations
docker --version
docker-compose --version
```

### 2. Configure Environment

```bash
# SSH into server
ssh ubuntu@staging.example.com

# Create application directory
mkdir -p /opt/peripateticware
cd /opt/peripateticware

# Clone repository
git clone https://github.com/yourusername/peripateticware.git .

# Create .env files for staging
cat > backend/.env << EOF
ENVIRONMENT=staging
DATABASE_URL=postgresql://user:password@postgres:5432/peripateticware_staging
REDIS_URL=redis://redis:6379
OLLAMA_API_URL=http://ollama:11434
SECRET_KEY=your-secret-key-here
ALLOWED_ORIGINS=https://staging.example.com,https://staging-admin.example.com
EOF

cat > frontend/.env << EOF
VITE_API_URL=https://api.staging.example.com
VITE_ENV=staging
EOF

cat > mobile/.env << EOF
EXPO_PUBLIC_API_URL=https://api.staging.example.com
EXPO_PUBLIC_ENV=staging
EOF
```

### 3. Setup Database

```bash
# Start containers
docker-compose up -d

# Wait for PostgreSQL to start
sleep 10

# Run migrations
docker-compose exec backend alembic upgrade head

# Create admin user
docker-compose exec backend python -c "from app.crud import user; user.create_admin('admin@example.com', 'temporary-password')"
```

### 4. Setup SSL Certificate

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx -y

# Get SSL certificate
sudo certbot certonly --standalone -d staging.example.com -d api.staging.example.com -d staging-admin.example.com

# Update Nginx config (auto-configured in docker-compose)
# Verify certificate renewal
sudo certbot renew --dry-run
```

### 5. Configure Nginx

```nginx
# /etc/nginx/sites-available/peripateticware-staging
upstream frontend {
    server localhost:3000;
}

upstream backend {
    server localhost:8000;
}

server {
    listen 443 ssl http2;
    server_name staging.example.com;

    ssl_certificate /etc/letsencrypt/live/staging.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/staging.example.com/privkey.pem;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;

    location / {
        proxy_pass http://frontend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}

server {
    listen 443 ssl http2;
    server_name api.staging.example.com;

    ssl_certificate /etc/letsencrypt/live/staging.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/staging.example.com/privkey.pem;

    location / {
        proxy_pass http://backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name _;
    return 301 https://$host$request_uri;
}
```

### 6. Verify Deployment

```bash
# Check containers
docker-compose ps

# Test endpoints
curl -k https://staging.example.com
curl -k https://api.staging.example.com/docs

# Check logs
docker-compose logs -f backend
docker-compose logs -f frontend
```

---

## Production Deployment

### 1. Production Server Setup

Same as staging, but with production-grade settings:

```bash
# SSH into production server
ssh ubuntu@prod.example.com

# Follow staging setup steps 1-2
# But use production environment variables
```

### 2. Production Environment Variables

```bash
cat > backend/.env << EOF
ENVIRONMENT=production
DATABASE_URL=postgresql://produser:secure-password@postgres:5432/peripateticware
REDIS_URL=redis://redis:6379
OLLAMA_API_URL=http://ollama:11434
SECRET_KEY=generate-secure-key-with-openssl-rand-hex-32
ALLOWED_ORIGINS=https://example.com,https://app.example.com
ALLOWED_HOSTS=["example.com","app.example.com","api.example.com"]
LOG_LEVEL=INFO
DEBUG=false
CORS_ORIGINS=https://example.com
SENTRY_DSN=your-sentry-dsn
EOF
```

### 3. Production Docker Compose

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: produser
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: peripateticware
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./backups:/backups
    restart: always
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U produser"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    restart: always
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  backend:
    build: ./backend
    environment:
      - DATABASE_URL=postgresql://produser:${DB_PASSWORD}@postgres:5432/peripateticware
      - REDIS_URL=redis://redis:6379
      - SECRET_KEY=${SECRET_KEY}
      - ENVIRONMENT=production
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: always
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"

  frontend:
    build: ./frontend
    restart: always

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - /etc/letsencrypt:/etc/letsencrypt:ro
    depends_on:
      - frontend
      - backend
    restart: always

volumes:
  postgres_data:
```

### 4. Database Backups

```bash
# Automated daily backup script
# /opt/peripateticware/backup.sh

#!/bin/bash
BACKUP_DIR="/opt/peripateticware/backups"
DATE=$(date +%Y-%m-%d-%H%M%S)

# Backup database
docker-compose exec -T postgres pg_dump -U produser peripateticware | gzip > $BACKUP_DIR/db-$DATE.sql.gz

# Keep only last 30 days of backups
find $BACKUP_DIR -name "db-*.sql.gz" -mtime +30 -delete

# Upload to S3 (optional)
aws s3 cp $BACKUP_DIR/db-$DATE.sql.gz s3://your-bucket/backups/

echo "Backup completed: $DATE"
```

Add to crontab:
```bash
0 2 * * * /opt/peripateticware/backup.sh
```

### 5. CI/CD Pipeline

GitHub Actions workflow:

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]
    paths:
      - 'backend/**'
      - 'frontend/**'
      - 'mobile/**'
      - '.github/workflows/deploy.yml'

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Run Backend Tests
        run: |
          cd backend
          python -m pytest
      
      - name: Run Frontend Tests
        run: |
          cd frontend
          npm install
          npm test
  
  build-and-push:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v2
      
      - name: Login to Docker Hub
        uses: docker/login-action@v2
        with:
          username: ${{ secrets.DOCKER_USERNAME }}
          password: ${{ secrets.DOCKER_PASSWORD }}
      
      - name: Build and Push Backend
        uses: docker/build-push-action@v4
        with:
          context: ./backend
          push: true
          tags: ${{ secrets.DOCKER_USERNAME }}/peripateticware-backend:latest
      
      - name: Build and Push Frontend
        uses: docker/build-push-action@v4
        with:
          context: ./frontend
          push: true
          tags: ${{ secrets.DOCKER_USERNAME }}/peripateticware-frontend:latest
  
  deploy:
    needs: build-and-push
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to Production
        uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.PROD_HOST }}
          username: ubuntu
          key: ${{ secrets.PROD_SSH_KEY }}
          script: |
            cd /opt/peripateticware
            docker-compose pull
            docker-compose up -d
            docker-compose exec -T backend alembic upgrade head
```

---

## Mobile App Deployment

### 1. iOS App Store Submission

```bash
cd mobile

# Install EAS CLI
npm install -g eas-cli

# Login to EAS
eas login

# Build for iOS
eas build --platform ios --auto-submit

# App will be submitted automatically
# Track status at https://expo.dev
```

### 2. Android Play Store Submission

```bash
# Build for Android
eas build --platform android --auto-submit

# App will be submitted automatically
```

### 3. Over-the-Air Updates

```bash
# After app is in stores, you can push updates without resubmission
eas update --branch production

# All users will get the update automatically
```

---

## Monitoring & Maintenance

### 1. Health Checks

```bash
# Check all services
docker-compose ps

# Check specific service logs
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f postgres

# Check system resources
docker stats
```

### 2. Monitoring Tools Setup

**Prometheus** (Metrics)
```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'backend'
    static_configs:
      - targets: ['localhost:8000']
```

**Grafana** (Dashboards)
- Import Prometheus datasource
- Create dashboards for:
  - API response times
  - Database connections
  - Cache hit rates
  - Error rates

**Sentry** (Error Tracking)
```python
# In backend
import sentry_sdk
sentry_sdk.init(dsn=os.getenv('SENTRY_DSN'))
```

### 3. Log Aggregation

```bash
# Using ELK Stack
docker-compose -f docker-compose.elk.yml up -d

# Or use CloudWatch
# Configure in backend/.env
LOG_GROUP=/peripateticware/backend
```

### 4. Performance Optimization

**Database**
- Add indexes: `CREATE INDEX idx_activity_teacher_id ON activities(teacher_id);`
- Optimize queries: Use EXPLAIN ANALYZE
- Connection pooling: Use PgBouncer

**Cache**
- Cache API responses (1 hour)
- Cache user permissions (30 min)
- Cache RAG results (variable)

**Frontend**
- Enable gzip compression
- Minify assets
- Use CDN for static files
- Enable browser caching

### 5. Maintenance Windows

```bash
# Schedule maintenance (notified to users)
1. Stop accepting new requests
2. Finish in-flight requests
3. Backup database
4. Run migrations
5. Deploy new code
6. Run health checks
7. Re-enable service

# Target: Friday 2am-3am EST
```

---

## Security

### 1. Secrets Management

```bash
# Use environment variables, never hardcode
# Store in secret manager:

# AWS Secrets Manager
aws secretsmanager create-secret --name peripateticware/prod/db-password

# GitHub Secrets (for CI/CD)
# Settings → Secrets → Actions

# Never commit secrets to repository
# Use .gitignore for .env files
```

### 2. Network Security

```bash
# Firewall rules
# Allow: 22 (SSH), 80 (HTTP), 443 (HTTPS)
# Deny: Everything else

sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

### 3. SSL/TLS Certificate Management

```bash
# Automatic renewal with Certbot
sudo systemctl enable certbot-renew.timer
sudo systemctl start certbot-renew.timer

# Verify renewal
sudo certbot certificates
```

### 4. Database Security

```sql
-- Create limited database user
CREATE USER readonly WITH PASSWORD 'password';
GRANT SELECT ON ALL TABLES IN SCHEMA public TO readonly;

-- Enable SSL for database connections
# In postgresql.conf: ssl = on
```

### 5. API Security

```python
# Rate limiting
from slowapi import Limiter
limiter = Limiter(key_func=get_remote_address)

@app.get("/api/endpoint")
@limiter.limit("100/minute")
async def endpoint():
    pass

# CORS configuration
from fastapi.middleware.cors import CORSMiddleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://example.com"],
    allow_credentials=True,
)
```

---

## Troubleshooting

### Common Issues

**Database Connection Fails**
```bash
# Check PostgreSQL is running
docker-compose ps postgres

# View logs
docker-compose logs postgres

# Restart
docker-compose restart postgres
```

**Backend API not responding**
```bash
# Check logs
docker-compose logs backend

# Restart
docker-compose restart backend

# Check disk space
df -h
```

**Frontend not loading**
```bash
# Clear cache
docker-compose exec frontend npm run clean
docker-compose restart frontend

# Check logs
docker-compose logs frontend
```

**SSL Certificate issues**
```bash
# Check certificate
sudo certbot certificates

# Renew manually
sudo certbot renew --force-renewal

# View renewal logs
sudo journalctl -u certbot-renew
```

---

## Rollback Procedure

If deployment fails:

```bash
# Stop current version
docker-compose down

# Restore database backup
cd /backups
gunzip db-YYYY-MM-DD-HHMMSS.sql.gz
psql -U produser < db-YYYY-MM-DD-HHMMSS.sql

# Switch to previous Docker image
# In docker-compose.yml, change image tag

# Restart
docker-compose up -d

# Verify
docker-compose ps
curl https://example.com/api/health
```

---

## Disaster Recovery

### Backup Strategy

- **Database**: Daily backups, 30-day retention
- **Code**: Git repository, backed up to GitHub
- **Files**: None (stateless, use database for storage)

### Recovery Time Objectives (RTO)

- **Database Failure**: 1 hour (restore from backup)
- **Server Failure**: 2 hours (spin up new server)
- **Application Failure**: 15 minutes (restart containers)

### Testing Recovery

Monthly:
1. Restore database backup to test server
2. Verify data integrity
3. Document issues
4. Update recovery procedures

---

## References

- Docker Documentation: https://docs.docker.com
- FastAPI: https://fastapi.tiangolo.com
- React: https://react.dev
- PostgreSQL: https://www.postgresql.org/docs
- Let's Encrypt: https://letsencrypt.org
- GitHub Actions: https://docs.github.com/en/actions

---

**Last Updated**: April 27, 2026  
**For questions**: devops@example.com
