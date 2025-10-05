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