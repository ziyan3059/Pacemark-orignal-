import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // Live reload is turned off when DISABLE_HMR is set to prevent screen flicker.
      hmr: process.env.DISABLE_HMR !== 'true',
      // File watching is turned off with HMR to reduce CPU usage.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
