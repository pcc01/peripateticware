# Contributing to Peripateticware Frontend

Thank you for your interest in contributing! This guide explains how to set up your development environment, follow coding standards, and submit pull requests.

## 📋 Table of Contents

1. [Code of Conduct](#code-of-conduct)
2. [Getting Started](#getting-started)
3. [Development Workflow](#development-workflow)
4. [Coding Standards](#coding-standards)
5. [Testing](#testing)
6. [Pull Request Process](#pull-request-process)
7. [Commit Messages](#commit-messages)

---

## Code of Conduct

- Be respectful and inclusive
- No harassment or discrimination
- Constructive feedback only
- Assume good intent

Violations should be reported to the maintainers.

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+
- Git
- Peripateticware backend running locally

### Setup Development Environment

```bash
# Clone the repository
git clone https://github.com/yourusername/peripateticware-frontend
cd peripateticware-frontend

# Install dependencies
npm install

# Create environment file
cp .env.example .env.local

# Configure for local development
cat .env.local
# Update VITE_API_URL=http://localhost:8010/api/v1

# Start development server
npm run dev
```

Visit `http://localhost:5173`

### Keep Fork Synced

```bash
git remote add upstream https://github.com/original/peripateticware-frontend
git fetch upstream
git rebase upstream/develop
```

---

## Development Workflow

### Creating a Feature Branch

```bash
# Update main branch
git checkout develop
git pull origin develop

# Create feature branch
git checkout -b feature/your-feature-name

# Or for bug fixes:
git checkout -b fix/bug-description

# Or for documentation:
git checkout -b docs/documentation-update
```

### Branch Naming Convention

- `feature/*` - New features
- `fix/*` - Bug fixes
- `docs/*` - Documentation
- `refactor/*` - Code refactoring
- `test/*` - Adding tests
- `chore/*` - Dependency updates, build config

### Make Your Changes

```bash
# Make changes to files
# Test frequently:
npm run dev

# Run tests:
npm run test -- --watch

# Check linting:
npm run lint
```

### Before Committing

```bash
# Format code
npm run format

# Lint and fix
npm run lint -- --fix

# Run all tests
npm run test

# Type check
npm run type-check
```

---

## Coding Standards

### File Organization

```
src/
├── components/      # React components
├── pages/           # Page components
├── services/        # API services
├── hooks/           # Custom hooks
├── stores/          # State management
├── types/           # TypeScript types
├── utils/           # Utilities
├── locales/         # Translations
└── styles/          # Global styles
```

### Component Guidelines

**Naming:**
- Use PascalCase for component files: `Button.tsx`
- Use camelCase for other files: `useAuth.ts`

**Structure:**
```typescript
import React from 'react'
import { useTranslation } from 'react-i18next'
import Button from '@components/common/Button'

interface MyComponentProps {
  title: string
  onAction: () => void
}

const MyComponent: React.FC<MyComponentProps> = ({ title, onAction }) => {
  const { t } = useTranslation(['common'])
  
  return (
    <div>
      <h1>{title}</h1>
      <Button onClick={onAction}>{t('common:submit')}</Button>
    </div>
  )
}

export default MyComponent
```

**Best Practices:**
- Use functional components with hooks
- Memoize expensive computations with `useMemo`
- Use `useCallback` for event handlers
- Always use TypeScript props interfaces
- Add JSDoc comments for complex logic

### String Externalization

**❌ BAD:**
```typescript
<button>Save Changes</button>
<p>Welcome to our app</p>
```

**✅ GOOD:**
```typescript
const { t } = useTranslation(['common'])
<button>{t('common:save')}</button>
<p>{t('common:welcome')}</p>
```

### Privacy-Aware Code

When handling user data:

```typescript
import { Privacy } from '@utils/privacy'

// Filter evidence based on user role
const evidence = Privacy.filterEvidenceByRole(data, userRole)

// Check permissions before showing data
if (Privacy.canViewCompetencyAssessment(userRole)) {
  // Show teacher-only content
}

// Sanitize logs
const logEntry = Privacy.sanitizeUserForLog(user)
```

### TypeScript

- Always define prop interfaces
- Use strict null checks
- No `any` types unless necessary (mark with `// @ts-ignore`)
- Use utility types: `Partial<T>`, `Pick<T>`, `Omit<T>`

### Styling

- Use Tailwind CSS utility classes
- For responsive: `md:`, `lg:`, `xl:`
- For RTL: Use logical properties (`margin-inline`, `inset-block`)
- Create custom CSS only if Tailwind can't handle it

```typescript
// Good: Tailwind utilities
className="px-4 py-2 md:px-6 md:py-4 bg-blue-500"

// Also good: Logical properties for RTL
className="ml-4 md:ml-6"  // Wrong for RTL
className="ml-4 md:ml-6"  // Use: ml-inline-start for RTL
```

---

## Testing

### Writing Tests

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import Button from '@components/common/Button'

describe('Button Component', () => {
  it('should render with text', () => {
    render(<Button>Click me</Button>)
    expect(screen.getByText('Click me')).toBeInTheDocument()
  })

  it('should call onClick handler', () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Click</Button>)
    screen.getByRole('button').click()
    expect(onClick).toHaveBeenCalled()
  })
})
```

### Test Coverage

- Components: ~80% coverage target
- Utils: ~95% coverage target
- Hooks: ~85% coverage target

```bash
# Check coverage
npm run test:coverage
```

### Privacy Tests

Always test that:
- Students cannot see teacher-only data
- PII is sanitized in logs
- COPPA compliance for under-13 users

```typescript
it('should strip competency assessment for students', () => {
  const evidence = filterEvidenceByRole(mockEvidence, 'student')
  expect(evidence.competency_assessment).toBeUndefined()
})
```

---

## Pull Request Process

### Before Creating PR

1. Create feature branch from `develop`
2. Make changes following coding standards
3. Add/update tests
4. Update documentation
5. Run full test suite: `npm run test`
6. Run linter: `npm run lint -- --fix`
7. Verify build: `npm run build`

### Create Pull Request

1. Push your branch to your fork
2. Create PR against `develop` branch
3. Fill out PR template completely:

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] New feature
- [ ] Bug fix
- [ ] Breaking change
- [ ] Documentation update

## Testing
How was this tested?

## Checklist
- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] No breaking changes
- [ ] Follows coding standards
```

### PR Review

- Expect feedback and be open to suggestions
- Reviewers will check:
  - Code quality and standards
  - Test coverage
  - Privacy and security
  - Localization (no hardcoded strings)
  - Performance implications

### Merge Criteria

- ✅ All CI checks passing
- ✅ At least 1 approval
- ✅ No conflicts with `develop`
- ✅ Test coverage maintained
- ✅ Privacy review passed

---

## Commit Messages

### Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Type
- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation
- `style` - Formatting (no logic changes)
- `refactor` - Code refactoring
- `test` - Tests
- `chore` - Dependencies, build config

### Scope
- `auth` - Authentication
- `curriculum` - Curriculum management
- `session` - Learning sessions
- `ui` - UI components
- `privacy` - Privacy features
- `i18n` - Internationalization

### Examples

```
feat(session): Add real-time location tracking

- Implement WebSocket connection for live updates
- Add StudentLocations hook
- Update SessionMonitor component

Closes #123
```

```
fix(privacy): Strip competency data for students

Teachers can now see competency assessments
Students only see evidence of learning

Closes #456
```

---

## Development Tips

### Useful Commands

```bash
# Development
npm run dev          # Start dev server
npm run test:watch   # Watch tests
npm run format       # Format code
npm run lint -- --fix # Fix linting issues

# Testing
npm run test         # Run tests once
npm run test:ui      # Test UI
npm run test:coverage # Coverage report

# Building
npm run build        # Production build
npm run preview      # Preview build

# Documentation
npm run storybook    # Component docs

# Debugging
npm run type-check   # Check TypeScript
npm run lint         # Check linting
```

### Browser DevTools

- React DevTools (browser extension)
- Redux DevTools for Zustand stores
- Network tab for API debugging
- Console for error messages

### Debugging Pseudo-Localization

```bash
# In browser console
localStorage.setItem('pseudo-loc', 'true')
location.reload()
```

All text becomes: `[Ħēļļōxxxxxxxxx]` to verify string externalization

### Testing Privacy Filters

```typescript
// Login as student
// Visit evidence page
// Should NOT see competency_assessment field

// Login as teacher
// Visit same evidence page
// Should see competency_assessment field
```

---

## Getting Help

- **Documentation:** See [README.md](./README.md), [API.md](./API.md), [DEPLOYMENT.md](./DEPLOYMENT.md)
- **Issues:** Check existing issues or create new one
- **Discussions:** GitHub Discussions
- **Email:** maintainers@example.com

---

## Recognition

Contributors will be recognized in:
- CONTRIBUTORS.md file
- GitHub contributors page
- Release notes for significant contributions

---

Thank you for contributing! 🙏

**Happy coding!**
