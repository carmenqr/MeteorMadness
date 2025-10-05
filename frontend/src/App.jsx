// App.jsx
import { Suspense, lazy } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import Mascot from './components/Mascot'

import scientistBot from './assets/aliviado.png'
import impactBot from './assets/sad_robot.png';

const HomePage = lazy(() => import('./pages/HomePage.jsx'))
const Impact = lazy(() => import('./pages/Impact.jsx'))
const Mitigation = lazy(() => import('./pages/Mitigation.jsx'))

export default function App() {
  const location = useLocation()
  const isMitigation = location.pathname.startsWith('/mitigation')
  const isImpact = location.pathname.startsWith('/impact');

  const sprite =
    isMitigation ? scientistBot :
      isImpact ? impactBot :
        undefined;

  const messages = isMitigation
    ? [
      "Tip: If you have years of warning, start with deflection.",
      "Short notice? Civil protection is critical.",
      "Kinetic impactors need time and precise targeting.",
      "Fragmentation reduces energy but spreads debris.",
      "Lasers trade raw force for precision and control.",
    ]
    : [
      "Tip: In the Impact view you can compare crater estimates by changing mass and speed.",
      "Did you know? Shockwaves scale roughly with energy ~ ½·m·v².",
      "Use the Mitigation tab to explore what-if strategies.",
    ]

  return (
    <>
      <Suspense fallback={<div style={{ padding: 16 }}>Cargando…</div>}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/impact" element={<Impact />} />
          <Route path="/mitigation" element={<Mitigation />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>

      <Mascot
        spriteSrc={sprite}
        messages={messages}
        auto={false}
        minDelayMs={15000}
        maxDelayMs={30000}
        showMs={5000}
        storageKey={isMitigation ? 'mascot-mitigation' : 'mascot-default'}
        allowRepeat={false}
        eventName="mascot:message"
        variant="rpgRight"
      />
    </>
  )
}
