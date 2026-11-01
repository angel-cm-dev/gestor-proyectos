/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Destino del proxy /api en desarrollo (por defecto el backend local en :3000).
const apiTarget = process.env.VITE_PROXY_TARGET ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // En desarrollo, /api se redirige al backend: mismo origen que en producción (nginx).
    proxy: { '/api': { target: apiTarget, changeOrigin: true } },
  },
  preview: {
    proxy: { '/api': { target: apiTarget, changeOrigin: true } },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});
