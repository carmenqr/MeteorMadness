import * as THREE from 'https://esm.sh/three@0.160.0';
import { DEG2RAD } from './asteroid_utils.js'

export function solveKepler(M, e) {
  let E = M;
  for (let k = 0; k < 15; k++) {
    E = E - (E - e*Math.sin(E) - M) / (1 - e*Math.cos(E));
  }
  return E;
}

export function propagate(obj, tJulian) {
  const mu = 0.01720209895**2;
  const n = Math.sqrt(mu / Math.pow(obj.a, 3));
  const M = (obj.M0*DEG2RAD + n*(tJulian - obj.epoch)) % (2*Math.PI);

  const E = solveKepler(M, obj.e);
  const v = 2*Math.atan2(Math.sqrt(1+obj.e)*Math.sin(E/2), Math.sqrt(1-obj.e)*Math.cos(E/2));
  const r = obj.a*(1 - obj.e*Math.cos(E));

  let x_orb = r * Math.cos(v);
  let y_orb = r * Math.sin(v);

  const cosO = Math.cos(obj.om*DEG2RAD), sinO = Math.sin(obj.om*DEG2RAD);
  const cosi = Math.cos(obj.i*DEG2RAD), sini = Math.sin(obj.i*DEG2RAD);
  const cosw = Math.cos(obj.w*DEG2RAD), sinw = Math.sin(obj.w*DEG2RAD);

  const x = (cosO*cosw - sinO*sinw*cosi)*x_orb + (-cosO*sinw - sinO*cosw*cosi)*y_orb;
  const y = (sinO*cosw + cosO*sinw*cosi)*x_orb + (-sinO*sinw + cosO*cosw*cosi)*y_orb;
  const z = (sini*sinw)*x_orb + (sini*cosw)*y_orb;

  return {pos: new THREE.Vector3(x, y, z), M};
}

export function getOrbitPoints(obj, steps = 512) {
  const pts = [];
  for (let k = 0; k <= steps; k++) {
    const frac = k / steps;
    const M = 2 * Math.PI * frac;
    let E = solveKepler(M, obj.e);
    const v = 2 * Math.atan2(
      Math.sqrt(1 + obj.e) * Math.sin(E / 2),
      Math.sqrt(1 - obj.e) * Math.cos(E / 2)
    );
    const r = obj.a * (1 - obj.e * Math.cos(E));

    const x_orb = r * Math.cos(v);
    const y_orb = r * Math.sin(v);

    const cosO = Math.cos(obj.om * DEG2RAD), sinO = Math.sin(obj.om * DEG2RAD);
    const cosi = Math.cos(obj.i * DEG2RAD), sini = Math.sin(obj.i * DEG2RAD);
    const cosw = Math.cos(obj.w * DEG2RAD), sinw = Math.sin(obj.w * DEG2RAD);

    const x = (cosO*cosw - sinO*sinw*cosi)*x_orb + (-cosO*sinw - sinO*cosw*cosi)*y_orb;
    const y = (sinO*cosw + cosO*sinw*cosi)*x_orb + (-sinO*sinw + cosO*cosw*cosi)*y_orb;
    const z = (sini*sinw)*x_orb + (sini*cosw)*y_orb;

    pts.push(new THREE.Vector3(x, y, z));
  }
  return pts;
}

/*
// ====== ORBIT TRAIL HELPERS ======
export function _wrapIndex(i, n){ return (i % n + n) % n; }

export function _nearestIndexOnOrbit(pts, pos){
  // O(N) – suficiente para 512 pts
  let bestI = 0, bestD2 = Infinity;
  for (let i=0; i<pts.length; i++){
    const p = pts[i];
    const dx = p.x - pos.x, dy = p.y - pos.y, dz = p.z - pos.z;
    const d2 = dx*dx + dy*dy + dz*dz;
    if (d2 < bestD2){ bestD2 = d2; bestI = i; }
  }
  return bestI;
}

// Crea segmentos de la órbita para poder variar opacidades por tramo (como "estela")
export function makeOrbitTrailFast(scene, orbitPts, {
  color = 0x00ff00,
  baseOpacity = 0.06,
  hiOpacities = [0.95, 0.45, 0.18], // más cerca del asteroide → más opaca
  hiWindows   = [36, 90, 180],      // tamaño de ventana en puntos (ajusta a tu densidad)
} = {}) {
  const baseGeom = new THREE.BufferGeometry().setFromPoints(orbitPts);
  const baseMat  = new THREE.LineBasicMaterial({ color, transparent:true, opacity: baseOpacity, depthWrite:false });
  const baseLine = new THREE.Line(baseGeom, baseMat);
  baseLine.frustumCulled = false;
  scene.add(baseLine);

  // Reutilizamos la MISMA geometría para las tres ventanas (menos memoria)
  const hiLines = hiOpacities.map((alpha) => {
    const m = new THREE.LineBasicMaterial({ color, transparent:true, opacity: alpha, depthWrite:false });
    const l = new THREE.Line(baseGeom, m);
    l.frustumCulled = false;
    // Empezamos con drawRange vacío (nada dibujado)
    l.geometry.setDrawRange(0, 0);
    scene.add(l);
    return l;
  });

  return {
    pts: orbitPts,
    baseLine,
    hiLines,      // array de 3 Line
    hiWindows,    // tamaños de ventana en puntos
  };
}

// Actualiza las ventanas deslizantes alrededor del índice actual (reciente detrás del asteroide)
export function updateOrbitTrailFast(trail, currentIdx) {
  if (!trail?.pts?.length) return;
  const N = trail.pts.length;

  // Función que aplica drawRange envolviendo por 0..N-1 si hace falta
  const applyWindow = (line, endIdx, win) => {
    // Ventana "reciente": desde endIdx - win hasta endIdx (incl.)
    let start = endIdx - win + 1;
    let count;
    if (start >= 0) {
      // ventana en un solo tramo
      count = Math.max(0, Math.min(win, N - start));
      line.geometry.setDrawRange(start, count);
      line.visible = (count > 1);
      // No necesitamos una segunda línea: esta ventana no cruza el 0
      line.userData._split = null;
    } else {
      // CRUZA el 0: partimos en DOS rangos -> usamos una segunda "sombra" con mismo material
      // Para no crear objetos extra, duplicamos con un "ghost" si no existe
      if (!line.userData._split) {
        const ghost = new THREE.Line(line.geometry, line.material);
        ghost.frustumCulled = false;
        line.parent.add(ghost);
        line.userData._split = ghost;
      }
      const ghost = line.userData._split;

      // Primer tramo [0 .. endIdx]
      const countA = Math.max(0, endIdx + 1);
      line.geometry.setDrawRange(0, countA);
      line.visible = (countA > 1);

      // Segundo tramo [N + start .. N-1]
      const startB = N + start;            // positivo
      const countB = Math.max(0, N - startB);
      ghost.geometry.setDrawRange(startB, countB);
      ghost.visible = (countB > 1);
    }
  };

  // Ventana más opaca cerca del punto actual, otras más largas y menos opacas por detrás
  for (let i = 0; i < trail.hiLines.length; i++) {
    applyWindow(trail.hiLines[i], currentIdx, trail.hiWindows[i]);
  }
}
  */
