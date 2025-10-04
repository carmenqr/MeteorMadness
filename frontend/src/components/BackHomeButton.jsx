import { useNavigate } from 'react-router-dom'

export default function BackHomeButton({ children = '⟵ Volver a inicio' }) {
  const navigate = useNavigate()
  return (
    <button
      onClick={() => navigate('/')}
      style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ccc', cursor: 'pointer' }}
      aria-label="Volver a inicio"
      title="Volver a inicio"
    >
      {children}
    </button>
  )
}