import * as THREE from 'three';
import { mascotSay } from "../utils/mascotBus.js";


let panelEl = null;
let panelStyleEl = null;
let keydownHandler = null;

const resetHandlers = new Set();

let impactorState = { massKg: null, speedKms: null, densityKgM3: null };
const impactorListeners = new Set();


export function getImpactorState() {
  return { ...impactorState };
}
export function onImpactorChange(handler) {
  impactorListeners.add(handler);
  return () => impactorListeners.delete(handler);
}

export function onPanelReset(handler) {
  resetHandlers.add(handler);
  return () => resetHandlers.delete(handler);
}

export function offPanelReset(fn) { resetHandlers.delete(fn); }
export function offImpactorChange(fn) { impactorListeners.delete(fn); }

function emitImpactorChange() {
  for (const fn of impactorListeners) { try { fn({ ...impactorState }); } catch { } }
}

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
    #info-panel .label-row { display:flex; align-items:center; gap:6px; }
    #info-panel .field label { font-weight:700; font-size:12px; color:#e2e8f0; }
    #info-panel .field input, 
    #info-panel .field select {
      background:#0b1220; color:#e5e7eb; border:1px solid #24365f; border-radius:10px;
      padding:8px 10px; font-size:13px; outline:none;
    }
    #info-panel .field small { color:#93c5fd; font-size:11px; }
    #info-panel .actions { display:flex; gap:8px; margin-top:6px; }
    #info-panel .btn.primary { background:#2563eb; }
    #info-panel .danger { color:#fecaca; }

    /* Tooltips inside form */
    #info-panel .form-tip { 
      background:#0c1326; border:1px solid #213055; border-radius:10px;
      padding:8px 10px; color:#dbeafe; font-size:12px; display:none; margin-top:4px;
    }
    #info-panel .form-tip.show { display:block; }
    #info-panel .qmark.inline { width:18px; height:18px; font-size:12px; }
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

export function destroyInfoPanel() {
  if (keydownHandler) {
    window.removeEventListener('keydown', keydownHandler);
    keydownHandler = null;
  }
  if (panelEl?.parentNode) {
    panelEl.parentNode.removeChild(panelEl);
  }
  if (panelStyleEl?.parentNode) {
    panelStyleEl.parentNode.removeChild(panelStyleEl);
  }
  panelEl = null;
  panelStyleEl = null;
  resetHandlers.clear();
  impactorListeners.clear();
}

const PARAM_DEFS = {
  a: {
    label: 'Semi-major axis (a)', unit: 'AU',
    desc: 'Half of the longest diameter of the ellipse. It sets the orbit size and strongly affects the orbital period.',
    unitsDesc: 'Astronomical Unit (AU). 1 AU ≈ 149,597,870 km.'
  },
  e: {
    label: 'Eccentricity (e)', unit: '',
    desc: 'How stretched the ellipse is. 0 = circle; values near 1 = very elongated.',
    unitsDesc: 'Dimensionless (no units), range [0,1) for elliptic orbits.'
  },
  i: {
    label: 'Inclination (i)', unit: 'deg',
    desc: 'Tilt of the orbital plane with respect to the ecliptic. 0° means the orbit lies in the ecliptic plane.',
    unitsDesc: 'Degrees (°).'
  },
  om: {
    label: 'Longitude of ascending node (Ω)', unit: 'deg',
    desc: 'Angle in the reference plane from the reference direction to the ascending node (northward crossing).',
    unitsDesc: 'Degrees (°).'
  },
  w: {
    label: 'Argument of periapsis (ω)', unit: 'deg',
    desc: 'Angle in the orbital plane from the ascending node to periapsis (closest point).',
    unitsDesc: 'Degrees (°).'
  },
  mean_anomaly_deg: {
    label: 'Mean anomaly (M)', unit: 'deg',
    desc: 'Angle that increases uniformly with time; from M we solve Kepler’s equation to get the true position.',
    unitsDesc: 'Degrees (°). Sometimes radians.'
  },
  M0: {
    label: 'Mean anomaly at epoch (M₀)', unit: 'deg',
    desc: 'Mean anomaly at the epoch t₀. With mean motion n it gives M(t) = M₀ + n·(t−t₀).',
    unitsDesc: 'Degrees (°).'
  },
  mean_motion: {
    label: 'Mean motion (n)', unit: 'deg/day',
    desc: 'Average angular speed along the orbit. Often n = 360°/P. In SI, n = √(μ/a³) (rad/s).',
    unitsDesc: 'Degrees per day (°/day) or radians per second.'
  },
  n: {
    label: 'Mean motion (n)', unit: 'deg/day',
    desc: 'Average angular speed along the orbit. Often n = 360°/P. In SI, n = √(μ/a³) (rad/s).',
    unitsDesc: 'Degrees per day (°/day) or radians per second.'
  },
  epoch: {
    label: 'Epoch (t₀)', unit: 'JD',
    desc: 'Reference instant for these elements. Propagate from t₀ to evaluate at another time.',
    unitsDesc: 'Julian Date (JD). Example: 2451545 = J2000.0.'
  },
  hazardous: {
    label: 'Potentially hazardous?', unit: '',
    desc: 'Monitoring flag (size + approach distance). Not an impact prediction.',
    unitsDesc: 'Boolean (yes/no).'
  },
  name: { label: 'Name', unit: '', desc: '', unitsDesc: '' },
  id: { label: 'ID', unit: '', desc: '', unitsDesc: '' },
};

function h(val) {
  return String(val).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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

const ORDER = ['a', 'e', 'i', 'om', 'w', 'mean_anomaly_deg', 'M0', 'mean_motion', 'n', 'epoch', 'hazardous'];

export function showPanelFor(item) {
  ensurePanel();
  if (!item) return hidePanel();

  const obj = item.obj || {};
  const displayName = (obj.name || item.mesh?.name || 'Object');

  if (String(displayName).toLowerCase() === 'impactor2025') {
    try { mascotClear(); } catch { }
    mascotSay("🛰️ Welcome to the Impactor setup!");
    setTimeout(() => mascotSay("Here you can set the asteroid’s mass, speed, and density."), 6000);
    setTimeout(() => mascotSay("Once ready, click 'Impact' to simulate or 'Mitigate' to prevent disaster."), 12000);

    const MAX_MASS_KG = 1e12;
    const MIN_VEL_KMS = 11;
    const MAX_VEL_KMS = 72;

    const tipMassId = `tip-mass-${Math.random().toString(36).slice(2, 7)}`;
    const tipVelId = `tip-vel-${Math.random().toString(36).slice(2, 7)}`;
    const tipDenId = `tip-den-${Math.random().toString(36).slice(2, 7)}`;

    panelEl.innerHTML = `
      <div class="topbar">
        <div class="title">${h(displayName)}</div>
        <div style="display:flex; gap:6px;">
          <button id="btn-reset" class="btn">Restore</button>
        </div>
      </div>

      <div class="form">
        <div class="field">
          <div class="label-row">
            <label for="inp-mass">Mass</label>
            <div class="qmark inline" data-tip="${tipMassId}" title="What is mass?">?</div>
          </div>
          <input id="inp-mass" type="number" min="0" max="${MAX_MASS_KG}" step="any" placeholder="e.g., 1.2e9" inputmode="decimal">
          <small>Units: kilograms (kg). Max: 1e12 kg (one billion tonnes).</small>
          <div id="${tipMassId}" class="form-tip">
            <b>Why it matters:</b> Mass multiplies impact energy: <i>E = ½·m·v²</i>.
            Higher mass → larger crater diameter, more ejecta, stronger seismic waves and higher tsunami potential (if water impact).
          </div>
        </div>

        <div class="field">
          <div class="label-row">
            <label for="inp-velocity">Impact velocity</label>
            <div class="qmark inline" data-tip="${tipVelId}" title="What is impact velocity?">?</div>
          </div>
          <input id="inp-velocity" type="number" min="${MIN_VEL_KMS}" max="${MAX_VEL_KMS}" step="any" placeholder="e.g., 20.5" inputmode="decimal">
          <small>Units: kilometers per second (km/s). Allowed range: 11–72 km/s.</small>
          <div id="${tipVelId}" class="form-tip">
            <b>Why it matters:</b> Velocity enters squared in <i>E = ½·m·v²</i>.
            Higher speed → disproportionately more energy, stronger shockwave and thermal radiation, more melt/vaporization, and a larger crater.
          </div>
        </div>

        <div class="field">
          <div class="label-row">
            <label for="sel-density">Material (density helper)</label>
            <div class="qmark inline" data-tip="${tipDenId}" title="What is density?">?</div>
          </div>
          <select id="sel-density">
            <option value="" disabled selected>pull down for options</option>
            <option value="1000">1000 kg/m³ for ice</option>
            <option value="1500">1500 kg/m³ for porous rock</option>
            <option value="3000">3000 kg/m³ for dense rock</option>
            <option value="8000">8000 kg/m³ for iron</option>
          </select>
          <small>We store only the numeric density (kg/m³), not the label.</small>
          <div id="${tipDenId}" class="form-tip">
            <b>Why it matters:</b> Density relates to strength and penetration.
            Low-density bodies (ice/porous) tend to break higher in the atmosphere (airbursts).
            High-density (iron) survive deeper, transfer momentum more efficiently, and usually create larger craters for the same mass.
          </div>
        </div>

        <div class="actions">
          <button id="btn-impact" class="btn primary" type="button">Impact</button>
          <button id="btn-mitigate" class="btn" type="button">Mitigate</button>
        </div>

        <small id="msg-validation" class="danger"></small>
      </div>
    `;
    panelEl.style.display = 'block';

    panelEl.querySelector('#btn-reset')?.addEventListener('click', () => {
      for (const fn of resetHandlers) try { fn(); } catch { }
    });

    const $mass = panelEl.querySelector('#inp-mass');
    const $vel = panelEl.querySelector('#inp-velocity');
    const $dens = panelEl.querySelector('#sel-density');
    const $msg = panelEl.querySelector('#msg-validation');

    panelEl.querySelectorAll('.qmark.inline').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.getAttribute('data-tip');
        const tip = id ? panelEl.querySelector(`#${id}`) : null;
        if (!tip) return;
        tip.classList.toggle('show');
      });
    });

    function parseNum(el) {
      const v = Number(el.value);
      return isFinite(v) ? v : null;
    }
    function clampMass(v) {
      if (!isFinite(v) || v < 0) return null;
      return Math.min(v, MAX_MASS_KG);
    }
    function clampVel(v) {
      if (!isFinite(v)) return null;
      if (v < MIN_VEL_KMS) return MIN_VEL_KMS;
      if (v > MAX_VEL_KMS) return MAX_VEL_KMS;
      return v;
    }
    function validateAndShow() {
      const ok = impactorState.massKg !== null &&
        impactorState.speedKms !== null &&
        impactorState.densityKgM3 !== null;
      $msg.textContent = ok ? '' : 'Please fill mass, velocity (11–72 km/s) and density.';
      return ok;
    }

    const updateMass = () => {
      const raw = parseNum($mass);
      const clamped = clampMass(raw);
      if (clamped !== null && clamped !== raw) $mass.value = clamped;
      impactorState.massKg = clamped;
      emitImpactorChange();
      validateAndShow();
    };
    const updateVel = () => {
      const raw = parseNum($vel);
      const clamped = clampVel(raw);
      if (clamped !== null && clamped !== raw) $vel.value = clamped;
      impactorState.speedKms = (clamped !== null) ? clamped : null;
      emitImpactorChange();
      validateAndShow();
    };
    const updateDens = () => {
      const v = Number($dens.value);
      impactorState.densityKgM3 = isFinite(v) ? v : null;
      emitImpactorChange();
      validateAndShow();
    };

    $mass.addEventListener('input', updateMass);
    $mass.addEventListener('change', updateMass);
    $vel.addEventListener('input', updateVel);
    $vel.addEventListener('change', updateVel);
    $dens.addEventListener('change', updateDens);

    panelEl.querySelector('#btn-impact')?.addEventListener('click', () => {
      if (validateAndShow()) {
        window.dispatchEvent(new CustomEvent('panel:navigate', { detail: '/impact' }));
      }
    });
    panelEl.querySelector('#btn-mitigate')?.addEventListener('click', () => {
      if (validateAndShow()) {
        window.dispatchEvent(new CustomEvent('panel:navigate', { detail: '/mitigation' }));
      }
    });

    return;
  }

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
      Using these, we solve Kepler’s equation to get the true position.
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
    for (const fn of resetHandlers) try { fn(); } catch { }
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