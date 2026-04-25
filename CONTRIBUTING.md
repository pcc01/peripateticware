# Contributing to Peripateticware

Thank you for contributing! This guide explains how to get started.

## Quick Start

```bash
# Clone
git clone https://github.com/pcc01/peripateticware
cd peripateticware

# Frontend
cd frontend && npm install && npm run dev

# Backend (new terminal)
cd backend && pip install -r requirements.txt && python main.py

# Ollama (new terminal)
ollama serve
```

## Code Standards

### Frontend
- TypeScript for all files
- Functional components with hooks
- Externalize all text (i18n)
- Test coverage: 80%+

### Backend  
- Type hints for all functions
- Docstrings for all modules
- Handle errors explicitly
- Test coverage: 80%+

## Before Submitting PR

- [ ] Tests pass: `npm run test` (frontend), `pytest` (backend)
- [ ] Linting passes: `npm run lint`, `flake8`
- [ ] Type check: `npm run type-check`, `mypy`
- [ ] Tests added for new features
- [ ] Documentation updated
- [ ] No console errors
- [ ] Privacy implications reviewed

## Testing

```bash
# Frontend
cd frontend
npm run test
npm run e2e

# Backend
cd backend
pytest
```

## Branch Naming

- `feature/description` - New features
- `fix/description` - Bug fixes
- `docs/description` - Documentation
- `refactor/description` - Code refactoring

## Commit Messages

```
feat(module): Add feature description
fix(module): Fix bug description
docs: Update documentation
test: Add tests for X
```

See [DEVELOPMENT.md](docs/DEVELOPMENT.md) for detailed guidance.

## Questions?

Open an issue or start a discussion!
