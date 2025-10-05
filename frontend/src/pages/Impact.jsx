import { useEffect, useRef, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// traer los parámetros del formulario
import { calcularImpacto } from "../simulation/impact-utils.js";

// === FIXED seismic efficiency (read-only) ===
const ETA_SEISMIC = 0.10; // 10%

/* ---------- THEME: Dark glassy (matching Mitigation) ---------- */
const DRAWER_WIDTH = 360;

const styles = {
  appWrap: { position: "fixed", inset: 0 },
  map: {
    position: "absolute", inset: 0, width: "100%", height: "100%",
    background: "#061224"
  },
  // --- NUEVOS estilos para tooltips educativos ---
  infoRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6
  },
  infoLabel: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontWeight: 600
  },
  infoValue: {
    color: "#cfe8ff",
    fontWeight: 500
  },
  helpIcon: {
    display: "inline-block",
    width: 18,
    height: 18,
    borderRadius: "50%",
    background: "rgba(24,45,78,0.85)",
    color: "#e9f2ff",
    fontSize: 12,
    lineHeight: "18px",
    textAlign: "center",
    cursor: "pointer",
    position: "relative",
    border: "1px solid rgba(173,216,255,0.3)"
  },
  tooltip: {
    position: "absolute",
    left: "50%",
    bottom: "125%",
    transform: "translateX(-50%)",
    // estilo “glass card”
    background: "linear-gradient(180deg, rgba(13,25,48,0.95), rgba(8,18,36,0.92))",
    color: "#e9f2ff",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.12)",
    boxShadow: "0 12px 30px rgba(0,0,0,.45)",
    fontSize: 12.5,
    lineHeight: 1.45,
    whiteSpace: "normal",   // ✅ permite varias líneas
    maxWidth: 280,
    zIndex: 999,
    opacity: 1,
    transition: "opacity .2s ease",
    pointerEvents: "auto"
  },
  helpIconHover: {
    opacity: 1
  },


  // NUEVO: cabecera de sección plegable + botón
  sectionHeaderRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 6
  },
  sectionToggleBtn: {
    padding: "4px 10px",
    borderRadius: 8,
    border: "1px solid rgba(255,255,255,0.25)",
    background: "rgba(255,255,255,0.08)",
    color: "#e9f2ff",
    fontSize: 13,
    lineHeight: 1,
    cursor: "pointer",
  },

  // NUEVO: fila de pestañas (para Tsunami)
  tabsRow: {
    display: "flex",
    gap: 8,
    marginTop: 8,
    marginBottom: 8
  },
  tabBtn: {
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,0.20)",
    background: "rgba(255,255,255,0.06)",
    color: "#e9f2ff",
    fontSize: 12,
    cursor: "pointer"
  },
  tabBtnActive: {
    border: "1px solid rgba(173, 216, 255, 0.40)",
    background: "rgba(24, 45, 78, 0.85)",
  },

  // Tirador lateral visible cuando el panel está cerrado
  pullTab: {
    position: "absolute",
    left: 0,
    top: "50%",
    transform: "translateY(-50%)",
    zIndex: 1101,
    padding: "10px 8px",
    borderRadius: "0 10px 10px 0",
    border: "1px solid rgba(173, 216, 255, 0.35)",
    borderLeft: "none",
    background: "rgba(24, 45, 78, 0.85)",
    color: "#e9f2ff",
    cursor: "pointer",
    font: "13px/1 Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
    backdropFilter: "blur(6px)",
    boxShadow: "0 4px 12px rgba(0,0,0,.3)",
  },

  // Botón flotante de ayuda (cuando el panel está cerrado)
  helpFab: {
    position: "absolute",
    top: 12,
    right: 12,
    zIndex: 1100,
    width: 36,
    height: 36,
    borderRadius: 8,
    border: "1px solid rgba(173, 216, 255, 0.35)",
    background: "rgba(24, 45, 78, 0.85)",
    color: "#e9f2ff",
    fontWeight: 800,
    fontSize: 18,
    lineHeight: "36px",
    textAlign: "center",
    cursor: "pointer",
    backdropFilter: "blur(6px)",
    boxShadow: "0 6px 18px rgba(0,0,0,.35)"
  },

  // Cabecera del panel de ayuda (título + cerrar)
  helpHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 6
  },
  helpCloseBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    border: "1px solid rgba(255,255,255,0.25)",
    background: "rgba(255,255,255,0.10)",
    color: "#e9f2ff",
    fontSize: 16,
    fontWeight: 700,
    lineHeight: "26px",
    textAlign: "center",
    cursor: "pointer"
  },

  // Cuadro de ayuda reutiliza titleBox
  titleBox: {
    position: "absolute",
    top: 56,
    right: 12,
    background: "linear-gradient(180deg, rgba(13,25,48,0.90), rgba(8,18,36,0.85))",
    color: "#e9f2ff",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.08)",
    boxShadow: "0 12px 30px rgba(0,0,0,.35)",
    font: "14px/1.35 Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
    zIndex: 1000,
    maxWidth: 380
  },

  drawer: {
    position: "absolute",
    top: 0,
    width: DRAWER_WIDTH,
    height: "100%",
    transition: "transform .25s ease",
    background:
      "linear-gradient(180deg, rgba(16,28,52,0.85) 0%, rgba(9,19,36,0.85) 100%)",
    color: "#e9f2ff",
    boxShadow: "0 18px 40px rgba(0,0,0,.45)",
    padding: 14,
    overflowY: "auto",
    font: "14px/1.55 Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
    borderRight: "1px solid rgba(255,255,255,0.08)",
    zIndex: 1000,
    pointerEvents: "auto",
    willChange: "transform",
    left: 0
  },

  sectionTitle: { fontWeight: 700, margin: "6px 0 10px", letterSpacing: ".2px" },
  subTitle: { fontWeight: 600, marginBottom: 6 },

  // Fila de cabecera del panel y botón de toggle
  headerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  headerToggleBtn: {
    padding: "4px 10px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.25)",
    background: "rgba(255,255,255,0.08)",
    color: "#e9f2ff",
    cursor: "pointer",
    fontSize: 14,
    lineHeight: 1,
  },

  card: {
    border: "1px solid rgba(255,255,255,0.08)",
    background: "linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.03))",
    borderRadius: 12,
    padding: 10
  },
  softNote: {
    fontSize: 12,
    color: "#ffd79a",
    background: "rgba(255, 196, 65, 0.06)",
    border: "1px solid rgba(255, 196, 65, 0.25)",
    padding: 8,
    borderRadius: 8
  },
  dividerTop: { marginTop: 10, borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 10 },

  grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 },

  button: {
    fontSize: 12, padding: "6px 10px", borderRadius: 10, cursor: "pointer",
    border: "1px solid rgba(255,255,255,0.20)", background: "rgba(255,255,255,0.06)",
    color: "#e9f2ff"
  },
  buttonGhost: {
    fontSize: 12, padding: "6px 10px", borderRadius: 10, cursor: "pointer",
    border: "1px solid rgba(255,255,255,0.20)", background: "transparent", color: "#e9f2ff"
  },

  mmiGrid: { display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 },
  mmiBtn: (selected, color) => ({
    padding: "6px 0",
    borderRadius: 8,
    border: selected ? "2px solid #e9f2ff" : "1px solid rgba(255,255,255,0.2)",
    background: color,
    cursor: "pointer",
    fontWeight: 700,
    color: "#071226",
    textShadow: "0 1px 0 rgba(255,255,255,.25)"
  }),

  infoToggle: {
    fontSize: 12, padding: "6px 8px", borderRadius: 8,
    border: "1px solid rgba(255,255,255,0.20)", background: "rgba(255,255,255,0.06)",
    color: "#e9f2ff", cursor: "pointer"
  },
  infoBody: {
    marginTop: 8,
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 10, padding: 10, fontSize: 13, lineHeight: 1.45, color: "#e9f2ff"
  },

  tableWrap: { border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, overflow: "hidden" },
  thead: { background: "rgba(255,255,255,0.05)", color: "#e9f2ff" },
  th: { textAlign: "left", padding: "6px 8px" },
  thRight: { textAlign: "right", padding: "6px 8px" },
  tr: { borderTop: "1px solid rgba(255,255,255,0.06)" },
  td: { padding: "6px 8px" },
  tdRight: { padding: "6px 8px", textAlign: "right" },

  badge: (level) => {
    const base = {
      display: "inline-block",
      padding: "4px 8px",
      borderRadius: 8,
      fontWeight: 700,
      fontSize: 12,
      border: "1px solid rgba(255,255,255,0.10)",
      color: "#e9f2ff"
    };
    const palettes = {
      warning: { background: "rgba(220,38,38,.25)" },
      watch: { background: "rgba(234,88,12,.25)" },
      advisory: { background: "rgba(14,165,233,.25)" },
      no_threat: { background: "rgba(16,185,129,.25)" },
      info: { background: "rgba(148,163,184,.25)" }
    };
    return { ...base, ...(palettes[level] || palettes.info) };
  },

  dimBox: { padding: 6, borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.05)" },
  dimBoxNote: { fontSize: 12, opacity: .75, marginTop: 4 },

  img: {
    width: "100%", height: "auto", display: "block", borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)"
  }
};



/* ---------- Original logic & helpers (unchanged) ---------- */

// --- MMI palette / descriptions adapted for impact shaking ---
// --- MMI palette / descriptions adapted for impact shaking (high contrast for dark theme) ---
const mmiBreaks = [
  { max: 1.9, label: "I", color: "#a6d4fa", desc: "Not felt / instrumental detection only." },
  { max: 2.9, label: "II", color: "#7cc4f7", desc: "Very weak: felt by a few people at rest." },
  { max: 3.9, label: "III", color: "#49b4f5", desc: "Weak: like the passing of a light truck." },
  { max: 4.9, label: "IV", color: "#20a0d8", desc: "Light: noticeable shaking of windows/objects." },
  { max: 5.9, label: "V", color: "#1b8cbd", desc: "Moderate: unstable objects may topple." },
  { max: 6.4, label: "VI", color: "#188a6f", desc: "Strong: items fall; slight structural damage." },
  { max: 6.9, label: "VII", color: "#1b8a2e", desc: "Very strong: moderate damage; people alarmed." },
  { max: 7.4, label: "VIII", color: "#ffb347", desc: "Severe: damage to structures; heavy furniture moves." },
  { max: 7.9, label: "IX", color: "#ff7043", desc: "Violent: considerable damage; buildings shifted." },
  { max: 10, label: "X+", color: "#d32f2f", desc: "Extreme: destruction; widespread ground failure." }
];

const labelOrder = mmiBreaks.map(b => b.label);
const lastBreak = mmiBreaks[mmiBreaks.length - 1];
const colorForMMI = (v) => (mmiBreaks.find(b => v <= b.max)?.color ?? lastBreak.color);
const labelForMMI = (v) => (mmiBreaks.find(b => v <= b.max)?.label ?? lastBreak.label);
const descForLabel = (lab) => mmiBreaks.find(b => b.label === lab)?.desc ?? "—";

async function fetchJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} while loading ${url}`);
  return r.json();
}
async function fetchText(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} while loading ${url}`);
  return r.text();
}

function MiniMarkdown({ text }) {
  const escape = (s) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = escape(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\n/g, "<br/>");
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}
function InfoNote({ title = "What is this?", children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginTop: 8 }}>
      <button onClick={() => setOpen(v => !v)} style={styles.infoToggle}>
        {open ? "Hide" : "Show"} {title}
      </button>
      {open && <div style={styles.infoBody}>{children}</div>}
    </div>
  );
}

const HELP = {
  mmi: `
**MMI (Modified Mercalli Intensity)** tells you how shaking is **felt** at the surface, from I (not felt) to X+ (destructive). It is **not** the earthquake magnitude — it is a **local experience** of shaking.

How to read:
• Pick an MMI level to highlight its contour (areas that feel roughly the same intensity).
• Intensity usually decreases as you move away from the source.
• Local ground conditions (soft soils, hills, basins) can make shaking stronger or weaker.

Teaching note: Here we use **USGS-style MMI contours** as a *proxy* for an asteroid impact to show the idea. A real impact run would compute shaking from the energy released by the impact and how waves travel through the ground.
`.trim(),
  exposure: `
**Population exposure** estimates how many people are inside each intensity band by overlaying the contours with population grids.

How to read the table:
• Each MMI row shows the estimated number of people under that intensity.
• “Total” is the sum across all bands.

Caveats: numbers depend on the population data used and the footprint of the shaking. In this demo, exposure is proxied from USGS PAGER products.
`.trim(),
  cities: `
**Affected cities** (if available) list large population centers near the source:
• **Population**: how big the city is.
• **MMI**: what intensity people there might feel.
• **Dist (km)**: distance from the source.

Use this list to see which cities could feel stronger shaking.
`.trim(),
  losses: `
**Human and economic risk** uses **empirical models** based on past events to estimate:
• **Fatalities** (binned into ranges).
• **Economic losses** (USD, also binned).

The alert histogram shows **uncertainty** — different ranges have different probabilities.

Interpretation tips:
• These are **ranges**, not precise predictions.
• Outcomes depend on building quality, infrastructure, and time of day, among other factors.

In this demo we show PAGER-style outputs for teaching. A full asteroid-impact system would also model shockwaves, overpressure, structural response, and more.
`.trim(),
  tsunami: `
This section shows a **tsunami bulletin** (static here due to CORS). Typical levels include **Warning**, **Watch**, **Advisory**, **Information**, or **No Tsunami Threat**.

How to read:
• **Header**: who issued the message and its number.
• **Evaluation**: whether there is a threat for listed regions.
• **Event details**: size, time, coordinates, depth, and location.
• **Updates**: whether to expect more messages.

Teaching note: We use a static example to explain the format. For real-time data in production, call tsunami.gov from your backend.
`.trim(),
  disclaimer: `
**Teaching note**: We use a real USGS event as a *stand-in* for an asteroid impact. Numbers and views (MMI, exposure, losses) illustrate the workflow. A full system would drive them from **impactor inputs** (size, speed, angle, density) and **local layers** (population, building vulnerability, terrain, coastlines).
`.trim(),
  howToUse: `
Quick guide:
1) Pick an **MMI band** to understand “what it would feel like”.
2) Check **exposure** to see how many people fall in each range.
3) Review **losses** to understand orders of magnitude and uncertainty.
4) Open the **tsunami bulletin** format when the source is coastal or in the ocean.
`.trim(),
  craterExplain: `
We estimate crater size from the **impactor's mass, density, and speed**, plus impact angle, the ground material, and gravity.

What matters most:
• **Bigger and faster impactors** excavate larger craters.
• **Denser impactors** (for the same mass) are usually **smaller in size** but more penetrating.
• **Shallow angles** spread energy over a wider area; **steeper angles** tend to dig deeper.
• **Target rock**: stronger, denser ground resists excavation; softer ground enlarges the crater.

We show: the **impactor diameter** (derived from mass and density), an estimate of the **transient crater**, and a **final crater** slightly larger after collapse.
`.trim(),
  fireExplain: `
Thermal radiation from an impact can ignite materials and cause burns near the source. The **fire ring** is a teaching circle that marks where thermal effects could become harmful.

What affects the ring:
• **Total energy**: more energy means a larger affected radius.
• **Fraction going into heat**: only part of the energy becomes thermal radiation.
• **Threshold for harm**: higher thresholds (e.g., needing more heat to ignite) produce smaller rings.
• **Air and visibility**: clouds, aerosols, or terrain can reduce how far heat travels.

Treat this as an educational approximation to visualize potential thermal reach.
`.trim(),
  shockExplain: `
A powerful impact sends out a **shock wave** in the air. The **shock ring** shows where the wave could be strong enough to damage windows, light structures, or cause injuries.

What controls the ring:
• **Energy release**: more energy pushes the damage zone outward.
• **Chosen threshold**: stricter thresholds for damage create smaller circles.
• **Atmospheric conditions**: wind, temperature, and terrain channel or weaken the wave.

The values here are simplified so you can explore how changing the impact strength shifts the possible damage radius.
`.trim()
};

// --- Helpers for PAGER/losspager ---
function findContentUrl(contents, patterns) {
  const keys = Object.keys(contents || {});
  for (const pat of patterns) {
    const re = new RegExp(pat, "i");
    const k = keys.find((key) => re.test(key));
    if (k && contents[k]?.url) return contents[k].url;
  }
  return null;
}
const numToMMI = (n) => {
  const map = { 1: "I", 2: "II", 3: "III", 4: "IV", 5: "V", 6: "VI", 7: "VII", 8: "VIII", 9: "IX", 10: "X+" };
  return map[n] || null;
};
function aggregateExposure(exposureJson) {
  const totals = {};
  labelOrder.forEach(l => (totals[l] = 0));
  const pe = exposureJson?.population_exposure;
  if (pe && Array.isArray(pe.mmi) && Array.isArray(pe.aggregated_exposure)) {
    pe.mmi.forEach((mmiNum, idx) => {
      const lab = numToMMI(Number(mmiNum));
      const val = Number(pe.aggregated_exposure[idx] ?? 0) || 0;
      if (lab && lab in totals) totals[lab] += val;
    });
    return totals;
  }
  const totalsObj =
    exposureJson?.total_population_exposure ||
    exposureJson?.population_exposure_totals ||
    exposureJson?.totals;
  if (totalsObj && typeof totalsObj === "object") {
    for (const [k, v] of Object.entries(totalsObj)) {
      const key = String(k).toUpperCase() === "X" ? "X+" : String(k).toUpperCase();
      if (key in totals) totals[key] += Number(v) || 0;
    }
    return totals;
  }
  if (Array.isArray(exposureJson?.exposures)) {
    exposureJson.exposures.forEach((r) => {
      const m = r.mmi ?? r.label ?? r.bin ?? r.level;
      const lab = typeof m === "number" ? numToMMI(m) : String(m || "").toUpperCase();
      const val = Number(r.population ?? r.pop ?? r.value ?? r.count) || 0;
      const labFixed = lab === "X" ? "X+" : lab;
      if (labFixed in totals) totals[labFixed] += val;
    });
    return totals;
  }
  if (exposureJson && typeof exposureJson === "object") {
    for (const [k, v] of Object.entries(exposureJson)) {
      const key = String(k).toUpperCase();
      const lab = key === "X" ? "X+" : key;
      if (lab in totals) totals[lab] += Number(v) || 0;
    }
  }
  return totals;
}
function normalizeCities(cityJson) {
  const arr = Array.isArray(cityJson?.cities) ? cityJson.cities
    : Array.isArray(cityJson) ? cityJson
      : [];
  return arr.map((c) => ({
    name: c.name ?? c.city ?? c.title ?? "—",
    country: c.country ?? c.cc ?? c.admin ?? "",
    population: Number(c.population ?? c.pop ?? c.pop2000 ?? c.pop2010 ?? 0),
    mmi: String(c.mmi ?? c.intensity ?? c.inten ?? c.shaking ?? "—").toUpperCase(),
    distance: Number(c.distance ?? c.dist ?? 0)
  }));
}
function parseLosses(lossesJson) {
  const fatalitiesTotal = Number(
    lossesJson?.empirical_fatality?.total_fatalities ?? 0
  );
  const dollarsTotal = Number(
    lossesJson?.empirical_economic?.total_dollars ?? 0
  );
  const perCountry = [];
  const fByCountry = lossesJson?.empirical_fatality?.country_fatalities ?? [];
  const $ByCountry = lossesJson?.empirical_economic?.country_dollars ?? [];
  const byCode = new Map();
  fByCountry.forEach((r) => {
    const code = r.country_code || "—";
    byCode.set(code, { code, fatalities: Number(r.fatalities || 0), dollars: 0 });
  });
  $ByCountry.forEach((r) => {
    const code = r.country_code || "—";
    const cur = byCode.get(code) || { code, fatalities: 0, dollars: 0 };
    cur.dollars = Number(r.us_dollars || 0);
    byCode.set(code, cur);
  });
  byCode.forEach((v) => perCountry.push(v));
  perCountry.sort((a, b) => (b.dollars || 0) - (a.dollars || 0));
  return { fatalitiesTotal, dollarsTotal, perCountry };
}

/** ============================
 *  CRÁTER
 *  ============================*/
function diameterFromMassDensity(massKg, densityKgM3) {
  if (!massKg || !densityKgM3) return null;
  const D = Math.pow((6 * massKg) / (Math.PI * densityKgM3), 1 / 3);
  return D; // m
}
function calcCraterFromInputs({
  massKg, densityKgM3, velocidadMps,
  targetDensity = 2500, angleDeg = 45, g = 9.81
}) {
  const Dimp = diameterFromMassDensity(massKg, densityKgM3);
  if (!Dimp || !velocidadMps) return null;
  const theta = (angleDeg * Math.PI) / 180;
  const Dtr =
    1.16 *
    Math.pow(densityKgM3 / targetDensity, 1 / 3) *
    Math.pow(Dimp, 0.78) *
    Math.pow(velocidadMps, 0.44) *
    Math.pow(g, -0.22) *
    Math.pow(Math.sin(theta), 1 / 3);
  const Dfin = 1.25 * Dtr;
  return { Dtr, Dfin, Dimp, angleDeg, targetDensity };
}

/** ============================
 *  FUEGO (dosis térmica ~ 1/R^2)
 *  ============================*/
function calcFireRingRadius({ energiaJ, fRad = 0.03, Qt_kJ_m2 = 8, attenuation = 1.0 }) {
  if (!energiaJ || energiaJ <= 0) return null;
  const Qt = Qt_kJ_m2 * 1000; // J/m^2
  const effE = energiaJ * fRad * attenuation;
  const R = Math.sqrt(effE / (4 * Math.PI * Qt)); // m
  if (!Number.isFinite(R) || R <= 0) return null;
  return { Rfire_m: R, fRad, Qt_kJ_m2, attenuation };
}

/** ============================
 *  ONDA DE CHOQUE (sobrepresión)
 *  ============================*/
const PSI_TO_KPA = 6.89476;
function peakOverpressure_kPa_from_Z(Z) {
  if (Z <= 0) return Infinity;
  const Ppsi = 8080 / (Z ** 3) + 114 / (Z ** 2) + 1 / Z;
  return Ppsi * PSI_TO_KPA;
}
function invertZforPressure_kPa(target_kPa) {
  if (!Number.isFinite(target_kPa) || target_kPa <= 0) return null;
  let lo = 0.02, hi = 50;
  for (let i = 0; i < 80; i++) {
    const mid = 0.5 * (lo + hi);
    const P = peakOverpressure_kPa_from_Z(mid);
    if (P > target_kPa) lo = mid; else hi = mid;
  }
  return 0.5 * (lo + hi);
}
function calcShockRingRadius({ energiaJ, Pth_kPa = 30 }) {
  if (!energiaJ || energiaJ <= 0) return null;
  const Wkg = energiaJ / 4.184e6;           // kg TNT equivalentes
  if (!Number.isFinite(Wkg) || Wkg <= 0) return null;
  const Z = invertZforPressure_kPa(Pth_kPa);
  if (!Z) return null;
  const R = Z * Math.cbrt(Wkg);             // metros
  const yield_kt = energiaJ / 4.184e12;     // kilotones TNT
  return { Rshock_m: R, Pth_kPa, yield_kt };
}

/** ============================
 *  MAGNITUD SÍSMICA (Mw) desde energía
 *  ============================*/
function mwFromEnergyJoules(Ej) {
  if (!Number.isFinite(Ej) || Ej <= 0) return null;
  return (2 / 3) * (Math.log10(Ej) - 4.8);
}
function mwFromImpactEnergy(energiaJ, etaSeismic = ETA_SEISMIC) {
  if (!Number.isFinite(energiaJ) || energiaJ <= 0) return null;
  if (!Number.isFinite(etaSeismic) || etaSeismic <= 0) return null;
  const Es = energiaJ * etaSeismic;
  return mwFromEnergyJoules(Es);
}

// --- Badge styling for tsunami status ---
const badgeStyle = (level) => {
  const base = {
    display: "inline-block",
    padding: "4px 8px",
    borderRadius: 8,
    fontWeight: 700,
    fontSize: 12,
    border: "1px solid #e5e7eb"
  };
  const palettes = {
    warning: { background: "#fee2e2", color: "#991b1b", border: "1px solid #fecaca" },
    watch: { background: "#ffedd5", color: "#9a3412", border: "1px solid #fed7aa" },
    advisory: { background: "#e0f2fe", color: "#075985", border: "1px solid #bae6fd" },
    no_threat: { background: "#ecfdf5", color: "#065f46", border: "1px solid #bbf7d0" },
    info: { background: "#f1f5f9", color: "#0f172a", border: "1px solid #e2e8f0" }
  };
  return { ...base, ...(palettes[level] || palettes.info) };
};

// --- Static tsunami bulletin (no CORS) ---
const STATIC_TSUNAMI_TXT = `WEXX32 PAAQ 250407
TIBATE

Tsunami Information Statement Number 1
NWS National Tsunami Warning Center Palmer AK
1207 AM AST Thu Sep 25 2025

...THIS IS A TSUNAMI INFORMATION STATEMENT FOR THE U.S. EAST COAST,
   GULF OF AMERICA STATES, AND EASTERN CANADA...

EVALUATION
----------
 * There is no tsunami danger for the U.S. east coast, the Gulf of 
   America states, or the eastern coast of Canada. 

 * Based on earthquake information and historic tsunami records, 
   the earthquake is not expected to generate a tsunami. 

 * An earthquake has occurred with parameters listed below. 


PRELIMINARY EARTHQUAKE PARAMETERS
---------------------------------

 * The following parameters are based on a rapid preliminary
   assessment of the earthquake and changes may occur.

 * Magnitude      6.4
 * Origin Time    2352  EDT Sep 24 2025
                  1152  AST Sep 24 2025
                  2252  CDT Sep 24 2025
                  0352  UTC Sep 25 2025
 * Coordinates    10.0 North 70.8 West
 * Depth          14 miles
 * Location       in Venezuela


ADDITIONAL INFORMATION AND NEXT UPDATE
--------------------------------------
 * Refer to the internet site tsunami.gov for more information. 

 * Caribbean coastal regions should refer to the Pacific 
   Tsunami Warning Center messages at tsunami.gov. 

 * This will be the only U.S. National Tsunami Warning Center 
   message issued for this event unless additional information 
   becomes available. 

$$`;

function ClickTip({ tip, label = "Help" }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);

  // Cerrar al hacer clic fuera
  useEffect(() => {
    function onDocClick(e) {
      if (!btnRef.current) return;
      if (!btnRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  // Cerrar con Esc
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <button
      ref={btnRef}
      type="button"
      style={{ ...styles.helpIcon, position: "relative" }}
      aria-haspopup="dialog"
      aria-expanded={open ? "true" : "false"}
      aria-label={label}
      onClick={() => setOpen((v) => !v)}
    >
      ?
      {open && (
        <div style={{ ...styles.tooltip, opacity: 1, pointerEvents: "auto", whiteSpace: "normal", maxWidth: 260 }}>
          {tip}
        </div>
      )}
    </button>
  );
}


export default function ImpactMMI() {
  const { eventId: routeEventId } = useParams();
  const eventId = routeEventId || "us6000rcqw"; // demo default

  const mapRef = useRef(null);
  const containerRef = useRef(null);
  const groupRef = useRef(null);
  const contoursLayerRef = useRef(null);

  // Ayuda flotante
  const [helpOpen, setHelpOpen] = useState(false);

  // Crater
  const craterLayerRef = useRef(null);
  const impactLatLonRef = useRef(null);
  const [craterVisible, setCraterVisible] = useState(false);

  // Fire
  const fireLayerRef = useRef(null);
  const [fireVisible, setFireVisible] = useState(false);
  const [fireParams, setFireParams] = useState(null);

  // Shock
  const shockLayerRef = useRef(null);
  const [shockVisible, setShockVisible] = useState(false);
  const [shockParams, setShockParams] = useState(null);

  // Inputs + crater dims
  const [impactInputs, setImpactInputs] = useState(null);
  const [craterDims, setCraterDims] = useState(null);

  // Mw equivalente (η fija)
  const [mwEquivalent, setMwEquivalent] = useState(null);

  const navigate = useNavigate();

  // UI state
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [selectedLabel, setSelectedLabel] = useState(null);
  const [impactInfo, setImpactInfo] = useState(null);

  const [mmiOpen, setMmiOpen] = useState(false);

  // PAGER state
  const [exposureTotals, setExposureTotals] = useState(null);
  const [cities, setCities] = useState([]);
  const [popLoading, setPopLoading] = useState(false);
  const [popError, setPopError] = useState(null);

  const [losses, setLosses] = useState(null);
  const [lossLoading, setLossLoading] = useState(false);
  const [lossError, setLossError] = useState(null);
  const [histUrls, setHistUrls] = useState({ fatal: null, econ: null });

  // Tsunami tabs
  const [tsuTab, setTsuTab] = useState("summary");

  // NUEVO: Estado de apertura/cierre por sección (todo cerrado por defecto)
  const [openSections, setOpenSections] = useState({
    form: false,
    mmi: false,
    population: false,
    losses: false,
    crater: false,
    fire: false,
    shock: false,
    tsunami: false,
  });
  const toggleSection = (key) =>
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));

  // 1) Cargar mapa una vez
  useEffect(() => {
    if (!mapRef.current && containerRef.current) {
      const map = L.map(containerRef.current, { zoomControl: true }).setView([20, 0], 2);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map);

      groupRef.current = L.featureGroup().addTo(map);
      mapRef.current = map;

      const invalidate = () => map.invalidateSize();
      setTimeout(invalidate, 0);
      window.addEventListener("resize", invalidate);

      return () => {
        window.removeEventListener("resize", invalidate);
        map.remove();
        mapRef.current = null;
        groupRef.current = null;
      };
    }
  }, []);

  // 2) Invalidate tras animación del drawer
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const t = setTimeout(() => map.invalidateSize(), 260);
    return () => clearTimeout(t);
  }, [drawerOpen]);

  // 3) Leer parámetros del formulario y calcular
  useEffect(() => {
    const res = calcularImpacto();
    setImpactInputs(res || null);

    if (res) {
      const crater = calcCraterFromInputs({
        massKg: res.masaKg,
        densityKgM3: res.densidadKgM3,
        velocidadMps: res.velocidadMps,
        targetDensity: 2500,
        angleDeg: 45,
        g: 9.81
      });
      setCraterDims(crater);

      const fire = calcFireRingRadius({ energiaJ: res.energiaJ, fRad: 0.03, Qt_kJ_m2: 8, attenuation: 1.0 });
      setFireParams(fire);

      const shock = calcShockRingRadius({ energiaJ: res.energiaJ, Pth_kPa: 30 });
      setShockParams(shock);

      setMwEquivalent(mwFromImpactEnergy(res.energiaJ, ETA_SEISMIC));
    } else {
      setCraterDims(null);
      setFireParams(null);
      setShockParams(null);
      setMwEquivalent(null);
    }
  }, [eventId]);

  const drawCraterRing = (lat, lon) => {
    const map = mapRef.current, group = groupRef.current;
    if (!map || !group) return;
    if (craterLayerRef.current) { group.removeLayer(craterLayerRef.current); craterLayerRef.current = null; }
    if (!craterVisible || !craterDims) return;

    const radiusMeters = Math.max(1, craterDims.Dfin / 2);
    const craterCircle = L.circle([lat, lon], {
      radius: radiusMeters, color: "#111", weight: 2, opacity: 0.9, fillColor: "#ff3b30", fillOpacity: 0.15
    });
    craterCircle.bindTooltip(
      `Crater ring (final) ≈ ${craterDims.Dfin.toFixed(1)} m (Impactor ≈ ${craterDims.Dimp.toFixed(1)} m)`,
      { direction: "top", permanent: false, opacity: 0.95 }
    );
    craterCircle.addTo(group);
    craterLayerRef.current = craterCircle;
  };

  const drawFireRing = (lat, lon) => {
    const map = mapRef.current, group = groupRef.current;
    if (!map || !group) return;
    if (fireLayerRef.current) { group.removeLayer(fireLayerRef.current); fireLayerRef.current = null; }
    if (!fireVisible || !fireParams) return;

    const ring = L.circle([lat, lon], {
      radius: fireParams.Rfire_m, color: "#ff6b00", weight: 2, opacity: 0.9, fillColor: "#ff9f43", fillOpacity: 0.12
    });
    ring.bindTooltip(
      `Thermal ring ≈ ${(fireParams.Rfire_m / 1000).toFixed(2)} km<br>` +
      `Teaching value based on impact energy and assumed heat fraction`,
      { direction: "top", permanent: false, opacity: 0.95 }
    );
    ring.addTo(group);
    fireLayerRef.current = ring;
  };

  const drawShockRing = (lat, lon) => {
    const map = mapRef.current, group = groupRef.current;
    if (!map || !group) return;
    if (shockLayerRef.current) { group.removeLayer(shockLayerRef.current); shockLayerRef.current = null; }
    if (!shockVisible || !shockParams) return;

    const ring = L.circle([lat, lon], {
      radius: shockParams.Rshock_m,
      color: "#2563eb",
      weight: 2,
      opacity: 0.95,
      fillColor: "#93c5fd",
      fillOpacity: 0.12
    });
    ring.bindTooltip(
      `Shock ring ≈ ${(shockParams.Rshock_m / 1000).toFixed(2)} km<br>` +
      `Teaching value for an overpressure threshold`,
      { direction: "top", permanent: false, opacity: 0.95 }
    );
    ring.addTo(group);
    shockLayerRef.current = ring;
  };

  // 4) Cargar evento + dibujar
  useEffect(() => {
    const map = mapRef.current, group = groupRef.current;
    if (!map || !group) return;

    group.clearLayers();
    contoursLayerRef.current = null;

    setExposureTotals(null);
    setCities([]);
    setPopError(null);
    setPopLoading(false);

    setLosses(null);
    setLossError(null);
    setLossLoading(false);

    setHistUrls({ fatal: null, econ: null });

    let abort = false;
    const DETAIL_URL = `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&eventid=${eventId}`;

    (async () => {
      try {
        const detail = await fetchJson(DETAIL_URL);
        if (abort) return;

        const [lon, lat] = detail.geometry.coordinates;
        const whenISO = new Date(detail.properties.time).toISOString();
        const place = detail.properties.place || "—";

        setImpactInfo({ place, whenISO });
        impactLatLonRef.current = { lat, lon };

        L.circleMarker([lat, lon], {
          radius: 6, weight: 2, color: "#111", fillColor: "#ffcc00", fillOpacity: 0.9
        })
          .bindPopup(
            `<strong>Impact point </strong><br>
             Equivalent earthquake magnitude: ${mwEquivalent != null ? mwEquivalent.toFixed(2) : "—"} (for teaching)<br>
             Seismic efficiency set to ${(ETA_SEISMIC * 100).toFixed(0)}%<br>
             ${place}<br>
             ${whenISO.replace("T", " ").slice(0, 19)} UTC<br>`
          )
          .addTo(group);

        // Anillos
        drawCraterRing(lat, lon);
        drawFireRing(lat, lon);
        drawShockRing(lat, lon);

        // MMI contours
        const shakemap = (detail.properties?.products?.shakemap || [])[0];
        if (shakemap?.contents) {
          const contKey = Object.keys(shakemap.contents).find(k =>
            /cont.*mmi.*\.json$/i.test(k) || /mmi.*\.geojson$/i.test(k)
          );
          if (contKey) {
            const contours = await fetchJson(shakemap.contents[contKey].url);
            if (!abort) {
              const layer = L.geoJSON(contours, {
                style: (f) => {
                  const v = Number(f.properties?.value ?? NaN);
                  const lab = Number.isFinite(v) ? labelForMMI(v) : null;
                  const baseColor = Number.isFinite(v) ? colorForMMI(v) : "#666";
                  const highlighted = !selectedLabel || (lab === selectedLabel);
                  return {
                    color: baseColor,
                    weight: highlighted ? 1.6 : 1,
                    fillOpacity: highlighted ? 0.28 : 0.08,
                    opacity: highlighted ? 1 : 0.4,
                    fillColor: baseColor
                  };
                },
                onEachFeature: (f, l) => {
                  const v = Number(f.properties?.value ?? NaN);
                  const lab = Number.isFinite(v) ? labelForMMI(v) : "—";
                  l.bindPopup(`Impact shaking: MMI ${lab} (${v})`);
                }
              }).addTo(group);

              contoursLayerRef.current = layer;
            }
          }
        }

        if (!abort) {
          if (group.getLayers().length > 0) {
            map.fitBounds(group.getBounds().pad(0.2));
          } else {
            map.setView([lat, lon], 6);
          }
          map.invalidateSize();
        }

        // === PAGER / losspager ===
        const pager = (detail.properties?.products?.losspager
          ?? detail.properties?.products?.pager
          ?? [])[0];

        if (pager?.contents && !abort) {
          setPopLoading(true);

          const exposureUrl = findContentUrl(pager.contents, [
            "^json/exposures\\.json$",
            "exposure.*\\.json$",
            "exposures.*\\.json$",
            "population.*exposure.*\\.json$"
          ]);
          const cityUrl = findContentUrl(pager.contents, [
            "^json/cities\\.json$",
            "city.*\\.json$",
            ".*city.*exposure.*\\.json$"
          ]);
          const lossesUrl = findContentUrl(pager.contents, [
            "^json/losses\\.json$",
            "loss.*\\.json$",
            "economic.*\\.json$"
          ]);
          const fatalPng = findContentUrl(pager.contents, [
            "^alertfatal\\.png$",
            "alertfatal_small\\.png$",
            "alertfatal_smaller\\.png$"
          ]);
          const econPng = findContentUrl(pager.contents, [
            "^alertecon\\.png$",
            "alertecon_small\\.png$",
            "alertecon_smaller\\.png$"
          ]);

          setLossLoading(Boolean(lossesUrl));

          const [exposureJson, cityJson, lossesJson] = await Promise.all([
            exposureUrl ? fetchJson(exposureUrl) : Promise.resolve(null),
            cityUrl ? fetchJson(cityUrl) : Promise.resolve(null),
            lossesUrl ? fetchJson(lossesUrl) : Promise.resolve(null)
          ]);

          if (!abort) {
            if (exposureJson) setExposureTotals(aggregateExposure(exposureJson));
            if (cityJson) setCities(normalizeCities(cityJson));
            if (!exposureJson && !cityJson) setPopError("No PAGER exposure/cities JSON found.");
            if (lossesJson) setLosses(parseLosses(lossesJson)); else if (lossesUrl) setLossError("Could not load losses.json");
            setHistUrls({ fatal: fatalPng || null, econ: econPng || null });
          }
        } else {
          setPopError("No losspager product available for this event.");
        }
      } catch (e) {
        if (!abort) { console.error(e); setPopError(e.message || String(e)); }
      } finally {
        if (!abort) { setPopLoading(false); setLossLoading(false); }
      }
    })();

    return () => { abort = true; };
  }, [eventId, selectedLabel, craterVisible, craterDims, fireVisible, fireParams, shockVisible, shockParams, mwEquivalent]);

  // Restyle MMI (no refetch)
  useEffect(() => {
    const layer = contoursLayerRef.current;
    if (!layer) return;
    layer.setStyle((f) => {
      const v = Number(f.properties?.value ?? NaN);
      const lab = Number.isFinite(v) ? labelForMMI(v) : null;
      const baseColor = Number.isFinite(v) ? colorForMMI(v) : "#666";
      const highlighted = !selectedLabel || (lab === selectedLabel);
      return {
        color: baseColor,
        weight: highlighted ? 1.6 : 1,
        fillOpacity: highlighted ? 0.28 : 0.08,
        opacity: highlighted ? 1 : 0.4,
        fillColor: baseColor
      };
    });
  }, [selectedLabel]);

  // Redibujar anillos cuando cambien
  useEffect(() => {
    const c = impactLatLonRef.current; if (!c) return;
    drawCraterRing(c.lat, c.lon);
  }, [craterVisible, craterDims]);
  useEffect(() => {
    const c = impactLatLonRef.current; if (!c) return;
    drawFireRing(c.lat, c.lon);
  }, [fireVisible, fireParams]);
  useEffect(() => {
    const c = impactLatLonRef.current; if (!c) return;
    drawShockRing(c.lat, c.lon);
  }, [shockVisible, shockParams]);

  const mmiOptions = useMemo(() => labelOrder.map(lab => ({
    label: lab, color: mmiBreaks.find(b => b.label === lab)?.color
  })), []);
  const totalPeople = useMemo(() => {
    if (!exposureTotals) return 0;
    return Object.values(exposureTotals).reduce((a, b) => a + (Number(b) || 0), 0);
  }, [exposureTotals]);
  const fmtUSD0 = (n) => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });

  const refreshFromForm = () => {
    const res = calcularImpacto();
    setImpactInputs(res || null);

    if (res) {
      setCraterDims(
        calcCraterFromInputs({
          massKg: res.masaKg, densityKgM3: res.densidadKgM3, velocidadMps: res.velocidadMps,
          targetDensity: 2500, angleDeg: 45, g: 9.81
        })
      );
      setFireParams(
        calcFireRingRadius({ energiaJ: res.energiaJ, fRad: 0.03, Qt_kJ_m2: 8, attenuation: 1.0 })
      );
      setShockParams(
        calcShockRingRadius({ energiaJ: res.energiaJ, Pth_kPa: 30 })
      );
      setMwEquivalent(mwFromImpactEnergy(res.energiaJ, ETA_SEISMIC));
    } else {
      setCraterDims(null); setFireParams(null); setShockParams(null); setMwEquivalent(null);
    }
  };

  return (
    <div style={styles.appWrap}>
      {/* Mapa */}
      <div ref={containerRef} style={styles.map} />

      {/* Tirador lateral cuando el panel está cerrado */}
      {!drawerOpen && (
        <button
          style={styles.pullTab}
          onClick={() => setDrawerOpen(true)}
          title="Open menu"
          aria-label="Open menu"
        >
          {"<"}
        </button>
      )}

      {/* AYUDA flotante: si está cerrado, muestra "?" */}
      {!helpOpen && (
        <button
          style={styles.helpFab}
          onClick={() => setHelpOpen(true)}
          title="What is this?"
          aria-label="Open help"
        >
          ?
        </button>
      )}

      {!helpOpen && (
      <button
        onClick={() => navigate("/")}
        title="Back to Menu"
        aria-label="Back to Menu"
        style={{
          position: "absolute",
          top: 12,
          right: 60, // separa del botón de ayuda
          zIndex: 1100,
          width: 100,
          height: 36,
          borderRadius: 8,
          border: "1px solid rgba(173, 216, 255, 0.35)",
          background: "rgba(24, 45, 78, 0.85)",
          color: "#e9f2ff",
          fontWeight: 600,
          fontSize: 13,
          lineHeight: "34px",
          textAlign: "center",
          cursor: "pointer",
          backdropFilter: "blur(6px)",
          boxShadow: "0 6px 18px rgba(0,0,0,.35)"
        }}
      >
        Back to Menu
      </button>
    )}


      {/* Panel de ayuda: si está abierto, muestra info y × */}
      {helpOpen && (
        <div style={styles.titleBox}>
          <div style={styles.helpHeader}>
            <strong>Asteroid Impact — What am I seeing?</strong>
            <button
              style={styles.helpCloseBtn}
              onClick={() => setHelpOpen(false)}
              title="Close help"
              aria-label="Close help"
            >
              ×
            </button>
          </div>

          <div style={{opacity:.9}}>
            <div style={{marginBottom:8}}>
              This view shows <strong>ground shaking</strong> people might feel,
              using <em>intensity bands (MMI)</em>. It’s a simple way to explain
              effects from an asteroid impact.
            </div>

            <div style={{marginBottom:8}}>
              <strong>How to use:</strong>
              <ul style={{margin: "6px 0 0 16px"}}>
                <li>Select an <strong>MMI level</strong> to highlight similar shaking.</li>
                <li>Check <strong>Exposed population</strong> to see how many people might be affected.</li>
                <li>Explore <strong>crater, fire, and shock rings</strong> for other effects.</li>
              </ul>
            </div>

            <div style={{marginBottom:8}}>
              <strong>About “Equivalent Mw”:</strong> a teaching estimate comparing impact energy with earthquake size.
            </div>

            <div style={{opacity:.8, fontSize:12}}>
              <strong>Note:</strong> Educational demo. Real models consider geology, atmosphere, angle, etc.
            </div>
          </div>
        </div>
      )}

      {/* Drawer lateral */}
      <div
        style={{
          ...styles.drawer,
          transform: drawerOpen ? "translateX(0)" : "translateX(-100%)",
          pointerEvents: drawerOpen ? "auto" : "none",
          boxShadow: drawerOpen ? "0 18px 40px rgba(0,0,0,.45)" : "none",
          borderRight: drawerOpen ? "1px solid rgba(255,255,255,0.08)" : "none"
        }}
      >
        <div style={styles.headerRow}>
          <h3 style={styles.sectionTitle}>Impact Consequences</h3>
          <button
            style={styles.headerToggleBtn}
            onClick={() => setDrawerOpen(v => !v)}
            title={drawerOpen ? "Close menu" : "Open menu"}
            aria-label={drawerOpen ? "Close menu" : "Open menu"}
          >
            {drawerOpen ? "<" : ">"}
          </button>
        </div>

        {/* (1) Impact Energy — con tooltips educativos */}
        <div style={{ marginTop: 18 }}>
          <div style={styles.sectionHeaderRow}>
            <div style={styles.subTitle}>1) Impact energy</div>
            <button
              style={styles.sectionToggleBtn}
              onClick={() => toggleSection("impact")}
            >
              {openSections.impact ? "▾" : "▸"}
            </button>
          </div>

          {openSections.impact && (
            <div style={styles.card}>
              {[
              { label: "Mass", value: "1.200.000.000 kg", tip: "The total mass of the impacting body — heavier objects carry more energy." },
              { label: "Density", value: "1500 kg/m³", tip: "Density indicates material type — e.g. ice, rock, or metal." },
              { label: "Speed", value: "22 km/s (22.000 m/s)", tip: "Velocity has a squared effect on impact energy (E = ½·m·v²)." },
              { label: "Energy", value: "2.9×10¹⁷ J", tip: "Kinetic energy released upon impact — comparable to millions of tons of TNT." },
              { label: "Estimated impactor diameter", value: "≈115 m", tip: "Approximate diameter inferred from mass and density." },
              { label: "Seismic efficiency (η)", value: "10%", tip: "Fraction of energy that becomes ground motion (teaching constant)." },
              { label: "Equivalent Mw", value: "7.78", tip: "Estimated earthquake magnitude producing similar ground shaking." }
            ].map(({ label, value, tip }, i) => (
              <div key={i} style={styles.infoRow}>
                <div style={styles.infoLabel}>
                  <span /* ¡sin title! */>{label}</span>
                  <ClickTip tip={tip} label={`About ${label}`} />
                </div>
                <div style={styles.infoValue}>{value}</div>
              </div>
            ))}
            </div>
          )}
        </div>

        {/* (2) Ground shaking (MMI) — unified styling */}
        <div style={{ marginTop: 18 }}>
          <div style={styles.sectionHeaderRow}>
            <div style={styles.subTitle}>2) Ground shaking (MMI)</div>
            <button
              style={styles.sectionToggleBtn}
              onClick={() => toggleSection("mmi")}
              aria-expanded={openSections.mmi}
            >
              {openSections.mmi ? "▾" : "▸"}
            </button>
          </div>

          {openSections.mmi && (
            <>
              <div style={{ opacity: .9, margin: "6px 0 8px" }}>
                “What does this intensity feel like?”
              </div>

              {/* Explicación (plegable) en tono del panel */}
              <InfoNote title="Explanation (MMI)">
                <MiniMarkdown text={HELP.mmi} />
              </InfoNote>

              {/* Paleta de MMI con botón “Show all” */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontSize: 13, opacity: .85 }}>Select an intensity:</div>
                <button
                  onClick={() => setSelectedLabel(null)}
                  style={{
                    ...styles.button,
                    padding: "4px 10px",
                    fontSize: 12,
                    borderRadius: 8,
                    background: "rgba(255,255,255,0.08)"
                  }}
                >
                  Show all
                </button>
              </div>

              <div style={styles.mmiGrid}>
                {mmiOptions.map(opt => (
                  <button
                    key={opt.label}
                    onClick={() =>
                      setSelectedLabel(prev => (prev === opt.label ? null : opt.label))
                    }
                    style={styles.mmiBtn(selectedLabel === opt.label, opt.color)}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>


              {/* Caja informativa con la “card” oscura del panel */}
              <div style={{ ...styles.card, marginTop: 10 }}>
                {selectedLabel ? (
                  <>
                    <div><strong>MMI {selectedLabel}</strong></div>
                    <div style={{ opacity: .9 }}>{descForLabel(selectedLabel)}</div>
                    <div style={{ marginTop: 6, fontSize: 12, opacity: .75 }}>
                      The map highlights the contours for this intensity level.
                    </div>
                  </>
                ) : (
                  <div style={{ opacity: .9 }}>
                    <em>
                      Select an MMI level to highlight its contours and see what it feels like.
                    </em>
                  </div>
                )}
              </div>
            </>
          )}
        </div>




        {/* (3) Exposed population — collapsible */}
        <div style={{ marginTop: 18 }}>
          <div style={styles.sectionHeaderRow}>
            <div style={styles.subTitle}>3) Exposed population</div>
            <button
              style={styles.sectionToggleBtn}
              onClick={() => toggleSection("population")}
              aria-expanded={openSections.population}
            >
              {openSections.population ? "▾" : "▸"}
            </button>
          </div>

          {openSections.population && (
            <>
              <InfoNote title="How is exposure estimated?"><MiniMarkdown text={HELP.exposure} /></InfoNote>

              {popLoading && <div style={{ fontSize: 12, opacity: .9 }}>Loading exposure data…</div>}
              {popError && (
                <div style={{ ...styles.softNote, color: "#ffd2d2", borderColor: "rgba(255,0,0,.35)", background: "rgba(255,0,0,.08)" }}>
                  Could not load population data: {popError}
                </div>
              )}

              {exposureTotals && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 13, marginBottom: 6, opacity: .9 }}>
                    Estimated people exposed by MMI (PAGER proxy)
                  </div>
                  <div style={styles.tableWrap}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead style={styles.thead}>
                        <tr>
                          <th style={styles.th}>MMI</th>
                          <th style={styles.thRight}>People</th>
                        </tr>
                      </thead>
                      <tbody>
                        {labelOrder.map((lab) => (
                          <tr key={lab} style={styles.tr}>
                            <td style={{ ...styles.td, fontWeight: 700 }}>{lab}</td>
                            <td style={styles.tdRight}>
                              {Number(exposureTotals[lab] || 0).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                        <tr style={{ borderTop: "2px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.03)" }}>
                          <td style={{ ...styles.td, fontWeight: 800 }}>Total</td>
                          <td style={{ ...styles.tdRight, fontWeight: 800 }}>
                            {Object.values(exposureTotals).reduce((a, b) => a + (Number(b) || 0), 0).toLocaleString()}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {histUrls.fatal && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 13, marginBottom: 6, opacity: .9 }}>
                    Fatality Alert Histogram (empirical probabilities)
                  </div>
                  <img src={histUrls.fatal} alt="PAGER Fatality Alert Histogram" style={styles.img} loading="lazy" />
                </div>
              )}
            </>
          )}
        </div>

        {/* (4) Economic & fatality risk — collapsible */}
        <div style={{ marginTop: 18 }}>
          <div style={styles.sectionHeaderRow}>
            <div style={styles.subTitle}>4) Economic & fatality risk</div>
            <button
              style={styles.sectionToggleBtn}
              onClick={() => toggleSection("losses")}
              aria-expanded={openSections.losses}
            >
              {openSections.losses ? "▾" : "▸"}
            </button>
          </div>

          {openSections.losses && (
            <>
              <InfoNote title="How to interpret losses and the histogram"><MiniMarkdown text={HELP.losses} /></InfoNote>

              {lossLoading && <div style={{ fontSize: 12, opacity: .9 }}>Loading losses…</div>}
              {lossError && (
                <div style={{ ...styles.softNote, color: "#ffd2d2", borderColor: "rgba(255,0,0,.35)", background: "rgba(255,0,0,.08)" }}>
                  {lossError}
                </div>
              )}

              {losses && (
                <>
                  <div style={{ ...styles.grid2, gap: 10 }}>
                    <div style={styles.card}>
                      <div style={{ fontSize: 12, opacity: .85, marginBottom: 4 }}>Estimated fatalities (empirical)</div>
                      <div style={{ fontWeight: 800, fontSize: 24 }}>
                        {Number(losses.fatalitiesTotal || 0).toLocaleString()}
                      </div>
                    </div>
                    <div style={styles.card}>
                      <div style={{ fontSize: 12, opacity: .85, marginBottom: 4 }}>Economic losses (USD, empirical)</div>
                      <div style={{ fontWeight: 800, fontSize: 24 }}>
                        {fmtUSD0(losses.dollarsTotal)}
                      </div>
                    </div>
                  </div>

                  {!!losses.perCountry.length && (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontSize: 13, marginBottom: 6, opacity: .9 }}></div>
                      <div style={styles.tableWrap}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                          <thead style={styles.thead}>
                            <tr>
                              <th style={styles.th}>Country</th>
                              <th style={styles.thRight}>Fatalities</th>
                              <th style={styles.thRight}>Loss (USD)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {losses.perCountry.map((row, idx) => (
                              <tr key={row.code + idx} style={styles.tr}>
                                <td style={styles.td}>{row.code}</td>
                                <td style={styles.tdRight}>{Number(row.fatalities || 0).toLocaleString()}</td>
                                <td style={styles.tdRight}>{fmtUSD0(row.dollars)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {histUrls.econ && (
                    <div style={{ marginTop: 14 }}>
                      <div style={{ fontSize: 13, marginBottom: 6, opacity: .9 }}>
                        Model uncertainty — Economic Alert Histogram
                      </div>
                      <div style={{ ...styles.card, padding: 10 }}>
                        <img src={histUrls.econ} alt="PAGER Economic Alert Histogram" style={styles.img} loading="lazy" />
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>

        {/* (5) Crater size estimation — collapsible */}
        <div style={{ marginTop: 18 }}>
          <div style={styles.sectionHeaderRow}>
            <div style={styles.subTitle}>5) Crater size estimation</div>
            <button
              style={styles.sectionToggleBtn}
              onClick={() => toggleSection("crater")}
              aria-expanded={openSections.crater}
            >
              {openSections.crater ? "▾" : "▸"}
            </button>
          </div>

          {openSections.crater && (
            <>
              <InfoNote title="How is crater size estimated?">
                <MiniMarkdown text={HELP.craterExplain} />
              </InfoNote>

              <div style={{ ...styles.card, marginTop: 8 }}>
                {!craterDims ? (
                  <div style={styles.softNote}>
                    Missing form data to compute crater. Please fill the mass, speed and density.
                  </div>
                ) : (
                  <>
                    <div><strong>Impactor diameter:</strong> {craterDims.Dimp.toFixed(1)} m</div>
                    <div><strong>Transient crater:</strong> {craterDims.Dtr.toFixed(1)} m</div>
                    <div><strong>Final crater:</strong> {craterDims.Dfin.toFixed(1)} m</div>
                    <div style={{ fontSize: 12, opacity: .85, marginTop: 4 }}>
                      (angle = {craterDims.angleDeg}°, target density = {craterDims.targetDensity} kg/m³)
                    </div>

                    <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                      <button onClick={() => setCraterVisible(v => !v)} style={styles.button}>
                        {craterVisible ? "Hide crater" : "Show crater"}
                      </button>
                      <button onClick={refreshFromForm} style={styles.buttonGhost}>
                        Recompute from form
                      </button>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>

        {/* (6) Fire ring — collapsible */}
        <div style={{ marginTop: 18 }}>
          <div style={styles.sectionHeaderRow}>
            <div style={styles.subTitle}>6) Fire ring (thermal dose)</div>
            <button
              style={styles.sectionToggleBtn}
              onClick={() => toggleSection("fire")}
              aria-expanded={openSections.fire}
            >
              {openSections.fire ? "▾" : "▸"}
            </button>
          </div>

          {openSections.fire && (
            <>
              <InfoNote title="How is the fire ring estimated?">
                <MiniMarkdown text={HELP.fireExplain} />
              </InfoNote>

              <div style={{ ...styles.card, marginTop: 8 }}>
                {!fireParams ? (
                  <div style={styles.softNote}>
                    Missing form energy to compute the thermal ring.
                  </div>
                ) : (
                  <>
                    <div><strong>Radius:</strong> {(fireParams.Rfire_m / 1000).toFixed(2)} km</div>
                    <div style={{ fontSize: 12, opacity: .85, marginTop: 4 }}>
                      (educational threshold and heat fraction applied)
                    </div>

                    <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                      <button onClick={() => setFireVisible(v => !v)} style={styles.button}>
                        {fireVisible ? "Hide fire ring" : "Show fire ring"}
                      </button>

                      <button onClick={refreshFromForm} style={styles.buttonGhost}>
                        Recompute from form
                      </button>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>

        {/* (7) Shock wave — collapsible */}
        <div style={{ marginTop: 18 }}>
          <div style={styles.sectionHeaderRow}>
            <div style={styles.subTitle}>7) Shock wave (overpressure)</div>
            <button
              style={styles.sectionToggleBtn}
              onClick={() => toggleSection("shock")}
              aria-expanded={openSections.shock}
            >
              {openSections.shock ? "▾" : "▸"}
            </button>
          </div>

          {openSections.shock && (
            <>
              <InfoNote title="How is the shock ring estimated?">
                <MiniMarkdown text={HELP.shockExplain} />
              </InfoNote>

              <div style={{ ...styles.card, marginTop: 8 }}>
                {!shockParams ? (
                  <div style={styles.softNote}>
                    Missing form energy to compute the shock ring.
                  </div>
                ) : (
                  <>
                    <div><strong>Radius:</strong> {(shockParams.Rshock_m / 1000).toFixed(2)} km</div>
                    <div><strong>Threshold:</strong> {shockParams.Pth_kPa} kPa (≈ {(shockParams.Pth_kPa / 6.89476).toFixed(2)} psi)</div>
                    <div style={{ fontSize: 12, opacity: .85, marginTop: 4 }}>
                      Yield ≈ {shockParams.yield_kt.toFixed(2)} kt TNT (energy equivalence)
                    </div>

                    <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                      <button onClick={() => setShockVisible(v => !v)} style={styles.button}>
                        {shockVisible ? "Hide shock ring" : "Show shock ring"}
                      </button>

                      <button onClick={refreshFromForm} style={styles.buttonGhost}>
                        Recompute from form
                      </button>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>

        {/* (8) Tsunami information — unified (collapsible + tabs) */}
        <div style={{ marginTop: 18 }}>
          <div style={styles.sectionHeaderRow}>
            <div style={styles.subTitle}>8) Tsunami information</div>
            <button
              style={styles.sectionToggleBtn}
              onClick={() => toggleSection("tsunami")}
              aria-expanded={openSections.tsunami}
              aria-controls="tsu-info-panel"
              title={openSections.tsunami ? "Hide" : "Show"}
            >
              {openSections.tsunami ? "▾" : "▸"}
            </button>
          </div>

          {openSections.tsunami && (
            <div id="tsu-info-panel" style={{ ...styles.card }}>
              {/* Tabs */}
              <div style={styles.tabsRow}>
                <button
                  style={{ ...styles.tabBtn, ...(tsuTab === "summary" ? styles.tabBtnActive : null) }}
                  onClick={() => setTsuTab("summary")}
                >
                  Summary
                </button>
                <button
                  style={{ ...styles.tabBtn, ...(tsuTab === "raw" ? styles.tabBtnActive : null) }}
                  onClick={() => setTsuTab("raw")}
                >
                  Raw bulletin
                </button>
              </div>

              {/* Content per tab */}
              {tsuTab === "summary" && (
                <div>
                  <div style={{ marginBottom: 8 }}>
                    <span style={badgeStyle("no_threat")}>No tsunami threat</span>
                  </div>
                  <div style={{ opacity: .9 }}>
                    <p style={{ marginTop: 0 }}>
                      This section explains tsunami messages in plain language.
                      When an offshore impact (or earthquake) occurs, agencies issue bulletins
                      that tell you whether a tsunami is expected and which coasts should pay attention.
                    </p>
                    <ul style={{ margin: "6px 0 0 16px" }}>
                      <li><strong>Level:</strong> Warning, Watch, Advisory, Information, or No Threat.</li>
                      <li><strong>What to do:</strong> Follow local guidance; move to higher ground if told.</li>
                      <li><strong>Updates:</strong> Bulletins can change as new data arrives.</li>
                    </ul>
                    <p style={{ opacity: .8, fontSize: 12 }}>
                      Tip: For production use, fetch live bulletins from <em>tsunami.gov</em> on your backend (avoid CORS issues).
                    </p>
                  </div>
                </div>
              )}

              {tsuTab === "raw" && (
                <div>
                  <div style={{ marginBottom: 8 }}>
                    <span style={badgeStyle("no_threat")}>No tsunami threat</span>
                  </div>
                  <pre
                    style={{
                      fontSize: 12,
                      lineHeight: 1.4,
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      color: "#e9f2ff",
                      padding: 10,
                      borderRadius: 8,
                      overflowX: "auto",
                      whiteSpace: "pre-wrap"
                    }}
                  >
                    {STATIC_TSUNAMI_TXT}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ height: 24 }} />
      </div>
    </div>
  );
}
