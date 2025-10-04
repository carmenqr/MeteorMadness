import { useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

export default function HomePage() {
  const navigate = useNavigate()
  const location = useLocation()
  const mountRef = useRef(null)

  useEffect(() => {
    let alive = true
    let stop = () => {}

    ;(async () => {
      try {
        const { runHomeSimulation } = await import('../simulation/home.js')
        if (!alive) return
        const cleanupFn = await runHomeSimulation(mountRef.current)
        if (alive && typeof cleanupFn === 'function') stop = cleanupFn
      } catch (e) {
        console.error('Error iniciando escena:', e)
      }
    })()

    const handler = e => navigate(e.detail)
    window.addEventListener('panel:navigate', handler)

    return () => {
      alive = false
      window.removeEventListener('panel:navigate', handler)
      try { stop() } catch {}
    }
  // IMPORTANTE: forzar reintento cuando se vuelve exactamente a "/"
  }, [navigate, location.pathname])

  return (
    <div
      ref={mountRef}
      style={{ position: 'absolute', inset: 0, background: 'black', overflow: 'hidden' }}
    />
  )
}