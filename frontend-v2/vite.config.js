import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// frontend-v2 — YENİ arayüz. Eski `frontend/` ile aynı anda çalışabilsin diye port 5174.
// '/api' → learnup-brain (Bun, :8080) proxy'lenir → tarayıcı için same-origin, CORS derdi yok.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/api': { target: 'http://localhost:8080', changeOrigin: true },
    },
  },
})
