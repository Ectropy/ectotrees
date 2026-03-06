import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const isDev = mode !== 'production';
  const hasApiOverride = Boolean(process.env.ECTOTREES_API);
  const apiBase = process.env.ECTOTREES_API
    ?? (isDev ? '/api' : 'https://trees.ectropyarts.com');
  const wsBase = process.env.ECTOTREES_WS
    ?? (hasApiOverride
      ? apiBase.replace(/^https?/, isDev ? 'ws' : 'wss')
      : (isDev ? '' : apiBase.replace(/^https?/, 'wss')));
  const emptyModule = path.resolve(__dirname, 'src/shims/empty-module.ts');

  return {
    base: './',
    resolve: {
      alias: [
        { find: '@shared', replacement: path.resolve(__dirname, '../shared') },
        { find: /^sharp(?:\/.*)?$/, replacement: emptyModule },
        { find: /^canvas(?:\/.*)?$/, replacement: emptyModule },
        { find: /^electron\/common$/, replacement: emptyModule },
      ],
    },
    define: {
      'process.env.API_BASE': JSON.stringify(apiBase),
      'process.env.WS_BASE': JSON.stringify(wsBase),
    },
    plugins: [react()],
    server: {
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        },
        '/ws': {
          target: 'ws://localhost:3001',
          ws: true,
        },
      },
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: isDev ? 'inline' : false,
      rollupOptions: {
        output: {
          entryFileNames: 'main.js',
          chunkFileNames: 'chunks/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]',
        },
      },
    },
  };
});
