import { useEffect, useRef } from 'react'
import { solveKepler, keplerToCartesian } from '../lib/orbitUtils.js'

export default function ThreeScene() {
  const containerRef = useRef(null)

  useEffect(() => {
    let renderer, scene, camera, animId

    // import dinámico => code-splitting
    import('three').then(THREE => {
      const { WebGLRenderer, Scene, PerspectiveCamera, BoxGeometry, MeshBasicMaterial, Mesh, Color } = THREE

      const width = containerRef.current.clientWidth
      const height = containerRef.current.clientHeight

      renderer = new WebGLRenderer({ antialias: true })
      renderer.setSize(width, height)
      containerRef.current.appendChild(renderer.domElement)

      scene = new Scene()
      scene.background = new Color(0x000000)

      camera = new PerspectiveCamera(60, width / height, 0.1, 1000)
      camera.position.z = 3

      const cube = new Mesh(
        new BoxGeometry(1,1,1),
        new MeshBasicMaterial({ wireframe: true })
      )
      scene.add(cube)

      const renderLoop = () => {
        cube.rotation.x += 0.01
        cube.rotation.y += 0.01
        renderer.render(scene, camera)
        animId = requestAnimationFrame(renderLoop)
      }
      renderLoop()
    })

    // cleanup
    return () => {
      if (animId) cancelAnimationFrame(animId)
      if (renderer) {
        renderer.dispose?.()
        // quita el canvas
        if (containerRef.current?.firstChild) {
          containerRef.current.removeChild(containerRef.current.firstChild)
        }
      }
    }
  }, [])

  return <div ref={containerRef} style={{width:'100%', height:'100%'}} />
}
