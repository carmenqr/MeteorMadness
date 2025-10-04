import * as THREE from 'https://esm.sh/three@0.160.0';
import { DEG2RAD } from './asteroides.js';
import { propagarOrbita } from './orbitUtils.js';
import { createScene } from './scene.js';

let asteroides = [];

//Conexión con el back para cargar datos de los asteroides
async function cargarAsteroides() {
  try {
    const res = await fetch("http://127.0.0.1:5000/api/asteroides");
    asteroides = await res.json(); //Guardamos los datos en la variable (formato json)
    iniciarSimulacion(); //Cuando tengamos los datos podemos ejecutar
  } catch (error) {
    console.error("Error cargando asteroides:", error);
  }
}

function iniciarSimulacion() {
  const { scene, camera, renderer, controls } = createScene();

  const asteroidMeshes = [];
  for (let obj of asteroides) {
    const geom = new THREE.SphereGeometry(0.05, 16, 16);
    const mat = new THREE.MeshPhongMaterial({color: 0xff0000});
    const mesh = new THREE.Mesh(geom, mat);

    const pathGeom = new THREE.BufferGeometry().setFromPoints([]);
    const pathMat = new THREE.LineBasicMaterial({color: 0x00ff00});
    const pathLine = new THREE.Line(pathGeom, pathMat);
    scene.add(pathLine);

    scene.add(mesh);
    asteroidMeshes.push({mesh, obj, pathGeom, pathPoints: [], lastM: obj.M0*DEG2RAD});
  }

  let t0 = Date.now();
  function animate() {
    requestAnimationFrame(animate);

    let days = (Date.now() - t0)/10;
    let tJulian = 2461000.5 + days;

    for (let item of asteroidMeshes) {
      let {pos, M} = propagarOrbita(item.obj, tJulian);
      item.mesh.position.copy(pos);

      if (M < item.lastM) {
        item.pathPoints = [];
      }
      item.lastM = M;

      item.pathPoints.push(pos.clone());
      item.pathGeom.setFromPoints(item.pathPoints);
    }

    controls.update();
    renderer.render(scene, camera);
  }
  animate();

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
