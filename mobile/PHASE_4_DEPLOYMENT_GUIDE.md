# Phase 4.10 - Deployment Guide

## Overview
This guide covers building, testing, and deploying the Peripateticware React Native mobile app to iOS App Store and Android Play Store.

## Prerequisites

### Required Accounts & Tools
1. **Apple Developer Account** ($99/year)
   - Required for iOS app signing and App Store distribution
   - Apple Team ID needed in `eas.json`

2. **Google Play Developer Account** ($25 one-time)
   - Required for Android app distribution
   - Service account key needed for automated uploads

3. **EAS Account** (Free)
   - Signup at https://expo.dev
   - EAS CLI for building and submitting apps

4. **Local Requirements**
   - Node.js 18+
   - npm 8+
   - Xcode 14+ (for iOS)
   - Android Studio & SDK (for Android)

## Setup Instructions

### 1. Install EAS CLI
```bash
npm install -g eas-cli
```

### 2. Authenticate with EAS
```bash
eas login
# Follow prompts to login with your Expo account
```

### 3. Configure EAS Project
```bash
cd mobile
eas init
# Follow interactive setup
```

### 4. Update app.json with App Details
```json
{
  "expo": {
    "name": "Peripateticware",
    "slug": "peripateticware",
    "version": "1.0.0",
    "ios": {
      "bundleIdentifier": "com.peripateticware.app",
      "buildNumber": "1"
    },
    "android": {
      "package": "com.peripateticware.app",
      "versionCode": 1
    }
  }
}
```

### 5. Update eas.json
```json
{
  "build": {
    "production": {
      "ios": {
        "buildType": "archive",
        "scheme": "Peripateticware",
        "schemeBuildConfiguration": "Release"
      },
      "android": {
        "buildType": "apk",
        "gradleCommand": ":app:bundleRelease"
      }
    }
  },
  "submit": {
    "production": {
      "ios": {
        "serviceType": "app-store",
        "appleTeamId": "YOUR_APPLE_TEAM_ID"
      },
      "android": {
        "serviceType": "google-play",
        "track": "internal"
      }
    }
  }
}
```

## Testing Before Deployment

### Local Testing
```bash
# Install dependencies
npm install

# Run unit tests
npm test

# Run tests with coverage
npm test:coverage

# Type checking
npm run type-check

# Linting
npm run lint
```

### Simulator Testing
```bash
# iOS Simulator
npm run ios

# Android Emulator
npm run android

# Web (for UI testing)
npm run web
```

### Preview Builds (EAS)
```bash
# Build for all platforms (preview)
npm run build:preview

# iOS only
eas build --platform ios --build-type preview

# Android only
eas build --platform android --build-type preview
```

## Building for Production

### Step 1: Prepare Release
```bash
# Bump version numbers
# Update CHANGELOG.md
# Create release branch
git checkout -b release/v1.0.0

# Install clean dependencies
rm -rf node_modules package-lock.json
npm install

# Run full test suite
npm test:coverage
npm run type-check
npm run lint
```

### Step 2: Build with EAS
```bash
# Build for all platforms
eas build --platform all --build-type production

# Or specific platforms
npm run build:ios
npm run build:android
```

The build process will:
1. Compile TypeScript
2. Bundle JavaScript
3. Sign with certificates
4. Create app archives (.ipa for iOS, .aab for Android)

### Step 3: Submit to App Stores

#### iOS App Store
```bash
eas submit --platform ios --latest
```

Or manually:
1. Go to App Store Connect
2. Create new version
3. Upload `.ipa` file
4. Fill in release notes, pricing, etc.
5. Submit for review (5-7 days typically)

#### Google Play
```bash
eas submit --platform android --latest
```

Or manually:
1. Go to Google Play Console
2. Create new release
3. Upload `.aab` file
4. Add release notes
5. Submit for review (typically approved within hours)

## CI/CD Pipeline

### GitHub Actions Workflow
The `.github/workflows/mobile-build.yml` file sets up:

1. **Test Job**
   - Runs on every push and PR
   - Runs Jest tests
   - Uploads coverage reports

2. **Type Check Job**
   - Verifies TypeScript types
   - No type errors allowed

3. **EAS Preview Build** (develop branch)
   - Builds preview version
   - Comments on PRs with build links

4. **EAS Production Build** (main branch)
   - Automatic production builds
   - Ready for App Store submission

### Setup GitHub Actions
1. Add `EXPO_TOKEN` secret to repository
   - Generate token: `eas token create`
   - Add to GitHub: Settings → Secrets → New repository secret

2. Commit workflow file
```bash
git add .github/workflows/mobile-build.yml
git commit -m "feat: add CI/CD pipeline"
```

## Post-Deployment

### 1. Analytics Setup
```typescript
// In App.tsx or store initialization
import * as Analytics from 'expo-analytics';

Analytics.initialize('GA_MEASUREMENT_ID');
Analytics.setUserId(userId);
```

### 2. Crash Reporting (Sentry)
```bash
npm install @sentry/react-native
```

```typescript
import * as Sentry from "@sentry/react-native";

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
});
```

### 3. Over-the-Air Updates (CodePush)
```bash
npm install react-native-code-push

eas update --branch production --message "fix: critical bug"
```

## Versioning Strategy

### Version Numbers: MAJOR.MINOR.PATCH
- **MAJOR**: Breaking changes
- **MINOR**: New features
- **PATCH**: Bug fixes

### Release Process
1. Create release branch: `release/v1.0.0`
2. Update version in `app.json` and `package.json`
3. Update CHANGELOG.md
4. Create release commit
5. Build and submit
6. Create GitHub release tag
7. Merge back to main

## Troubleshooting

### Build Failures
```bash
# Clear cache and rebuild
eas build --platform all --clear-cache

# Check logs
eas build:list
eas build:view <BUILD_ID>
```

### Signing Issues
```bash
# Reset provisioning profiles
eas credentials
# Select reset and reconfigure
```

### App Store Rejection
Common reasons and fixes:
- **Privacy Policy**: Add to app and app store listing
- **Age Rating**: Complete questionnaire in App Store Connect
- **App Category**: Choose most relevant category
- **Metadata**: Ensure keywords and descriptions are accurate

### Performance Issues
- Profile with React Native Debugger
- Check network requests
- Monitor memory usage
- Use React DevTools Profiler

## Monitoring Post-Launch

### Metrics to Track
- Crash rate
- User retention
- Session duration
- Feature usage
- API response times

### Setup Monitoring
```typescript
// In store initialization
import { syncManager } from './services/syncManager';

syncManager.initialize({
  onOnline: () => analytics.trackEvent('app_online'),
  onOffline: () => analytics.trackEvent('app_offline'),
});
```

## Rollback Procedure

If critical issues discovered:

### Immediate Actions
1. Publish a fix build
2. Use CodePush for quick rollback
3. Notify users of issue

### Release a Patch
```bash
# Fix the bug
git checkout -b hotfix/v1.0.1
# ... make changes
npm test
npm run build:production
eas submit --platform all
```

## Maintenance Schedule

- **Daily**: Monitor crash reports, user reviews
- **Weekly**: Review analytics, performance metrics
- **Monthly**: Plan new features, plan releases
- **Quarterly**: Major version updates, strategy review

## References

- [Expo Documentation](https://docs.expo.dev)
- [EAS Build Documentation](https://docs.expo.dev/build/introduction)
- [App Store Connect Guide](https://help.apple.com/app-store-connect/)
- [Google Play Console Help](https://support.google.com/googleplay/android-developer)
- [React Native Performance](https://reactnative.dev/docs/performance)

## Support

For issues:
1. Check GitHub Issues
2. Review logs and error messages
3. Consult team Slack channel
4. Contact EAS support for build issues
5. Contact Apple/Google for store issues
