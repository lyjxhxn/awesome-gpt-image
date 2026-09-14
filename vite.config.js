import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  publicDir: 'data',
  server: {
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8787',
        changeOrigin: false
      },
      '/healthz': process.env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8787',
      '/readyz': process.env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8787'
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      input: {
        gallery: fileURLToPath(new URL('./index.html', import.meta.url)),
        image25: fileURLToPath(new URL('./gpt-image-2-5/index.html', import.meta.url))
      }
    }
  }
});
