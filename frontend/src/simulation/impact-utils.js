import { getImpactorState } from "./home-panel.js";

export function calcularImpacto() {
  const { massKg, speedKms, densityKgM3 } = getImpactorState();

  if (massKg == null || speedKms == null || densityKgM3 == null) {
    return null; // faltan datos
  }

  const v_mps = speedKms * 1000;                  // convertir a m/s
  const energiaJ = 0.5 * massKg * v_mps ** 2;     // energía cinética en Julios

  const result = {
    energiaJ,
    velocidadKms: speedKms,
    velocidadMps: v_mps,
    masaKg: massKg,
    densidadKgM3: densityKgM3
  };

  // 👇 Imprimir en consola para depurar
  console.log("Impactor parameters:", result);

  return result;
}
