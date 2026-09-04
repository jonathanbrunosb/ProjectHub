import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// GitHub Pages serve o site em https://<user>.github.io/<repo>/.
// O base path e' injetado pelo workflow (VITE_BASE_PATH) e cai para '/' em dev.
export default defineConfig(({ mode }) => ({
  base: process.env.VITE_BASE_PATH ?? '/',
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  build: {
    outDir: 'dist',
    sourcemap: mode !== 'production',
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          query: ['@tanstack/react-query', '@tanstack/react-table'],
          charts: ['recharts'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
}));
