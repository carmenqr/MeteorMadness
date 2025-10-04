import * as THREE from 'https://esm.sh/three@0.160.0';
import { DEG2RAD } from './asteroides.js';
import { propagarOrbita } from './orbitUtils.js';
import { createScene } from './scene.js';

let asteroides = [];
let simulationPaused = false;     // pausa/continúa la propagación
let isolatedItem = null;          // asteroide aislado (o null)

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
  // Panel de info
  if (!document.getElementById('info-panel')) {
    const panel = document.createElement('div');
    panel.id = 'info-panel';
    Object.assign(panel.style, {
      position: 'fixed', top: '12px', left: '12px', width: '320px',
      maxHeight: '65vh', overflow: 'auto',
      background: 'rgba(11,18,32,.92)', color: '#e5e7eb',
      border: '1px solid #ffffff22', borderRadius: '12px',
      padding: '12px', font: '13px system-ui', zIndex: 25, display: 'none'
    });
    document.body.appendChild(panel);
  }
  // Botón iniciar simulación (top-right)
  if (!document.getElementById('btn-start')) {
    const topbar = document.createElement('div');
    Object.assign(topbar.style, {
      position: 'fixed', top: '12px', right: '12px', zIndex: 30, pointerEvents: 'auto'
    });
    const btn = document.createElement('button');
    btn.id = 'btn-start';
    btn.textContent = 'Iniciar simulación';
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

function openInfoPanelFor(item) {
  const infoPanel = document.getElementById('info-panel');
  if (!item) { infoPanel.style.display = 'none'; infoPanel.innerHTML = ''; return; }
  const rows = Object.entries(item.obj).map(([k,v]) =>
    `<div style="margin:2px 0;"><b>${k}</b>: ${typeof v === 'object' ? JSON.stringify(v) : v}</div>`
  ).join('');
  infoPanel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px">
      <div style="font-weight:600">${item.mesh.name}</div>
      <div>
        <button id="btn-reset" style="background:#334155;color:#fff;border:none;border-radius:8px;padding:4px 8px;cursor:pointer">Restaurar</button>
      </div>
    </div>
    ${rows}
  `;
  infoPanel.style.display = 'block';
  // Wrapper: evita que el Event se pase como argumento a resetIsolation
  document.getElementById('btn-reset').onclick = () => resetIsolation();
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
  openInfoPanelFor(item);
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
  openInfoPanelFor(null);
}

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

  const { scene, camera, renderer, controls } = createScene();

  const labelLayer = document.getElementById('labels');
  const asteroidMeshes = [];              // mantenemos tu nombre
  window.__asteroidMeshes = asteroidMeshes; // acceso para resetIsolation externo

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
        const { pos, M } = propagarOrbita(item.obj, tJulian);
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
