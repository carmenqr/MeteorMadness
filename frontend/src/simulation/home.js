import * as THREE from 'three';
import { DEG2RAD } from '../lib/asteroid_utils.js';
import { propagate, getOrbitPoints } from '../lib/orbit_utils.js';
import { createScene } from './scene.js';
import { initInfoPanel, showPanelFor, hidePanel, onPanelReset, destroyInfoPanel, onImpactorChange } from './home-panel.js';
import earthUrl from '../assets/earth.jpg'
import asteroidUrl from '../assets/asteroid.jpg'
import iceUrl from '../assets/ice.jpg';
import porousRockUrl from '../assets/porous_rock.jpg';
import rockUrl from '../assets/rock.jpg';
import ironUrl from '../assets/iron.jpg';

const _domNodes = new Set();
const _listeners = [];

let asteroides = [];
let simulationPaused = false;     // pausa/continúa la propagación
let isolatedItem = null;          // asteroide aislado (o null)
let earthData = null;      // elementos orbitales de la Tierra (del backend)
let earthItem = null;      // referencia a su mesh/órbita/label

let tweenCancel = null;   // para abortar un zoom en curso

// Tiempo de simulación independiente del tab
let baseJulian = 2461000.5;  // tu misma época base
let simDays = 0;             // días acumulados de la sim
let lastFrameMs = performance.now();
let tabHidden = false;

let defaultView = { pos: null, target: null }; // vista “global” inicial
let savedView = null;                           // vista temporal cuando abrimos el panel

const TIME_SCALE = 1; // días/segundo de simulación

let _running = false;
let _frameId = null;
let _sceneRefs = null;         // guardamos {scene,camera,renderer,controls}
let _visibilityHandler = null;
let _resizeHandler = null;

let _earthPin = null; // { impactorMesh, earthMesh, camera, controls, targetNDC, depthOffset, lockControls }
let hoverItem = null; // ahora en ámbito de módulo (accesible desde isolate)

function applyHover(item) {
  if (!item?.pathLine?.material) return;
  // Si hay un aislado y no es éste, no elevamos
  if (isolatedItem && item !== isolatedItem) return;
  item.pathLine.material.opacity = 1.0;
}

function restoreHover(item) {
  if (!item?.pathLine?.material) return;
  if (isolatedItem === item) {
    item.pathLine.material.opacity = 1.0;
    return;
  }
  item.pathLine.material.opacity = getBaseOrbitOpacity(item);
}

function _easeSmoothstep(u){ return u<=0?0:u>=1?1:u*u*(3-2*u); }

function freezeSystem() {
  simulationPaused = true;
  window.dispatchEvent(new CustomEvent('sim:pause-orbits'));
}

function resumeSystem() {
  simulationPaused = false;
  // si hay un tween de cámara en curso, lo cancelamos
  if (typeof tweenCancel === 'function') { tweenCancel(); tweenCancel = null; }
  window.dispatchEvent(new CustomEvent('sim:resume-orbits'));
}

// Tween sencillo de cámara (suave)
function tweenCamera({camera, controls, fromPos, toPos, fromTarget, toTarget, duration = 900, onDone}) {
  let raf, stop = false;
  const t0 = performance.now();
  const ease = x => (x<0?0:x>1?1:x*x*(3-2*x)); // smoothstep
  function step(now){
    if (stop) return;
    const u = ease((now - t0)/duration);
    camera.position.lerpVectors(fromPos, toPos, u);
    if (controls) controls.target.lerpVectors(fromTarget, toTarget, u);
    camera.updateProjectionMatrix();
    if (u >= 1){ onDone?.(); return; }
    raf = requestAnimationFrame(step);
  }
  raf = requestAnimationFrame(step);
  return ()=>{ stop = true; cancelAnimationFrame(raf); };
}

// Fija la Tierra en una esquina de la pantalla (NDC) respecto al IMPACTOR (centro)
function startPinEarthToCorner({
  impactorMesh, earthMesh, camera, controls,
  targetNDC = { x: -0.94, y: -0.97 },
  earthDepthFactor = 0.80,     // <1 → Tierra más cerca que el impactor (se ve mayor)
  depthOffset = null,          // se ignora si hay factor
  keepCameraDistance = 0.40,   // zoom objetivo
  earthScale = 2.3,            // tamaño objetivo
  viewOffset = { yawDeg: -14, pitchDeg: 6 }, // giro objetivo
  lockControls = true,
  transitionMs = 900,          // ← duración transición suave
  fadeOrbits = true            // ← difuminar órbitas durante el zoom
} = {}) {
  if (!impactorMesh || !earthMesh || !camera) return;

  // escala original Tierra
  if (!earthMesh.userData.__origScale) {
    earthMesh.userData.__origScale = earthMesh.scale.clone();
  }
  const startEarthScale = earthMesh.scale.x; // asumimos uniform

  // estado inicial para tween de cámara (distancia + yaw/pitch alrededor del impactor)
  const pI = impactorMesh.position.clone();
  const vCam = camera.position.clone().sub(pI);
  let startDist = vCam.length(); if (startDist < 1e-6) startDist = keepCameraDistance;
  const dir = vCam.length() > 1e-6 ? vCam.clone().normalize() : new THREE.Vector3(0,0,1);

  // yaw (alrededor de Y mundial) y pitch (alrededor de eje lateral)
  const upWorld = new THREE.Vector3(0,1,0);
  // Proyección horizontal para yaw
  const horiz = dir.clone(); horiz.y = 0; if (horiz.lengthSq()<1e-8) horiz.set(0,0,1); horiz.normalize();
  let startYaw = Math.atan2(horiz.x, horiz.z);                 // [-π, π], z adelante
  const sideAxis = new THREE.Vector3().crossVectors(upWorld, horiz).normalize();
  // ángulo entre horiz y dir sobre sideAxis (pitch positivo = mirar hacia abajo un poco)
  const dot = THREE.MathUtils.clamp(dir.dot(horiz), -1, 1);
  let startPitch = Math.acos(dot); if (dir.y > 0) startPitch = -startPitch;

  // destino
  const targetYaw = (viewOffset?.yawDeg ?? 0) * Math.PI / 180;
  const targetPitch = (viewOffset?.pitchDeg ?? 0) * Math.PI / 180;

  // preparar fade de órbitas
  const orbits = [];
  if (fadeOrbits) {
    const list = window.__asteroidMeshes || [];
    for (const it of list) {
      if (it.pathLine && it.pathLine.material) {
        const mat = it.pathLine.material;
        if (!mat.userData) mat.userData = {};
        if (typeof mat.userData.__origOpacity !== 'number') {
          mat.userData.__origOpacity = mat.opacity ?? 1;
        }
        mat.transparent = true;
        orbits.push(it.pathLine);
      }
    }
  }

  _earthPin = {
    impactorMesh, earthMesh, camera, controls,
    targetNDC, earthDepthFactor, depthOffset,
    keepCameraDistance, earthScale, viewOffset,
    lockControls,

    // transición
    t0: performance.now(),
    dur: Math.max(0, transitionMs|0),
    startDist, targetDist: keepCameraDistance,
    startYaw, targetYaw,
    startPitch, targetPitch,
    startEarthScale,

    // órbitas
    orbits, fadedDone: false
  };

  // fijar target al impactor y bloquear controles si procede
  if (controls) {
    if (lockControls) controls.enabled = false;
    controls.target.copy(pI);
  } else {
    camera.lookAt(pI);
  }

  camera.up.set(0,1,0);
  camera.updateMatrixWorld();
  camera.updateProjectionMatrix();
}

function stopPinEarth() {
  if (!_earthPin) return;

  // restaurar escala Tierra
  if (_earthPin.earthMesh?.userData?.__origScale) {
    _earthPin.earthMesh.scale.copy(_earthPin.earthMesh.userData.__origScale);
    delete _earthPin.earthMesh.userData.__origScale;
  }

  // restaurar órbitas
  if (_earthPin.orbits?.length) {
    for (const ln of _earthPin.orbits) {
      if (ln?.material) {
        const mat = ln.material;
        const op = typeof mat.userData?.__origOpacity === 'number' ? mat.userData.__origOpacity : 0.25;
        mat.opacity = op;
        ln.visible = true;
      }
    }
  }

  // desbloquear controles
  if (_earthPin.controls && _earthPin.lockControls) _earthPin.controls.enabled = true;

  _earthPin = null;
}


// --- encuadre: target = punto medio Tierra-Impactor; Tierra en bottom-left, Impactor en primer plano ---
function zoomComposeMidpointAndCorner(impactorMesh, earthMesh, camera, controls, opts = {}) {
  const dur      = opts.duration ?? 1000;
  const distance = opts.distance ?? 2.0;     // distancia de la cámara desde el punto medio
  const lateral  = opts.lateral  ?? 0.65;    // compensa horizontal para empujar Tierra a la izquierda
  const vertical = opts.vertical ?? 0.45;    // compensa vertical para empujar Tierra abajo
  const earthScale = opts.earthScale ?? 1.6; // escala temporal para ver Tierra “grande”

  if (!impactorMesh) return;
  const earthMeshOrNull = earthMesh || null;

  // 1) punto medio entre Tierra e Impactor (si no hay Tierra, aproxima)
  const pI = impactorMesh.position.clone();
  const pE = earthMeshOrNull ? earthMeshOrNull.position.clone()
                             : pI.clone().add(new THREE.Vector3(0.7,0.5,0.6));
  const mid = pI.clone().add(pE).multiplyScalar(0.5);

  // 2) ejes de composición
  const v = pI.clone().sub(mid).normalize(); // mirar hacia el Impactor
  const up = new THREE.Vector3(0,1,0);
  let side = new THREE.Vector3().crossVectors(v, up); // horizontal
  if (side.lengthSq() < 1e-6) side.set(1,0,0);
  side.normalize();
  let vert = new THREE.Vector3().crossVectors(side, v).normalize(); // vertical

  // Empuja la cámara para que la Tierra quede bottom-left en el encuadre
  const camOffset = v.clone().multiplyScalar(-distance)
    .add(side.multiplyScalar(+lateral))
    .add(vert.multiplyScalar(+vertical));

  const fromPos    = camera.position.clone();
  const toPos      = mid.clone().add(camOffset);
  const fromTarget = controls ? controls.target.clone() : new THREE.Vector3();
  const toTarget   = mid.clone();

  // 3) escala temporal de la Tierra
  if (earthMeshOrNull) {
    if (!earthMeshOrNull.userData.__origScale) {
      earthMeshOrNull.userData.__origScale = earthMeshOrNull.scale.clone();
    }
    earthMeshOrNull.scale.setScalar(earthScale);
  }

  if (controls) controls.enabled = false;
  tweenCancel = tweenCamera({
    camera, controls, fromPos, toPos, fromTarget, toTarget, duration: dur,
    onDone: ()=>{ if (controls) controls.enabled = true; }
  });
}

// Restaurar escala original de la Tierra (llámalo al cerrar panel)
function restoreEarthScale(earthMesh){
  if (earthMesh && earthMesh.userData?.__origScale) {
    earthMesh.scale.copy(earthMesh.userData.__origScale);
    delete earthMesh.userData.__origScale;
  }
}

function restoreDefaultView({ smooth = false, duration = 700 } = {}) {
  const cam = window.__camera;
  const ctr = window.__controls;
  if (!cam) return;

  const toPos = (savedView?.pos || defaultView.pos);
  const toTarget = (savedView?.target || defaultView.target);
  if (!toPos || !toTarget) return;

  if (!smooth) {
    if (ctr) ctr.target.copy(toTarget);
    cam.position.copy(toPos);
    cam.updateProjectionMatrix();
    savedView = null; // limpia vista temporal
    return;
  }

  // Suave (tween casero)
  const fromPos = cam.position.clone();
  const fromTarget = (ctr ? ctr.target.clone() : new THREE.Vector3());
  const t0 = performance.now();
  const ease = x => (x<0?0:x>1?1:x*x*(3-2*x));

  function step(now){
    const u = ease((now - t0)/duration);
    cam.position.lerpVectors(fromPos, toPos, u);
    if (ctr) ctr.target.lerpVectors(fromTarget, toTarget, u);
    cam.updateProjectionMatrix();
    if (u < 1) requestAnimationFrame(step);
    else savedView = null;
  }
  requestAnimationFrame(step);
}


// Evita actualizar cuando no se ve
function isRenderable(item, camera) {
  if (!item.mesh.visible) return false;
  const sp = item.mesh.position.clone().project(camera);
  // dentro del clip-space y delante de la cámara (márgenes holgados)
  return sp.z < 1 && sp.x > -1.2 && sp.x < 1.2 && sp.y > -1.2 && sp.y < 1.2;
}

// ———————————————————————————————————————
// Cargar datos del backend
// ———————————————————————————————————————
async function cargarAsteroides() {
  try {
    const res = await fetch("http://127.0.0.1:5000/api/asteroides");
    if (!res.ok) throw new Error(`API responded ${res.status}`);
    // API returns {count, items} when using NASA browse endpoint, or a raw array from mock
    const data = await res.json();
    asteroides = Array.isArray(data) ? data : (data.items || []);
    console.log(`Loaded ${asteroides.length} asteroids from backend`);

    // ——— AÑADIR IMPACTOR2025 CON ÓRBITA PROPIA ———
    const yaExisteImpactor = asteroides.some(a => /impactor[- ]?2025/i.test(a.name));
    if (!yaExisteImpactor) {
      const impactor2025 = {
        name: "Impactor2025",
        // Elementos keplerianos (mismas CLAVES que tus asteroides reales)
        a: 1.20,     // UA (distinto para no superponer)
        e: 0.15,     // excentricidad moderada
        i: 25.0,     // grados (inclinación)
        om: 80.0,    // Ω: nodo ascendente (grados)
        w: 45.0,     // ω: argumento del perihelio (grados)
        M0: 0.0,     // anomalía media en epoch (grados)
        epoch: 2461000.5 // misma época de referencia que usas
      };
      asteroides.push(impactor2025);
      console.log("Añadido Impactor2025 con órbita propia:", impactor2025);
    }

    // === AÑADIR: Cargar Earth desde el backend ===
    try {
      const resEarth = await fetch("http://127.0.0.1:5000/api/earth");
      if (resEarth.ok) {
        const d = await resEarth.json();
        // Esperamos mismas claves: { name, a, e, i, om, w, M0, epoch }
        earthData = Array.isArray(d) ? d[0] : d;
        if (!earthData?.name) earthData.name = "Earth";
        console.log("Earth loaded:", earthData);
      } else {
        console.warn("No se pudo cargar /api/earth:", resEarth.status);
      }
    } catch (e) {
      console.warn("Error cargando /api/earth:", e);
    }

  } catch (error) {
    console.warn("No se pudo cargar asteroides desde backend, intentando mock local. Error:", error);
    try {
      const local = await fetch('./mock/asteroides_mock.json');
      if (!local.ok) throw new Error(`Local mock responded ${local.status}`);
      asteroides = await local.json();
      console.log(`Loaded ${asteroides.length} asteroids from local mock`);

    } catch (err2) {
      console.error('Fallo al cargar mock local:', err2);
      // Mostrar mensaje visible al usuario
      const info = document.getElementById('info-panel') || document.createElement('div');
      info.id = 'info-panel';
      Object.assign(info.style, {position: 'fixed', top: '12px', left: '12px', padding: '12px', background: 'rgba(0,0,0,0.85)', color: '#fff', zIndex: 50});
      info.innerText = 'No se han podido cargar datos de los asteroides. Inicia el backend o comprueba la ruta de los archivos.';
      document.body.appendChild(info);
      // también dejamos un log en consola
      console.error('No se pudieron cargar asteroides desde backend ni desde mock local.');
    }
  }
}

function addListener(target, type, handler, opts) {
  target.addEventListener(type, handler, opts);
  _listeners.push(() => target.removeEventListener(type, handler, opts));
}
function registerNode(node) {
  if (node) _domNodes.add(node);
  return node;
}

function resetModuleState() {
  asteroides = [];
  earthData = null;
  earthItem = null;
  isolatedItem = null;
  simulationPaused = false;
  tweenCancel = null;
  simDays = 0;
  tabHidden = false;
  savedView = null;
  defaultView = { pos: null, target: null };
}

// ———————————————————————————————————————
// UI auxiliar
// ———————————————————————————————————————
function ensureLabelStyles() {
  if (document.getElementById('asteroid-label-styles')) return;
  const style = document.createElement('style');
  style.id = 'asteroid-label-styles';
  style.textContent = `
    .asteroid-label {
      position: absolute;
      pointer-events: none;
      font-family: Inter, system-ui, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
      font-size: 12px;
      line-height: 1.2;
      color: #eaeaea;
      /* sin fondo por defecto */
      /* Si quieres ligeramente más legible sobre fondos claros, puedes usar solo sombra de texto: */
      text-shadow: 0 1px 2px rgba(0,0,0,.55);
      will-change: transform;
      user-select: none;
    }
    .asteroid-label--earth {
      color: #7fb3ff; /* azul “Tierra” */
      text-shadow:
        0 0 6px rgba(43,111,255,.55),
        0 1px 2px rgba(0,0,0,.6);
      font-weight: 600;
    }
    .asteroid-label--impactor {
      color: #ffb155; /* naranja impacto */
      text-shadow: 0 1px 2px rgba(0,0,0,.6);
      font-weight: 600;
    }
    .asteroid-label--minor {
      color: #dddddd;
      text-shadow: 0 1px 2px rgba(0,0,0,.5);
      font-weight: 500;
    }
    /* Si en algún momento quieres fondo, añade la clase 'bg' dinámicamente */
    .asteroid-label.bg {
      background: rgba(0,0,0,.45);
      border-radius: 8px;
      padding: 2px 6px;
    }
  `;
  document.head.appendChild(style);
}

function ensureAstralDropdownStyles() {
  if (document.getElementById('astral-dropdown-styles')) return;
  const s = document.createElement('style');
  s.id = 'astral-dropdown-styles';
  s.textContent = `
    .astral-dd {
      position: relative;
      width: 240px;
      font-family: system-ui, sans-serif;
      user-select: none;
    }
    .astral-dd__button {
      display: flex; align-items: center; justify-content: space-between; gap: 8px;
      padding: 12px 14px;
      border-radius: 16px;
      background: linear-gradient(160deg, rgba(22,34,54,0.85), rgba(12,20,32,0.85));
      color: #d5dfef;
      border: 1px solid rgba(120,150,200,0.28);
      box-shadow: 0 4px 16px -4px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(180,210,255,0.05);
      backdrop-filter: blur(5px);
      cursor: pointer;
      font-size: 15px; font-weight: 600;
    }
    .astral-dd__button:focus-visible {
      outline: none;
      box-shadow: 0 0 0 2px rgba(120,170,240,0.55), 0 4px 16px -4px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(180,210,255,0.07);
      border-color: rgba(160,190,240,0.55);
    }
    .astral-dd__chev { transform: translateY(1px); opacity: .9 }
    .astral-dd__panel {
      position: absolute; left: 0; right: 0; top: calc(100% + 6px);
      max-height: min(55vh, 440px);
      overflow: auto;
      background: linear-gradient(145deg, rgba(16,28,48,0.95), rgba(20,34,58,0.95));
      color: #cdd8f0;
      border: 1px solid rgba(120,150,200,0.28);
      border-radius: 14px;
      box-shadow: 0 16px 40px -10px rgba(0,0,0,0.65), inset 0 0 0 1px rgba(180,210,255,0.05);
      backdrop-filter: blur(6px);
      padding: 6px;
      z-index: 1000;
      display: none;
    }
    .astral-dd__option {
      padding: 10px 12px;
      border-radius: 10px;
      cursor: pointer;
      font-size: 14px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .astral-dd__option:hover, .astral-dd__option[aria-selected="true"] {
      background: rgba(60, 110, 180, 0.25);
      color: #ffffff;
    }
    .astral-dd__optlabel {
      font-size: 12px; opacity: .75; padding: 8px 10px 4px;
    }
    /* Scrollbar sutil */
    .astral-dd__panel::-webkit-scrollbar { width: 10px }
    .astral-dd__panel::-webkit-scrollbar-thumb { background: rgba(160,190,240,0.22); border-radius: 10px }
  `;
  document.head.appendChild(s);
}

function createAstralDropdown({ id = 'astral-dropdown', placeholder = 'All objects', onSelect } = {}) {
  ensureAstralDropdownStyles();

  const root = document.createElement('div');
  root.className = 'astral-dd';
  root.id = id;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'astral-dd__button';
  btn.setAttribute('aria-haspopup', 'listbox');
  btn.setAttribute('aria-expanded', 'false');
  btn.innerHTML = `<span class="astral-dd__label">${placeholder}</span>
                   <span class="astral-dd__chev">▾</span>`;
  root.appendChild(btn);

  const panel = document.createElement('div');
  panel.className = 'astral-dd__panel';
  panel.setAttribute('role', 'listbox');
  root.appendChild(panel);

  let currentValue = '__all';
  let options = [];

  function open() {
    panel.style.display = 'block';
    btn.setAttribute('aria-expanded', 'true');
    document.addEventListener('click', clickOutside, true);
    document.addEventListener('keydown', onKeyDown);
  }
  function close() {
    panel.style.display = 'none';
    btn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', clickOutside, true);
    document.removeEventListener('keydown', onKeyDown);
  }
  function toggle() {
    const isOpen = panel.style.display === 'block';
    isOpen ? close() : open();
  }
  function clickOutside(e) { if (!root.contains(e.target)) close(); }

  function onKeyDown(e) {
    const opts = Array.from(panel.querySelectorAll('.astral-dd__option'));
    const idx = opts.findIndex(n => n.getAttribute('data-value') === currentValue);
    if (e.key === 'Escape') { close(); btn.focus(); }
    else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = opts[Math.min(opts.length - 1, idx + 1)] || opts[0];
      next?.scrollIntoView({ block: 'nearest' }); next?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = opts[Math.max(0, idx - 1)] || opts[opts.length - 1];
      prev?.scrollIntoView({ block: 'nearest' }); prev?.focus();
    } else if (e.key === 'Home') { e.preventDefault(); opts[0]?.focus(); }
    else if (e.key === 'End') { e.preventDefault(); opts[opts.length - 1]?.focus(); }
    else if (e.key === 'Enter') { e.preventDefault(); document.activeElement?.click(); }
  }

  function render() {
    panel.innerHTML = '';
    for (const opt of options) {
      const el = document.createElement('div');
      el.className = 'astral-dd__option';
      el.setAttribute('role', 'option');
      el.setAttribute('tabindex', '0');
      el.setAttribute('data-value', opt.value);
      el.textContent = opt.label;
      if (opt.value === currentValue) el.setAttribute('aria-selected', 'true');
      el.addEventListener('click', () => {
        setValue(opt.value);
        close();
        onSelect?.(opt.value);
      });
      panel.appendChild(el);
    }
  }

  function setOptions(newOpts) {
    options = newOpts || [];
    render();
  }
  function setValue(v) {
    currentValue = v;
    const found = options.find(o => o.value === v);
    const labelEl = btn.querySelector('.astral-dd__label');
    labelEl.textContent = found?.label ?? placeholder;
    // marcar selección visual
    panel.querySelectorAll('.astral-dd__option').forEach(n =>
      n.setAttribute('aria-selected', n.getAttribute('data-value') === v ? 'true' : 'false'));
  }
  function getValue() { return currentValue; }

  btn.addEventListener('click', toggle);

  return { root, setOptions, setValue, getValue, open, close };
}

function handleAstralSelection(value) {
  const list = window.__asteroidMeshes || [];

  if (value === '__all') {
    resetIsolation(list);
    stopPinEarth();
    restoreEarthScale(earthItem?.mesh || null);
    restoreDefaultView({ smooth: true, duration: 600 });
    resumeSystem();
    return;
  }

  const item = list.find(i => (i.mesh?.name || '').toLowerCase() === value.toLowerCase());
  if (!item) return;

  if (/impactor[- ]?2025/i.test(item.mesh.name)) {
    simulationPaused = true;
    window.dispatchEvent(new CustomEvent('sim:pause-orbits'));
    window.dispatchEvent(new CustomEvent('sim:open-panel'));
    const b = document.getElementById('btn-start'); if (b) b.style.display = 'none';
    return;
  }
  isolate(item, list);
}

function ensureUI() {
  ensureLabelStyles();
  ensureAstralDropdownStyles();
  if (!document.getElementById('labels')) {
    const labels = registerNode(document.createElement('div'));
    labels.id = 'labels';
    Object.assign(labels.style, {
      position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 20
    });
    document.body.appendChild(labels);
  }
  // Contenedor botón (bottom-left)
  if (!document.getElementById('btn-start')) {
    const btn = document.createElement('button');
    btn.id = 'btn-start';
    btn.textContent = 'Start simulation';
    Object.assign(btn.style, {
      position: 'fixed',
      bottom: '16px',
      left: '16px',
      zIndex: 30,
      padding: '14px 26px',
      borderRadius: '18px',
      background: 'linear-gradient(155deg, rgba(28,42,70,0.9), rgba(12,18,30,0.9))',
      color: '#f1f5f9',
      border: '1px solid rgba(255,255,255,0.3)',
      cursor: 'pointer',
      fontSize: '16px',
      fontWeight: '600',
      letterSpacing: '.5px',
      boxShadow: '0 6px 22px -6px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(255,255,255,0.08)',
      backdropFilter: 'blur(7px)',
      WebkitBackdropFilter: 'blur(7px)',
      userSelect: 'none',
      transition: 'border-color .25s, box-shadow .25s, transform .25s, background .4s'
    });

    btn.addEventListener('mouseover', () => {
      btn.style.borderColor = '#3b82f6';
      btn.style.boxShadow = '0 8px 26px -4px rgba(0,0,0,0.65), 0 0 0 1px rgba(59,130,246,0.45), inset 0 0 0 1px rgba(255,255,255,0.15)';
      btn.style.transform = 'translateY(-2px)';
    });
    btn.addEventListener('mouseout', () => {
      btn.style.borderColor = 'rgba(255,255,255,0.3)';
      btn.style.boxShadow = '0 6px 22px -6px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(255,255,255,0.08)';
      btn.style.transform = 'translateY(0)';
    });
    btn.addEventListener('mousedown', () => {
      btn.style.transform = 'translateY(0)';
      btn.style.boxShadow = '0 4px 16px -4px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(255,255,255,0.1)';
    });
    btn.addEventListener('mouseup', () => {
      btn.style.transform = 'translateY(-2px)';
      btn.style.boxShadow = '0 8px 26px -4px rgba(0,0,0,0.65), 0 0 0 1px rgba(59,130,246,0.45), inset 0 0 0 1px rgba(255,255,255,0.15)';
    });
    btn.addEventListener('focus', () => {
      btn.style.outline = 'none';
      btn.style.boxShadow = '0 0 0 2px rgba(59,130,246,0.55), 0 6px 22px -6px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(255,255,255,0.1)';
    });
    btn.addEventListener('blur', () => {
      btn.style.boxShadow = '0 6px 22px -6px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(255,255,255,0.08)';
    });

    btn.addEventListener('click', () => {
      simulationPaused = true;
      window.dispatchEvent(new CustomEvent('sim:pause-orbits'));
      window.dispatchEvent(new CustomEvent('sim:open-panel'));
      btn.style.display = 'none';
    });

    document.body.appendChild(registerNode(btn));

    // Reaparecer botón al reset
    window.addEventListener('sim:resume-orbits', () => {
      const b = document.getElementById('btn-start');
      if (b) b.style.display = 'block';
    });
  }

  // Contenedor dropdown (top-right) — versión custom
  if (!document.getElementById('astral-dropdown')) {
    const wrap = registerNode(document.createElement('div'));
    Object.assign(wrap.style, {
      position: 'fixed', top: '12px', right: '12px', zIndex: 30,
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
      pointerEvents: 'auto', fontFamily: 'system-ui, sans-serif'
    });

    const labelSel = document.createElement('div');
    labelSel.textContent = 'Astral Bodies';
    Object.assign(labelSel.style, {
      fontSize: '22px',
      fontWeight: '700',
      color: '#cdd8f0',
      letterSpacing: '.8px',
      textShadow: '0 2px 6px rgba(0,0,0,0.65)',
      textTransform: 'uppercase',
      background: 'transparent',
      padding: '0',
      border: 'none',
      boxShadow: 'none',
      backdropFilter: 'none'
    });

    const dd = createAstralDropdown({
      id: 'astral-dropdown',
      placeholder: 'All objects',
      onSelect: handleAstralSelection
    });
    // guarda referencia global para poder poblar luego
    window.__astralDropdown = dd;

    wrap.appendChild(labelSel);
    wrap.appendChild(dd.root);
    document.body.appendChild(registerNode(wrap));
  }
}

function getBaseOrbitOpacity(item) {
  if (!item) return 0.25;
  if (item === earthItem) return 0.6;
  if (/impactor[- ]?2025/i.test(item.mesh?.name || '')) return 0.4;
  return 0.25;
}

// (Opcional) helper para fijar a base
function applyBaseOpacity(item) {
  if (item?.pathLine?.material) {
    item.pathLine.material.opacity = getBaseOrbitOpacity(item);
  }
}

function isolate(item, list) {
  if (hoverItem && hoverItem !== item) {
    restoreHover(hoverItem);
    hoverItem = null;
  }
  isolatedItem = item;
  for (const it of list) {
    const sel = it === item;
    if (it.mesh) it.mesh.visible = sel;
    if (it.pathLine?.material) {
      it.pathLine.visible = sel;
      it.pathLine.material.transparent = true;
      it.pathLine.material.opacity = sel ? 1.0 : getBaseOrbitOpacity(it);
    }
    setLabelMode(it, sel ? 'auto' : 'hide');
  }
  showPanelFor(item);
}

function isolateKeep(keepItems, list) {
  const keepSet = new Set(keepItems.filter(Boolean));
  if (hoverItem && !keepSet.has(hoverItem)) {
    restoreHover(hoverItem);
    hoverItem = null;
  }
  isolatedItem = keepItems[0] || null;
  for (const it of list) {
    const keep = keepSet.has(it);
    if (it.mesh) it.mesh.visible = keep;
    if (it.pathLine?.material) {
      it.pathLine.visible = keep;
      it.pathLine.material.transparent = true;
      it.pathLine.material.opacity = keep
        ? (keepItems.length === 1 ? 1.0 : 0.9)
        : getBaseOrbitOpacity(it);
    }
    setLabelMode(it, keep ? 'auto' : 'hide');
  }
}

function resetIsolation(listRef) {
  const list = listRef || window.__asteroidMeshes || [];
  isolatedItem = null;
  for (const it of list) {
    if (it.mesh) it.mesh.visible = true;
    if (it.pathLine?.material) {
      it.pathLine.visible = true;
      it.pathLine.material.transparent = true;
      it.pathLine.material.opacity = getBaseOrbitOpacity(it);
    }
    setLabelMode(it, 'auto');
  }
  if (hoverItem) {
    restoreHover(hoverItem);
    hoverItem = null;
  }
  hidePanel();
}

//PARA EL PANEL LATERAL DE INFO
// Registro diferido del handler de reset del panel (se reinsertará en cada iniciarSimulacion)
let _panelResetUnsub = null;
function registerPanelResetHandler() {
  // Si hay uno previo no hace falta; destroyInfoPanel lo borra cuando se desmonta
  if (_panelResetUnsub) return;
  const cb = () => {
    // Restaurar estado visual/cámara
    stopPinEarth();
    resetIsolation();
    restoreEarthScale(earthItem?.mesh || null);
    restoreDefaultView({ smooth: true, duration: 1000 });
    resumeSystem();
    // Reaparecer botón start (por si no lo hace el listener global)
    const b = document.getElementById('btn-start');
    if (b) b.style.display = 'block';
  };
  onPanelReset(cb);
  // Guardamos un pseudo unsub (no expuesto directamente por panel, pero podremos reinicializar tras cleanup poniéndolo a null)
  _panelResetUnsub = () => { _panelResetUnsub = null; };
}

// ———————————————————————————————————————
// Simulación
// ———————————————————————————————————————
function setLabelMode(item, mode = 'auto') {
  item._labelMode = mode; // 'auto' | 'hide'
  if (item.labelEl && mode === 'hide') {
    item.labelEl.style.display = 'none';
  }
}
function getLabelMode(item) {
  return item?._labelMode || 'auto';
}

function iniciarSimulacion(mountEl) {
  ensureUI();
  initInfoPanel();
  registerPanelResetHandler();

  const { scene, camera, renderer, controls } = createScene(mountEl);
  _sceneRefs = { scene, camera, renderer, controls };

  defaultView.pos = camera.position.clone();
  defaultView.target = controls ? controls.target.clone() : new THREE.Vector3();

  window.__camera = camera;
  window.__controls = controls;
  camera.near = 0.001;
  camera.far = 5000;
  camera.updateProjectionMatrix();

  const labelLayer = document.getElementById('labels');
  const asteroidMeshes = [];
  window.__asteroidMeshes = asteroidMeshes;

  const texLoader = new THREE.TextureLoader();
  const maxAniso = renderer.capabilities.getMaxAnisotropy?.() ?? 1;
  const earthTex = texLoader.load(earthUrl, t => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Math.min(8,maxAniso); });
  const asteroidTex = texLoader.load(asteroidUrl, t => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Math.min(8,maxAniso); });
  // Texturas específicas para el impactor según material elegido en el formulario
  const impactorMaterialTextures = {
    ice: texLoader.load(iceUrl, t => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Math.min(8,maxAniso); }),
    porous_rock: texLoader.load(porousRockUrl, t => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Math.min(8,maxAniso); }),
    rock: texLoader.load(rockUrl, t => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Math.min(8,maxAniso); }),
    iron: texLoader.load(ironUrl, t => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = Math.min(8,maxAniso); })
  };

  // Earth
  if (earthData) {
    try {
      const geomE = new THREE.SphereGeometry(0.09, 64, 64);
      const matE = new THREE.MeshPhongMaterial({
        map: earthTex,
        flatShading: false,
        shininess: 8,
        specular: 0x222222,
        emissive: 0x0a0f1a,
        emissiveIntensity: 0.22
      });
      const meshE = new THREE.Mesh(geomE, matE);
      meshE.name = earthData.name || 'Earth';

      const earthPts = getOrbitPoints(earthData, 512);
      const pathGeomE = new THREE.BufferGeometry().setFromPoints(earthPts);
      const pathMatE = new THREE.LineBasicMaterial({ color: 0x2b6fff, transparent: true, opacity: 0.6, depthWrite:false });
      const pathLineE = new THREE.Line(pathGeomE, pathMatE);
      pathLineE.frustumCulled = false;
      scene.add(pathLineE, meshE);

      const labelE = document.createElement('div');
      labelE.className = 'asteroid-label asteroid-label--earth';
      labelE.textContent = meshE.name;
      labelE.style.display = 'block';
      labelE.style.transform = 'translate(-50%, -100%)'; // solo ancla, el resto via CSS
      labelE.classList.add('outline');
      labelLayer.appendChild(labelE);

      asteroidMeshes.push(earthItem = {
        mesh: meshE, obj: earthData, pathLine: pathLineE, pathGeom: pathGeomE, labelEl: labelE
      });
      setLabelMode(earthItem, 'auto');
    } catch(e){ console.warn('Earth fail', e); }
  }

  // Asteroides
  for (const obj of asteroides) {
    const geom = new THREE.SphereGeometry(0.03, 32, 32);
    const mat = new THREE.MeshPhongMaterial({
      map: asteroidTex, color: 0xffffff, emissive: 0x202020, emissiveIntensity: 0.35,
      shininess: 4, specular: 0x050505
    });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.name = obj.name || 'Asteroide';

    const orbitPts = getOrbitPoints(obj, 512);
    const pathGeom = new THREE.BufferGeometry().setFromPoints(orbitPts);
    const pathMat  = new THREE.LineBasicMaterial({ color: 0xaaaaaa, transparent: true, opacity: 0.25, depthWrite:false });
    const pathLine = new THREE.Line(pathGeom, pathMat);
    pathLine.frustumCulled = false;
    scene.add(pathLine, mesh);

    const label = document.createElement('div');
    const isImpactor = /impactor[- ]?2025/i.test(mesh.name);
    label.className = 'asteroid-label ' + (isImpactor ? 'asteroid-label--impactor' : 'asteroid-label--minor');
    label.textContent = mesh.name;
    label.style.display = 'block';
    label.style.transform = 'translate(-50%, -100%)';
    label.classList.add('outline');
    labelLayer.appendChild(label);

    const item = { mesh, obj, pathLine, pathGeom, labelEl: label };
    asteroidMeshes.push(item);
    setLabelMode(item, 'auto');
  }

  // Rellenar dropdown ahora que tenemos asteroidMeshes
  // Rellenar dropdown custom
  if (window.__astralDropdown) {
    const items = [...asteroidMeshes].sort((a,b) => (a.mesh.name||'').localeCompare(b.mesh.name||''));
    const options = [
      { value: '__all', label: 'All objects' },
      ...items.map(it => ({ value: it.mesh.name, label: it.mesh.name }))
    ];
    window.__astralDropdown.setOptions(options);
    window.__astralDropdown.setValue('__all');
  }


  // ——— IMPACTOR2025: localizar, destacar y preparar aislamiento + pausa al abrir panel ———
  const impactorItem = asteroidMeshes.find(i => /impactor[- ]?2025/i.test(i.mesh.name));
  if (impactorItem) {
    // Destacar color del Impactor2025 (opcional)
    try {
      impactorItem.mesh.material.color.set(0xffaa00);
      if (impactorItem.pathLine?.material?.color) {
        impactorItem.pathLine.material.color.set(0xffaa00);
        impactorItem.pathLine.material.transparent = true;
        impactorItem.pathLine.material.opacity = 0.4; // órbita bien visible al aislar
      }
    } catch {}

    const openPanelHandler = () => {
      isolateKeep([impactorItem, earthItem], asteroidMeshes);
      freezeSystem();

      // ACTIVAR PIN: Tierra fijada a la esquina inf-izq y impactor centrado
      startPinEarthToCorner({
        impactorMesh: impactorItem.mesh,
        earthMesh: earthItem?.mesh,
        camera,
        controls,
        targetNDC: { x: -0.94, y: -0.97 },
        earthDepthFactor: 0.80,
        keepCameraDistance: 0.40,
        earthScale: 2.3,
        viewOffset: { yawDeg: -14, pitchDeg: 6 },
        lockControls: true,
        transitionMs: 900,   // ← transición suave
        fadeOrbits: true     // ← oculta órbitas con fade
      });

      showPanelFor(impactorItem);
    };
  if (impactorItem) addListener(window, 'sim:open-panel', openPanelHandler);

  // === Suscripción a cambios del formulario del IMPACTOR ===
  // Mapeo densidad -> clave de textura
  const densityToKey = (d) => {
    if (d == null) return null;
    if (d <= 1100) return 'ice';          // ~1000
    if (d <= 2000) return 'porous_rock';  // ~1500
    if (d <= 4000) return 'rock';         // ~3000
    return 'iron';                        // >= 8000 u otros valores altos
  };
  // Registrar listener sólo una vez por simulación
  onImpactorChange?.(({ densityKgM3 }) => {
    if (!impactorItem || !impactorItem.mesh) return;
    const key = densityToKey(densityKgM3);
    if (!key) return;
    const tex = impactorMaterialTextures[key];
    if (tex && impactorItem.mesh.material) {
      impactorItem.mesh.material.map = tex;
      // Ajustes de color/emissive ligeros según material
      try {
        if (key === 'ice') {
          impactorItem.mesh.material.color.set(0xe0f6ff);
          impactorItem.mesh.material.emissive.set(0x203040);
        } else if (key === 'porous_rock') {
          impactorItem.mesh.material.color.set(0xb9a899);
          impactorItem.mesh.material.emissive.set(0x302520);
        } else if (key === 'rock') {
          impactorItem.mesh.material.color.set(0xaaaaaa);
          impactorItem.mesh.material.emissive.set(0x202020);
        } else if (key === 'iron') {
          impactorItem.mesh.material.color.set(0xc0c6d0);
          impactorItem.mesh.material.emissive.set(0x303030);
        }
      } catch {}
      impactorItem.mesh.material.needsUpdate = true;
    }
  });

  const resumeHandler = () => {
    simulationPaused = false;
    resetIsolation();
    restoreEarthScale(earthItem?.mesh || null);
    restoreDefaultView({ smooth: true, duration: 1000 });
  };
  addListener(window, 'sim:resume-orbits', resumeHandler);

  }


  // Raycaster click (aislar o abrir panel de simulación si es Impactor2025)
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  const el = renderer.domElement;

  // Raycaster Hover
  const pointer = new THREE.Vector2();
  const hoverRaycaster = new THREE.Raycaster();

  addListener(renderer.domElement, 'click', (e) => {
    const rect = el.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    const targets = (isolatedItem ? [isolatedItem.mesh] : asteroidMeshes.filter(i=>i.mesh.visible).map(i => i.mesh));
    raycaster.setFromCamera(mouse, camera);
    const hit = raycaster.intersectObjects(targets, false)[0];
    if (!hit) return;

    const item = asteroidMeshes.find(i => i.mesh === hit.object);
    if (!item) return;

    // Impactor2025 => mismo flujo que botón iniciar simulación
    if (/impactor[- ]?2025/i.test(item.mesh.name)) {
      simulationPaused = true;
      window.dispatchEvent(new CustomEvent('sim:pause-orbits'));
      window.dispatchEvent(new CustomEvent('sim:open-panel'));
      const b = document.getElementById('btn-start');
      if (b) b.style.display = 'none';
      return;
    }

    // Asteroide normal: aislar + info
    isolate(item, asteroidMeshes);
  });

  addListener(el, 'pointermove', (e) => {
    // Si hay uno aislado, no hacemos hover sobre otros (el aislado ya está a 1.0)
    //if (isolatedItem) return;

    const rect = el.getBoundingClientRect();
    pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    const visibles = asteroidMeshes.filter(i => i.mesh?.visible).map(i => i.mesh);
    hoverRaycaster.setFromCamera(pointer, camera);
    const hit = hoverRaycaster.intersectObjects(visibles, false)[0];

    if (!hit) {
      if (hoverItem) {
        restoreHover(hoverItem);
        hoverItem = null;
      }
      return;
    }

    const newItem = asteroidMeshes.find(i => i.mesh === hit.object);
    if (!newItem) return;
    if (newItem === hoverItem) return;

    if (hoverItem) restoreHover(hoverItem);
    hoverItem = newItem;
    applyHover(hoverItem);
  });

  addListener(el, 'pointerleave', () => {
    if (hoverItem) {
      restoreHover(hoverItem);
      hoverItem = null;
    }
  });
  
  // Reemplaza la función animate completa por:
  let lastFrameMsLocal = performance.now();
  function animate() {
      _frameId = requestAnimationFrame(animate);
      const now = performance.now();
      const dt = now - lastFrameMsLocal;
      lastFrameMsLocal = now;

      if (!simulationPaused && !tabHidden) {
          simDays += (dt/1000)*TIME_SCALE;
      }
      const tJulian = baseJulian + simDays;

      for (const item of asteroidMeshes) {
        if (!simulationPaused && !tabHidden) {
          const { pos } = propagate(item.obj, tJulian);
          item.mesh.position.copy(pos);
        }
        if (item.labelEl) {
          const mode = getLabelMode(item);           // 'auto' o 'hide'
          if (mode === 'hide') {
            item.labelEl.style.display = 'none';     // nunca mostrar si está forzado a oculto
          } else {
            // modo 'auto': culling normal por pantalla
            const sp = item.mesh.position.clone().project(camera);
            const onScreen = (sp.z < 1) && (sp.x > -1.1 && sp.x < 1.1) && (sp.y > -1.1 && sp.y < 1.1);
            if (onScreen) {
              const x = (sp.x * 0.5 + 0.5) * window.innerWidth;
              const y = (-sp.y * 0.5 + 0.5) * window.innerHeight;
              item.labelEl.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
              item.labelEl.style.display = 'block';
            } else {
              item.labelEl.style.display = 'none';
            }
          }
        }
      }

      // --- PIN: recolocar TIERRA en esquina inferior-izquierda respecto al IMPACTOR ---
      if (_earthPin) {
        const S = _earthPin;
        const { impactorMesh, earthMesh, camera, controls } = S;
        if (impactorMesh?.position && earthMesh?.position) {
          const now = performance.now();
          const u = S.dur > 0 ? _easeSmoothstep(Math.min(1, (now - S.t0) / S.dur)) : 1;

          // ---- 1) fade de órbitas ----
          if (S.orbits?.length) {
            for (const ln of S.orbits) {
              if (!ln?.material) continue;
              const mat = ln.material;
              const orig = typeof mat.userData?.__origOpacity === 'number' ? mat.userData.__origOpacity : (mat.opacity ?? 1);
              mat.opacity = (1 - u) * orig; // fade out
              if (u >= 1 && !S.fadedDone) { ln.visible = false; }
            }
            if (u >= 1) S.fadedDone = true;
          }

          // ---- 2) tween de cámara: distancia + yaw/pitch alrededor del impactor ----
          const pI = impactorMesh.position;
          if (controls) controls.target.copy(pI);

          // distancia
          const dist = THREE.MathUtils.lerp(S.startDist, S.targetDist, u);

          // yaw/pitch blending
          const yaw = THREE.MathUtils.lerp(S.startYaw, S.targetYaw, u);
          const pitch = THREE.MathUtils.lerp(S.startPitch, S.targetPitch, u);

          // construir dirección desde yaw/pitch (convención: yaw sobre Y+, pitch sobre eje lateral)
          const baseDir = new THREE.Vector3(0, 0, 1); // mirando +Z desde el impactor
          const upWorld = new THREE.Vector3(0,1,0);
          const qYaw = new THREE.Quaternion().setFromAxisAngle(upWorld, yaw);
          const dirYaw = baseDir.clone().applyQuaternion(qYaw);
          const side = new THREE.Vector3().crossVectors(upWorld, dirYaw).normalize();
          const qPitch = new THREE.Quaternion().setFromAxisAngle(side, pitch);
          const dirFinal = dirYaw.clone().applyQuaternion(qPitch).normalize();

          camera.position.copy(pI.clone().add(dirFinal.multiplyScalar(dist)));
          camera.up.set(0,1,0);
          camera.updateMatrixWorld();
          camera.updateProjectionMatrix();

          // ---- 3) escalar tierra suavemente ----
          const scaleNow = THREE.MathUtils.lerp(S.startEarthScale, S.earthScale, u);
          earthMesh.scale.setScalar(scaleNow);

          // ---- 4) fijar TIERRA en esquina (NDC → cámara → mundo) con profundidad “cercana” ----
          const pI_cam = pI.clone().applyMatrix4(camera.matrixWorldInverse);
          const impactorDepth = Math.max(1e-4, -pI_cam.z);
          const depth = Number.isFinite(S.earthDepthFactor)
            ? Math.max(1e-4, impactorDepth * S.earthDepthFactor)
            : Math.max(1e-4, impactorDepth + (S.depthOffset ?? 0.2));

          const fovY = (camera.fov ?? 50) * Math.PI/180;
          const tanY = Math.tan(fovY/2);
          const tanX = tanY * (camera.aspect || (window.innerWidth / Math.max(1, window.innerHeight)));
          const desiredX_cam = (S.targetNDC.x) * tanX * depth;
          const desiredY_cam = (S.targetNDC.y) * tanY * depth;
          const desiredZ_cam = -depth;

          const desired_cam = new THREE.Vector3(desiredX_cam, desiredY_cam, desiredZ_cam);
          const desired_world = desired_cam.applyMatrix4(camera.matrixWorld);
          earthMesh.position.copy(desired_world);
        }
      }


      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    // Listeners (guardar para cleanup)
    _resizeHandler = () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    };
    addListener(window, 'resize', _resizeHandler);

    _visibilityHandler = () => {
        tabHidden = document.hidden;
        if (!tabHidden) lastFrameMs = performance.now();
    };
    addListener(document, 'visibilitychange', _visibilityHandler);
}

function _internalCleanup(mountEl) {
  simulationPaused = true;
  if (_frameId) cancelAnimationFrame(_frameId);
  _frameId = null;

  // Listeners
  _listeners.splice(0).forEach(fn => { try { fn(); } catch {} });

  // Nodos DOM creados
  _domNodes.forEach(n => { if (n?.parentNode) n.parentNode.removeChild(n); });
  _domNodes.clear();

  destroyInfoPanel();

  if (_sceneRefs) {
    const { scene, renderer } = _sceneRefs;
    scene.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (Array.isArray(o.material)) o.material.forEach(m => m.dispose());
        else o.material.dispose();
      }
    });
    if (renderer) {
      renderer.dispose();
      if (mountEl && renderer.domElement?.parentNode === mountEl) {
        mountEl.removeChild(renderer.domElement);
      }
    }
  }
  _sceneRefs = null;
  resetModuleState();
  _running = false;
  // Permitir re-registro del handler de panel en próxima simulación
  _panelResetUnsub = null;
}

// Export opcional por si quieres forzar un stop manual desde consola
export function stopHomeSimulation(mountEl) {
  _internalCleanup(mountEl);
}

// Helper para saber si hay canvas vivo
function _hasAliveRenderer(mountEl) {
  return !!(_sceneRefs?.renderer && _sceneRefs.renderer.domElement &&
            _sceneRefs.renderer.domElement.parentNode === mountEl);
}

export async function runHomeSimulation(mountEl) {
  // Si ya “está corriendo” pero no hay renderer vivo (limpieza parcial), libera y continúa
  if (_running && !_hasAliveRenderer(mountEl)) {
    _internalCleanup(mountEl);
  }

  // Si realmente sigue activo y en el mismo contenedor, no hacer nada
  if (_running && _hasAliveRenderer(mountEl)) {
    return () => _internalCleanup(mountEl);
  }

  _running = true;
  try {
    await cargarAsteroides();
    iniciarSimulacion(mountEl);
  } catch (e) {
    console.error('No se pudo iniciar la simulación:', e);
    _internalCleanup(mountEl);
    return () => {};
  }

  // Devuelve cleanup
  return () => _internalCleanup(mountEl);
}

//Ejemplo de función de mandar datos de asteroides al back (por si guardamos cosas en BD)
/*fetch("http://127.0.0.1:5000/api/send-asteroides", {
    method: "POST",
    headers: {
        "Content-Type": "application/json"
    },
    body: JSON.stringify({
        nombre: "433 Eros",
        posicion: {x: 1.23, y: 4.56, z: 7.89},
        velocidad: 123.45
    })
})
.then(res => res.json())
.then(data => console.log("Respuesta del servidor:", data))
.catch(err => console.error(err));
*/
