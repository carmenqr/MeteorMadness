import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { MAX_CAM_DIST, MIN_CAM_DIST } from '../lib/scene_utils.js';
import sunUrl from '../assets/sun.jpg'
import backgroundUrl from '../assets/stars_milky_way.jpg'

export function createScene(mountNode = null) {
  const container = mountNode ?? document.createElement('div')
  if (!mountNode) {
    Object.assign(container.style, { position: 'fixed', inset: 0, zIndex: 0, overflow: 'hidden' })
    document.body.appendChild(container)
  }

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x000000)
  new THREE.TextureLoader().load(
    backgroundUrl,
    tex => {
      tex.colorSpace = THREE.SRGBColorSpace
      const domeGeo = new THREE.SphereGeometry(120, 64, 64)
      const domeMat = new THREE.MeshBasicMaterial({
        map: tex,
        side: THREE.BackSide,
        transparent: true,
        opacity: 0.35,
        depthWrite: false
      })
      const starDome = new THREE.Mesh(domeGeo, domeMat)
      starDome.name = '__starDome'
      scene.add(starDome)
    },
    undefined,
    err => console.warn('No se pudo cargar fondo estrellas', err)
  )

  const width = container.clientWidth || window.innerWidth
  const height = container.clientHeight || window.innerHeight

  const camera = new THREE.PerspectiveCamera(60, width / height, 0.01, 1000)
  camera.position.set(2.5, 1.7, 3.2)

  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.physicallyCorrectLights = false
  renderer.toneMapping = THREE.NoToneMapping
  renderer.toneMappingExposure = 1.0

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

  controls.minDistance = MIN_CAM_DIST
  controls.maxDistance = MAX_CAM_DIST

  function clampDistance() {
    const v = camera.position.clone().sub(controls.target)
    let d = v.length()
    if (d < controls.minDistance) {
      camera.position.copy(controls.target).add(v.setLength(controls.minDistance))
    } else if (d > controls.maxDistance) {
      camera.position.copy(controls.target).add(v.setLength(controls.maxDistance))
    }
  }
  controls.addEventListener('change', clampDistance)

  const STAR_COUNT = 1500;
  const SHELL_RADIUS = 22;
  const SHELL_THICKNESS = 4;
  const starsGeom = new THREE.BufferGeometry();
  const positions = new Float32Array(STAR_COUNT * 3);
  for (let i = 0; i < STAR_COUNT; i++) {
    const t = Math.pow(Math.random(), 1.8);
    const r = SHELL_RADIUS + (t - 0.5) * SHELL_THICKNESS;
    const u = Math.random() * 2 - 1;
    const theta = Math.acos(u);
    const phi = 2 * Math.PI * Math.random();
    const sinT = Math.sin(theta);
    positions[i * 3 + 0] = r * sinT * Math.cos(phi);
    positions[i * 3 + 1] = r * u;
    positions[i * 3 + 2] = r * sinT * Math.sin(phi);
  }
  starsGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const stars = new THREE.Points(
    starsGeom,
    new THREE.PointsMaterial({ color: 0xffffff, size: 0.06, sizeAttenuation: true })
  );
  scene.add(stars);

  const R = 0.05

  const sunTex = new THREE.TextureLoader().load(sunUrl, t => {
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
  })

  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(R, 64, 64),
    new THREE.MeshBasicMaterial({ map: sunTex, color: 0xffff66 })
  )
  sun.castShadow = false
  sun.receiveShadow = false
  scene.add(sun)

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

  const ambient = new THREE.AmbientLight(0xffffff, 0.78);
  scene.add(ambient);
  
  const solarLight = new THREE.PointLight(0xfff7c0, 8, 200, 2);
  solarLight.castShadow = false;
  sun.add(solarLight);

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
  const coreGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeCoreGlow(1024, '255, 230, 0'),
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending
  }));
  coreGlow.scale.set(glowR * 4, glowR * 4, 1);

  const outerGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeOuterGlow(1024, '255, 230, 0'),
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending
  }));
  outerGlow.scale.set(glowR * 6.0, glowR * 6.0, 1);

  sun.add(coreGlow);
  sun.add(outerGlow);

  return { scene, camera, renderer, controls, container }
}