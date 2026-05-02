// Copyright (c) 2026 Paul Christopher Cerda
// This source code is licensed under the Business Source License 1.1
// found in the LICENSE.md file in the root directory of this source tree.

import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/tests/setup.ts',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/tests/',
        'tests/e2e/**'
      ],
    },
  },
 resolve: {
  alias: {
    '@': path.resolve(__dirname, './src'),
    '@components': path.resolve(__dirname, './src/components'),
    '@pages': path.resolve(__dirname, './src/pages'),
    '@stores': path.resolve(__dirname, './src/stores'),
    '@services': path.resolve(__dirname, './src/services'),
    '@hooks': path.resolve(__dirname, './src/hooks'),
    '@types': path.resolve(__dirname, './src/types'),
    '@locales': path.resolve(__dirname, './public/locales'),
  },
},
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/components'),
      '@pages': path.resolve(__dirname, './src/pages'),
      '@stores': path.resolve(__dirname, './src/stores'),
      '@services': path.resolve(__dirname, './src/services'),
      '@hooks': path.resolve(__dirname, './src/hooks'),
      '@types': path.resolve(__dirname, './src/types'),
      '@locales': path.resolve(__dirname, './public/locales'),
    },
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
    hmr: {
      host: 'localhost',
      port: 5173,
    },
  },
})
})

