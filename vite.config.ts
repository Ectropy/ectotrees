import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { version } from './package.json'

// https://vite.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true,
      },
    },
  },
  test: {
    environment: 'node',
    exclude: ['e2e/**', 'node_modules/**', 'alt1-plugin/**'],
  },
})
