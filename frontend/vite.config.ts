import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    // FIX 1: Force a single React instance across all packages.
    // react-i18next v14 (and some other packages) that import 'react' internally
    // can resolve to a different copy when node_modules exist at multiple levels,
    // causing "useContext dispatcher is null / Invalid hook call" crashes on React 19.
    dedupe: ['react', 'react-dom', 'react-i18next', 'i18next'],
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@hooks': path.resolve(__dirname, './src/hooks'),
      '@components': path.resolve(__dirname, './src/components'),
      '@pages': path.resolve(__dirname, './src/pages'),
      '@stores': path.resolve(__dirname, './src/stores'),
      '@types': path.resolve(__dirname, './src/types'),
      '@utils': path.resolve(__dirname, './src/utils'),
      '@services': path.resolve(__dirname, './src/services'),
      '@config': path.resolve(__dirname, './src/config'),
      '@styles': path.resolve(__dirname, './src/styles'),
    },
  },
  json: {
    stringify: true,
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    hmr: {
      host: 'localhost',
      port: 3000,
    },
    watch: {
      // Use polling for reliable HMR on Windows bind mounts (inotify unreliable)
      usePolling: true,
      interval: 1000,
    },
    proxy: {
      '/auth': {
        // VITE_PROXY_TARGET = server-side Docker service URL (http://backend:8000)
        // VITE_API_URL is a browser-side var and must NOT be used here — inside the
        // container "localhost" resolves to the frontend container, not the backend.
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => `/api/v1${path}`,
      },
      '/api': {
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    copyPublicDir: true,
  },
})
