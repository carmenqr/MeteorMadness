// src/pages/Mitigation.jsx
import React from "react";
import { useNavigate } from "react-router-dom";

/**
 * Mitigation Page — NASA-style educational layout
 * - Accessible accordions (<details>/<summary>) collapsed by default
 * - Lightweight SVG illustrations (replace with real images if you prefer)
 * - "Back to Home" button on the top-right
 * - Responsive, clean UI with zero external deps
 */
export default function Mitigation() {
  const navigate = useNavigate();

  return (
    <div style={styles.page}>
      {/* Header */}
      <header style={styles.header}>
        <h1 style={styles.title}>Asteroid Impact Mitigation</h1>
        <button style={styles.homeBtn} onClick={() => navigate("/")}>
          Back to Home
        </button>
      </header>

      {/* Intro */}
      <section style={styles.leadWrap}>
        <p style={styles.lead}>
          <strong>We’re glad you’ve chosen to mitigate the asteroid impact!</strong>&nbsp;
          Below are established strategies studied in planetary defense. Click each card to expand.
        </p>
      </section>

      {/* Accordions */}
      <main style={styles.main}>
        <AccordionCard
          title="Deflection (Kinetic Impactor)"
          summary="A small spacecraft strikes the asteroid to slightly change its orbit—like billiard balls."
          image={<KineticImpactorSVG />}
        >
          <p>
            A small spacecraft is sent to collide with the asteroid and nudge its orbit. Estimated cost:
            <em> US$100–600 million</em>. It typically requires about a decade of lead time and is most
            effective for medium-sized asteroids (<strong>&lt; 300 m</strong> in diameter). This approach was
            demonstrated by NASA’s <strong>DART mission (2022)</strong>.
          </p>
        </AccordionCard>

        <AccordionCard
          title="Nuclear Disruption"
          summary="Detonate one or more nuclear devices on or near the asteroid to fragment it."
          image={<NuclearSVG />}
        >
          <p>
            One or more nuclear devices are detonated on/near the asteroid to break it apart. Estimated cost:
            <em> &gt; US$500 million</em>. This is a last-resort option due to serious, hard-to-predict
            consequences and geopolitical concerns. Considered for bodies <strong>&gt; 300 m</strong> with
            extremely short warning times.
          </p>
        </AccordionCard>

        <AccordionCard
          title="Laser Ablation"
          summary="High-energy laser pulses vaporize material and create a gentle, precise thrust."
          image={<LaserSVG />}
        >
          <p>
            High-energy laser pulses slowly alter the asteroid’s trajectory by ejecting vaporized material.
            Estimated cost: <em>&gt; US$1 billion</em>. It offers high precision and low operational risk and
            is best suited for asteroids <strong>&lt; 300 m</strong>. Laboratory studies suggest technical
            feasibility for gradual deflection.
          </p>
        </AccordionCard>

        <AccordionCard
          title="Failure to Mitigate / Civil Protection"
          summary="If mitigation risks outweigh benefits, focus on evacuation, shelters, and public safety."
          image={<ShelterSVG />}
        >
          <p>
            Sometimes the cure is worse than the disease. If mitigation risks and costs exceed expected
            damage, emphasize <strong>evacuation, early warning, shelters/bunkers</strong>, and emergency
            management—especially for late-warning, small-to-medium events or airbursts.
          </p>
        </AccordionCard>
      </main>

      {/* Footer */}
      <footer style={styles.footer}>
        <small>
          Educational mock page inspired by NASA-style outreach. Replace the SVGs with your own assets if
          desired.
        </small>
      </footer>
    </div>
  );
}

/* ---------- Components ---------- */

function AccordionCard({ title, summary, image, children }) {
  return (
    <details style={styles.card}>
      <summary style={styles.cardSummary}>
        <div style={styles.summaryText}>
          <h2 style={styles.cardTitle}>{title}</h2>
          <p style={styles.cardSubtitle}>{summary}</p>
        </div>
        <span style={styles.chevron} aria-hidden>
          ▾
        </span>
      </summary>

      <div style={styles.cardBody}>
        <div style={styles.cardMedia}>{image}</div>
        <div style={styles.cardContent}>{children}</div>
      </div>
    </details>
  );
}

/* ---------- Simple SVG placeholders ---------- */

function KineticImpactorSVG() {
  return (
    <svg viewBox="0 0 240 140" role="img" aria-label="Kinetic impactor illustration" style={styles.svg}>
      <defs>
        <radialGradient id="g1" cx="35%" cy="40%" r="65%">
          <stop offset="0%" stopColor="#ffe9a9" />
          <stop offset="100%" stopColor="#f6b73c" />
        </radialGradient>
      </defs>
      <circle cx="180" cy="70" r="28" fill="url(#g1)" />
      <circle cx="180" cy="70" r="28" fill="none" stroke="#9b6a1d" strokeDasharray="2 4" />
      <rect x="40" y="62" width="30" height="16" rx="3" fill="#9ad5ff" stroke="#2a6ea8" />
      <polygon points="70,70 90,70 80,65" fill="#2a6ea8" />
      <line x1="40" y1="30" x2="140" y2="110" stroke="#ccd9e2" strokeDasharray="4 6" />
      <line x1="60" y1="20" x2="200" y2="120" stroke="#e4eef5" strokeDasharray="4 6" />
    </svg>
  );
}

function NuclearSVG() {
  return (
    <svg viewBox="0 0 240 140" role="img" aria-label="Nuclear disruption illustration" style={styles.svg}>
      <circle cx="120" cy="70" r="22" fill="#5b4a3a" />
      <circle cx="120" cy="70" r="22" fill="none" stroke="#d3c7bf" strokeDasharray="3 5" />
      <circle cx="120" cy="70" r="6" fill="#ffc857" />
      <g stroke="#ffed89" strokeWidth="3">
        <line x1="120" y1="10" x2="120" y2="38" />
        <line x1="120" y1="102" x2="120" y2="130" />
        <line x1="10" y1="70" x2="38" y2="70" />
        <line x1="202" y1="70" x2="230" y2="70" />
        <line x1="35" y1="25" x2="55" y2="45" />
        <line x1="185" y1="95" x2="205" y2="115" />
        <line x1="35" y1="115" x2="55" y2="95" />
        <line x1="185" y1="45" x2="205" y2="25" />
      </g>
    </svg>
  );
}

function LaserSVG() {
  return (
    <svg viewBox="0 0 240 140" role="img" aria-label="Laser ablation illustration" style={styles.svg}>
      <circle cx="185" cy="70" r="26" fill="#6b5b95" />
      <circle cx="185" cy="70" r="26" fill="none" stroke="#cabbe9" strokeDasharray="2 4" />
      <defs>
        <linearGradient id="beam" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#a0c4ff" />
        </linearGradient>
      </defs>
      <rect x="30" y="64" width="95" height="12" rx="6" fill="url(#beam)" />
      <polygon points="125,70 170,70 155,62" fill="#a0c4ff" />
      <rect x="15" y="58" width="20" height="24" rx="3" fill="#2b2d42" />
    </svg>
  );
}

function ShelterSVG() {
  return (
    <svg viewBox="0 0 240 140" role="img" aria-label="Civil protection illustration" style={styles.svg}>
      <rect x="30" y="75" width="180" height="40" rx="6" fill="#9db4c0" />
      <polygon points="30,75 120,40 210,75" fill="#6c7a89" />
      <rect x="60" y="88" width="30" height="27" fill="#eef2f5" />
      <rect x="150" y="88" width="30" height="27" fill="#eef2f5" />
      <circle cx="205" cy="35" r="12" fill="#ffd166" />
    </svg>
  );
}

/* ---------- Styles ---------- */

const styles = {
  page: {
    minHeight: "100vh",
    color: "#e9f2ff",
    background:
      "radial-gradient(1200px 600px at 70% -10%, #122a4a 0%, #0d1e36 35%, #0a1730 60%, #071226 100%)",
    fontFamily: "'Inter', system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
    lineHeight: 1.55,
    paddingBottom: "48px",
  },
  header: {
    position: "sticky",
    top: 0,
    zIndex: 5,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "20px 24px",
    background: "linear-gradient(180deg, rgba(5,12,24,0.85) 0%, rgba(5,12,24,0.55) 100%)",
    backdropFilter: "blur(8px)",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
  },
  title: {
    margin: 0,
    fontSize: "24px",
    letterSpacing: "0.5px",
    fontWeight: 700,
  },
  homeBtn: {
    border: "1px solid rgba(255,255,255,0.2)",
    background: "rgba(255,255,255,0.06)",
    color: "#e9f2ff",
    padding: "10px 14px",
    borderRadius: "10px",
    cursor: "pointer",
    fontWeight: 600,
    transition: "all .2s ease",
  },
  leadWrap: {
    maxWidth: 940,
    margin: "24px auto 0",
    padding: "0 20px",
  },
  lead: {
    margin: 0,
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.08)",
    padding: "16px 18px",
    borderRadius: 12,
  },
  main: {
    maxWidth: 940,
    margin: "24px auto 0",
    padding: "0 20px",
    display: "grid",
    gap: "16px",
  },
  card: {
    borderRadius: 14,
    overflow: "hidden",
    border: "1px solid rgba(255,255,255,0.08)",
    background: "linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.03))",
  },
  cardSummary: {
    listStyle: "none",
    display: "flex",
    gap: 16,
    alignItems: "center",
    justifyContent: "space-between",
    padding: "16px 18px",
    cursor: "pointer",
    userSelect: "none",
    position: "relative",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
  },
  summaryText: {
    display: "grid",
    gap: 4,
  },
  cardTitle: {
    margin: 0,
    fontSize: 18,
    fontWeight: 700,
  },
  cardSubtitle: {
    margin: 0,
    opacity: 0.85,
    fontSize: 14,
  },
  chevron: {
    fontSize: 18,
    opacity: 0.8,
    transition: "transform .2s ease",
  },
  cardBody: {
    display: "grid",
    gap: 16,
    padding: "16px 18px 18px",
    gridTemplateColumns: "minmax(220px, 320px) 1fr",
  },
  cardMedia: {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: 12,
    display: "grid",
    placeItems: "center",
    padding: 8,
  },
  cardContent: {
    display: "grid",
    gap: 10,
    fontSize: 15,
  },
  svg: {
    width: "100%",
    height: "auto",
    maxWidth: 320,
  },
  footer: {
    maxWidth: 940,
    margin: "24px auto 0",
    padding: "0 20px",
    opacity: 0.7,
  },
};

/* Tip:
   <details> toggles natively. If you want the chevron to rotate when open,
   move styles to a CSS file and add:
   details[open] summary span { transform: rotate(180deg); }
*/
