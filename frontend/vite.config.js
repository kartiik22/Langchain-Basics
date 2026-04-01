import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Lets frontend call /api/chat during dev without CORS setup.
    proxy: {
      "/api": "http://localhost:4000",
    },
  },
})
