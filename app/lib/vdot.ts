/**
 * Cálculo de VDOT pela fórmula de Jack Daniels.
 *
 * Referência: "Daniels' Running Formula", 3ª edição.
 * A fórmula calcula o VO2 de corrida a partir de um tempo em uma distância,
 * e o VDOT é o VO2max efetivo que explicaria aquela performance.
 */

/**
 * Calcula o percentual de VO2max utilizado em uma corrida de dado tempo (minutos).
 * Fórmula de Daniels & Gilbert (1979).
 */
function vo2PctFromTime(t: number): number {
  return (
    0.8 +
    0.1894393 * Math.exp(-0.012778 * t) +
    0.2989558 * Math.exp(-0.1932605 * t)
  );
}

/**
 * Calcula o VO2 de corrida (ml/kg/min) a partir de velocidade (m/min).
 */
function vo2FromVelocity(v: number): number {
  return -4.60 + 0.182258 * v + 0.000104 * v * v;
}

/**
 * Calcula o VDOT dado uma distância (metros) e tempo (segundos).
 * Retorna null se os dados forem inválidos.
 */
export function calculateVdot(distanceMeters: number, timeSec: number): number | null {
  if (!distanceMeters || !timeSec || timeSec <= 0) return null;

  const t = timeSec / 60; // tempo em minutos
  const v = distanceMeters / t; // velocidade em m/min

  const vo2 = vo2FromVelocity(v);
  const pct = vo2PctFromTime(t);

  if (pct <= 0) return null;

  const vdot = vo2 / pct;
  return Math.round(vdot * 10) / 10;
}

/**
 * Dados vários VDOTs (de diferentes distâncias), retorna a média ponderada.
 * Provas mais longas têm peso maior por serem mais confiáveis para maratona.
 */
export function aggregateVdot(
  vdots: { vdot: number; weight: number }[]
): number | null {
  const valid = vdots.filter((v) => v.vdot > 0 && Number.isFinite(v.vdot));
  if (!valid.length) return null;

  const totalWeight = valid.reduce((s, v) => s + v.weight, 0);
  const weighted = valid.reduce((s, v) => s + v.vdot * v.weight, 0);

  return Math.round((weighted / totalWeight) * 10) / 10;
}

/**
 * Dado um VDOT, retorna o pace estimado (s/km) para cada distância clássica.
 * Usa busca binária: encontra o tempo que produziria aquele VDOT.
 */
export function pacesFromVdot(vdot: number): {
  km5: number;
  km10: number;
  half: number;
  marathon: number;
} {
  function estimatePace(distanceM: number): number {
    // Busca binária: acha o tempo (em s) que produz o vdot informado
    let lo = distanceM / 10; // tempo mínimo absurdo
    let hi = distanceM / 1;  // tempo máximo absurdo (1 m/s)

    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      const v = calculateVdot(distanceM, mid);
      if (v === null) break;
      if (v > vdot) lo = mid;
      else hi = mid;
    }

    const timeSec = (lo + hi) / 2;
    return timeSec / (distanceM / 1000); // s/km
  }

  return {
    km5:      Math.round(estimatePace(5000)),
    km10:     Math.round(estimatePace(10000)),
    half:     Math.round(estimatePace(21097)),
    marathon: Math.round(estimatePace(42195)),
  };
}

/**
 * Dado um VDOT, retorna os paces de treino clássicos de Daniels (s/km):
 * Easy, Marathon, Threshold, Interval, Repetition.
 */
export function trainingPacesFromVdot(vdot: number): {
  easy: { min: number; max: number };
  marathon: { min: number; max: number };
  threshold: number;
  interval: number;
  repetition: number;
} {
  const race = pacesFromVdot(vdot);

  return {
    easy:      { min: Math.round(race.marathon * 1.20), max: Math.round(race.marathon * 1.29) },
    marathon:  { min: Math.round(race.marathon * 1.00), max: Math.round(race.marathon * 1.05) },
    threshold: Math.round(race.km10 * 1.07),
    interval:  Math.round(race.km5 * 1.01),
    repetition:Math.round(race.km5 * 0.95),
  };
}

/**
 * VO2max estimado a partir do VDOT (são equivalentes para fins práticos).
 */
export function vo2maxFromVdot(vdot: number): number {
  return Math.round(vdot * 10) / 10;
}