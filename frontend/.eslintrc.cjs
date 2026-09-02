module.exports = {
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:jsx-a11y/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs', '*.stories.tsx'],
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaFeatures: { jsx: true } },
  plugins: ['@typescript-eslint', 'jsx-a11y'],
  rules: {
    // Downgrade to warn — pre-existing issues across the codebase
    'no-empty': 'warn',
    'no-useless-escape': 'warn',
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': 'warn',
    '@typescript-eslint/no-require-imports': 'warn',
    // jsx-a11y: warn rather than error for the same reason — this is a new
    // category of check being turned on across an existing large codebase,
    // not something to gate the build on until the backlog is triaged.
    'jsx-a11y/click-events-have-key-events': 'warn',
    'jsx-a11y/no-static-element-interactions': 'warn',
    'jsx-a11y/no-noninteractive-element-interactions': 'warn',
    'jsx-a11y/anchor-is-valid': 'warn',
    'jsx-a11y/label-has-associated-control': 'warn',
    // media-has-caption fires on <audio>/<video> used as live
    // record/playback UI for student-captured evidence (no separate
    // caption track exists to add); no-autofocus fires on deliberate
    // focus-on-open UX in login/search modals. Both real tradeoffs, not
    // bugs — warn instead of blocking the build.
    'jsx-a11y/media-has-caption': 'warn',
    'jsx-a11y/no-autofocus': 'warn',
  },
}
