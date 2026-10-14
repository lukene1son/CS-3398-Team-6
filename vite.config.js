import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Forward /api/* to the Express backend so the frontend can use relative URLs
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})