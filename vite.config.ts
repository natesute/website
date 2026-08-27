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
  plugins: [
    {
      // Dev only: resolve /demos/<name>/ and /admin/ to their index.html like
      // static hosting does, instead of letting the SPA fallback swallow them.
      name: 'public-directory-index',
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          const url = req.url ?? '';
          if ((url.startsWith('/demos/') || url === '/admin/') && url.endsWith('/')) {
            req.url = url + 'index.html';
          }
          next();
        });
      },
    },
  ],
});





