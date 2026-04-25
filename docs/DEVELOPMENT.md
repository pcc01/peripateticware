# Development Guide

## Local Setup

### Prerequisites
- Node.js 18+
- Python 3.11+
- Docker & Docker Compose (optional)
- Git

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Create environment file
cp .env.example .env.local

# Start development server
npm run dev
```

**Frontend will open at:** http://localhost:5173

### Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Create environment file
cp .env.example .env

# Start server
python main.py
```

**Backend available at:** http://localhost:8010  
**API Docs:** http://localhost:8010/docs

### Start Ollama

In another terminal:

```bash
ollama serve

# Pull models (first time only)
ollama pull llama2
ollama pull llava
```

### Start Database

```bash
# Using Docker
docker run -d -p 5432:5432 \
  -e POSTGRES_USER=peripateticware_user \
  -e POSTGRES_PASSWORD=peripateticware_secure_password_dev \
  -e POSTGRES_DB=peripateticware \
  postgres:15

# Or with Docker Compose
docker-compose up postgres
```

---

## Code Quality

### Frontend

```bash
cd frontend

# Lint code
npm run lint

# Auto-fix linting issues
npm run lint -- --fix

# Format code
npm run format

# Type check
npm run type-check

# Run tests
npm run test

# Run tests in watch mode
npm run test:watch

# E2E tests
npm run e2e
```

### Backend

```bash
cd backend

# Format code
black .

# Lint code
flake8 .

# Type check
mypy .

# Run tests
pytest

# Run with coverage
pytest --cov=. --cov-report=html

# Run specific test
pytest tests/test_api.py::test_login
```

---

## Testing Strategy

### Unit Tests

**Frontend:**
- Component rendering
- Hook behavior
- Utility functions
- API service mocking

**Backend:**
- Route handlers
- Database queries
- Service logic
- Privacy filtering

### Integration Tests

- API contracts
- Database transactions
- Auth flow
- Session lifecycle

### E2E Tests

- Complete user workflows
- Cross-browser testing
- Mobile responsiveness
- Privacy enforcement

---

## Git Workflow

### Branch Naming

```
feature/add-new-feature
fix/resolve-bug
docs/update-readme
refactor/improve-performance
test/add-tests-for-x
```

### Commit Messages

```
feat(module): Add feature description
fix(module): Fix bug description
docs: Update documentation
test(module): Add tests
refactor(module): Improve code
chore: Update dependencies
```

### Pull Request Process

1. Create feature branch
2. Make changes + tests
3. Ensure tests pass: `npm run test` (frontend), `pytest` (backend)
4. Format code
5. Push to GitHub
6. Create PR with description
7. Wait for CI/CD checks to pass
8. Request code review
9. Merge after approval

---

## Docker Development

### Using Docker Compose

```bash
# Start all services
docker-compose up

# Stop services
docker-compose down

# View logs
docker-compose logs -f backend

# Rebuild images
docker-compose build --no-cache

# Run specific service
docker-compose up backend postgres
```

### Service Access

- Frontend: http://localhost:5173
- Backend: http://localhost:8010
- Database: localhost:5432
- Redis: localhost:6379
- Ollama: localhost:11434

---

## Debugging

### Frontend Debugging

```bash
# Enable verbose logging
export DEBUG=peripateticware:*

# Browser DevTools
# - React DevTools
# - Network tab for API calls
# - Console for errors
# - Application tab for storage

# Pseudo-localization testing
localStorage.setItem('pseudo-loc', 'true')
location.reload()
```

### Backend Debugging

```bash
# Set log level
export LOG_LEVEL=DEBUG

# Enable SQL logging
export SQLALCHEMY_ECHO=true

# Use pdb
import pdb; pdb.set_trace()

# View logs
docker-compose logs -f backend
tail -f logs/*.log
```

---

## Performance Profiling

### Frontend

```bash
# Lighthouse audit
npm run build
npx lighthouse http://localhost:5173

# React DevTools Profiler
# - Record interaction
# - Analyze rendering
# - Find bottlenecks
```

### Backend

```bash
# Use py-spy for profiling
pip install py-spy
py-spy record -o profile.svg -- python main.py

# Use time module
import time
start = time.time()
# code to profile
print(f"Took {time.time() - start}s")
```

---

## Common Tasks

### Adding a New API Endpoint

1. Define route in `backend/routes/*.py`
2. Define database model if needed
3. Add tests in `backend/tests/`
4. Update OpenAPI docs (automatic)
5. Update frontend API service

### Adding a New Component

1. Create in `frontend/src/components/`
2. Add TypeScript props interface
3. Add tests
4. Add to Storybook
5. Export from index

### Adding a Translation

1. Add key to `frontend/src/locales/{lang}/*.json`
2. Use in component: `const { t } = useTranslation()`
3. Test with pseudo-loc: `localStorage.setItem('pseudo-loc', 'true')`

### Running Database Migrations

```bash
# Create migration
alembic revision --autogenerate -m "Add new column"

# Apply migration
alembic upgrade head

# Rollback
alembic downgrade -1
```

---

## Environment Variables

### Frontend (.env.local)

```env
VITE_API_URL=http://localhost:8010/api/v1
VITE_WEBSOCKET_URL=ws://localhost:8010/api/v1
VITE_DEFAULT_LANGUAGE=en
VITE_LOG_LEVEL=debug
```

### Backend (.env)

```env
ENVIRONMENT=development
LOG_LEVEL=DEBUG
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
DATABASE_URL=postgresql://user:pass@localhost:5432/peripateticware
SECRET_KEY=dev-key-change-in-production
```

---

## Useful Resources

- [React Documentation](https://react.dev)
- [FastAPI Documentation](https://fastapi.tiangolo.com)
- [TypeScript Handbook](https://www.typescriptlang.org/docs)
- [SQLAlchemy Documentation](https://docs.sqlalchemy.org)
- [PostgreSQL Documentation](https://www.postgresql.org/docs)

