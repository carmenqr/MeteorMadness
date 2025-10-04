import { useNavigate } from 'react-router-dom'

export default function ImpactButton({ children = 'Impact' }) {
  const navigate = useNavigate()
  return (
    <button
      onClick={() => navigate('/impact')}
      style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #ccc', cursor: 'pointer' }}
      aria-label="Go to impact page"
      title="Go to impact page"
    >
      {children}
    </button>
  )
}
