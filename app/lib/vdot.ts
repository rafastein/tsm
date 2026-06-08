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
    let lo = distanceM / 10;
    let hi = distanceM / 1;

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
 * Easy (E), Marathon (M), Threshold (T), Interval (I), Repetition (R).
 *
 * Metodologia: Daniels define cada zona como um % do VO2max.
 * Para converter % VO2max → pace, usa resolução analítica da fórmula inversa:
 * encontra a velocidade v tal que vo2FromVelocity(v) = pct * vdot.
 *
 * Referência: Daniels' Running Formula, 3ª edição.
 * E:  59–74% VDOT (faixa de corrida fácil/longo)
 * M:  pace de maratona calculado diretamente
 * T:  83–88% VDOT (threshold/tempo — "comfortably hard")
 * I:  97–100% VDOT (intervalado — ≈ pace 5km de corrida séria)
 * R:  105–120% VDOT (repetição — mais rápido que I, esforço neuromuscular)
 */
export function trainingPacesFromVdot(vdot: number): {
  easy:       { min: number; max: number };
  marathon:   { min: number; max: number };
  threshold:  { min: number; max: number };
  interval:   number;
  repetition: number;
} {
  // Converte % VDOT → pace (s/km) via resolução analítica
  // Resolve: vo2FromVelocity(v) = pct * vdot → equação de 2º grau em v
  function paceFromPctVdot(pct: number): number {
    const targetVO2 = pct * vdot;
    const a = 0.000104;
    const b = 0.182258;
    const c = -(4.60 + targetVO2);
    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0) return 0;
    const vMetersPerMin = (-b + Math.sqrt(discriminant)) / (2 * a);
    if (vMetersPerMin <= 0) return 0;
    return Math.round((1000 / vMetersPerMin) * 60);
  }

  const race = pacesFromVdot(vdot);

  return {
    // Easy: 59–74% VDOT
    easy: {
      min: paceFromPctVdot(0.74), // mais rápido (74%)
      max: paceFromPctVdot(0.59), // mais lento (59%)
    },
    // Marathon: pace direto ±5s/km
    marathon: {
      min: race.marathon - 5,
      max: race.marathon + 5,
    },
    // Threshold: 83–88% VDOT
    threshold: {
      min: paceFromPctVdot(0.88), // mais rápido
      max: paceFromPctVdot(0.83), // mais lento
    },
    // Interval: 97–100% VDOT
    interval: paceFromPctVdot(0.98),
    // Repetition: 105% VDOT
    repetition: paceFromPctVdot(1.05),
  };
}

/**
 * VO2max estimado a partir do VDOT (são equivalentes para fins práticos).
 */
export function vo2maxFromVdot(vdot: number): number {
  return Math.round(vdot * 10) / 10;
}
