import { getImpactorState } from "./home-panel.js";

export function calcularImpacto() {
  const { massKg, speedKms, densityKgM3 } = getImpactorState();

  if (massKg == null || speedKms == null || densityKgM3 == null) {
    return null; // faltan datos
  }

  const v_mps = speedKms * 1000;                  // convertir a m/s
  const energiaJ = 0.5 * massKg * v_mps ** 2;     // energía cinética en Julios

  return {
    energiaJ,        // energía en Julios
    velocidadKms: speedKms,   // velocidad en km/s
    velocidadMps: v_mps,      // velocidad en m/s
    masaKg: massKg,           // masa en kg
    densidadKgM3: densityKgM3 // densidad en kg/m³
  };
}
