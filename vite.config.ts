import { defineConfig } from 'vitest/config'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { version } from './package.json'

const _protocolHash = createHash('sha256')
  .update(readFileSync(new URL('./shared/protocol.ts', import.meta.url)))
  .digest('hex')
  .slice(0, 8)

function requireEnv(): Plugin {
  return {
    name: 'require-env',
    configResolved(config) {
      if (config.mode !== 'production') return;

      if (!config.env.VITE_SITE_URL) {
        throw new Error('[require-env] Environment variable "VITE_SITE_URL" is required in production builds.');
      }
      if (!URL.canParse(config.env.VITE_SITE_URL)) {
        throw new Error(`[require-env] Environment variable "VITE_SITE_URL" must be a valid URL. Got: ${config.env.VITE_SITE_URL}`);
      }
    },
  };
}

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
  plugins: [react(), requireEnv()],
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
