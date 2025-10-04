import * as THREE from 'https://esm.sh/three@0.160.0';
import { DEG2RAD } from '../lib/asteroid_utils.js';
import { propagate } from '../lib/orbit_utils.js';
import { createScene } from './scene.js';
import { initInfoPanel, showPanelFor, hidePanel, onPanelReset } from './home-panel.js';


let asteroides = [];
let simulationPaused = false;     // pausa/continúa la propagación
let isolatedItem = null;          // asteroide aislado (o null)
let earthData = null;      // elementos orbitales de la Tierra (del backend)
let earthItem = null;      // referencia a su mesh/órbita/label

let tweenCancel = null;   // para abortar un zoom en curso

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

    iniciarSimulacion();
  } catch (error) {
    console.warn("No se pudo cargar asteroides desde backend, intentando mock local. Error:", error);
    try {
      const local = await fetch('./mock/asteroides_mock.json');
      if (!local.ok) throw new Error(`Local mock responded ${local.status}`);
      asteroides = await local.json();
      console.log(`Loaded ${asteroides.length} asteroids from local mock`);
      iniciarSimulacion();
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
// UI auxiliar (se crea desde JS, no toques HTML)
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
    const vis = (it === item);
    it.mesh.visible = vis;
    // Ocultamos las órbitas no seleccionadas y resaltamos la del seleccionado
    if (it.pathLine) it.pathLine.visible = vis;
    if (vis && it.pathLine && it.pathLine.material) it.pathLine.material.opacity = 1.0;
    it.labelEl.style.display = vis ? 'block' : 'none';
  }
  showPanelFor(item); //PARA EL PANEL LATERAL DE INFO
}

function resetIsolation(listRef) {
  const list = listRef || window.__asteroidMeshes || [];
  isolatedItem = null;
  for (const it of list) {
    it.mesh.visible = true;
    // Restaurar visibilidad y opacidad por defecto de las órbitas
    if (it.pathLine) {
      it.pathLine.visible = true;
      if (it.pathLine.material) it.pathLine.material.opacity = 0.25;
    }
    it.labelEl.style.display = 'block';
  }
  hidePanel();
}

//PARA EL PANEL LATERAL DE INFO
onPanelReset(() => {
  resetIsolation();
  resumeSystem();
});


// Permite que otra parte de la app restaure (p.ej., al cerrar un modal)
window.addEventListener('sim:resume-orbits', () => {
  simulationPaused = false;
  resetIsolation();
});

// ———————————————————————————————————————
// Simulación
// ———————————————————————————————————————
function iniciarSimulacion() {
  ensureUI();
  initInfoPanel();

  const { scene, camera, renderer, controls } = createScene();

  const labelLayer = document.getElementById('labels');
  const asteroidMeshes = [];              // mantenemos tu nombre
  window.__asteroidMeshes = asteroidMeshes; // acceso para resetIsolation externo

  // Si tenemos datos de la Tierra, crear su mesh + órbita + label
  if (earthData) {
    try {
      const geomE = new THREE.SphereGeometry(0.095, 32, 32);
      const matE = new THREE.MeshPhongMaterial({ color: 0x2b6fff, emissive: 0x051022 });
      const meshE = new THREE.Mesh(geomE, matE);
      meshE.name = earthData.name || 'Earth';

      const pathGeomE = new THREE.BufferGeometry().setFromPoints([]);
      const pathMatE = new THREE.LineBasicMaterial({ color: 0x2b6fff, transparent: true, opacity: 0.25 });
      const pathLineE = new THREE.Line(pathGeomE, pathMatE);
      scene.add(pathLineE);
      scene.add(meshE);

      const labelE = document.createElement('div');
      labelE.className = 'asteroid-label';
      labelE.textContent = meshE.name;
      Object.assign(labelE.style, {
        position: 'absolute', transform: 'translate(-50%,-100%)', padding: '2px 6px',
        background: 'rgba(0,0,0,0.6)', color: '#fff', borderRadius: '8px',
        font: '12px system-ui', whiteSpace: 'nowrap', pointerEvents: 'none'
      });
      labelLayer.appendChild(labelE);

      earthItem = {
        mesh: meshE,
        obj: earthData,
        pathLine: pathLineE,
        pathGeom: pathGeomE,
        pathPoints: [],
        lastM: (earthData.M0 ?? 0) * DEG2RAD,
        labelEl: labelE
      };
      asteroidMeshes.push(earthItem);
    } catch (e) { console.warn('No se pudo crear mesh de Earth:', e); }
  }

  // Crear asteroides + trayectorias + labels
  for (let obj of asteroides) {
    const geom = new THREE.SphereGeometry(0.03, 16, 16);
    const mat = new THREE.MeshPhongMaterial({ color: 0xff0000 });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.name = obj.name || 'Asteroide';

    const pathGeom = new THREE.BufferGeometry().setFromPoints([]);
    // Órbitas atenuadas por defecto
    const pathMat = new THREE.LineBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.25 });
    const pathLine = new THREE.Line(pathGeom, pathMat);
    scene.add(pathLine);
    scene.add(mesh);

    // Label DOM siempre visible
    const label = document.createElement('div');
    label.className = 'asteroid-label';
    label.textContent = mesh.name;
    Object.assign(label.style, {
      position: 'absolute',
      transform: 'translate(-50%,-100%)',
      padding: '2px 6px',
      background: 'rgba(0,0,0,0.6)',
      color: '#fff',
      borderRadius: '8px',
      font: '12px system-ui',
      whiteSpace: 'nowrap',
      pointerEvents: 'none'
    });
    labelLayer.appendChild(label);

    asteroidMeshes.push({
      mesh, obj,
      pathLine, pathGeom, pathPoints: [],
      lastM: (obj.M0 ?? 0) * DEG2RAD,
      labelEl: label
    });
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
        impactorItem.pathLine.material.opacity = 1.0; // órbita bien visible al aislar
      }
    } catch {}

    // Al abrir el panel (botón "Iniciar simulación" o click en Impactor2025)
    window.addEventListener('sim:open-panel', () => {
      // Oculta TODOS los demás y muestra solo el Impactor2025
      isolate(impactorItem, asteroidMeshes);

      // Congela el movimiento donde esté
      simulationPaused = true;

      // (Opcional) centra cámara cerca del Impactor2025 para enfocarlo
      try {
        const target = impactorItem.mesh.position.clone();
        if (controls) controls.target.copy(target);
        const dir = new THREE.Vector3(0.6, 0.4, 0.6).normalize();
        const desired = target.clone().add(dir.multiplyScalar(1.5));
        camera.position.lerp(desired, 0.7);
        camera.updateProjectionMatrix();
      } catch {}
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

  // Animación
  let t0 = Date.now();
  function animate() {
    requestAnimationFrame(animate);

    let days = (Date.now() - t0) / 1000;
    let tJulian = 2461000.5 + days;

    for (let item of asteroidMeshes) {
      // Si pausado, no propagamos (pero dejamos labels renderizar)
      if (!simulationPaused) {
        const { pos, M } = propagate(item.obj, tJulian);
        item.mesh.position.copy(pos);

        // Reseteo de traza al completar vuelta
        if (M < item.lastM) item.pathPoints = [];
        item.lastM = M;

        // Solo actualiza la traza si es visible (ahorro)
        if (item.mesh.visible) {
          item.pathPoints.push(item.mesh.position.clone());
          item.pathGeom.setFromPoints(item.pathPoints);
        }
      }

      // Posicionar label (si está visible en pantalla)
      if (item.mesh.visible) {
        const screenPos = item.mesh.position.clone().project(camera);
        const x = (screenPos.x * 0.5 + 0.5) * window.innerWidth;
        const y = (-screenPos.y * 0.5 + 0.5) * window.innerHeight;
        const onScreen = screenPos.z < 1;
        item.labelEl.style.display = onScreen ? 'block' : 'none';
        if (onScreen) {
          item.labelEl.style.left = `${x}px`;
          item.labelEl.style.top = `${y}px`;
        }
      } else {
        item.labelEl.style.display = 'none';
      }
    }

    controls.update();
    renderer.render(scene, camera);
  }
  animate();

  // Resize
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

cargarAsteroides();


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
