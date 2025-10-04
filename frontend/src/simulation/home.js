import * as THREE from 'three';
import { DEG2RAD } from '../lib/asteroid_utils.js';
import { propagate, getOrbitPoints } from '../lib/orbit_utils.js';
import { createScene } from './scene.js';
import { initInfoPanel, showPanelFor, hidePanel, onPanelReset } from './home-panel.js';
import earthUrl from '../assets/earth.jpg'
import asteroidUrl from '../assets/asteroid.jpg'

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

// ———————————————————————————————————————
// UI auxiliar
// ———————————————————————————————————————
function ensureUI() {
  // Contenedor de labels
  if (!document.getElementById('labels')) {
    const labels = document.createElement('div');
    labels.id = 'labels';
    Object.assign(labels.style, {
      position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 20
    });
    document.body.appendChild(labels);
  }
  // Botón iniciar simulación (top-right)
  if (!document.getElementById('btn-start')) {
    const topbar = document.createElement('div');
    Object.assign(topbar.style, {
      position: 'fixed', top: '12px', right: '12px', zIndex: 30, pointerEvents: 'auto'
    });
    const btn = document.createElement('button');
    btn.id = 'btn-start';
    btn.textContent = 'Start simulation';
    Object.assign(btn.style, {
      padding: '8px 12px', borderRadius: '10px',
      border: '1px solid #ffffff22', background: '#1d4ed8',
      color: '#fff', cursor: 'pointer'
    });
    btn.addEventListener('click', () => {
      simulationPaused = true;
      window.dispatchEvent(new CustomEvent('sim:pause-orbits'));
      window.dispatchEvent(new CustomEvent('sim:open-panel')); // engancha tu modal/form si lo tienes
      // Si no tenéis aún modal, quita la línea de arriba y deja un console.log:
      // console.log('Abrir panel de simulación');
    });
    topbar.appendChild(btn);
    document.body.appendChild(topbar);
  }
}

function isolate(item, list) {
  isolatedItem = item;
  for (const it of list) {
    const sel = it === item;

    if (it.mesh) it.mesh.visible = sel;
    if (it.pathLine) {
      it.pathLine.visible = sel;
      if (it.pathLine.material) {
        it.pathLine.material.transparent = true;
        it.pathLine.material.opacity = sel ? 1.0 : 0.25;
      }
    }
    if (it.labelEl) it.labelEl.style.display = sel ? 'block' : 'none';
  }
  showPanelFor(item);
}

function isolateKeep(keepItems, list) {
  const keepSet = new Set(keepItems.filter(Boolean));
  isolatedItem = keepItems[0] || null;
  for (const it of list) {
    const keep = keepSet.has(it);

    if (it.mesh) it.mesh.visible = keep;
    if (it.pathLine) {
      it.pathLine.visible = keep;
      if (it.pathLine.material) {
        it.pathLine.material.transparent = true;
        it.pathLine.material.opacity = keep ? (keepItems.length === 1 ? 1.0 : 0.9) : 0.25;
      }
    }
    // Mostrar labels solo de los kept
    if (it.labelEl) it.labelEl.style.display = keep ? 'block' : 'none';
  }
}

function resetIsolation(listRef) {
  const list = listRef || window.__asteroidMeshes || [];
  isolatedItem = null;
  for (const it of list) {
    if (it.mesh) it.mesh.visible = true;
    if (it.pathLine) {
      it.pathLine.visible = true;
      if (it.pathLine.material) {
        it.pathLine.material.transparent = true;
        it.pathLine.material.opacity = 0.25;
      }
    }
    // Mostrar de nuevo TODOS los labels tras reset
    if (it.labelEl) it.labelEl.style.display = 'block';
  }
  hidePanel();
}

//PARA EL PANEL LATERAL DE INFO
onPanelReset(() => {
  resetIsolation();
  restoreEarthScale(earthItem?.mesh || null);
  restoreDefaultView({ smooth: true, duration: 1000 });
  resumeSystem();
});


// Permite que otra parte de la app restaure (p.ej., al cerrar un modal)
window.addEventListener('sim:resume-orbits', () => {
  simulationPaused = false;
  resetIsolation();
  restoreEarthScale(earthItem?.mesh || null);
  restoreDefaultView({ smooth: true, duration: 1000 });
});

// ———————————————————————————————————————
// Simulación
// ———————————————————————————————————————
function iniciarSimulacion(mountEl) {
  ensureUI();
  initInfoPanel();

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

  // Earth
  if (earthData) {
    try {
      const geomE = new THREE.SphereGeometry(0.09, 64, 64);
      const matE = new THREE.MeshBasicMaterial({ map: earthTex });
      const meshE = new THREE.Mesh(geomE, matE);
      meshE.name = earthData.name || 'Earth';

      const earthPts = getOrbitPoints(earthData, 512);
      const pathGeomE = new THREE.BufferGeometry().setFromPoints(earthPts);
      const pathMatE = new THREE.LineBasicMaterial({ color: 0x2b6fff, transparent: true, opacity: 0.25, depthWrite:false });
      const pathLineE = new THREE.Line(pathGeomE, pathMatE);
      pathLineE.frustumCulled = false;
      scene.add(pathLineE, meshE);

      const labelE = document.createElement('div');
      labelE.className = 'asteroid-label';
      labelE.textContent = meshE.name;
      labelE.style.display = 'block';
      Object.assign(labelE.style, {
        position:'absolute', transform:'translate(-50%,-100%)', padding:'2px 6px',
        background:'rgba(0,0,0,0.6)', color:'#fff', borderRadius:'8px',
        font:'12px system-ui', whiteSpace:'nowrap', pointerEvents:'none'
      });
      labelLayer.appendChild(labelE);

      asteroidMeshes.push(earthItem = {
        mesh: meshE, obj: earthData, pathLine: pathLineE, pathGeom: pathGeomE, labelEl: labelE
      });
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
    const pathMat  = new THREE.LineBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.25, depthWrite:false });
    const pathLine = new THREE.Line(pathGeom, pathMat);
    pathLine.frustumCulled = false;
    scene.add(pathLine, mesh);

    const label = document.createElement('div');
    label.className = 'asteroid-label';
    label.textContent = mesh.name;
    label.style.display = 'block';
    Object.assign(label.style, {
      position:'absolute', transform:'translate(-50%,-100%)', padding:'2px 6px',
      background:'rgba(0,0,0,0.6)', color:'#fff', borderRadius:'8px',
      font:'12px system-ui', whiteSpace:'nowrap', pointerEvents:'none'
    });
    labelLayer.appendChild(label);

    asteroidMeshes.push({ mesh, obj, pathLine, pathGeom, labelEl: label });
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
        impactorItem.pathLine.material.opacity = 0.25; // órbita bien visible al aislar
      }
    } catch {}

    // Al abrir el panel (botón "Iniciar simulación" o click en Impactor2025)
    window.addEventListener('sim:open-panel', () => {
      // dejar visibles solo Impactor y Tierra
      isolateKeep([impactorItem, earthItem], asteroidMeshes);

      // congelar sistema mientras se edita
      freezeSystem();

      // NUEVO encuadre: target = punto medio, Tierra “grande” abajo-izquierda, Impactor en primer plano
      zoomComposeMidpointAndCorner(
      impactorItem.mesh,
      earthItem?.mesh || null,
      camera,
      controls,
      { distance: 0.6, lateral: 0.4, vertical: 0.2, earthScale: 1.6, duration: 1400 } // ← antes: distance 2.0, duration 1000
    );

      showPanelFor(impactorItem);
    });
  }


  // Raycaster click (aislar o abrir panel de simulación si es Impactor2025)
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  const el = renderer.domElement;

  el.addEventListener('click', (e) => {
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
      return;
    }

    // Asteroide normal: aislar + info
    isolate(item, asteroidMeshes);
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
      if (item.labelEl && item.labelEl.style.display === 'block') {
        const sp = item.mesh.position.clone().project(camera);
        if (sp.z < 1) {
          const x = (sp.x*0.5+0.5)*window.innerWidth;
          const y = (-sp.y*0.5+0.5)*window.innerHeight;
            item.labelEl.style.left = `${x}px`;
            item.labelEl.style.top  = `${y}px`;
        } else {
          item.labelEl.style.display = 'none';
        }
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
  window.addEventListener('resize', _resizeHandler);

  _visibilityHandler = () => {
    tabHidden = document.hidden;
    if (!tabHidden) lastFrameMs = performance.now();
  };
  document.addEventListener('visibilitychange', _visibilityHandler);
}

export async function runHomeSimulation(mountEl) {
  if (_running) return () => {};
  _running = true;
  try {
    await cargarAsteroides();
    iniciarSimulacion(mountEl);
  } catch (e) {
    console.error('No se pudo iniciar la simulación:', e);
    _running = false;
    return () => {};
  }

  return function cleanup() {
    simulationPaused = true;
    if (_frameId) cancelAnimationFrame(_frameId);
    _frameId = null;

    document.removeEventListener('visibilitychange', _visibilityHandler);
    window.removeEventListener('resize', _resizeHandler);

    const labels = document.getElementById('labels');
    if (labels?.parentNode) labels.parentNode.removeChild(labels);

    if (_sceneRefs) {
      const { scene, renderer } = _sceneRefs;
      scene.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          if (Array.isArray(o.material)) o.material.forEach(m => m.dispose());
          else o.material.dispose();
        }
      });
      renderer.dispose();
      if (renderer.domElement && renderer.domElement.parentNode === mountEl) {
        mountEl.removeChild(renderer.domElement);
      }
    }
    _sceneRefs = null;
    _running = false;
  };
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
