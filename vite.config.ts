import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'esnext',
  },
  server: {
    port: 3000,
  },
  // Handle SPA routing - serve index.html for all routes
  appType: 'spa',
});





