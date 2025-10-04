import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

export default function HomePage() {
  const navigate = useNavigate()
  const mountRef = useRef(null)

  useEffect(() => {
    let stop = () => {};
    let alive = true;

    (async () => {
      try {
        const { runHomeSimulation } = await import('../simulation/home.js');
        if (!alive) return;
        const cleanupFn = await runHomeSimulation(mountRef.current);
        if (alive && typeof cleanupFn === 'function') {
          stop = cleanupFn;
        }
      } catch (e) {
        console.error('Error iniciando escena:', e);
      }
    })();

    const handler = e => navigate(e.detail);
    window.addEventListener('panel:navigate', handler);

    return () => {
      alive = false;
      window.removeEventListener('panel:navigate', handler);
      try { stop(); } catch {}
    };
  }, [navigate]);

  return (
    <div
      ref={mountRef}
      style={{ position: 'absolute', inset: 0, background: 'black', overflow: 'hidden' }}
    />
  )
}