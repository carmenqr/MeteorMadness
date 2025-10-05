import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";

import deflectionImg from "../assets/deflection.png";
import nuclearImg from "../assets/nucleardestruction.png";
import laserImg from "../assets/laser.png";
import evacuationImg from "../assets/evacuation.png";
import { mascotSay } from "../utils/mascotBus";
import alivado from '../assets/aliviado.png'

export default function Mitigation() {
  const navigate = useNavigate();

  useEffect(() => {
    mascotSay("We’re glad you’ve chosen to mitigate the asteroid impact!");

    const timer = setTimeout(() => {
      mascotSay("Below are established strategies studied in planetary defense. Click each card to expand.");
    }, 5000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <h1 style={styles.title}>Asteroid Impact Mitigation</h1>
        <button style={styles.homeBtn} onClick={() => navigate("/")}>
          Back to Home
        </button>
      </header>

      <main style={styles.main}>
        <AccordionCard
          title="Deflection (Kinetic Impactor)"
          summary="A small spacecraft strikes the asteroid to slightly change its orbit—like billiard balls."
          image={<ImgCard src={deflectionImg} alt="Kinetic impactor deflecting an asteroid away from Earth" />}
          facts={[
            { label: "Estimated cost", value: "US$100–600M" },
            { label: "Lead time", value: "≈ 5–10+ years" },
            { label: "Best for size", value: "< 300 m diameter" },
            { label: "Tech status", value: "Demo: NASA DART (2022)" },
            { label: "Risk level", value: "Low–moderate (precision, timing)" },
          ]}
        >
          <p>
            A kinetic impactor collides with the asteroid to slightly alter its velocity (Δv), causing a
            cumulative trajectory shift over time. Most effective with long warning times and
            well-characterized orbits.
          </p>
        </AccordionCard>

        <AccordionCard
          title="Nuclear Disruption"
          summary="Detonate one or more nuclear devices on or near the asteroid to fragment it."
          image={<ImgCard src={nuclearImg} alt="Near-asteroid nuclear burst fragmenting a large asteroid" />}
          facts={[
            { label: "Estimated cost", value: "> US$500M" },
            { label: "Lead time", value: "Months–years (operational)" },
            { label: "Best for size", value: "> 300 m or short notice" },
            { label: "Effect", value: "Fragmentation / intense ablation" },
            { label: "Risk level", value: "High (debris, geopolitics)" },
          ]}
        >
          <p>
            Considered a last-resort option for large bodies or very short warning scenarios. While it can
            rapidly reduce impact risk, fragmentation can create multiple hazardous pieces and has
            significant geopolitical and policy implications.
          </p>
        </AccordionCard>

        <AccordionCard
          title="Laser Ablation"
          summary="High-energy laser pulses vaporize material and create a gentle, precise thrust."
          image={<ImgCard src={laserImg} alt="Spacecraft laser ablating asteroid surface producing a plume" />}
          facts={[
            { label: "Estimated cost", value: "> US$1B" },
            { label: "Lead time", value: "Years (build & ops)" },
            { label: "Best for size", value: "< 300 m diameter" },
            { label: "Control", value: "High precision, gradual Δv" },
            { label: "Risk level", value: "Low–moderate (power/thermal)" },
          ]}
        >
          <p>
            Continuous or pulsed lasers vaporize surface material, producing a reaction plume that nudges
            the asteroid. Attractive for precise control and low debris, but requires substantial power and
            long engagement durations.
          </p>
        </AccordionCard>

        <AccordionCard
          title="Failure to Mitigate / Civil Protection"
          summary="If mitigation risks outweigh benefits, focus on evacuation, shelters, and public safety."
          image={<ImgCard src={evacuationImg} alt="City map with arrows to safe zones illustrating evacuation plan" />}
          facts={[
            { label: "When to use", value: "Late warning, small–medium events, airbursts" },
            { label: "Lead time", value: "Hours–weeks" },
            { label: "Primary actions", value: "Evacuation, early warning, shelters" },
            { label: "Cost", value: "Variable (local to national scale)" },
            { label: "Risk level", value: "Context-dependent" },
          ]}
        >
          <p>
            Prioritize life safety and critical infrastructure: rapid alerts, evacuation routes, shelters
            (including blast and glass protection), and clear public messaging. Coordinate with emergency
            management and international agencies when needed.
          </p>
        </AccordionCard>
      </main>

      <footer style={styles.footer}>
        <small>
          Images on this page were AI-generated with <strong>Perplexity.ai</strong> using <strong>GPT-5</strong>.
        </small>
      </footer>
    </div>
  );
}

function AccordionCard({ title, summary, image, children, facts = [] }) {
  const onToggle = (e) => {
    if (e.currentTarget.open) {
      const msgMap = {
        "Deflection (Kinetic Impactor)": "Small push, big change — if you start early.",
        "Nuclear Disruption": "Powerful last resort — mind debris & policy.",
        "Laser Ablation": "Slow but precise; needs lots of power.",
        "Failure to Mitigate / Civil Protection": "Protect people first: alerts, shelters, evacuation.",
      };
      mascotSay(msgMap[title] || `Opened: ${title}`);
    }
  };

  return (
    <details style={styles.card} onToggle={onToggle}>
      <summary style={styles.cardSummary}>
        <div style={styles.summaryText}>
          <h2 style={styles.cardTitle}>{title}</h2>
          <p style={styles.cardSubtitle}>{summary}</p>
        </div>
        <span style={styles.chevron} aria-hidden>▾</span>
      </summary>

      <div style={styles.cardBody}>
        <div style={styles.cardMedia}>{image}</div>
        <div style={styles.cardContent}>
          {children}
          {facts.length > 0 && (
            <KeyFacts facts={facts} />
          )}
        </div>
      </div>
    </details>
  );
}

function KeyFacts({ facts }) {
  return (
    <div style={styles.factsWrap} role="list" aria-label="Key facts">
      {facts.map((f, i) => (
        <div key={i} style={styles.factsItem} role="listitem">
          <div style={styles.factLabel}>{f.label}</div>
          <div style={styles.factValue}>{f.value}</div>
        </div>
      ))}
    </div>
  );
}

function ImgCard({ src, alt }) {
  return (
    <img
      src={src}
      alt={alt}
      style={styles.svg}
      loading="lazy"
      decoding="async"
    />
  );
}

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
  factsWrap: {
    marginTop: 12,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
    gap: 10,
    padding: "10px 0 0",
    borderTop: "1px solid rgba(255,255,255,0.08)",
  },
  factsItem: {
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 8,
    padding: "8px 10px",
    background: "rgba(255,255,255,0.04)",
    display: "grid",
    gap: 4,
  },
  factLabel: {
    fontSize: 11,
    letterSpacing: "0.3px",
    opacity: 0.75,
    textTransform: "uppercase",
  },
  factValue: {
    fontSize: 14,
    fontWeight: 700,
    lineHeight: 1.3,
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
