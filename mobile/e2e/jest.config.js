// Load mobile/.env.test (Detox test-account credentials — see .env.test.example)
// into process.env before any test file runs, so tests can read
// process.env.TEST_STUDENT_EMAIL / TEST_STUDENT_PASSWORD / TEST_TEACHER_EMAIL /
// TEST_TEACHER_PASSWORD without hardcoding them. .env.test is gitignored;
// test-preflight.ps1 / test-preflight-ios.sh already refuse to proceed if it's
// missing or still has placeholder values, so we just load-and-ignore-errors here.
try {
  require('dotenv').config({ path: require('path').resolve(__dirname, '../.env.test') });
} catch {
  // dotenv unavailable or .env.test missing — tests that need TEST_* vars will
  // fail fast with a clear "undefined credentials" error instead of a silent skip.
}

/** @type {import('@jest/types').Config.InitialOptions} */
module.exports = {
  rootDir: '..',
  testMatch: ['<rootDir>/e2e/**/*.test.{js,ts}'],
  // 120000 wasn't enough headroom: cold app launch on a loaded CI runner has
  // been measured up to ~100s to first paint on its own (see e2e/helpers.js's
  // completeOnboardingIfPresent() comment), and that wait shares the same
  // single per-hook/per-test clock as everything else in a beforeAll/
  // beforeEach that also logs in afterward — 100s of cold-launch wait left
  // under 20s for the rest of the hook, which then failed on ITS OWN
  // timeout instead of the intended assertion. 300000 leaves real margin
  // above the worst cold-launch case actually observed in CI, not just the
  // typical one.
  testTimeout: 300000,
  maxWorkers: 1,
  globalSetup: 'detox/runners/jest/globalSetup',
  globalTeardown: 'detox/runners/jest/globalTeardown',
  reporters: ['detox/runners/jest/reporter'],
  testEnvironment: 'detox/runners/jest/testEnvironment',
  verbose: true,
};
