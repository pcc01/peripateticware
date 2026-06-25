/** @type {Detox.DetoxConfig} */
module.exports = {
  testRunner: {
    args: {
      // Use `node` explicitly so cmd.exe doesn't try to run the extensionless
      // node_modules/.bin/jest shim (which fails on Windows with shell:true).
      $0: 'node node_modules/jest/bin/jest.js',
      config: 'e2e/jest.config.js',
    },
    jest: {
      setupTimeout: 120000,
    },
  },

  apps: {
    // Release build: expo export:embed bundles the JS so the app never tries to
    // reach a Metro server that isn't running.  useDeveloperSupport=false
    // also prevents the dev-overlay crash on Android 15 (API 35).
    // signingConfigs.release in app/build.gradle already uses the debug keystore,
    // so this APK installs on any AVD without a production key.
    'android.debug': {
      type: 'android.apk',
      binaryPath: 'android/app/build/outputs/apk/release/app-release.apk',
      // --no-daemon: run Gradle in-process so stale long-lived daemons can't
      // accumulate JIT memory and OOM after hours of emulator sessions.
      build: process.platform === 'win32'
        ? 'cd android && gradlew.bat --no-daemon assembleRelease assembleAndroidTest'
        : 'cd android && ./gradlew --no-daemon assembleRelease assembleAndroidTest',
    },
    'ios.debug': {
      type: 'ios.app',
      binaryPath:
        'ios/build/Build/Products/Debug-iphonesimulator/Peripateticware.app',
      build: [
        'npx expo prebuild --platform ios --no-install',
        'xcodebuild',
        '-workspace ios/Peripateticware.xcworkspace',
        '-scheme Peripateticware',
        '-configuration Debug',
        '-sdk iphonesimulator',
        '-derivedDataPath ios/build',
        'CODE_SIGNING_ALLOWED=NO',
      ].join(' '),
    },
  },

  devices: {
    // ── Android emulators ──────────────────────────────────────────────────
    'emulator.api35': {
      type: 'android.emulator',
      device: { avdName: 'Pixel_6_API_35' },
    },
    'emulator.api33': {
      type: 'android.emulator',
      device: { avdName: 'Pixel_6_API_33' },
    },
    'emulator.api30': {
      type: 'android.emulator',
      device: { avdName: 'Pixel_6_API_30' },
    },
    'emulator.api24': {
      // API 24 uses x86 and default (non-Google) image for availability
      type: 'android.emulator',
      device: { avdName: 'Nexus_5X_API_24' },
    },

    // ── iOS simulators ────────────────────────────────────────────────────
    'simulator.ios26': {
      type: 'ios.simulator',
      device: { type: 'iPhone 16', os: 'iOS 26' },
    },
    'simulator.ios18': {
      type: 'ios.simulator',
      device: { type: 'iPhone 15', os: 'iOS 18' },
    },
    'simulator.ios16': {
      // iPhone 8 is the flagship legacy device for iOS 16 floor testing
      type: 'ios.simulator',
      device: { type: 'iPhone 8', os: 'iOS 16' },
    },
  },

  configurations: {
    // ── Android ────────────────────────────────────────────────────────────
    // API 35 — Android 15 (VanillaIceCream)
    'android.api35.debug': {
      device: 'emulator.api35',
      app: 'android.debug',
    },
    // API 33 — Android 13 (Tiramisu)
    'android.api33.debug': {
      device: 'emulator.api33',
      app: 'android.debug',
    },
    // API 30 — Android 11 (R)
    'android.api30.debug': {
      device: 'emulator.api30',
      app: 'android.debug',
    },
    // API 24 — Android 7.0 (Nougat)
    'android.api24.debug': {
      device: 'emulator.api24',
      app: 'android.debug',
    },
    // Legacy alias kept so any existing local scripts don't break
    'android.emu.debug': {
      device: 'emulator.api35',
      app: 'android.debug',
    },

    // ── iOS ───────────────────────────────────────────────────────────────
    // iOS 26 — current baseline (~86 % of recent devices)
    'ios.26.debug': {
      device: 'simulator.ios26',
      app: 'ios.debug',
    },
    // iOS 18 — primary fallback
    'ios.18.debug': {
      device: 'simulator.ios18',
      app: 'ios.debug',
    },
    // iOS 16 — floor (last version for iPhone 8 / iPhone X)
    'ios.16.debug': {
      device: 'simulator.ios16',
      app: 'ios.debug',
    },
    // Legacy alias
    'ios.sim.debug': {
      device: 'simulator.ios26',
      app: 'ios.debug',
    },
  },
};
