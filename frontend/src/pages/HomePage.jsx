import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import '../simulation/home.js' // solo efectos

export default function HomePage() {
  const navigate = useNavigate()

  useEffect(() => {
    const handler = (e) => navigate(e.detail)
    window.addEventListener('panel:navigate', handler)
    return () => window.removeEventListener('panel:navigate', handler)
  }, [navigate])

  return null
}
