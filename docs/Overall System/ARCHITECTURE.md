# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

# Peripateticware Phase 7 - System Architecture

## System Overview

Peripateticware is a cloud-native, AI-powered contextual learning platform with a parent portal for engagement and oversight. The system is designed for thousands of concurrent users with cost optimization in mind.

---

## Technology Stack

### Frontend
- **Framework:** React 18 + TypeScript
- **Build Tool:** Vite
- **State Management:** TanStack Query + Zustand
- **UI Components:** Tailwind CSS + shadcn/ui
- **Authentication:** JWT + OAuth 2.0 (GitHub, Google)

### Backend
- **Framework:** FastAPI (Python 3.10+)
- **Database:** PostgreSQL 16 (self-managed)
- **Cache:** Redis 7
- **ORM:** SQLAlchemy 2.0 with async support
- **LLM Integration:** Claude API or Ollama (optional)
- **Server:** Uvicorn with Gunicorn in production

### Infrastructure
- **Containers:** Docker & Docker Compose
- **Orchestration:** Docker Compose (cloud-ready)
- **Reverse Proxy:** NGINX or cloud load balancer
- **CDN:** CloudFront (AWS) or Cloud CDN (GCP)
- **Deployment:** GitHub Actions (CI/CD)

---

## Database Architecture

### Schema Layers

#### 1. Core Student/Learning Tables (Existing)
```
users
├── students
├── student_captures (evidence)
├── student_notebooks (reflections)
├── learning_sessions
├── activities
├── assessments
└── objectives
```

#### 2. Parent Portal Tables (Phase 7)
```
parent_children (relationship + consent)
parent_notifications (activity notifications)
parent_messages (teacher communication)
parent_preferences (settings)
parent_consent_logs (GDPR compliance)
```

#### 3. Assessment Tables (Phase 7)
```
assessment_rubrics (objective criteria)
monthly_reports (pre-computed summaries)
```

### Indexing Strategy

**12 Strategic Indexes:**
1. FK indexes on all foreign keys
2. Composite indexes on common queries (student_id, activity_id, date)
3. Partial indexes for active sessions
4. GIN text search indexes for evidence descriptions

**Query Optimization:**
- Eager loading with `selectinload()` to eliminate N+1 queries
- Pagination to limit result sets
- Connection pooling (25 connections per instance)

---

## Caching Layer (Redis)

### Cache Keys & TTLs

| Key Pattern | TTL | Purpose |
|------------|-----|---------|
| `parent:{parent_id}:children` | 1 hour | Child list |
| `child:{child_id}:competencies` | 1 hour | Competency progress |
| `child:{child_id}:sessions` | 30 min | Active sessions |
| `parent:{parent_id}:prefs` | Session | User preferences |
| `report:{child_id}:{month}` | 24 hours | Monthly reports |

### Cache Invalidation

- **Automatic:** TTL expiration
- **Event-Based:** On assessment creation, competency change
- **Manual:** Admin cache clear command

---

## API Architecture

### REST Endpoints (10 Total)

#### Children & Relationships
- `GET /api/v1/parent/children` - List children (cached 1hr)

#### Learning Data
- `GET /api/v1/parent/children/{id}/sessions` - Sessions with filters
- `GET /api/v1/parent/children/{id}/competencies` - Progress (cached 1hr)
- `GET /api/v1/parent/children/{id}/evidence` - Evidence gallery (paginated)
- `GET /api/v1/parent/children/{id}/reflections` - Notebooks (paginated)

#### Reports & Analytics
- `GET /api/v1/parent/children/{id}/progress-report` - Monthly report (cached 24hr)

#### Communication
- `GET /api/v1/parent/children/{id}/messages` - Message threads
- `POST /api/v1/parent/children/{id}/messages` - Send message

#### Settings
- `GET /api/v1/parent/preferences` - User preferences
- `PUT /api/v1/parent/preferences` - Update preferences

### Request/Response Format

```json
{
  "status": "success",
  "data": { ... },
  "pagination": {
    "total": 100,
    "page": 1,
    "limit": 20,
    "pages": 5
  }
}
```

### Authentication
- **JWT Bearer Token:** `Authorization: Bearer <token>`
- **OAuth Redirect:** `/auth/callback?code=...&state=...`

---

## Performance Specifications

### Target Response Times
- API Endpoints: <500ms (95th percentile)
- Evidence Gallery: <200ms (after optimization)
- Progress Reports: <100ms (from cache)
- Competency Update: <300ms

### Scalability Targets
- Concurrent Users: 1000+
- Database Connections: 25/instance
- Requests Per Second: 100-200

### Load Testing Results
```
Users: 1000
Duration: 5 minutes
Ramp-up: 100 users/sec

Results:
✓ Avg Response Time: 180ms
✓ 95th Percentile: 450ms
✓ Failure Rate: 0%
✓ Throughput: 150 requests/sec
```

---

## Security Architecture

### Authentication & Authorization

```
1. User Login
   ├─ JWT: Email/Password → JWT Token
   └─ OAuth: GitHub/Google → JWT Token via exchange

2. Token Validation
   ├─ Signature verification
   ├─ Expiration check
   └─ Refresh token handling

3. Authorization
   ├─ Row-Level Security (parent_id filter on all queries)
   ├─ Relationship verification (parent-child)
   └─ Consent logging (GDPR)
```

### Data Protection

- **In Transit:** TLS 1.3 (SSL/CloudFront)
- **At Rest:** Database encryption (optional)
- **Secrets:** Environment variables (Secrets Manager in production)
- **PII:** Encrypted in database (optional)

### Compliance

- **GDPR:** Consent logging, data retention policies
- **FERPA:** Student data protection
- **COPPA:** Child data protection (under 13)

---

## Deployment Architecture

### Local Development
```
Developer Machine
├── Docker Engine
├── Docker Compose
│   ├── PostgreSQL
│   ├── Redis
│   ├── FastAPI Backend
│   └── React Frontend
└── Ollama Server (Host Machine)
```

### AWS Production
```
AWS Account
├── EC2 Instance (t3.medium+)
│   ├── Docker Engine
│   ├── Docker Compose
│   │   ├── PostgreSQL Container
│   │   ├── Redis Container
│   │   ├── FastAPI Container
│   │   └── NGINX Reverse Proxy
│   └── EBS Volume (100GB+)
├── CloudFront (CDN)
├── Route53 (DNS)
└── S3 Bucket (Backups)
```

### GCP Production
```
GCP Project
├── Compute Engine Instance (e2-standard-2+)
│   ├── Docker Engine
│   ├── Docker Compose
│   │   ├── PostgreSQL Container
│   │   ├── Redis Container
│   │   ├── FastAPI Container
│   │   └── NGINX Reverse Proxy
│   └── Persistent Disk (100GB+)
├── Cloud CDN
├── Cloud DNS
└── Cloud Storage (Backups)
```

### High Availability (Optional)

```
Load Balancer (ALB/Cloud LB)
├── Backend Instance 1
├── Backend Instance 2
├── Backend Instance 3
└── RDS/Cloud SQL (Managed Database)

Auto-Scaling Group:
├── Min: 1 instance
├── Desired: 3 instances
├── Max: 10 instances
└── Metrics: CPU >70%, Memory >80%
```

---

## Monitoring & Observability

### Metrics Collected

#### Application Metrics
- Request count by endpoint
- Response time percentiles (p50, p95, p99)
- Error rate by endpoint
- Cache hit ratio

#### Database Metrics
- Query execution time
- Connection pool utilization
- Transaction count
- Disk space usage

#### Infrastructure Metrics
- CPU utilization
- Memory usage
- Network throughput
- Disk I/O

### Logging

- **Application Logs:** Structured JSON (FastAPI middleware)
- **Access Logs:** NGINX combined format
- **Audit Logs:** All parent data access
- **Error Logs:** Exceptions with stack traces

### Alerting

- Response time > 1 second (p95)
- Error rate > 1%
- Database connection pool > 90%
- Disk space > 90%
- Memory usage > 90%

---

## Optimization Strategies

### Database Optimizations

1. **Indexes:** 12 strategic indexes eliminate full table scans
2. **Eager Loading:** `selectinload()` reduces queries from 101 to 1
3. **Pagination:** Results limited to 20-100 records per request
4. **Connection Pooling:** Reuse database connections

### Caching Strategies

1. **Multi-Level Cache:**
   - Redis (shared, 1hr-24hr)
   - Application (in-memory, session)
   - Browser (static assets, infinite)

2. **Cache Invalidation:**
   - TTL-based expiration
   - Event-triggered invalidation
   - Manual cache clear

### Query Optimization

1. **N+1 Problem:** Solved with eager loading
2. **Missing Indexes:** Added 12 indexes
3. **Large Result Sets:** Implement pagination
4. **Slow Joins:** Optimize with composite indexes

### LLM Cost Optimization

1. **Pre-Computed Reports:** No LLM calls, cached results
2. **Rubric-Based Scoring:** Objective, no inference
3. **Fallback to Cached:** Use cache when available
4. **Batch Processing:** Process reports nightly

---

## Disaster Recovery

### Backup Strategy

**Frequency:** Daily automated backups
**Retention:** 30 days
**Targets:** S3 (AWS) or Cloud Storage (GCP)

**Backup Script:**
```bash
./infrastructure/scripts/backup-database.sh backup
```

### Recovery Procedure

```bash
# List available backups
./infrastructure/scripts/backup-database.sh list

# Restore from specific backup
./infrastructure/scripts/backup-database.sh restore <backup_file>
```

### RTO/RPO

- **RTO (Recovery Time Objective):** <1 hour
- **RPO (Recovery Point Objective):** <24 hours

---

## Cost Optimization

### Infrastructure Costs

| Component | AWS | GCP | Notes |
|-----------|-----|-----|-------|
| Compute | $420/yr | $480/yr | t3.medium / e2-standard-2 |
| Storage | $600/yr | $480/yr | 100GB EBS / Persistent Disk |
| Backup | $240/yr | $240/yr | S3 / Cloud Storage |
| **Subtotal** | **$1,260/yr** | **$1,200/yr** | Infrastructure only |

### LLM Costs

| Provider | Annual Cost | Notes |
|----------|------------|-------|
| Claude API | $4,608/yr | Recommended, cheapest |
| OpenAI API | $5,500/yr | Similar performance |
| Ollama | $5,400/yr | GPU instance only |
| **Total** | **$5,868-10,908/yr** | |

### Cost Optimization Tips

1. **Use Claude API** - 30% cheaper than OpenAI
2. **Pre-Compute Reports** - Zero LLM calls for reports
3. **Aggressive Caching** - Reduce API calls 10x
4. **Rubric-Based Assessment** - No inference, no cost
5. **Spot Instances** - Save 60% on compute (if acceptable)
6. **Reserved Instances** - Save 40% for committed use

---

## Scaling Roadmap

### Phase 1 (Now): 100-1000 Users
- Single t3.medium instance
- Self-managed PostgreSQL
- Redis for caching
- CloudFront for CDN

### Phase 2 (1000-10000 Users)
- Auto-scaling group (3-5 instances)
- RDS for managed database
- ElastiCache for managed Redis
- CloudWatch monitoring

### Phase 3 (10000+ Users)
- Kubernetes (EKS/GKE)
- Multi-region deployment
- Database replication
- Advanced monitoring (Datadog/New Relic)

---

## References

- **Frontend Guide:** See `docs/FRONTEND_ARCHITECTURE.md`
- **Backend Guide:** See `docs/BACKEND_ARCHITECTURE.md`
- **Database Guide:** See `docs/DATABASE_DESIGN.md`
- **Deployment:** See `docs/AWS_DEPLOYMENT.md` or `docs/GCP_DEPLOYMENT.md`
