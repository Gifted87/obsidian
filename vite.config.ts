import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      watch: {
        ignored: ['**/sandbox_workspace/**', '**/memory/**', '**/logs/**'],
      },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      proxy: {
        // All /api/* requests are proxied from the Vite dev server (running inside WSL)
        // to the Express backend. This avoids the Windows→WSL localhost relay breaking
        // whenever the backend is restarted.
        '/api': {
          target: 'http://127.0.0.1:3030',
          changeOrigin: true,
          ws: true, // proxy WebSocket/SSE connections too
        },
      },
    },
  };
});
