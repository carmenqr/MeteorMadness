import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

export function createScene(mountNode = null) {

  const container = mountNode ?? document.createElement('div')
  if (!mountNode) {
    Object.assign(container.style, {
      position: 'fixed', inset: 0, zIndex: 0, overflow: 'hidden'
    })
    document.body.appendChild(container)
  }

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x000000)

  const width = container.clientWidth || window.innerWidth
  const height = container.clientHeight || window.innerHeight

  const camera = new THREE.PerspectiveCamera(60, width / height, 0.01, 1000)
  camera.position.set(2.5, 1.7, 3.2)

  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(width, height)
  container.appendChild(renderer.domElement)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.enablePan = true
  controls.enableZoom = true
  controls.target.set(0, 0, 0)

  // Luces + Sol
  scene.add(new THREE.AmbientLight(0xffffff, 0.35))
  const sunLight = new THREE.DirectionalLight(0xffffff, 1.1)
  sunLight.position.set(5, 5, 5)
  scene.add(sunLight)

  const sunGeometry = new THREE.SphereGeometry(0.22, 32, 32)
  const sunMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 })
  const sun = new THREE.Mesh(sunGeometry, sunMaterial)
  scene.add(sun)

  return { scene, camera, renderer, controls, container }
}
