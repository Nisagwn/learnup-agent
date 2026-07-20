import './index.css'
// KaTeX'in kendi stili — formüller bunsuz ÇİZİLİR ama üst/alt indis, kesir çizgisi ve
// kök işareti yerine oturmaz (KaTeX konumlandırmayı CSS'e bırakır). Paket kuruluydu,
// bu satır yoktu: yani "katex var" görünüp matematik yine bozuk çıkıyordu.
import 'katex/dist/katex.min.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './lib/auth'
import { ThemeProvider } from './lib/theme'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>,
)
