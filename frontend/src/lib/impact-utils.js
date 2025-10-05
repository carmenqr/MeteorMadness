import { getImpactorState } from "../simulation/home-panel.js";

export function calcularImpacto() {
  const { massKg, speedKms, densityKgM3 } = getImpactorState();

  if (massKg == null || speedKms == null || densityKgM3 == null) {
    return null;
  }

  const v_mps = speedKms * 1000;
  const energiaJ = 0.5 * massKg * v_mps ** 2;

  const result = {
    energiaJ,
    velocidadKms: speedKms,
    velocidadMps: v_mps,
    masaKg: massKg,
    densidadKgM3: densityKgM3
  };

  console.log("Impactor parameters:", result);

  return result;
}
