import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const isDev = mode !== 'production';
  const emptyModule = path.resolve(__dirname, 'src/shims/empty-module.ts');

  return {
    base: './',
    resolve: {
      alias: [
        { find: '@shared', replacement: path.resolve(__dirname, '../shared') },
        { find: '@shared-browser', replacement: path.resolve(__dirname, '../shared-browser') },
        { find: /^sharp(?:\/.*)?$/, replacement: emptyModule },
        { find: /^canvas(?:\/.*)?$/, replacement: emptyModule },
        { find: /^electron\/common$/, replacement: emptyModule },
      ],
      dedupe: ['react', 'react-dom'],
    },
    plugins: [react(), tailwindcss()],
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
      outDir: '../dist/alt1',
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
