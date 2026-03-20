import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/auth': 'http://api:4000',
      '/spotify': 'http://api:4000',
      '/requests': 'http://api:4000',
      '/settings': 'http://api:4000',
      '/tiktok': 'http://api:4000',
      '/health': 'http://api:4000',
    },
  },
});
