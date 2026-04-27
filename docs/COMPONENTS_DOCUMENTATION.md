# 🧩 Component Documentation - Peripateticware

**Last Updated:** April 26, 2026  
**Version:** 0.1.0

---

## 📱 Mobile App Components (React Native)

### Common Components

#### Button

**File:** `mobile/src/components/common/Button.tsx`

A versatile button component with multiple variants.

```typescript
interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  style?: ViewStyle;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  style,
}) => { ... }
```

**Usage:**
```typescript
<Button 
  title="Continue" 
  onPress={() => handleNext()}
  variant="primary"
/>
```

**Variants:**
- `primary` - Main action (teal background)
- `secondary` - Alternative action (teal outline)
- `danger` - Destructive action (red background)

---

#### Card

**File:** `mobile/src/components/common/Card.tsx`

Container component for grouping content.

```typescript
interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
}

export const Card: React.FC<CardProps> = ({ children, style }) => { ... }
```

**Usage:**
```typescript
<Card>
  <Text>Card content goes here</Text>
</Card>
```

**Features:**
- Rounded corners
- White background
- Subtle shadow
- Padding

---

#### LoadingSpinner

**File:** `mobile/src/components/common/LoadingSpinner.tsx`

Loading indicator component.

```typescript
interface LoadingSpinnerProps {
  color?: string;
  size?: 'small' | 'large';
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  color = '#1f7f7f',
  size = 'large',
}) => { ... }
```

**Usage:**
```typescript
{isLoading ? (
  <LoadingSpinner size="large" color="#1f7f7f" />
) : (
  <Content />
)}
```

---

### Screen Components

#### LoginScreen

**File:** `mobile/src/screens/auth/LoginScreen.tsx`

User authentication screen with email/password and biometric support.

**Features:**
- Email validation
- Password input with show/hide toggle
- Biometric authentication (Face ID, Touch ID)
- Error display
- Loading state
- Link to registration

**Props:**
```typescript
{
  navigation: NavigationProp
}
```

**Usage:**
```typescript
<LoginScreen navigation={navigation} />
```

---

#### RegisterScreen

**File:** `mobile/src/screens/auth/RegisterScreen.tsx`

New account creation screen.

**Features:**
- Full name input
- Email input
- Role selection (student/teacher)
- Password confirmation
- Terms acceptance
- Input validation
- Error handling

**Props:**
```typescript
{
  navigation: NavigationProp
}
```

**Usage:**
```typescript
<RegisterScreen navigation={navigation} />
```

---

#### StudentDashboard

**File:** `mobile/src/screens/student/StudentDashboard.tsx`

Main screen for student users showing overview and quick actions.

**Features:**
- Welcome greeting with student name
- Statistics display (activities, competencies)
- Active sessions list
- Quick action buttons
- Navigation to other screens

**Props:**
```typescript
{
  navigation: NavigationProp
}
```

---

#### TeacherDashboard

**File:** `mobile/src/screens/teacher/TeacherDashboard.tsx`

Main screen for teacher users showing class overview and controls.

**Features:**
- Welcome greeting with teacher name
- Quick action buttons
- Class overview statistics
- Navigation to management screens

**Props:**
```typescript
{
  navigation: NavigationProp
}
```

---

## 💻 Web Portal Components (React + Vite)

### Common Components

#### Button

**File:** `web/src/components/common/Button.tsx`

Tailwind-based button component for web.

```typescript
interface ButtonProps {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  disabled = false,
  onClick,
  className = '',
}) => { ... }
```

**Usage:**
```tsx
<Button variant="primary" onClick={handleClick}>
  Continue
</Button>
```

**Variants:**
- `btn-primary` - Main action
- `btn-secondary` - Alternative action
- `btn-danger` - Destructive action

---

#### Card

**File:** `web/src/components/common/Card.tsx`

Container component for grouping content.

```typescript
interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export const Card: React.FC<CardProps> = ({ children, className = '' }) => { ... }
```

**Usage:**
```tsx
<Card className="p-6">
  <h2>Card Title</h2>
  <p>Card content</p>
</Card>
```

---

#### LoadingSpinner

**File:** `web/src/components/common/LoadingSpinner.tsx`

Loading indicator for web.

```typescript
export const LoadingSpinner: React.FC = () => { ... }
```

**Usage:**
```tsx
{isLoading ? <LoadingSpinner /> : <Content />}
```

---

### Page Components

#### LoginPage

**File:** `web/src/pages/LoginPage.tsx`

Parent authentication page.

**Features:**
- Email input
- Password input
- Login form
- Error display
- Loading state
- Link to registration
- Forgot password link (future)

**Usage:**
```typescript
import LoginPage from '../pages/LoginPage';

// In router
<Route path="/login" element={<LoginPage />} />
```

---

#### DashboardPage

**File:** `web/src/pages/DashboardPage.tsx`

Main parent dashboard showing children and activity overview.

**Features:**
- Welcome greeting
- Statistics cards
- Child list with progress
- Recent activities
- Quick navigation

**Usage:**
```typescript
import DashboardPage from '../pages/DashboardPage';

// In router
<ProtectedRoute path="/dashboard" element={<DashboardPage />} />
```

---

## 🎨 Design System

### Colors

**Primary Colors:**
```css
--primary: #1f7f7f (Teal)
--secondary: #f56565 (Red)
--accent: #ed8936 (Orange)
--success: #48bb78 (Green)
```

**Neutral Colors:**
```css
--neutral-900: #1a202c (Dark)
--neutral-800: #2d3748
--neutral-700: #4a5568
--neutral-600: #718096
--neutral-500: #a0aec0
--neutral-400: #cbd5e0
--neutral-300: #e2e8f0
--neutral-200: #edf2f7
--neutral-100: #f7fafc
--neutral-50: #f9fafb
```

### Typography

**Mobile:**
```
- Poppins Bold (heading)
- Inter (body)
- Fira Code (code)
```

**Web:**
```
- System font stack
- Tailwind typography
```

### Spacing

**Scale:** 0, 2px, 4px, 8px, 12px, 16px, 20px, 24px, 32px, etc.

### Border Radius

- Small: 4px
- Medium: 8px
- Large: 12px
- Full: 9999px

---

## 🏗️ Component Hierarchy

### Mobile App Tree

```
App
├─ AuthStack
│  ├─ LoginScreen
│  │  └─ Button
│  │  └─ Card
│  └─ RegisterScreen
│     └─ Button
│     └─ Card
│
├─ StudentStack
│  ├─ StudentDashboard
│  │  ├─ Card
│  │  └─ Button
│  ├─ ActivityScreen (future)
│  └─ SessionScreen (future)
│
├─ TeacherStack
│  ├─ TeacherDashboard
│  │  ├─ Card
│  │  └─ Button
│  └─ MonitoringScreen (future)
│
└─ Shared
   ├─ Button
   ├─ Card
   └─ LoadingSpinner
```

### Web App Tree

```
App
├─ Router
│  ├─ LoginPage
│  │  ├─ Button
│  │  └─ Card
│  │
│  ├─ DashboardLayout
│  │  ├─ Sidebar
│  │  ├─ Header
│  │  │
│  │  └─ DashboardPage
│  │     ├─ Card
│  │     ├─ Button
│  │     └─ ProgressChart (future)
│  │
│  └─ Shared
│     ├─ Button
│     ├─ Card
│     └─ LoadingSpinner
```

---

## 📝 Component Checklist

### Mobile (Phase 4 - In Progress)

**Auth Screens:**
- ✅ LoginScreen
- ✅ RegisterScreen
- ⏳ BiometricAuthScreen
- ⏳ ForgotPasswordScreen

**Student Screens:**
- ✅ StudentDashboard
- ⏳ ActivityScreen
- ⏳ SessionScreen
- ⏳ ProgressScreen

**Teacher Screens:**
- ✅ TeacherDashboard
- ⏳ ClassManagementScreen
- ⏳ MonitoringScreen
- ⏳ AnalyticsScreen

**Common Components:**
- ✅ Button
- ✅ Card
- ✅ LoadingSpinner
- ⏳ Modal
- ⏳ Dropdown
- ⏳ Tabs
- ⏳ ProgressBar

### Web (Phase 4 - In Progress)

**Pages:**
- ✅ LoginPage
- ✅ DashboardPage
- ⏳ ChildProgressPage
- ⏳ CommunicationPage
- ⏳ ReportsPage
- ⏳ SettingsPage

**Layout Components:**
- ⏳ Sidebar
- ⏳ Header
- ⏳ Footer

**Common Components:**
- ✅ Button
- ✅ Card
- ✅ LoadingSpinner
- ⏳ Modal
- ⏳ Dropdown
- ⏳ Tabs
- ⏳ ProgressBar
- ⏳ Chart

**Parent-Specific Components:**
- ⏳ ChildCard
- ⏳ ProgressChart
- ⏳ ActivityCard
- ⏳ MessageCard

---

## 🔧 Creating New Components

### Mobile Component Template

```typescript
// mobile/src/components/[category]/NewComponent.tsx

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface NewComponentProps {
  // Props here
}

export const NewComponent: React.FC<NewComponentProps> = ({
  // Destructure props
}) => {
  return (
    <View style={styles.container}>
      <Text>Component content</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 8,
  },
});
```

### Web Component Template

```typescript
// web/src/components/[category]/NewComponent.tsx

import React from 'react';

interface NewComponentProps {
  // Props here
}

export const NewComponent: React.FC<NewComponentProps> = ({
  // Destructure props
}) => {
  return (
    <div className="p-4 bg-white rounded-lg">
      Component content
    </div>
  );
};
```

---

## 📚 Component Best Practices

1. **Keep components focused** - Single responsibility principle
2. **Use TypeScript** - Type all props and state
3. **Write tests** - Cover happy path and edge cases
4. **Document props** - Use JSDoc comments
5. **Avoid prop drilling** - Use context or stores for shared state
6. **Reuse components** - DRY principle
7. **Accessible** - ARIA labels, keyboard navigation
8. **Responsive** - Mobile-first design
9. **Performance** - Memoize when needed
10. **Styled consistently** - Follow design system

---

## 🎯 Component Status

| Component | Mobile | Web | Status |
|-----------|--------|-----|--------|
| Button | ✅ | ✅ | Complete |
| Card | ✅ | ✅ | Complete |
| LoadingSpinner | ✅ | ✅ | Complete |
| LoginScreen/Page | ✅ | ✅ | Complete |
| RegisterScreen | ✅ | ⏳ | In Progress |
| Dashboard | ✅ | ✅ | Complete |
| Modal | ⏳ | ⏳ | Planned |
| Dropdown | ⏳ | ⏳ | Planned |
| Charts | ❌ | ⏳ | Planned |
| Forms | ✅ | ⏳ | Partial |

---

## 🔗 Related Documentation

- [README.md](../README.md) - Project overview
- [DEVELOPMENT.md](./DEVELOPMENT.md) - Development workflow
- [ARCHITECTURE.md](./ARCHITECTURE.md) - System design
- [mobile/README.md](../mobile/README.md) - Mobile guide
- [web/README.md](../web/README.md) - Web guide

---

**Happy building! 🎨**

*For questions or suggestions, open an issue on GitHub.*
