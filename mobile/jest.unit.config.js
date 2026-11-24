// Standalone unit-test config for plain TS logic in src/ — deliberately
// separate from e2e/jest.config.js, which drives Detox device tests and
// requires a running simulator/emulator.
//
// This config only needs to strip TypeScript types and convert ES module
// syntax to CommonJS so Jest (running under Node) can require() the
// source files directly. It intentionally does NOT create a project-root
// babel.config.js / .babelrc — Metro looks for those files to bundle the
// actual Expo app, and a minimal non-Expo babel config there would break
// the real app build. Babel options are passed inline to babel-jest instead.
//
// Run with:  npx jest --config jest.unit.config.js
/** @type {import('@jest/types').Config.InitialOptions} */
module.exports = {
  rootDir: '.',
  testMatch: ['<rootDir>/src/**/__tests__/**/*.test.ts'],
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': [
      'babel-jest',
      {
        babelrc: false,
        configFile: false,
        presets: ['@babel/preset-typescript'],
        plugins: ['@babel/plugin-transform-modules-commonjs'],
      },
    ],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  clearMocks: true,
  // Mirrors tsconfig.json's "@/*": ["./*"] -- source files use that alias
  // for cross-directory imports (e.g. src/db importing src/api). Scoped to
  // this standalone config only, so it has no effect on Metro's bundling of
  // the real app (see the file-level comment above).
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
};
