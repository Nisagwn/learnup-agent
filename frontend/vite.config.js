import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Dev sunucusu: '/api' → learnup-brain (Bun) backend'e proxy'lenir.
  // Böylece frontend kodu her ortamda relative '/api' kullanır:
  //   • dev  → buradaki proxy (localhost:8080)
  //   • prod → nginx '/api' proxy (docker-compose)
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
