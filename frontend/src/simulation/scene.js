import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import sunUrl from '../assets/sun.jpg'

export function createScene(mountNode = null) {
  const container = mountNode ?? document.createElement('div')
  if (!mountNode) {
    Object.assign(container.style, { position: 'fixed', inset: 0, zIndex: 0, overflow: 'hidden' })
    document.body.appendChild(container)
  }

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x000000)

  const width = container.clientWidth || window.innerWidth
  const height = container.clientHeight || window.innerHeight

  const camera = new THREE.PerspectiveCamera(60, width / height, 0.01, 1000)
  camera.position.set(2.5, 1.7, 3.2)

  const renderer = new THREE.WebGLRenderer({ antialias: true })

  // Color y luces físicas
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.physicallyCorrectLights = false
  renderer.toneMapping = THREE.NoToneMapping
  renderer.toneMappingExposure = 1.0

  // Sombras (si quieres que los asteroides proyecten/reciban sombras)
  renderer.shadowMap.enabled = false
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(width, height)
  container.appendChild(renderer.domElement)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.enablePan = true
  controls.enableZoom = true
  controls.target.set(0, 0, 0)

  // El Sol NO recibe luz: MeshBasicMaterial ignora luces (actúa como emisor)
  const R = 0.05 // radio del sol en tu escena

    // --- Textura local del Sol ---
  const sunTex = new THREE.TextureLoader().load(sunUrl, t => {
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
  })

  // Sol (MeshBasic ignora luces ⇒ no “recibe” iluminación)
  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(R, 64, 64),
    new THREE.MeshBasicMaterial({ map: sunTex, color: 0xffff66 }) // tiñe a amarillo
  )
  sun.castShadow = false
  sun.receiveShadow = false
  scene.add(sun)

  // Velo amarillo muy fino encima (refuerza el tinte)
  const tint = new THREE.Mesh(
    new THREE.SphereGeometry(R, 64, 64),
    new THREE.MeshBasicMaterial({
      color: 0xffff66,
      transparent: true,
      opacity: 0.25,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  )
  sun.add(tint)

  // 1) una “luz de espacio” muy tenue (relleno global)
  const ambient = new THREE.AmbientLight(0xffffff, 0.78); // 0.08–0.18
  scene.add(ambient);
  
  const solarLight = new THREE.PointLight(0xfff7c0, /*intensity*/ 8, /*distance*/ 200, /*decay*/ 2);
  solarLight.castShadow = false;
  sun.add(solarLight);


  // Gradiente concentrado (core)
function makeCoreGlow(size = 1024, color = '255, 230, 0') {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  const r = size * 0.5;
  const grd = g.createRadialGradient(r, r, r*0.02, r, r, r*0.35);
  grd.addColorStop(0.00, `rgba(${color}, 1.0)`);
  grd.addColorStop(0.20, `rgba(${color}, 0.55)`);
  grd.addColorStop(0.40, `rgba(${color}, 0.10)`);
  grd.addColorStop(1.00, `rgba(${color}, 0.0)`);
  g.fillStyle = grd; g.fillRect(0,0,size,size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Gradiente amplio (corona exterior muy tenue)
function makeOuterGlow(size = 1024, color = '255, 230, 0') {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  const r = size * 0.5;
  const grd = g.createRadialGradient(r, r, r*0.10, r, r, r*0.50);
  grd.addColorStop(0.00, `rgba(${color}, 0.15)`);
  grd.addColorStop(0.60, `rgba(${color}, 0.05)`);
  grd.addColorStop(1.00, `rgba(${color}, 0.0)`);
  g.fillStyle = grd; g.fillRect(0,0,size,size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const glowR = 0.2
// Core (pegado)
const coreGlow = new THREE.Sprite(new THREE.SpriteMaterial({
  map: makeCoreGlow(1024, '255, 230, 0'),
  transparent: true,
  depthWrite: false,
  depthTest: false,
  blending: THREE.AdditiveBlending
}));
// diámetro del Sol = 2*R → pon el core algo mayor
coreGlow.scale.set(glowR * 4, glowR * 4, 1);

// Corona (suave y amplia)
const outerGlow = new THREE.Sprite(new THREE.SpriteMaterial({
  map: makeOuterGlow(1024, '255, 230, 0'),
  transparent: true,
  depthWrite: false,
  depthTest: false,
  blending: THREE.AdditiveBlending
}));
outerGlow.scale.set(glowR * 6.0, glowR * 6.0, 1);

// Añádelos al Sol
sun.add(coreGlow);
sun.add(outerGlow);


  return { scene, camera, renderer, controls, container }
}
