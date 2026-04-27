# Peripateticware Phase 4 Mobile App - Integration Guide

This package contains the complete Phase 4 mobile app implementation for the Peripateticware platform.

## 📦 What's Included

- **Complete React Native App** using Expo 49
- **7 Fully Functional Screens** (Login, Register, ForgotPassword, Dashboard, ChildProgress, Notifications, Settings)
- **5 Zustand State Management Stores** (Auth, Children, Notifications, Settings, Activity)
- **Push Notifications** (Firebase Cloud Messaging integration)
- **Offline Support** (Queue management, sync on reconnect)
- **Testing Suite** (Jest, unit tests, mocks)
- **CI/CD Pipeline** (GitHub Actions)
- **Deployment Ready** (EAS configuration, store submission guides)

## 🚀 Quick Start

### 1. Copy Files to Your Repo
```bash
# From this package
cp -r mobile/ /path/to/your/repo/

# Navigate to mobile directory
cd /path/to/your/repo/mobile
```

### 2. Install Dependencies
```bash
npm install
```

This installs all required packages including:
- React Native, Expo, React Navigation
- Zustand (state management)
- Axios (HTTP client)
- Jest (testing)
- TypeScript

### 3. Configuration Setup
```bash
# Copy example env file
cp .env.example .env

# Edit .env with your values
# EXPO_PUBLIC_API_URL=http://localhost:8000
# EXPO_PUBLIC_SENTRY_DSN=your-sentry-dsn
# etc.
```

### 4. Verify Everything Works
```bash
# Type checking
npm run type-check
# ✅ Should show no errors

# Run tests
npm test
# ✅ Should show test results

# Lint check
npm run lint
# ✅ Should show no critical errors
```

## 📱 Running the App

### iOS Simulator
```bash
npm run ios
```
Opens app in iOS simulator (requires Xcode installed)

### Android Emulator
```bash
npm run android
```
Opens app in Android emulator (requires Android Studio)

### Web (Development)
```bash
npm run web
```
Runs web version for quick testing (limited features)

### Development Server
```bash
npm start
```
Shows menu to choose platform

## 📋 Project Structure

```
mobile/
├── src/
│   ├── App.tsx                  # Root navigation setup
│   ├── screens/                 # All 7 screens (fully built)
│   ├── stores/                  # Zustand state stores (5)
│   ├── services/                # API, Push, Offline, Sync
│   ├── hooks/                   # Custom React hooks
│   ├── components/              # Reusable UI components
│   ├── types/                   # TypeScript type definitions
│   ├── utils/                   # Validation and utilities
│   └── __tests__/               # Unit tests
├── app.json                     # Expo configuration
├── eas.json                     # EAS build config
├── jest.config.js               # Test configuration
├── package.json                 # Dependencies and scripts
├── tsconfig.json                # TypeScript config
└── [Documentation files]
```

## 🔧 Configuration Files

### .env File
Create `.env` with your configuration:
```
EXPO_PUBLIC_API_URL=http://localhost:8000
EXPO_PUBLIC_SENTRY_DSN=
EXPO_PUBLIC_FIREBASE_PROJECT_ID=
EXPO_PUBLIC_FIREBASE_API_KEY=
```

### app.json
Update with your app details:
```json
{
  "expo": {
    "name": "Peripateticware",
    "slug": "peripateticware",
    "ios": {
      "bundleIdentifier": "com.peripateticware.app"
    },
    "android": {
      "package": "com.peripateticware.app"
    }
  }
}
```

## 🧪 Testing

### Run All Tests
```bash
npm test
```

### Watch Mode (Auto-rerun on changes)
```bash
npm run test:watch
```

### Coverage Report
```bash
npm run test:coverage
```
Creates coverage report in `coverage/` directory

### Included Tests
- ✅ Validation utilities (email, password, phone)
- ✅ Auth store (login, logout, token refresh)
- ✅ Mock setup for all external services

### Adding More Tests
Create test files in `src/__tests__/` following the existing pattern:
```typescript
describe('Feature Name', () => {
  it('should do something', () => {
    // test code
  });
});
```

## 🚢 Deployment

### Prerequisites
1. Node.js 18+
2. npm 8+
3. Expo account (free at https://expo.dev)
4. Apple Developer account (for iOS, $99/year)
5. Google Play Developer account (for Android, $25 one-time)

### Setup EAS
```bash
npm install -g eas-cli
eas login
eas init
```

### Build for Testing (Preview)
```bash
npm run build:preview
```
Creates testable builds without App Store submission

### Build for Production
```bash
npm run build:ios
npm run build:android
```

### Submit to App Stores
See `PHASE_4_DEPLOYMENT_GUIDE.md` for detailed instructions

## 📊 Features

### ✅ Authentication
- Email/password login and registration
- Password reset flow
- Secure token storage
- Automatic token refresh

### ✅ Parent Portal
- View linked children
- Track child progress
- View learning activities
- Manage notifications

### ✅ Notifications
- Push notifications (Firebase)
- Notification preferences
- Mark as read
- Delete notifications

### ✅ Offline Support
- Works offline
- Queues API calls
- Auto-syncs when online
- Shows sync status

### ✅ Settings
- Dark mode toggle
- Language selection
- Email preferences
- Privacy settings

## 🔍 TypeScript Types

All types are defined in `src/types/index.ts` and match the backend API schema:

```typescript
// Authentication
User, LoginRequest, RegisterRequest, AuthResponse

// Children
Child, ChildProgress, LearningArea

// Activities
Activity, Evidence

// Notifications
Notification, NotificationPreferences

// Settings
UserSettings, EmailPreferences, PrivacySettings
```

## 📚 Documentation

- **PHASE_4_COMPLETION_SUMMARY.md** - What's included and built
- **PHASE_4_DEPLOYMENT_GUIDE.md** - How to deploy to App Stores
- **PHASE_4_BUILD_SUMMARY.md** - Technical implementation details
- **README.md** - Original project setup guide

## 🐛 Troubleshooting

### Dependencies not installing
```bash
rm -rf node_modules package-lock.json
npm install
```

### Type errors
```bash
npm run type-check
```
Shows specific TypeScript errors to fix

### Tests failing
```bash
npm test -- --clearCache
npm test
```

### App won't start
```bash
npm start
# Press 'r' to reload
# Press 'a' for Android
# Press 'i' for iOS
```

## 🔗 Connecting to Backend

Update your API URL in `.env`:
```
EXPO_PUBLIC_API_URL=https://your-backend-api.com
```

The app expects these API endpoints:
- `POST /auth/login`
- `POST /auth/register`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /users/me`
- `POST /auth/password-reset/request`
- `POST /auth/password-reset/confirm`
- `GET /children`
- `GET /children/{id}/progress`
- `GET /notifications`
- `PUT /notifications/{id}/read`
- `DELETE /notifications/{id}`
- etc.

See backend API documentation for complete endpoint list.

## 🎯 Next Steps

1. ✅ Copy files to your repo
2. ✅ Run `npm install`
3. ✅ Configure `.env` file
4. ✅ Test with `npm test`
5. ✅ Run app with `npm run ios` or `npm run android`
6. ✅ Connect to your backend API
7. ✅ Commit to GitHub
8. ✅ Setup CI/CD (GitHub Actions already configured)
9. ✅ Build and deploy to App Stores (see deployment guide)

## 📞 Support

For issues:
1. Check `PHASE_4_DEPLOYMENT_GUIDE.md` troubleshooting section
2. Review TypeScript errors: `npm run type-check`
3. Check test output: `npm test`
4. Review console logs in simulator/emulator

## ✨ What's Ready

✅ All screens built and connected  
✅ State management fully implemented  
✅ API integration complete  
✅ Push notifications configured  
✅ Offline support implemented  
✅ Testing infrastructure ready  
✅ CI/CD pipeline configured  
✅ Deployment guide provided  

**The app is production-ready. You just need to:**
- Configure your environment
- Connect to your backend
- Build and deploy to App Stores

---

**Happy building! 🚀**
