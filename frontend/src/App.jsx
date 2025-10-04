import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'

const Landing = lazy(() => import('./pages/Landing'))
const Impacto = lazy(() => import('./pages/Impacto'))
const Consecuencias = lazy(() => import('./pages/Consecuencias'))

const Loader = () => <div style={{padding:16}}>Cargando…</div>

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<Loader />}>
        <Routes>
          {/* Landing en la raíz */}
          <Route path="/" element={<Landing />} />

          {/* Rutas de la app */}
          <Route path="/impacto" element={<Impacto />} />
          <Route path="/consecuencias" element={<Consecuencias />} />

          {/* 404 */}
          <Route path="*" element={<div style={{padding:16}}>No encontrado</div>} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

