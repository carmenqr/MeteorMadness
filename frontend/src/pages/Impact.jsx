import { useEffect, useRef, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

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

// --- Fetch helper ---
async function fetchJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} while loading ${url}`);
  return r.json();
}

// --- Text fetch helper (for tsunami.gov TXT)
async function fetchText(url) {
  const r = await fetch(url /*, { mode: 'cors' }*/);
  if (!r.ok) throw new Error(`HTTP ${r.status} while loading ${url}`);
  return r.text();
}

// // Very simple status parser for NWS/NOAA tsunami bulletins
// function parseTsunamiStatus(txt) {
//   const t = txt.toUpperCase();
//   if (/TSUNAMI WARNING/.test(t)) return { level: "warning", label: "Tsunami WARNING" };
//   if (/TSUNAMI WATCH/.test(t)) return { level: "watch", label: "Tsunami WATCH" };
//   if (/TSUNAMI ADVISORY/.test(t)) return { level: "advisory", label: "Tsunami ADVISORY" };
//   if (/NO TSUNAMI THREAT/.test(t) || /THERE IS NO TSUNAMI THREAT/.test(t))
//     return { level: "no_threat", label: "No tsunami threat" };
//   return { level: "info", label: "Tsunami information" };
// }

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


// Find a content URL within a PAGER/losspager product using regex patterns
function findContentUrl(contents, patterns) {
  const keys = Object.keys(contents || {});
  for (const pat of patterns) {
    const re = new RegExp(pat, "i");
    const k = keys.find((key) => re.test(key));
    if (k && contents[k]?.url) return contents[k].url;
  }
  return null;
}

// Map 1..10 -> Roman used in the UI (10 -> "X+")
const numToMMI = (n) => {
  const map = { 1: "I", 2: "II", 3: "III", 4: "IV", 5: "V", 6: "VI", 7: "VII", 8: "VIII", 9: "IX", 10: "X+" };
  return map[n] || null;
};

// Robust aggregator for PAGER exposures (handles the schema you pasted)
function aggregateExposure(exposureJson) {
  const totals = {};
  labelOrder.forEach(l => (totals[l] = 0));

  // CASE: { population_exposure: { mmi:[1..10], aggregated_exposure:[...] } }
  const pe = exposureJson?.population_exposure;
  if (pe && Array.isArray(pe.mmi) && Array.isArray(pe.aggregated_exposure)) {
    pe.mmi.forEach((mmiNum, idx) => {
      const lab = numToMMI(Number(mmiNum));
      const val = Number(pe.aggregated_exposure[idx] ?? 0) || 0;
      if (lab && lab in totals) totals[lab] += val;
    });
    return totals;
  }

  // Fallbacks for other events (kept for robustness)
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

// Normalize city rows into {name, country, population, mmi, distance}
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

// Parse losses.json → { fatalitiesTotal, dollarsTotal, perCountry[] }
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

export default function ImpactMMI() {
  const { eventId: routeEventId } = useParams();
  const eventId = routeEventId || "us6000rcqw"; // demo default
  const mapRef = useRef(null);
  const containerRef = useRef(null);
  const groupRef = useRef(null);
  const contoursLayerRef = useRef(null);
  const navigate = useNavigate();

  // UI state
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [selectedLabel, setSelectedLabel] = useState(null);
  const [impactInfo, setImpactInfo] = useState(null);

  // PAGER state (population / cities / losses / histograms)
  const [exposureTotals, setExposureTotals] = useState(null);
  const [cities, setCities] = useState([]);
  const [popLoading, setPopLoading] = useState(false);
  const [popError, setPopError] = useState(null);

  const [losses, setLosses] = useState(null);
  const [lossLoading, setLossLoading] = useState(false);
  const [lossError, setLossError] = useState(null);

  const [histUrls, setHistUrls] = useState({ fatal: null, econ: null });

  // // TSUNAMI state
  // const [tsuUrl, setTsuUrl] = useState(
  //   "https://www.tsunami.gov/events/PAAQ/2025/09/25/t34le6/1/WEXX32/WEXX32.txt"
  // );
  // const [tsuLoading, setTsuLoading] = useState(false);
  // const [tsuError, setTsuError] = useState(null);
  // const [tsuText, setTsuText] = useState(null);
  // const [tsuStatus, setTsuStatus] = useState(null);
  // const [tsuOpen, setTsuOpen] = useState(false); // para plegar/desplegar el <pre>


  // Create map once
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

  // Invalidate after drawer animation so Leaflet reflows tiles
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const t = setTimeout(() => map.invalidateSize(), 260);
    return () => clearTimeout(t);
  }, [drawerOpen]);

  // Load event + contours + PAGER/losspager JSONs/PNGs
  useEffect(() => {
    const map = mapRef.current;
    const group = groupRef.current;
    if (!map || !group) return;

    group.clearLayers();
    contoursLayerRef.current = null;

    // reset UI slices
    setExposureTotals(null);
    setCities([]);
    setPopError(null);
    setPopLoading(false);

    setLosses(null);
    setLossError(null);
    setLossLoading(false);

    setHistUrls({ fatal: null, econ: null });

    const DETAIL_URL = `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&eventid=${eventId}`;
    let abort = false;

    (async () => {
      try {
        const detail = await fetchJson(DETAIL_URL);
        if (abort) return;

        // “Impact point” proxy
        const [lon, lat, depth] = detail.geometry.coordinates;
        const whenISO = new Date(detail.properties.time).toISOString();
        const mag = detail.properties.mag;
        const place = detail.properties.place || "—";

        setImpactInfo({ magnitude: mag, place, whenISO });

        L.circleMarker([lat, lon], {
          radius: 6, weight: 2, color: "#111", fillColor: "#ffcc00", fillOpacity: 0.9
        })
          .bindPopup(
            `<strong>Impact point (demo)</strong><br>` +
            `Proxy magnitude: M ${mag}<br>` +
            `${place}<br>` +
            `${whenISO.replace("T", " ").slice(0, 19)} UTC<br>` +
            `Proxy depth: ${depth} km`
          )
          .addTo(group);

        // Shake-style MMI contours (proxy for impact ground motion)
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

        // Fit to current layers
        if (!abort) {
          if (group.getLayers().length > 0) {
            map.fitBounds(group.getBounds().pad(0.2));
          } else {
            map.setView([lat, lon], 6);
          }
          map.invalidateSize();
        }

        // === Load PAGER/LOSsPAGER JSONs/PNGs ===
        const pager = (detail.properties?.products?.losspager
          ?? detail.properties?.products?.pager
          ?? [])[0];

        if (pager?.contents && !abort) {
          console.log("[losspager contents]", Object.keys(pager.contents));

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

          // Histogram PNGs (prefer full size, fallback to small/smaller)
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
            if (!exposureJson && !cityJson) {
              setPopError("No PAGER exposure/cities JSON found. Check console keys.");
            }

            if (lossesJson) {
              setLosses(parseLosses(lossesJson));
            } else if (lossesUrl) {
              setLossError("Could not load losses.json");
            }

            setHistUrls({
              fatal: fatalPng || null,
              econ: econPng || null
            });
          }
        } else {
          setPopError("No losspager product available for this event.");
        }
      } catch (e) {
        if (!abort) {
          console.error(e);
          setPopError(e.message || String(e));
        }
      } finally {
        if (!abort) {
          setPopLoading(false);
          setLossLoading(false);
        }
      }
    })();

    return () => { abort = true; };
  }, [eventId, selectedLabel]);

  // Restyle when MMI filter changes (no refetch)
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

/*   // Carga del boletín de tsunami.gov con fallback vía proxy backend
  useEffect(() => {
    let aborted = false;
    if (!tsuUrl) return;

    (async () => {
      setTsuLoading(true);
      setTsuError(null);
      setTsuText(null);
      setTsuStatus(null);

      // 1) Intento directo
      const tryFetch = async (url) => {
        try {
          const txt = await fetchText(url);
          if (aborted) return;
          setTsuText(txt);
          setTsuStatus(parseTsunamiStatus(txt));
          setTsuLoading(false);
          return true;
        } catch (e) {
          return false;
        }
      };

      // 2) Si falla (CORS), probar vía proxy backend
      const proxiedUrl =
        (import.meta.env?.VITE_API_URL
          ? `${import.meta.env.VITE_API_URL.replace(/\/$/, "")}/api/proxy?url=${encodeURIComponent(tsuUrl)}`
          : `/api/proxy?url=${encodeURIComponent(tsuUrl)}`);

      const okDirect = await tryFetch(tsuUrl);
      if (!okDirect) {
        const okProxy = await tryFetch(proxiedUrl);
        if (!okProxy && !aborted) {
          setTsuError("Network/CORS error fetching bulletin (direct and proxy).");
          setTsuLoading(false);
        }
      }
    })();

    return () => { aborted = true; };
  }, [tsuUrl]);
 */

  // UI helpers
  const mmiOptions = useMemo(() => labelOrder.map(lab => ({
    label: lab,
    color: mmiBreaks.find(b => b.label === lab)?.color
  })), []);

  const totalPeople = useMemo(() => {
    if (!exposureTotals) return 0;
    return Object.values(exposureTotals).reduce((a, b) => a + (Number(b) || 0), 0);
  }, [exposureTotals]);

  const fmtUSD0 = (n) =>
    Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });

  return (
    <div style={{ position: "fixed", inset: 0 }}>
      {/* Full-screen map */}
      <div
        ref={containerRef}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", background: "#e5e7eb", zIndex: 0 }}
      />

      {/* Title box (moved to top-right, below Back to home button) */}
      <div style={{
        position: "absolute",
        top: 56,              // debajo del botón "Back to home" (que está en top:12)
        right: 12,            // ahora a la derecha, no se tapa con el drawer
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
          left: drawerOpen ? 0 : -320,
          width: 320,
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

        {/* Step 1: Impact shaking (MMI) */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>1) Ground shaking (MMI)</div>

          <div style={{ marginBottom: 6, opacity: .8 }}>
            “What does this intensity feel like?”
          </div>

          {/* MMI selector */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 6 }}>
            {mmiOptions.map(opt => (
              <button
                key={opt.label}
                onClick={() => setSelectedLabel(prev => prev === opt.label ? null : opt.label)}
                title={`MMI ${opt.label}`}
                style={{
                  padding: "6px 0",
                  borderRadius: 8,
                  border: selectedLabel === opt.label ? "2px solid #111" : "1px solid rgba(0,0,0,.2)",
                  background: opt.color,
                  cursor: "pointer",
                  fontWeight: 600
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Selection description */}
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

        {/* Step 2: Exposed population */}
        <div style={{ marginTop: 18 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>2) Exposed population</div>

          {popLoading && (
            <div style={{ fontSize: 12, opacity: .8 }}>Loading exposure data…</div>
          )}

          {popError && (
            <div style={{ fontSize: 12, color: "#b91c1c", background: "#fee2e2", border: "1px solid #fecaca", padding: 8, borderRadius: 8 }}>
              Could not load population data: {popError}
            </div>
          )}

          {/* Exposure totals by MMI */}
          {exposureTotals && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 13, marginBottom: 6, opacity: .75 }}>
                Estimated people exposed by MMI (PAGER proxy)
              </div>
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead style={{ background: "#f8fafc" }}>
                    <tr>
                      <th style={{ textAlign: "left", padding: "6px 8px" }}>MMI</th>
                      <th style={{ textAlign: "right", padding: "6px 8px" }}>People</th>
                    </tr>
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
                        {totalPeople.toLocaleString()}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: 6, fontSize: 12, opacity: .65 }}>
                Note: PAGER exposure is derived from the proxy event; real impact runs would compute it from the impactor parameters and local demographics.
              </div>
            </div>
          )}

          {/* City list (renders only if cities.json exists for the event) */}
          {!!cities.length && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 13, marginBottom: 6, opacity: .75 }}>
                Affected cities (top 10 by population)
              </div>
              <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead style={{ background: "#f8fafc" }}>
                    <tr>
                      <th style={{ textAlign: "left", padding: "6px 8px" }}>City</th>
                      <th style={{ textAlign: "left", padding: "6px 8px" }}>Country/Region</th>
                      <th style={{ textAlign: "right", padding: "6px 8px" }}>Population</th>
                      <th style={{ textAlign: "center", padding: "6px 8px" }}>MMI</th>
                      <th style={{ textAlign: "right", padding: "6px 8px" }}>Dist (km)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cities
                      .slice()
                      .sort((a, b) => (b.population || 0) - (a.population || 0))
                      .slice(0, 10)
                      .map((c, idx) => (
                        <tr key={`${c.name}-${idx}`} style={{ borderTop: "1px solid #f1f5f9" }}>
                          <td style={{ padding: "6px 8px" }}>{c.name}</td>
                          <td style={{ padding: "6px 8px" }}>{c.country || "—"}</td>
                          <td style={{ padding: "6px 8px", textAlign: "right" }}>{(c.population || 0).toLocaleString()}</td>
                          <td style={{ padding: "6px 8px", textAlign: "center", fontWeight: 600 }}>{c.mmi || "—"}</td>
                          <td style={{ padding: "6px 8px", textAlign: "right" }}>
                            {Number.isFinite(c.distance) ? c.distance.toFixed(1) : "—"}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Fatality histogram under Step 2 */}
          {histUrls.fatal && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 13, marginBottom: 6, opacity: .75 }}>
                Fatality Alert Histogram (empirical probabilities)
              </div>
              <img
                src={histUrls.fatal}
                alt="PAGER Fatality Alert Histogram"
                style={{
                  width: "100%",
                  height: "auto",
                  display: "block",
                  borderRadius: 10,
                  border: "1px solid #e5e7eb",
                  background: "#fafafa"
                }}
                loading="lazy"
              />
            </div>
          )}
        </div>

        {/* Step 3: Economic & fatality risk */}
        <div style={{ marginTop: 18 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>3) Economic & fatality risk</div>

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
                  <div style={{ fontSize: 13, marginBottom: 6, opacity: .75 }}>
                    By country (sorted by economic loss)
                  </div>
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
                            <td style={{ padding: "6px 8px", textAlign: "right" }}>
                              {Number(row.fatalities || 0).toLocaleString()}
                            </td>
                            <td style={{ padding: "6px 8px", textAlign: "right" }}>
                              {fmtUSD0(row.dollars)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Economic histogram ONLY in Step 3 */}
              {histUrls.econ && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 13, marginBottom: 6, opacity: .75 }}>
                    Model uncertainty — Economic Alert Histogram
                  </div>
                  <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 10, background: "#fff" }}>
                    <img
                      src={histUrls.econ}
                      alt="PAGER Economic Alert Histogram"
                      style={{ width: "100%", height: "auto", display: "block", borderRadius: 8 }}
                      loading="lazy"
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Step 4: Tsunami (bulletin from tsunami.gov) 
        <div style={{ marginTop: 18 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>4) Tsunami</div>

          <div style={{ fontSize: 13, opacity: .75, marginBottom: 6 }}>
            Live bulletin fetched from <code>tsunami.gov</code>.
          </div>

          {tsuLoading && <div style={{ fontSize: 12, opacity: .8 }}>Checking tsunami bulletin…</div>}
          {tsuError && (
            <div style={{
              fontSize: 12, color: "#b91c1c", background: "#fee2e2", border: "1px solid #fecaca",
              padding: 8, borderRadius: 8
            }}>
              Could not load bulletin: {tsuError}<br />
              {/* Sugerencia si CORS: 
              If this is a CORS issue, route via your backend proxy (/api/proxy).
            </div>
          )}

          {tsuStatus && (
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 10, background: "#fff" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <span style={badgeStyle(tsuStatus.level)}>{tsuStatus.label}</span>
                <div style={{ display: "flex", gap: 8 }}>
                  <a href={tsuUrl} target="_blank" rel="noreferrer"
                    style={{ fontSize: 12, textDecoration: "underline" }}>Open TXT</a>
                  <button
                    onClick={() => setTsuOpen(v => !v)}
                    style={{
                      fontSize: 12, padding: "6px 8px", borderRadius: 8,
                      border: "1px solid rgba(0,0,0,.15)", background: "#f8fafc", cursor: "pointer"
                    }}
                  >
                    {tsuOpen ? "Hide details" : "Show details"}
                  </button>
                </div>
              </div>

              {tsuOpen && tsuText && (
                <pre style={{
                  marginTop: 10, maxHeight: 260, overflow: "auto",
                  background: "#f8fafc", border: "1px solid #e5e7eb",
                  borderRadius: 8, padding: 10, whiteSpace: "pre-wrap"
                }}>{tsuText}</pre>
              )}
            </div>
          )}

          {/* (opcional) permitir cambiar la URL del TXT en runtime 
          <div style={{ marginTop: 10, fontSize: 12, opacity: .7 }}>
            Source TXT:&nbsp;
            <input
              value={tsuUrl}
              onChange={(e) => setTsuUrl(e.target.value)}
              style={{ width: "100%", padding: "6px 8px", borderRadius: 8, border: "1px solid #e5e7eb" }}
              placeholder="https://www.tsunami.gov/.../WEXX32.txt"
            />
          </div>
        </div> 
        */}


        {/* Small note */}
        <div style={{ marginTop: 16, fontSize: 12, opacity: .65 }}>
          This is a didactic demo. Replace the proxy PAGER with your own impact-run outputs for fully realistic impact consequences.
        </div>
      </div>

      {/* Drawer toggle */}
      <button
        onClick={() => setDrawerOpen(v => !v)}
        style={{
          position: "absolute",
          top: 12,
          left: drawerOpen ? 332 : 12,
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
    </div >
  );
}