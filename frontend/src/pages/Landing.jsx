import { useNavigate } from 'react-router-dom'
import { useCallback, useState, useEffect } from 'react'

export default function Landing() {
  const navigate = useNavigate()
  const [visited, setVisited] = useState(false)

  useEffect(() => {
    setVisited(localStorage.getItem('visited') === '1')
  }, [])

  const handleEntrar = useCallback(() => {
    localStorage.setItem('visited', '1')
    setVisited(true)
    navigate('/impacto')
  }, [navigate])

  return (
    <main style={{ padding: 24 }}>
      <h1>Meteor Madness</h1>
      <p>Simulador de impacto con datos reales (NASA/USGS).</p>

      <button onClick={handleEntrar}>
        {visited ? 'Volver a la simulación' : 'Entrar'}
      </button>

      {visited && (
        <button
          style={{ marginLeft: 12 }}
          onClick={() => {
            localStorage.removeItem('visited')
            setVisited(false)
          }}
        >
          Reset estado
        </button>
      )}
    </main>
  )
}