import { Suspense, lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'

const HomePage = lazy(() => import('./pages/HomePage.jsx'))
const Impact = lazy(() => import('./pages/Impact.jsx'))
const Mitigation = lazy(() => import('./pages/Mitigation.jsx'))

export default function App() {
  return (
    <Suspense fallback={<div style={{padding:16}}>Cargando…</div>}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/impact" element={<Impact />} />
        <Route path="/mitigation" element={<Mitigation />} />
        {/* Si quieres que cualquier ruta desconocida vaya a la landing */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}

