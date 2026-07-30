import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// frontend-v2 — YENİ arayüz. Eski `frontend/` ile aynı anda çalışabilsin diye port 5174.
// '/api' → learnup-brain (Bun, :8080) proxy'lenir → tarayıcı için same-origin, CORS derdi yok.
export default defineConfig({
  plugins: [react()],
  build: {
    sourcemap: true,
    rollupOptions: {
      output: {
        // Ağır kütüphaneler ayrı vendor chunk'larında: ana bundle küçülür, cache isabeti artar.
        // Atama tek FONKSİYONLA yapılır (aşağıdaki `name(id)`) — tarihçe ve NEDEN'ler:
        // · GOREV-005: atama Object değil FONKSİYON (Object formu vite 8/rolldown'da kırıktı).
        // · GOREV-030: `scheduler` react-dom↔fiber paylaşımı yüzünden vendor-three'ye hoist
        //   ediliyordu → kabuk 900 kB three'yi eager çekiyordu; açık atamayla sabitlendi.
        // · GOREV-033 (ÖLÇÜLDÜ, kanıt kartta): deprecated manualChunks-COMPAT, grup üyelerinin
        //   bağımlılıklarını ÖZYİNELEMELİ yakalıyor ve fonksiyonun dönüşünü eziyordu — react
        //   çekirdeği recharts'ın bağımlılığı diye vendor-charts'a, jsx-runtime react-markdown'ın
        //   bağımlılığı diye vendor-katex'e gidiyor, EAGER kabuk jsx için 390 kB katex + createRoot
        //   için 397 kB charts indiriyordu. manualChunks + advancedChunks birlikte verilince de
        //   manualChunks TAMAMEN yok sayılıyor (vendor split çöküyor). Bu yüzden AYNI atama
        //   fonksiyonu rolldown-native advancedChunks grubunun `name` fonksiyonu olarak taşındı:
        //   kapsam birebir; react ailesi artık küçük eager vendor-react'te. Object formuna DÖNME.
        advancedChunks: {
          groups: [
            // GRUP 1 — ÖNCELİKLİ (dizi sırası = öncelik): çekirdek react ailesi + ekosistem
            // şimleri tek küçük EAGER vendor'da. Ayrı ve ÖNDE olması şart: tek grupta
            // birleşince aşağıdaki grupların özyinelemeli bağımlılık yakalaması react'i
            // kendine çekiyor (ölçüldü — kanıt kartta).
            {
              name(id) {
                if (/node_modules[/\\](react|react-dom|scheduler|react-is|use-sync-external-store)[/\\]/.test(id)) return 'vendor-react'
                // EAGER kod ile lazy vendor'ların PAYLAŞTIĞI mikro yardımcılar. Grup 2'ye
                // yakalanırlarsa eager kabuk o vendor'ı ilk boyada indirir (ölçüldü: clsx
                // recharts'ın bağımlılığı diye vendor-charts'a gitti → eager cn 384 kB
                // charts'ı çekti). Küçük ortak chunk bu zinciri kırar.
                if (/node_modules[/\\]clsx[/\\]/.test(id)) return 'vendor-shared'
                return undefined
              },
            },
            // GRUP 2 — ağır kütüphane aileleri (üye bağımlılıkları grup semantiğiyle birlikte gelir:
            // d3/victory recharts'la, unified/micromark ailesi react-markdown'la aynı chunk'ta kalır).
            {
              name(id) {
                if (!id.includes('node_modules')) return undefined
                if (/node_modules[/\\](three|@react-three)[/\\]/.test(id)) return 'vendor-three'
                if (/node_modules[/\\](katex|react-markdown|remark-math|rehype-katex)[/\\]/.test(id)) return 'vendor-katex'
                if (/node_modules[/\\]recharts[/\\]/.test(id)) return 'vendor-charts'
                if (/node_modules[/\\]framer-motion[/\\]/.test(id)) return 'vendor-motion'
                return undefined
              },
            },
          ],
        },
      },
    },
  },
  server: {
    port: 5174,
    proxy: {
      '/api': { target: 'http://localhost:8080', changeOrigin: true },
    },
  },
})
