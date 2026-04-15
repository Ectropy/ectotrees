import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { version } from './package.json'

const __dirname = dirname(fileURLToPath(import.meta.url))
const _protocolHash = createHash('sha256')
  .update(readFileSync(resolve(__dirname, 'shared/protocol.ts')))
  .digest('hex')
  .slice(0, 8)

// https://vite.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@shared-browser': fileURLToPath(new URL('./shared-browser', import.meta.url)),
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(`${version}+${_protocolHash}`),
  },
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
      '/ws': {
        target: 'ws://localhost:3001',
        ws: true,
      },
      '/alt1': 'http://localhost:3001',
    },
  },
  test: {
    environment: 'node',
    exclude: ['e2e/**', 'node_modules/**', 'alt1-plugin/**'],
  },
})
