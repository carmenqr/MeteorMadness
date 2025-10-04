import { useEffect, useState } from 'react'
import { api } from '../services/api'
import ThreeScene from '../components/ThreeScene'
import BackHomeButton from '../components/BackHomeButton'

export default function Impacto() {
  const [lista, setLista] = useState([])

  useEffect(() => {
    api.get('/asteroides')
      .then(r => setLista(r.data))
      .catch(() => setLista([]))
  }, [])

  return (
    <section style={{padding:16}}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <h1>Simulación de Impacto</h1>
        <BackHomeButton />
      </header>
      <p>Asteroides (backend Flask):</p>
      <ul>
        {lista.map(a => <li key={a.name}>{a.name} – a={a.a} e={a.e}</li>)}
      </ul>
      <div style={{height:400, border:'1px solid #ddd', marginTop:12}}>
        <ThreeScene />
      </div>
    </section>
  )
}
