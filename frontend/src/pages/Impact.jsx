import { useEffect, useRef, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// traer los parámetros del formulario
import { calcularImpacto } from "../simulation/impact-utils.js";

// --- MMI palette / descriptions adapted for impact shaking ---
const mmiBreaks = [
  { max: 1.9, label: "I", color: "#edf8fb", desc: "Not felt / instrumental detection only." },
  { max: 2.9, label: "II", color: "#ccece6", desc: "Very weak: felt by a few people at rest." },
  { max: 3.9, label: "III", color: "#a8ddb5", desc: "Weak: like the passing of a light truck." },
  { max: 4.9, label: "IV", color: "#7bccc4", desc: "Light: noticeable shaking of windows/objects." },
  { max: 5.9, label: "V", color: "#4eb3d3", desc: "Moderate: unstable objects may topple." },
  { max: 6.4, label: "VI", color: "#2b8cbe", desc: "Strong: items fall; slight structural damage." },
  { max: 6.9, label: "VII", color: "#0868ac", desc: "Very strong: moderate damage; people alarmed." },
  { max: 7.4, label: "VIII", color: "#084081", desc: "Severe: damage to structures; heavy furniture moves." },
  { max: 7.9, label: "IX", color: "#78281F", desc: "Violent: considerable damage; buildings shifted." },
  { max: 10, label: "X+", color: "#4A0E0E", desc: "Extreme: destruction; widespread ground failure." }
];
const labelOrder = mmiBreaks.map(b => b.label);
const lastBreak = mmiBreaks[mmiBreaks.length - 1];
const colorForMMI = (v) => (mmiBreaks.find(b => v <= b.max)?.color ?? lastBreak.color);
const labelForMMI = (v) => (mmiBreaks.find(b => v <= b.max)?.label ?? lastBreak.label);
const descForLabel = (lab) => mmiBreaks.find(b => b.label === lab)?.desc ?? "—";

// --- Fetch helper (JSON) ---
async function fetchJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} while loading ${url}`);
  return r.json();
}

// --- Text fetch helper (tsunami.gov TXT) ---
async function fetchText(url) {
  const r = await fetch(url /*, { mode: 'cors' }*/);
  if (!r.ok) throw new Error(`HTTP ${r.status} while loading ${url}`);
  return r.text();
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

// --- Minimal Markdown renderer for bold + code + line breaks ---
function MiniMarkdown({ text }) {
  const escape = (s) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = escape(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\n/g, "<br/>");
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

// --- InfoNote (collapsible educational note) ---
function InfoNote({ title = "What is this?", children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginTop: 8 }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          fontSize: 12, padding: "6px 8px", borderRadius: 8,
          border: "1px solid rgba(0,0,0,.15)", background: "#f8fafc",
          cursor: "pointer"
        }}
      >
        {open ? "Hide" : "Show"} {title}
      </button>
      {open && (
        <div style={{
          marginTop: 8, background: "#f8fafc", border: "1px solid #e5e7eb",
          borderRadius: 10, padding: 10, fontSize: 13, lineHeight: 1.45
        }}>
          {children}
        </div>
      )}
    </div>
  );
}

// --- Educational help text (EN) ---
const HELP = {
  mmi: `
**MMI (Modified Mercalli Intensity)** describes how shaking is **felt** at the surface, from I (not felt) to X+ (destructive). It is **not** earthquake magnitude—it's **local intensity**.

How to read:
• Pick an MMI level to highlight its contour (isointensity band).
• Intensity typically decreases with distance from the source.
• Local geology, topography, and depth can amplify or damp shaking.

Didactic note: Here we use **USGS-style MMI contours** as a *proxy* for an asteroid impact to explain the concept. A real impact run would compute MMI from impactor energy deposition and wave propagation models.
`.trim(),

  exposure: `
**Population exposure** estimates how many people fall within each MMI band by overlaying intensity contours with demographic grids.

How to read the table:
• Each MMI row shows the estimated people under that intensity.
• “Total” sums across all bands.

Caveats: values depend on demographic sources and the spatial footprint of shaking. In this demo, exposure is proxied from USGS PAGER.
`.trim(),

  cities: `
**Affected cities** (if available) list highly populated places near the source:
• **Population**: city size.
• **MMI**: expected intensity felt there.
• **Dist (km)**: distance to the source.

Use this to get a sense of which cities might feel stronger shaking.
`.trim(),

  losses: `
**Human and economic risk** (PAGER) uses **empirical models** from historical events to estimate:
• **Fatalities** (order-of-magnitude).
• **Economic losses** (USD).

The alert histogram shows **model uncertainty** (probabilities for different ranges).

Interpretation:
• Large numbers are not point predictions, but **likely bands**.
• Building vulnerability, infrastructure, and time of day affect real outcomes.

In this demo, PAGER is used for teaching. A full asteroid-impact pipeline would model shockwave, overpressure, structural response, etc.
`.trim(),

  tsunami: `
This section shows a **tsunami bulletin** (static here due to CORS). Typical levels: **Warning**, **Watch**, **Advisory**, **Information**, or **No Tsunami Threat**.

How to read:
• Header: issuing center and bulletin number.
• **Evaluation**: whether there is a threat in listed regions.
• **Event parameters**: magnitude, time, coordinates, depth, location.
• **Updates**: whether more messages will follow.

Didactic note: No live fetch here; the text teaches the **format and reading**. For real-time data in production, use a backend proxy to call tsunami.gov.
`.trim(),

  disclaimer: `
**Didactic note**: This prototype uses a real USGS event as a *proxy* for an asteroid impact. Views and numbers (MMI, exposure, losses) are meant to **explain** the analysis flow. A full system would derive them from **impactor parameters** (size, speed, angle, density) plus **local layers** (population, vulnerability, topography, coastal proximity).
`.trim(),

  howToUse: `
Quick guide:
1) Select an **MMI band** to understand “what it would feel like”.
2) Check **exposure** to see how many people fall in each range.
3) Review **losses** to understand orders of magnitude and **uncertainty**.
4) Look at the **tsunami bulletin** format when the source is coastal/oceanic.
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
// P_psi(Z) ≈ 8080/Z^3 + 114/Z^2 + 1/Z  → P_kPa = P_psi * 6.89476
const PSI_TO_KPA = 6.89476;
function peakOverpressure_kPa_from_Z(Z) {
  if (Z <= 0) return Infinity;
  const Ppsi = 8080 / (Z ** 3) + 114 / (Z ** 2) + 1 / Z;
  return Ppsi * PSI_TO_KPA;
}
// Invertir para hallar Z dado P_kPa (búsqueda binaria)
function invertZforPressure_kPa(target_kPa) {
  if (!Number.isFinite(target_kPa) || target_kPa <= 0) return null;
  let lo = 0.02, hi = 50; // rango típico
  for (let i = 0; i < 80; i++) {
    const mid = 0.5 * (lo + hi);
    const P = peakOverpressure_kPa_from_Z(mid);
    if (P > target_kPa) lo = mid; else hi = mid;
  }
  return 0.5 * (lo + hi);
}
// Radio del anillo para umbral de sobrepresión
// 1 kg TNT = 4.184 MJ  → W_kg = E / 4.184e6
function calcShockRingRadius({ energiaJ, Pth_kPa = 30 }) {
  if (!energiaJ || energiaJ <= 0) return null;
  const Wkg = energiaJ / 4.184e6;
  if (!Number.isFinite(Wkg) || Wkg <= 0) return null;
  const Z = invertZforPressure_kPa(Pth_kPa);
  if (!Z) return null;
  const R = Z * Math.cbrt(Wkg); // metros
  const yield_kt = energiaJ / 4.184e12; // kilotones TNT
  return { Rshock_m: R, Pth_kPa, yield_kt };
}

export default function ImpactMMI() {
  const { eventId: routeEventId } = useParams();
  const eventId = routeEventId || "us6000rcqw"; // demo default

  const mapRef = useRef(null);
  const containerRef = useRef(null);
  const groupRef = useRef(null);
  const contoursLayerRef = useRef(null);

  // Crater
  const craterLayerRef = useRef(null);
  const impactLatLonRef = useRef(null);
  const [craterVisible, setCraterVisible] = useState(true);

  // Fire
  const fireLayerRef = useRef(null);
  const [fireVisible, setFireVisible] = useState(true);
  const [fireParams, setFireParams] = useState(null);

  // Shock
  const shockLayerRef = useRef(null);
  const [shockVisible, setShockVisible] = useState(true);
  const [shockParams, setShockParams] = useState(null); // {Rshock_m, Pth_kPa, yield_kt}

  // Inputs + crater dims
  const [impactInputs, setImpactInputs] = useState(null);
  const [craterDims, setCraterDims] = useState(null);

  const navigate = useNavigate();

  // UI state
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [selectedLabel, setSelectedLabel] = useState(null);
  const [impactInfo, setImpactInfo] = useState(null);

  // PAGER state
  const [exposureTotals, setExposureTotals] = useState(null);
  const [cities, setCities] = useState([]);
  const [popLoading, setPopLoading] = useState(false);
  const [popError, setPopError] = useState(null);

  const [losses, setLosses] = useState(null);
  const [lossLoading, setLossLoading] = useState(false);
  const [lossError, setLossError] = useState(null);
  const [histUrls, setHistUrls] = useState({ fatal: null, econ: null });

  // Tsunami (static)
  const [tsuOpen, setTsuOpen] = useState(false);
  const tsuStatus = { level: "no_threat", label: "No tsunami threat" };

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

  // 3) Leer parámetros del formulario al entrar
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
    } else {
      setCraterDims(null);
      setFireParams(null);
      setShockParams(null);
    }
  }, [eventId]);

  // Helpers de dibujo
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
      `Dose ≥ ${fireParams.Qt_kJ_m2} kJ/m² · f_rad=${fireParams.fRad}`,
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
      `Overpressure ≥ ${shockParams.Pth_kPa} kPa (≈ ${(shockParams.Pth_kPa / 6.89476).toFixed(2)} psi)` +
      `<br>Yield ≈ ${shockParams.yield_kt.toFixed(2)} kt TNT`,
      { direction: "top", permanent: false, opacity: 0.95 }
    );
    ring.addTo(group);
    shockLayerRef.current = ring;
  };

  // 4) Cargar evento + dibujar capas + anillos
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

        const [lon, lat, depth] = detail.geometry.coordinates;
        const whenISO = new Date(detail.properties.time).toISOString();
        const mag = detail.properties.mag;
        const place = detail.properties.place || "—";

        setImpactInfo({ magnitude: mag, place, whenISO });
        impactLatLonRef.current = { lat, lon };

        L.circleMarker([lat, lon], {
          radius: 6, weight: 2, color: "#111", fillColor: "#ffcc00", fillOpacity: 0.9
        })
          .bindPopup(
            `<strong>Impact point (demo)</strong><br>
             Proxy magnitude: M ${mag}<br>
             ${place}<br>
             ${whenISO.replace("T", " ").slice(0, 19)} UTC<br>
             Proxy depth: ${depth} km<br>
             <div style="margin-top:6px">
               <img src="https://upload.wikimedia.org/wikipedia/commons/5/5e/Barringer_Crater_-_Arizona.jpg" 
                    alt="Crater example" 
                    style="width:260px;height:auto;border-radius:6px;border:1px solid #e5e7eb"/>
             </div>`
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

        // Fit
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
  }, [eventId, selectedLabel, craterVisible, craterDims, fireVisible, fireParams, shockVisible, shockParams]);

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

  // Helpers de UI
  const mmiOptions = useMemo(() => labelOrder.map(lab => ({
    label: lab, color: mmiBreaks.find(b => b.label === lab)?.color
  })), []);
  const totalPeople = useMemo(() => {
    if (!exposureTotals) return 0;
    return Object.values(exposureTotals).reduce((a, b) => a + (Number(b) || 0), 0);
  }, [exposureTotals]);
  const fmtUSD0 = (n) => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });

  // Refrescar desde el formulario
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
    } else {
      setCraterDims(null); setFireParams(null); setShockParams(null);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0 }}>
      {/* Full-screen map */}
      <div
        ref={containerRef}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", background: "#e5e7eb", zIndex: 0 }}
      />

      {/* Title box */}
      <div style={{
        position: "absolute",
        top: 56,
        right: 12,
        background: "rgba(255,255,255,.9)",
        padding: "8px 10px",
        borderRadius: 10,
        boxShadow: "0 6px 16px rgba(0,0,0,.12)",
        font: "14px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
        zIndex: 1000,
        maxWidth: 360
      }}>
        <strong>Asteroid Impact — Ground Shaking (MMI)</strong><br />
        <span style={{ opacity: .75, fontSize: 12 }}>
          Demo uses USGS-style MMI contours as a proxy for impact-induced shaking.
        </span>
        <div style={{ marginTop: 6 }}>
          <div><strong>Event ID</strong>: <code>{eventId}</code></div>
          {impactInfo && (
            <div style={{ marginTop: 6 }}>
              <div><strong>Proxy magnitude</strong> M {impactInfo.magnitude} — {impactInfo.place}</div>
              <div style={{ opacity: .7 }}>{impactInfo.whenISO.replace("T", " ").slice(0, 19)} UTC</div>
            </div>
          )}
        </div>
      </div>

      {/* Drawer / side menu */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: drawerOpen ? 0 : -340,
          width: 340,
          height: "100%",
          transition: "left .25s ease",
          background: "#ffffff",
          boxShadow: "0 8px 24px rgba(0,0,0,.18)",
          padding: 14,
          overflowY: "auto",
          font: "14px/1.35 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
          borderRight: "1px solid #00000014",
          zIndex: 1000,
          pointerEvents: "auto",
          willChange: "transform"
        }}
      >
        <h3 style={{ margin: "6px 0 10px" }}>Impact Consequences</h3>

        {/* (A) Form parameters */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Form parameters</div>

          {!impactInputs ? (
            <div style={{ fontSize: 12, color: "#92400e", background: "#fffbeb", border: "1px solid #fde68a", padding: 8, borderRadius: 8 }}>
              No form data available. Go to the input panel and set mass, speed and density.
            </div>
          ) : (
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 10, background: "#f8fafc" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div><strong>Mass</strong><br />{impactInputs.masaKg.toLocaleString()} kg</div>
                <div><strong>Density</strong><br />{impactInputs.densidadKgM3.toLocaleString()} kg/m³</div>
                <div><strong>Speed</strong><br />{impactInputs.velocidadKms} km/s ({impactInputs.velocidadMps.toLocaleString()} m/s)</div>
                <div><strong>Energy</strong><br />{impactInputs.energiaJ.toLocaleString()} J</div>
              </div>

              {craterDims && (
                <div style={{ marginTop: 8 }}>
                  <div><strong>Estimated impactor diameter</strong>: {craterDims.Dimp.toFixed(1)} m</div>
                </div>
              )}

              <div style={{ marginTop: 8 }}>
                <button onClick={refreshFromForm}
                  style={{
                    fontSize: 12, padding: "6px 10px", borderRadius: 8, cursor: "pointer",
                    border: "1px solid rgba(0,0,0,.15)", background: "#fff"
                  }}>
                  Refresh from form
                </button>
              </div>
            </div>
          )}
        </div>

        {/* (1) MMI */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>1) Ground shaking (MMI)</div>
          <div style={{ marginBottom: 6, opacity: .8 }}>“What does this intensity feel like?”</div>
          <InfoNote title="Explanation (MMI)"><MiniMarkdown text={HELP.mmi} /></InfoNote>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
            {mmiOptions.map(opt => (
              <button key={opt.label}
                onClick={() => setSelectedLabel(prev => prev === opt.label ? null : opt.label)}
                title={`MMI ${opt.label}`}
                style={{
                  padding: "6px 0",
                  borderRadius: 8,
                  border: selectedLabel === opt.label ? "2px solid #111" : "1px solid rgba(0,0,0,.2)",
                  background: opt.color,
                  cursor: "pointer",
                  fontWeight: 600
                }}>
                {opt.label}
              </button>
            ))}
          </div>

          <div style={{ marginTop: 10, minHeight: 48, background: "#f8fafc", border: "1px solid #e5e7eb", borderRadius: 10, padding: 10 }}>
            {selectedLabel ? (
              <>
                <div><strong>MMI {selectedLabel}</strong></div>
                <div style={{ opacity: .85 }}>{descForLabel(selectedLabel)}</div>
                <div style={{ marginTop: 6, fontSize: 12, opacity: .7 }}>
                  The map highlights the contours for this intensity level.
                </div>
              </>
            ) : (
              <div style={{ opacity: .8 }}>
                Select an MMI level to highlight its contours and see what it feels like.
              </div>
            )}
          </div>
        </div>

        {/* (2) Exposed population */}
        <div style={{ marginTop: 18 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>2) Exposed population</div>
          <InfoNote title="How is exposure estimated?"><MiniMarkdown text={HELP.exposure} /></InfoNote>

          {popLoading && <div style={{ fontSize: 12, opacity: .8 }}>Loading exposure data…</div>}
          {popError && (
            <div style={{ fontSize: 12, color: "#b91c1c", background: "#fee2e2", border: "1px solid #fecaca", padding: 8, borderRadius: 8 }}>
              Could not load population data: {popError}
            </div>
          )}

          {exposureTotals && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 13, marginBottom: 6, opacity: .75 }}>
                Estimated people exposed by MMI (PAGER proxy)
              </div>
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead style={{ background: "#f8fafc" }}>
                    <tr><th style={{ textAlign: "left", padding: "6px 8px" }}>MMI</th>
                      <th style={{ textAlign: "right", padding: "6px 8px" }}>People</th></tr>
                  </thead>
                  <tbody>
                    {labelOrder.map((lab) => (
                      <tr key={lab} style={{ borderTop: "1px solid #f1f5f9" }}>
                        <td style={{ padding: "6px 8px", fontWeight: 600 }}>{lab}</td>
                        <td style={{ padding: "6px 8px", textAlign: "right" }}>
                          {Number(exposureTotals[lab] || 0).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                    <tr style={{ borderTop: "2px solid #e2e8f0", background: "#fafafa" }}>
                      <td style={{ padding: "6px 8px", fontWeight: 700 }}>Total</td>
                      <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700 }}>
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
              <div style={{ fontSize: 13, marginBottom: 6, opacity: .75 }}>
                Fatality Alert Histogram (empirical probabilities)
              </div>
              <img src={histUrls.fatal} alt="PAGER Fatality Alert Histogram"
                style={{ width: "100%", height: "auto", display: "block", borderRadius: 10, border: "1px solid #e5e7eb", background: "#fafafa" }}
                loading="lazy" />
            </div>
          )}
        </div>

        {/* (3) Economic & fatality risk */}
        <div style={{ marginTop: 18 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>3) Economic & fatality risk</div>
          <InfoNote title="How to interpret losses and the histogram"><MiniMarkdown text={HELP.losses} /></InfoNote>

          {lossLoading && <div style={{ fontSize: 12, opacity: .8 }}>Loading losses…</div>}
          {lossError && (
            <div style={{ fontSize: 12, color: "#b91c1c", background: "#fee2e2", border: "1px solid #fecaca", padding: 8, borderRadius: 8 }}>
              {lossError}
            </div>
          )}

          {losses && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 10 }}>
                  <div style={{ fontSize: 12, opacity: .7, marginBottom: 4 }}>Estimated fatalities (empirical)</div>
                  <div style={{ fontWeight: 800, fontSize: 24 }}>
                    {Number(losses.fatalitiesTotal || 0).toLocaleString()}
                  </div>
                </div>
                <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 10 }}>
                  <div style={{ fontSize: 12, opacity: .7, marginBottom: 4 }}>Economic losses (USD, empirical)</div>
                  <div style={{ fontWeight: 800, fontSize: 24 }}>
                    {fmtUSD0(losses.dollarsTotal)}
                  </div>
                </div>
              </div>

              {!!losses.perCountry.length && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 13, marginBottom: 6, opacity: .75 }}>By country (sorted by economic loss)</div>
                  <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead style={{ background: "#f8fafc" }}>
                        <tr>
                          <th style={{ textAlign: "left", padding: "6px 8px" }}>Country</th>
                          <th style={{ textAlign: "right", padding: "6px 8px" }}>Fatalities</th>
                          <th style={{ textAlign: "right", padding: "6px 8px" }}>Loss (USD)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {losses.perCountry.map((row, idx) => (
                          <tr key={row.code + idx} style={{ borderTop: "1px solid #f1f5f9" }}>
                            <td style={{ padding: "6px 8px" }}>{row.code}</td>
                            <td style={{ padding: "6px 8px", textAlign: "right" }}>{Number(row.fatalities || 0).toLocaleString()}</td>
                            <td style={{ padding: "6px 8px", textAlign: "right" }}>{fmtUSD0(row.dollars)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {histUrls.econ && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 13, marginBottom: 6, opacity: .75 }}>
                    Model uncertainty — Economic Alert Histogram
                  </div>
                  <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 10, background: "#fff" }}>
                    <img src={histUrls.econ} alt="PAGER Economic Alert Histogram"
                      style={{ width: "100%", height: "auto", display: "block", borderRadius: 8 }} loading="lazy" />
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* (4) Cráter */}
        <div style={{ marginTop: 18 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>4) Crater size estimation</div>
          <InfoNote title="How is crater size estimated?">
            <MiniMarkdown text={`
We use the **Holsapple–Schmidt scaling law** using impactor **mass, density, speed**, impact angle, target density and gravity.

- We derive **impactor diameter** from mass & density:  m = ρ·(π/6)·D³  ⇒  D = (6m / (πρ))^(1/3)
- The formula gives a **transient crater** (D_tr).  
- Final crater ≈ **1.25 × D_tr**.

In this view, we read mass/speed/density from the **form**, and use angle=45°, ρ_target=2500 kg/m³, g=9.81 m/s².
            `} />
          </InfoNote>

          <div style={{ marginTop: 8, border: "1px solid #e5e7eb", borderRadius: 10, padding: 10 }}>
            {!craterDims ? (
              <div style={{ fontSize: 12, color: "#92400e", background: "#fffbeb", border: "1px solid #fde68a", padding: 8, borderRadius: 8 }}>
                Missing form data to compute crater. Please fill the mass, speed and density.
              </div>
            ) : (
              <>
                <div><strong>Impactor diameter:</strong> {craterDims.Dimp.toFixed(1)} m</div>
                <div><strong>Transient crater:</strong> {craterDims.Dtr.toFixed(1)} m</div>
                <div><strong>Final crater:</strong> {craterDims.Dfin.toFixed(1)} m</div>
                <div style={{ fontSize: 12, opacity: .7, marginTop: 4 }}>
                  (angle = {craterDims.angleDeg}°, target density = {craterDims.targetDensity} kg/m³)
                </div>

                <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                  <button onClick={() => setCraterVisible(v => !v)}
                    style={{
                      fontSize: 12, padding: "6px 10px", borderRadius: 8, cursor: "pointer",
                      border: "1px solid rgba(0,0,0,.15)", background: "#fff"
                    }}>
                    {craterVisible ? "Hide crater" : "Show crater"}
                  </button>

                  <button onClick={refreshFromForm}
                    style={{
                      fontSize: 12, padding: "6px 10px", borderRadius: 8, cursor: "pointer",
                      border: "1px solid rgba(0,0,0,.15)", background: "#fff"
                    }}>
                    Recompute from form
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* (4.5) Fuego */}
        <div style={{ marginTop: 18 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>5) Fire ring (thermal dose)</div>
          <InfoNote title="How is the fire ring computed?">
            <MiniMarkdown text={`
We assume thermal radiation decays as **1/R²**.
Radius where **dose** exceeds threshold \\(Q_t\\):

\\( R = \\sqrt{\\dfrac{f_{rad}\\,E_k}{4\\pi\\,Q_t}} \\)

- **E_k**: impact energy (from the form)
- **f_rad**: fraction to thermal (demo: 0.03)
- **Q_t**: ignition/burn threshold (typ. **5–10 kJ/m²**)
            `} />
          </InfoNote>

          <div style={{ marginTop: 8, border: "1px solid #e5e7eb", borderRadius: 10, padding: 10 }}>
            {!fireParams ? (
              <div style={{ fontSize: 12, color: "#92400e", background: "#fffbeb", border: "1px solid #fde68a", padding: 8, borderRadius: 8 }}>
                Missing form energy to compute the thermal ring.
              </div>
            ) : (
              <>
                <div><strong>Radius:</strong> {(fireParams.Rfire_m / 1000).toFixed(2)} km</div>
                <div style={{ fontSize: 12, opacity: .7, marginTop: 4 }}>
                  (Qt = {fireParams.Qt_kJ_m2} kJ/m² · f_rad = {fireParams.fRad})
                </div>

                <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                  <button onClick={() => setFireVisible(v => !v)}
                    style={{
                      fontSize: 12, padding: "6px 10px", borderRadius: 8, cursor: "pointer",
                      border: "1px solid rgba(0,0,0,.15)", background: "#fff"
                    }}>
                    {fireVisible ? "Hide fire ring" : "Show fire ring"}
                  </button>

                  <button onClick={refreshFromForm}
                    style={{
                      fontSize: 12, padding: "6px 10px", borderRadius: 8, cursor: "pointer",
                      border: "1px solid rgba(0,0,0,.15)", background: "#fff"
                    }}>
                    Recompute from form
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* (5) Onda de choque */}
        <div style={{ marginTop: 18 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>6) Shock wave (overpressure)</div>

          <InfoNote title="How is overpressure radius computed?">
            <MiniMarkdown text={`
We use **scaled distance** \\(Z = R/W^{1/3}\\) with TNT equivalence.
Peak overpressure (empirical) in **psi**:

\\( P(Z) \\approx 8080/Z^3 + 114/Z^2 + 1/Z \\) → \\(P_{kPa} = 6.89476\\,P_{psi}\\).

Given threshold \\(P_{th}\\), we numerically invert to find \\(Z\\) and then \\(R = Z W^{1/3}\\).
Default \\(P_{th}=30\\,\\text{kPa}\\) (≈ 4.35 psi) ~ moderate structural damage.
            `} />
          </InfoNote>

          <div style={{ marginTop: 8, border: "1px solid #e5e7eb", borderRadius: 10, padding: 10 }}>
            {!shockParams ? (
              <div style={{ fontSize: 12, color: "#92400e", background: "#fffbeb", border: "1px solid #fde68a", padding: 8, borderRadius: 8 }}>
                Missing form energy to compute the shock ring.
              </div>
            ) : (
              <>
                <div><strong>Radius:</strong> {(shockParams.Rshock_m / 1000).toFixed(2)} km</div>
                <div><strong>Threshold:</strong> {shockParams.Pth_kPa} kPa (≈ {(shockParams.Pth_kPa / 6.89476).toFixed(2)} psi)</div>
                <div style={{ fontSize: 12, opacity: .7, marginTop: 4 }}>
                  Yield ≈ {shockParams.yield_kt.toFixed(2)} kt TNT (energy equivalence)
                </div>

                <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                  <button onClick={() => setShockVisible(v => !v)}
                    style={{
                      fontSize: 12, padding: "6px 10px", borderRadius: 8, cursor: "pointer",
                      border: "1px solid rgba(0,0,0,.15)", background: "#fff"
                    }}>
                    {shockVisible ? "Hide shock ring" : "Show shock ring"}
                  </button>

                  <button onClick={refreshFromForm}
                    style={{
                      fontSize: 12, padding: "6px 10px", borderRadius: 8, cursor: "pointer",
                      border: "1px solid rgba(0,0,0,.15)", background: "#fff"
                    }}>
                    Recompute from form
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* (6) Tsunami */}
        <div style={{ marginTop: 18 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>7) Tsunami</div>

          <div style={{ fontSize: 13, opacity: .75, marginBottom: 6 }}>
            Static bulletin (CORS blocked live fetch). Source: <code>tsunami.gov</code>
          </div>

          <InfoNote title="How to read a tsunami bulletin"><MiniMarkdown text={HELP.tsunami} /></InfoNote>

          <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 10, background: "#fff", marginTop: 8 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <span style={badgeStyle(tsuStatus.level)}>{tsuStatus.label}</span>
              <div style={{ display: "flex", gap: 8 }}>
                <a href="https://www.tsunami.gov/" target="_blank" rel="noreferrer" style={{ fontSize: 12, textDecoration: "underline" }}>
                  Open tsunami.gov
                </a>
                <button onClick={() => setTsuOpen(v => !v)}
                  style={{
                    fontSize: 12, padding: "6px 8px", borderRadius: 8,
                    border: "1px solid rgba(0,0,0,.15)", background: "#f8fafc", cursor: "pointer"
                  }}>
                  {tsuOpen ? "Hide details" : "Show details"}
                </button>
              </div>
            </div>

            {tsuOpen && (
              <pre style={{
                marginTop: 10, maxHeight: 260, overflow: "auto",
                background: "#f8fafc", border: "1px solid #e5e7eb",
                borderRadius: 8, padding: 10, whiteSpace: "pre-wrap"
              }}>
                {STATIC_TSUNAMI_TXT}
              </pre>
            )}
          </div>
        </div>

        <InfoNote title="How to use this view (quick guide)"><MiniMarkdown text={HELP.howToUse} /></InfoNote>
        <InfoNote title="Didactic disclaimer"><MiniMarkdown text={HELP.disclaimer} /></InfoNote>
      </div>

      {/* Drawer toggle */}
      <button
        onClick={() => setDrawerOpen(v => !v)}
        style={{
          position: "absolute",
          top: 12,
          left: drawerOpen ? 352 : 12,
          transition: "left .25s ease",
          padding: "8px 10px",
          borderRadius: 10,
          border: "1px solid rgba(0,0,0,.15)",
          background: "#fff",
          boxShadow: "0 6px 16px rgba(0,0,0,.12)",
          cursor: "pointer",
          zIndex: 1000
        }}
      >
        {drawerOpen ? "Hide menu" : "Show menu"}
      </button>

      {/* Back to home */}
      <button
        onClick={() => navigate("/")}
        style={{
          position: "absolute", top: 12, right: 12, padding: "8px 12px",
          borderRadius: 10, border: "1px solid rgba(0,0,0,.15)", background: "#fff",
          boxShadow: "0 6px 16px rgba(0,0,0,.12)", cursor: "pointer",
          zIndex: 1000
        }}
      >
        Back to home
      </button>
    </div>
  );
}
