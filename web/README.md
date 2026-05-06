# Copyright (c) 2026 Paul Christopher Cerda
# This source code is licensed under the Business Source License 1.1
# found in the LICENSE.md file in the root directory of this source tree.

# 👨‍👩‍👧 Peripateticware Parent Portal

A web-based dashboard enabling parents to track their children's learning progress, communicate with teachers, and stay engaged in their education.

**Version:** 0.1.0  
**Status:** In Development (Phase 4)  
**Last Updated:** April 26, 2026

---

## 🎯 Overview

The Parent Portal provides a comprehensive view of children's learning journeys in Peripateticware. Parents can monitor progress, review achievements, communicate with teachers, generate reports, and stay informed about their child's development.

### Key Features

**Dashboard & Progress**
- 📊 Multi-child dashboard overview
- 📈 Visual progress tracking (gauges, charts, trends)
- 🎯 Competency achievement tracking
- 📍 Location-aware learning history
- 🏆 Achievement badges & milestones
- 📉 Engagement metrics & trends

**Communication**
- 💬 Message center with teachers
- 📧 Automated weekly digest emails
- 🔔 Smart notifications
- 📎 File attachments
- 🔍 Message search & filters

**Reports & Analytics**
- 📄 Weekly progress reports
- 📋 Monthly detailed analytics
- 📊 Comparative analysis (vs. class average)
- 🎯 Learning trajectory charts
- 📥 PDF export for records
- 🔄 Scheduled email reports

**Settings & Preferences**
- ⚙️ Account management
- 🎨 Dark mode theme
- 🌍 Multi-language support
- 📧 Email notification preferences
- 🔐 Privacy controls
- 👨‍👩‍👧 Manage child links

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18.0.0 or higher
- **npm** or **yarn**
- Modern web browser (Chrome, Firefox, Safari, Edge)

### Installation

```bash
# Clone the repository
git clone https://github.com/pcc01/peripateticware.git
cd parent-portal

# Install dependencies
npm install

# Start development server
npm run dev
```

The app will be available at `http://localhost:3001`

### Configuration

Create a `.env.local` file:

```env
VITE_API_URL=http://localhost:8000/api/v1  # Development
# VITE_API_URL=https://api.peripateticware.com  # Production
```

---

## 📁 Project Structure

```
parent-portal/
├── src/
│   ├── pages/
│   │   ├── LoginPage.tsx
│   │   ├── RegisterPage.tsx
│   │   ├── DashboardPage.tsx
│   │   ├── ChildProgressPage.tsx
│   │   ├── CommunicationPage.tsx
│   │   ├── ReportsPage.tsx
│   │   ├── SettingsPage.tsx
│   │   └── NotFoundPage.tsx
│   ├── components/
│   │   ├── common/
│   │   │   ├── Header.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   ├── Card.tsx
│   │   │   ├── Button.tsx
│   │   │   ├── Modal.tsx
│   │   │   └── LoadingSpinner.tsx
│   │   ├── parent/
│   │   │   ├── ChildProgressWidget.tsx
│   │   │   ├── CompetencyGrid.tsx
│   │   │   ├── RecentActivities.tsx
│   │   │   ├── UpcomingSessions.tsx
│   │   │   ├── WeeklyDigest.tsx
│   │   │   ├── MessageCenter.tsx
│   │   │   └── ReportGenerator.tsx
│   │   └── dashboard/
│   │       ├── OverviewCard.tsx
│   │       ├── ProgressChart.tsx
│   │       ├── ChildSelector.tsx
│   │       └── StatCard.tsx
│   ├── hooks/
│   │   ├── useChildProgress.ts
│   │   ├── useMessages.ts
│   │   ├── useWeeklyReport.ts
│   │   ├── useParentAuth.ts
│   │   └── useFetch.ts
│   ├── services/
│   │   ├── api.ts
│   │   ├── progressService.ts
│   │   ├── communicationService.ts
│   │   ├── reportService.ts
│   │   └── authService.ts
│   ├── stores/
│   │   ├── parentAuthStore.ts
│   │   ├── progressStore.ts
│   │   └── uiStore.ts
│   ├── types/
│   │   └── parent.ts
│   ├── utils/
│   │   ├── chartHelpers.ts
│   │   ├── reportGenerators.ts
│   │   ├── emailScheduling.ts
│   │   └── formatters.ts
│   ├── styles/
│   │   └── globals.css
│   ├── config/
│   │   └── i18n.ts
│   └── App.tsx
│   └── main.tsx
├── index.html
├── vite.config.ts
├── tsconfig.json
├── package.json
├── README.md
└── .gitignore
```

---

## 🔑 Key Technologies

### Frontend Framework
- **React** 18.2 - UI library
- **TypeScript** - Type-safe development
- **Vite** - Fast build tool
- **Tailwind CSS** - Utility-first styling

### Routing & State
- **React Router** - Client-side routing
- **Zustand** - Lightweight state management
- **React Query** (optional) - Server state management

### Data Visualization
- **Recharts** - Responsive charts
- **Lucide React** - Icons

### Forms & Validation
- **React Hook Form** - Efficient form handling
- **Zod** - Schema validation

### API Communication
- **Axios** - HTTP client
- **Interceptors** - Request/response handling

### PDF & Export
- **@react-pdf/renderer** - PDF generation
- **react-csv** (optional) - CSV export

### Internationalization
- **i18next** - Multi-language support
- **react-i18next** - React integration

### Email Scheduling
- **node-schedule** - Scheduled tasks (backend)
- **nodemailer** - Email sending (backend)

### Testing
- **Vitest** - Unit testing
- **React Testing Library** - Component testing
- **Playwright** - E2E testing

---

## 🎨 Design System

### Color Palette

```
Primary:     #1f7f7f (Teal)      - Main actions, highlights
Secondary:   #f56565 (Red)       - Alerts, achievements
Accent:      #ed8936 (Orange)    - Supporting elements
Success:     #48bb78 (Green)     - Positive feedback
Warning:     #ecc94b (Yellow)    - Warnings
Error:       #f56565 (Red)       - Errors
Neutral:     Gray scale          - Text, backgrounds
```

### Typography
- **Display:** Poppins Bold (warm, friendly)
- **Body:** Inter (clear, readable)
- **Mono:** Fira Code (data)

### Components
- Cards with subtle shadows
- Progress rings for competencies
- Area charts for trends
- Timelines for activity history
- Badge system for achievements
- Modal dialogs for actions
- Toast notifications

---

## 📱 Responsive Design

Built mobile-first with breakpoints:
- **Mobile:** < 640px
- **Tablet:** 640px - 1024px
- **Desktop:** > 1024px

All components are fully responsive and touch-friendly.

---

## 🔐 Authentication

### Login Flow
```
1. User enters email & password
2. Backend validates & returns JWT
3. Store token in localStorage
4. Include token in Authorization header
5. Refresh token before expiry
```

### Token Management
```typescript
// Automatic token refresh
refreshToken(); // Called before expiry

// Auto logout on 401
if (response.status === 401) {
  logout();
}
```

---

## 📊 Dashboard Features

### Child Progress Widget
- Overview of each child's competencies
- Visual progress indicators
- Recent activities
- Achievement count

### Engagement Metrics
- Weekly engagement score
- Trend analysis
- Comparison to class average
- Activity breakdown by subject

### Recent Activities
- Latest 5 activities
- Activity details & evidence
- Location & duration
- Teacher information

### Quick Actions
- View detailed progress
- Message teacher
- Download reports
- Share achievements

---

## 📈 Reports & Analytics

### Weekly Report
- Activities completed
- Total hours spent
- New competencies achieved
- Highlights & concerns
- Class comparison

### Monthly Report
- Detailed competency breakdown
- Subject-wise statistics
- Growth trajectory chart
- Top subjects & achievements
- Recommendations

### Custom Reports
- Date range selection
- Include/exclude graphics
- Choose sections
- PDF export
- Email delivery

---

## 💬 Communication Hub

### Features
- Message history with teachers
- Rich text editor
- File attachments
- Message search
- Conversation threads
- Real-time indicators

### Notifications
- New message alerts
- Achievement notifications
- Concern alerts
- Weekly digest emails
- Customizable preferences

---

## 📧 Email System

### Scheduled Emails
```typescript
// Weekly digest
frequency: 'weekly'
dayOfWeek: 1  // Monday
timeOfDay: '09:00'  // 9 AM

// Monthly report
frequency: 'monthly'
dayOfMonth: 1  // First of month
timeOfDay: '08:00'
```

### Email Types
- Weekly digest (summary + highlights)
- Monthly report (detailed analytics)
- Achievement alerts (milestones)
- Concern notifications (low engagement)
- Session invites (from teacher)

---

## ⚙️ Settings & Preferences

### Account Settings
- Update profile information
- Change password
- Link/unlink children
- Manage account

### Display Settings
- Dark mode toggle
- Language selection (EN, ES, AR, JA)
- Font size adjustment
- Sidebar collapse option

### Notification Settings
- Email frequency
- Push notifications
- Notification types
- Quiet hours

### Privacy Settings
- Data visibility level
- Third-party sharing
- Analytics tracking
- Export data

---

## 🌍 Internationalization

Supported languages:
- 🇬🇧 English
- 🇪🇸 Spanish
- 🇸🇦 Arabic (RTL)
- 🇯🇵 Japanese

```typescript
import { useTranslation } from 'react-i18next';

const { t } = useTranslation();
<h1>{t('parent.dashboard.title')}</h1>
```

---

## 🎨 Dark Mode

Automatic detection with manual override:

```typescript
const isDarkMode = useUIStore((state) => state.isDarkMode);

// Toggle
toggleDarkMode();

// Stored in localStorage
localStorage.getItem('darkMode')
```

Entire UI adapts with CSS variables:
```css
html.dark {
  --color-bg: #1a202c;
  --color-text: #f7fafc;
}
```

---

## ♿ Accessibility

- **WCAG AAA** compliance
- Screen reader support
- Keyboard navigation
- High contrast mode
- Focus indicators
- Semantic HTML
- ARIA labels
- Color-blind friendly palette

---

## 🧪 Testing

### Run Tests
```bash
# Unit tests
npm run test

# Watch mode
npm run test:watch

# Coverage
npm run test:coverage
```

### E2E Testing with Playwright
```bash
# Install Playwright
npm install -D @playwright/test

# Run tests
npx playwright test

# Headed mode
npx playwright test --headed

# Single test
npx playwright test -g "parent login"
```

---

## 🚀 Build & Deployment

### Development Build
```bash
npm run dev
```

### Production Build
```bash
npm run build
# Output: dist/
```

### Preview Production Build
```bash
npm run preview
```

### Deploy to Production
```bash
# Set API URL
export VITE_API_URL=https://api.peripateticware.com

# Build
npm run build

# Deploy to hosting (Vercel, Netlify, etc.)
```

---

## 📊 Performance

### Optimization Techniques
- **Code Splitting:** Route-based lazy loading
- **Image Optimization:** Compressed & responsive
- **Caching:** Strategic browser cache
- **Compression:** Gzip compression
- **Minification:** Production builds
- **Tree Shaking:** Remove unused code

### Performance Targets
- Page load: < 1.5s
- Lighthouse: 90+
- FCP (First Contentful Paint): < 1s
- LCP (Largest Contentful Paint): < 2.5s
- CLS (Cumulative Layout Shift): < 0.1

### Monitor Performance
```bash
# Lighthouse
npm run lighthouse

# Bundle analysis
npm run analyze
```

---

## 🔄 Continuous Integration

GitHub Actions pipeline:
- Run tests on push/PR
- Build production bundle
- Run ESLint & TypeScript
- Upload coverage
- Deploy on merge to main

---

## 📚 Documentation

- [API Reference](./API.md)
- [Component Library](./COMPONENT_STORYBOOK.md)
- [Contributing Guide](./CONTRIBUTING.md)
- [Architecture](../docs/ARCHITECTURE.md)
- [Design System](./DESIGN_SYSTEM.md)

---

## 🤝 Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for:
- Development setup
- Code style guidelines
- Pull request process
- Component requirements
- Testing expectations

---

## 📄 License

This project is licensed under the MIT License. See [LICENSE](../LICENSE) for details.

---

## 🆘 Support

- **Issues:** [GitHub Issues](https://github.com/pcc01/peripateticware/issues)
- **Discussions:** [GitHub Discussions](https://github.com/pcc01/peripateticware/discussions)
- **Email:** support@peripateticware.com

---

## 🎯 Roadmap

### Phase 4A (Current - Weeks 1-3)
- ✅ Project setup & authentication
- ⏳ Parent login & child linking
- ⏳ Dashboard & progress overview
- ⏳ Reports & exports
- ⏳ Communication hub

### Phase 4B (Weeks 4-5)
- ⏳ Email digests & scheduling
- ⏳ Advanced analytics
- ⏳ Achievement tracking
- ⏳ Goal setting (optional)

### Phase 4C (Weeks 6-7)
- ⏳ Dark mode
- ⏳ Accessibility audit
- ⏳ Performance optimization
- ⏳ Testing & QA

---

**Last Updated:** April 26, 2026  
**Next Milestone:** Phase 4A completion (May 17, 2026)
