import * as THREE from 'three'
import { DEG2RAD } from '../lib/asteroid_utils.js'
import { propagate } from '../lib/orbit_utils.js'
import { createScene } from './scene.js'

export default function runHomeSimulation({ apiBase, fullscreen = false, mountNode = null }) {
  let asteroides = []
  let simulationPaused = false
  let isolatedItem = null
  let frameId = null

  // Crea escena (si fullscreen, no pasamos mountNode y se crea contenedor en <body>)
  const { scene, camera, renderer, controls, container } = createScene(fullscreen ? null : mountNode)

  // ---------- UI (dentro del contenedor) ----------
  const labelsLayer = document.createElement('div')
  Object.assign(labelsLayer.style, {
    position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2
  })
  container.appendChild(labelsLayer)

  const infoPanel = document.createElement('div')
  Object.assign(infoPanel.style, {
    position: 'absolute', top: '12px', left: '12px', width: '320px',
    maxHeight: '65%', overflow: 'auto',
    background: 'rgba(11,18,32,.92)', color: '#e5e7eb',
    border: '1px solid #ffffff22', borderRadius: '12px',
    padding: '12px', font: '13px system-ui', zIndex: 3, display: 'none'
  })
  container.appendChild(infoPanel)

  const topbar = document.createElement('div')
  Object.assign(topbar.style, {
    position: 'absolute', top: '12px', right: '12px', zIndex: 3, pointerEvents: 'auto'
  })
  const btnStart = document.createElement('button')
  btnStart.textContent = 'Iniciar simulación'
  Object.assign(btnStart.style, {
    padding: '8px 12px', borderRadius: '10px',
    border: '1px solid #ffffff22', background: '#1d4ed8', color: '#fff', cursor: 'pointer'
  })
  topbar.appendChild(btnStart)
  container.appendChild(topbar)

  function openInfoPanelFor(item) {
    if (!item) { infoPanel.style.display = 'none'; infoPanel.innerHTML = ''; return }
    const rows = Object.entries(item.obj).map(([k,v]) =>
      `<div style="margin:2px 0;"><b>${k}</b>: ${typeof v === 'object' ? JSON.stringify(v) : v}</div>`
    ).join('')
    infoPanel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px">
        <div style="font-weight:600">${item.mesh.name}</div>
        <div>
          <button id="btn-reset" style="background:#334155;color:#fff;border:none;border-radius:8px;padding:4px 8px;cursor:pointer">Restaurar</button>
        </div>
      </div>
      ${rows}
    `
    infoPanel.style.display = 'block'
    infoPanel.querySelector('#btn-reset').onclick = () => resetIsolation()
  }

  function isolate(item, list) {
    isolatedItem = item
    for (const it of list) {
      const vis = (it === item)
      it.mesh.visible = vis
      if (it.pathLine) it.pathLine.visible = vis
      if (vis && it.pathLine && it.pathLine.material) it.pathLine.material.opacity = 1.0
      it.labelEl.style.display = vis ? 'block' : 'none'
    }
    openInfoPanelFor(item)
  }

  function resetIsolation() {
    isolatedItem = null
    for (const it of asteroidList) {
      it.mesh.visible = true
      if (it.pathLine) {
        it.pathLine.visible = true
        if (it.pathLine.material) it.pathLine.material.opacity = 0.25
      }
      it.labelEl.style.display = 'block'
    }
    openInfoPanelFor(null)
  }

  btnStart.addEventListener('click', () => {
    simulationPaused = true
    window.dispatchEvent(new CustomEvent('sim:pause-orbits'))
    window.dispatchEvent(new CustomEvent('sim:open-panel'))
  })

  const raycaster = new THREE.Raycaster()
  const mouse = new THREE.Vector2()
  renderer.domElement.addEventListener('click', (e) => {
    const rect = renderer.domElement.getBoundingClientRect()
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1

    const targets = (isolatedItem ? [isolatedItem.mesh] : asteroidList.filter(i=>i.mesh.visible).map(i => i.mesh))
    raycaster.setFromCamera(mouse, camera)
    const hit = raycaster.intersectObjects(targets, false)[0]
    if (!hit) return
    const item = asteroidList.find(i => i.mesh === hit.object)
    if (!item) return

    if (/impactor[- ]?2025/i.test(item.mesh.name)) {
      simulationPaused = true
      window.dispatchEvent(new CustomEvent('sim:pause-orbits'))
      window.dispatchEvent(new CustomEvent('sim:open-panel'))
      return
    }
    isolate(item, asteroidList)
  })

  // ---------- Carga de datos + escena ----------
  const asteroidList = []

  function iniciarSimulacion() {
    for (let obj of asteroides) {
      const geom = new THREE.SphereGeometry(0.03, 16, 16)
      const mat = new THREE.MeshPhongMaterial({ color: 0xff3b3b }) // rojo
      const mesh = new THREE.Mesh(geom, mat)
      mesh.name = obj.name || 'Asteroide'

      // ÓRBITA verde translúcida
      const pathGeom = new THREE.BufferGeometry().setFromPoints([])
      const pathMat = new THREE.LineBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.25 })
      const pathLine = new THREE.Line(pathGeom, pathMat)
      scene.add(pathLine)
      scene.add(mesh)

      const label = document.createElement('div')
      label.textContent = mesh.name
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
      })
      labelsLayer.appendChild(label)

      asteroidList.push({
        mesh, obj,
        pathLine, pathGeom, pathPoints: [],
        lastM: (obj.M0 ?? 0) * DEG2RAD,
        labelEl: label
      })
    }

    let t0 = Date.now()
    const animate = () => {
      frameId = requestAnimationFrame(animate)
      let days = (Date.now() - t0) / 1000
      let tJulian = 2461000.5 + days

      for (let item of asteroidList) {
        if (!simulationPaused) {
          const { pos, M } = propagate(item.obj, tJulian)
          item.mesh.position.copy(pos)
          if (M < item.lastM) item.pathPoints = []
          item.lastM = M
          if (item.mesh.visible) {
            item.pathPoints.push(item.mesh.position.clone())
            item.pathGeom.setFromPoints(item.pathPoints)
          }
        }
        if (item.mesh.visible) {
          const screenPos = item.mesh.position.clone().project(camera)
          const x = (screenPos.x * 0.5 + 0.5) * (container.clientWidth || window.innerWidth)
          const y = (-screenPos.y * 0.5 + 0.5) * (container.clientHeight || window.innerHeight)
          const onScreen = screenPos.z < 1
          item.labelEl.style.display = onScreen ? 'block' : 'none'
          if (onScreen) {
            item.labelEl.style.left = `${x}px`
            item.labelEl.style.top = `${y}px`
          }
        } else {
          item.labelEl.style.display = 'none'
        }
      }

      controls.update()
      renderer.render(scene, camera)
    }
    animate()
  }

  async function cargarAsteroides() {
    try {
      const res = await fetch(`${apiBase}/api/asteroides`)
      if (!res.ok) throw new Error(`API responded ${res.status}`)
      const data = await res.json()
      asteroides = Array.isArray(data) ? data : (data.items || [])
      iniciarSimulacion()
    } catch (error) {
      try {
        const local = await fetch('/src/assets/mock/asteroides_mock.json')
        if (!local.ok) throw new Error(`Local mock responded ${local.status}`)
        asteroides = await local.json()
        iniciarSimulacion()
      } catch (err2) {
        infoPanel.style.display = 'block'
        infoPanel.innerText =
          'No se han podido cargar datos de los asteroides. Inicia el backend o comprueba la ruta de los archivos.'
        console.error('No se pudieron cargar asteroides desde backend ni mock.', error, err2)
      }
    }
  }
  cargarAsteroides()

  // ---------- Resize ----------
  const onResize = () => {
    const w = container.clientWidth || window.innerWidth
    const h = container.clientHeight || window.innerHeight
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
  }
  window.addEventListener('resize', onResize)

  // ---------- Cleanup ----------
  return () => {
    cancelAnimationFrame(frameId)
    window.removeEventListener('resize', onResize)

    // borrar UI
    asteroidList.forEach(i => i.labelEl?.remove?.())
    labelsLayer.remove()
    infoPanel.remove()
    topbar.remove()

    // liberar geometrías/materiales
    asteroidList.forEach(i => {
      i.mesh.geometry?.dispose?.()
      i.mesh.material?.dispose?.()
      i.pathGeom?.dispose?.()
      i.pathLine?.material?.dispose?.()
      scene.remove(i.mesh)
      scene.remove(i.pathLine)
    })

    renderer.dispose()
    container.contains(renderer.domElement) && container.removeChild(renderer.domElement)
    // si el contenedor lo creó la escena (fullscreen), elimínalo
    if (container.parentElement === document.body) {
      document.body.removeChild(container)
    }
  }
}
