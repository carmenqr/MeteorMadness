import { Suspense, lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'

const HomePage = lazy(() => import('./pages/HomePage.jsx'))
const Impact = lazy(() => import('./pages/Impact.jsx'))

export default function App() {
  return (
    <Suspense fallback={<div style={{padding:16}}>Cargando…</div>}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/impacto" element={<Impact />} />
        {/* Si quieres que cualquier ruta desconocida vaya a la landing */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}

