// src/home-panel.js
// Self-contained side panel for asteroid/planet info with didactic explanations

let panelEl = null;
let resetHandlers = new Set();

function ensurePanel() {
  if (panelEl) return panelEl;

  panelEl = document.createElement('div');
  panelEl.id = 'info-panel';
  Object.assign(panelEl.style, {
    position: 'fixed',
    top: '12px',
    left: '12px',
    width: '360px',
    maxHeight: '70vh',
    overflow: 'auto',
    background: 'rgba(11,18,32,.96)',
    color: '#e5e7eb',
    border: '1px solid #ffffff22',
    borderRadius: '14px',
    padding: '14px',
    font: '13px/1.45 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
    zIndex: 25,
    display: 'none',
    pointerEvents: 'auto',
    boxShadow: '0 10px 30px rgba(0,0,0,.35)',
  });

  const style = document.createElement('style');
  style.textContent = `
    #info-panel .title { font-weight: 800; font-size: 18px; letter-spacing:.2px; }
    #info-panel .topbar { display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:8px; }
    #info-panel .btn {
      background:#334155; color:#fff; border:none; border-radius:10px;
      padding:6px 10px; cursor:pointer; font-size:12px;
    }
    #info-panel .btn:hover { filter:brightness(1.08); }
    #info-panel .intro {
      font-size:12px; color:#cbd5e1; background:#0b1220; border:1px dashed #334155;
      border-radius:10px; padding:10px; margin:10px 0 12px 0;
    }
    #info-panel .grid {
      display:grid; grid-template-columns: 24px 1fr auto; align-items:center; gap:8px 10px;
    }
    #info-panel .qmark {
      width:22px; height:22px; border-radius:50%; display:flex; align-items:center; justify-content:center;
      background:#1f2a44; cursor:pointer; user-select:none; font-weight:700;
    }
    #info-panel .param { color:#e2e8f0; }
    #info-panel .value { color:#f8fafc; font-weight:600; }
    #info-panel .tooltip {
      grid-column: 1 / -1; background:#0c1326; border:1px solid #213055; border-radius:10px;
      padding:8px 10px; color:#dbeafe; font-size:12px; display:none;
    }
    #info-panel .tooltip.show { display:block; }
    #info-panel hr.sep { border:none; border-top:1px solid #1f2937; margin:10px 0; }
    #info-panel .muted { opacity:.85; }
    #info-panel .tag { font-size:11px; background:#0f172a; border:1px solid #24365f; padding:2px 6px; border-radius:999px; }
    #info-panel .units { display:block; margin-top:6px; color:#93c5fd; }

    /* --- Form mode (Impactor2025) --- */
    #info-panel .form { display:flex; flex-direction:column; gap:12px; margin-top:8px; }
    #info-panel .field { display:flex; flex-direction:column; gap:6px; }
    #info-panel .field label { font-weight:700; font-size:12px; color:#e2e8f0; }
    #info-panel .field input {
      background:#0b1220; color:#e5e7eb; border:1px solid #24365f; border-radius:10px;
      padding:8px 10px; font-size:13px; outline:none;
    }
    #info-panel .field small { color:#93c5fd; font-size:11px; }
    #info-panel .actions { display:flex; gap:8px; margin-top:6px; }
    #info-panel .btn.primary { background:#2563eb; }
  `;
  document.head.appendChild(style);

  document.body.appendChild(panelEl);

  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') hidePanel(); });
  return panelEl;
}

export function initInfoPanel() { ensurePanel(); }

export function hidePanel() {
  if (!panelEl) return;
  panelEl.style.display = 'none';
  panelEl.innerHTML = '';
}

/** Definitions, labels and units for common orbital elements */
const PARAM_DEFS = {
  a: { label: 'Semi-major axis (a)', unit: 'AU',
    desc:'Half of the longest diameter of the ellipse. It sets the orbit size and strongly affects the orbital period.',
    unitsDesc:'Astronomical Unit (AU). 1 AU ≈ 149,597,870 km.' },
  e: { label: 'Eccentricity (e)', unit: '',
    desc:'How stretched the ellipse is. 0 = circle; values near 1 = very elongated.',
    unitsDesc:'Dimensionless (no units), range [0,1) for elliptic orbits.' },
  i: { label: 'Inclination (i)', unit: 'deg',
    desc:'Tilt of the orbital plane with respect to the ecliptic. 0° means the orbit lies in the ecliptic plane.',
    unitsDesc:'Degrees (°).' },
  om:{ label:'Longitude of ascending node (Ω)', unit:'deg',
    desc:'Angle in the reference plane from the reference direction to the ascending node (northward crossing).',
    unitsDesc:'Degrees (°).' },
  w: { label:'Argument of periapsis (ω)', unit:'deg',
    desc:'Angle in the orbital plane from the ascending node to periapsis (closest point).',
    unitsDesc:'Degrees (°).' },
  mean_anomaly_deg:{ label:'Mean anomaly (M)', unit:'deg',
    desc:'Angle that increases uniformly with time; from M we solve Kepler’s equation to get the true position.',
    unitsDesc:'Degrees (°). Sometimes radians.' },
  M0:{ label:'Mean anomaly at epoch (M₀)', unit:'deg',
    desc:'Mean anomaly at the epoch t₀. With mean motion n it gives M(t) = M₀ + n·(t−t₀).',
    unitsDesc:'Degrees (°).' },
  mean_motion:{ label:'Mean motion (n)', unit:'deg/day',
    desc:'Average angular speed along the orbit. Often n = 360°/P. In SI, n = √(μ/a³) (rad/s).',
    unitsDesc:'Degrees per day (°/day) or radians per second.' },
  n:{ label:'Mean motion (n)', unit:'deg/day',
    desc:'Average angular speed along the orbit. Often n = 360°/P. In SI, n = √(μ/a³) (rad/s).',
    unitsDesc:'Degrees per day (°/day) or radians per second.' },
  epoch:{ label:'Epoch (t₀)', unit:'JD',
    desc:'Reference instant for these elements. Propagate from t₀ to evaluate at another time.',
    unitsDesc:'Julian Date (JD). Example: 2451545 = J2000.0.' },
  hazardous:{ label:'Potentially hazardous?', unit:'',
    desc:'Monitoring flag (size + approach distance). Not an impact prediction.',
    unitsDesc:'Boolean (yes/no).' },
  name:{ label:'Name', unit:'', desc:'', unitsDesc:'' },
  id:{ label:'ID', unit:'', desc:'', unitsDesc:'' },
};

function h(val) {
  return String(val).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function formatValue(key, raw) {
  if (raw == null) return '—';
  if (typeof raw === 'boolean') return raw ? 'yes' : 'no';
  if (typeof raw === 'number') {
    const isIntLike = Math.abs(raw - Math.round(raw)) < 1e-9;
    const num = isIntLike ? Math.round(raw) : Number(raw).toFixed(6);
    const unit = PARAM_DEFS[key]?.unit || '';
    return unit ? `${num} ${unit}` : `${num}`;
  }
  const unit = PARAM_DEFS[key]?.unit || '';
  return unit ? `${h(raw)} ${unit}` : h(raw);
}

/** Ordered keys to display if present in item.obj */
const ORDER = ['a','e','i','om','w','mean_anomaly_deg','M0','mean_motion','n','epoch','hazardous'];

export function showPanelFor(item) {
  ensurePanel();
  if (!item) return hidePanel();

  const obj = item.obj || {};
  const displayName = (obj.name || item.mesh?.name || 'Object');

  // —— SPECIAL CASE: Impactor2025 -> show form instead of info ——
  if (String(displayName).toLowerCase() === 'impactor2025') {
    panelEl.innerHTML = `
      <div class="topbar">
        <div class="title">${h(displayName)}</div>
        <div style="display:flex; gap:6px;">
          <button id="btn-reset" class="btn">Restore</button>
        </div>
      </div>

      <div class="form">
        <div class="field">
          <label for="inp-mass">Mass</label>
          <input id="inp-mass" type="number" min="0" step="any" placeholder="e.g., 1.2e9">
          <small>Units: kilograms (kg)</small>
        </div>
        <div class="field">
          <label for="inp-velocity">Velocity</label>
          <input id="inp-velocity" type="number" min="0" step="any" placeholder="e.g., 20.5">
          <small>Units: kilometers per second (km/s)</small>
        </div>
        <div class="field">
          <label for="inp-volume">Volume</label>
          <input id="inp-volume" type="number" min="0" step="any" placeholder="e.g., 5.0e6">
          <small>Units: cubic meters (m³)</small>
        </div>

        <div class="actions">
          <button id="btn-impact" class="btn primary" type="button">Impact</button>
          <button id="btn-mitigate" class="btn" type="button">Mitigate</button>
        </div>
      </div>
    `;
    panelEl.style.display = 'block';

    // Buttons (no behavior yet, just prevent default)
    panelEl.querySelector('#btn-reset')?.addEventListener('click', () => {
      for (const fn of resetHandlers) try { fn(); } catch {}
    });
    panelEl.querySelector('#btn-impact')?.addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent('panel:navigate', { detail: '/impact' }))
    });
    panelEl.querySelector('#btn-mitigate')?.addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent('panel:navigate', { detail: '/mitigate' }))
    });

    return; // <— important: do not render the info grid
  }

  // —— Default info mode ——
  const introHTML = `
    <div class="intro">
      <b>How do we compute an orbit?</b><br/>
      In classical mechanics an orbit is described by six “Keplerian elements”.
      Three of them set the <span class="muted">size/shape/orientation</span> of the ellipse:
      <span class="tag">semi-major axis (a)</span>, <span class="tag">eccentricity (e)</span> and <span class="tag">inclination (i)</span>.
      The other three locate the ellipse in space and place the body on it:
      <span class="tag">longitude of ascending node (Ω)</span>,
      <span class="tag">argument of periapsis (ω)</span>, and
      <span class="tag">mean anomaly (M) at a given epoch</span>.
      Using these, we solve Kepler’s equation to get the true position along the orbit.
    </div>
  `;

  const rows = [];
  function pushRow(key, value, fallbackKey) {
    let k = key, v = value;
    if (v == null && fallbackKey) { k = fallbackKey; v = obj[fallbackKey]; }
    if (v == null) return;
    const def = PARAM_DEFS[k] || { label: k, unit: '', desc: '', unitsDesc: '' };
    const rowId = `tip-${k}-${Math.random().toString(36).slice(2, 7)}`;
    rows.push(`
      <div class="qmark" data-tip="${rowId}" title="What is ${def.label}?">?</div>
      <div class="param">${def.label}</div>
      <div class="value">${formatValue(k, v)}</div>
      <div id="${rowId}" class="tooltip">
        ${def.desc}
        ${def.unitsDesc ? `<span class="units"><b>Units:</b> ${def.unitsDesc}</span>` : ''}
      </div>
    `);
  }
  for (const key of ORDER) {
    if (key === 'mean_anomaly_deg') pushRow('mean_anomaly_deg', obj.mean_anomaly_deg, 'M0');
    else if (key === 'mean_motion') pushRow('mean_motion', obj.mean_motion, 'n');
    else pushRow(key, obj[key]);
  }

  panelEl.innerHTML = `
    <div class="topbar">
      <div class="title">${h(displayName)}</div>
      <div style="display:flex; gap:6px;">
        <button id="btn-reset" class="btn">Close</button>
      </div>
    </div>
    ${introHTML}
    <hr class="sep"/>
    <div class="grid">
      ${rows.join('')}
    </div>
  `;
  panelEl.style.display = 'block';

  panelEl.querySelector('#btn-reset')?.addEventListener('click', () => {
    for (const fn of resetHandlers) try { fn(); } catch {}
  });

  panelEl.querySelectorAll('.qmark').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.getAttribute('data-tip');
      const tip = id ? panelEl.querySelector(`#${id}`) : null;
      if (!tip) return;
      tip.classList.toggle('show');
    });
  });
}

/** Allow home.js to react to "Restore" click */
export function onPanelReset(handler) {
  resetHandlers.add(handler);
  return () => resetHandlers.delete(handler);
}
