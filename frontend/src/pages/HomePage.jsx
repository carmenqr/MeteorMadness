import { useEffect, useRef } from 'react'
import runHomeSimulation from '../simulation/home.js'

export default function HomePage() {
  const cleanupRef = useRef(null)

  useEffect(() => {
    // Montamos la simulación en pantalla completa (añade su propio contenedor a <body>)
    cleanupRef.current = runHomeSimulation({
      apiBase: import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:5000',
      fullscreen: true
    })
    return () => cleanupRef.current?.()
  }, [])

  // Nada de JSX — escena ocupa toda la pantalla
  return null
}