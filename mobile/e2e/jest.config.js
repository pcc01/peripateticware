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
  testTimeout: 120000,
  maxWorkers: 1,
  globalSetup: 'detox/runners/jest/globalSetup',
  globalTeardown: 'detox/runners/jest/globalTeardown',
  reporters: ['detox/runners/jest/reporter'],
  testEnvironment: 'detox/runners/jest/testEnvironment',
  verbose: true,
};
