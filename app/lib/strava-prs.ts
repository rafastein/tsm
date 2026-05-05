/**
 * Busca os melhores tempos do atleta nos últimos 12 meses por faixa de distância,
 * e calcula o VDOT dinamicamente pela fórmula de Jack Daniels.
 *
 * Estratégia: em vez de depender dos best_efforts das últimas atividades
 * (que só refletem corridas recentes), buscamos TODAS as corridas dos últimos
 * 12 meses, filtramos por faixa de distância de cada prova-alvo e pegamos
 * o menor tempo — que é o PR real dentro do período.
 */

import { calculateVdot, aggregateVdot, pacesFromVdot, vo2maxFromVdot } from "./vdot";

export type BestEffort = {
  name: string;
  distanceM: number;
  timeSec: number;
  activityId: number;
  startDate: string;
};

export type AthletePersonalRecords = {
  km5:      BestEffort | null;
  km10:     BestEffort | null;
  half:     BestEffort | null;
  marathon: BestEffort | null;
};

export type DynamicAthleteProfile = {
  prs: AthletePersonalRecords;
  vdot: number | null;
  vo2max: number | null;
  paces: {
    km5:      number | null; // s/km
    km10:     number | null;
    half:     { min: number; max: number } | null;
    marathon: { min: number; max: number } | null;
  };
};

// Faixas de distância aceitas para cada PR (em metros)
// Margem generosa para capturar corridas de rua com GPS impreciso
const PR_DISTANCE_RANGES: Record<keyof AthletePersonalRecords, { min: number; max: number; target: number }> = {
  km5:      { min: 4800,  max: 5300,  target: 5000  },
  km10:     { min: 9700,  max: 10400, target: 10000 },
  half:     { min: 20500, max: 21800, target: 21097 },
  marathon: { min: 41500, max: 43000, target: 42195 },
};

// Pesos para a média ponderada do VDOT — provas mais longas = mais confiáveis para maratona
const EFFORT_WEIGHTS: Record<keyof AthletePersonalRecords, number> = {
  km5:      1,
  km10:     2,
  half:     3,
  marathon: 4,
};

type StravaActivity = {
  id: number;
  name: string;
  type: string;
  distance: number;
  moving_time: number;
  start_date: string;
  start_date_local: string;
};

/**
 * Busca todas as corridas dos últimos 12 meses.
 * Pagina até encontrar todas, respeitando o limite de 200/página do Strava.
 */
async function fetchRunsLast12Months(accessToken: string): Promise<StravaActivity[]> {
  const after = Math.floor(Date.now() / 1000) - 365 * 24 * 3600;
  const all: StravaActivity[] = [];
  const perPage = 200;

  for (let page = 1; page <= 10; page++) {
    const url = new URL("https://www.strava.com/api/v3/athlete/activities");
    url.searchParams.set("per_page", String(perPage));
    url.searchParams.set("page", String(page));
    url.searchParams.set("after", String(after));

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });

    if (!res.ok) break;

    const data = (await res.json()) as StravaActivity[];
    if (!Array.isArray(data) || data.length === 0) break;

    const runs = data.filter((a) => a.type === "Run");
    all.push(...runs);

    if (data.length < perPage) break;
  }

  return all;
}

/**
 * A partir de uma lista de corridas, extrai o melhor tempo por distância-alvo.
 * Ajusta o tempo proporcionalmente quando a distância não é exatamente a alvo
 * (ex: uma corrida de 10.2km ajusta o tempo para equivalente de 10km exatos).
 */
function extractPRsFromRuns(runs: StravaActivity[]): AthletePersonalRecords {
  const prs: AthletePersonalRecords = { km5: null, km10: null, half: null, marathon: null };

  for (const key of Object.keys(PR_DISTANCE_RANGES) as (keyof AthletePersonalRecords)[]) {
    const range = PR_DISTANCE_RANGES[key];

    const matching = runs.filter(
      (r) => r.distance >= range.min && r.distance <= range.max
    );

    if (!matching.length) continue;

    // Normaliza o pace e recalcula o tempo para a distância-alvo exata
    const candidates = matching.map((r) => {
      const paceSecPerM = r.moving_time / r.distance;
      const normalizedTime = Math.round(paceSecPerM * range.target);
      return { run: r, normalizedTime };
    });

    // Pega o menor tempo normalizado (= PR na distância-alvo)
    const best = candidates.reduce((a, b) =>
      a.normalizedTime <= b.normalizedTime ? a : b
    );

    prs[key] = {
      name:       best.run.name,
      distanceM:  range.target,
      timeSec:    best.normalizedTime,
      activityId: best.run.id,
      startDate:  best.run.start_date_local ?? best.run.start_date,
    };
  }

  return prs;
}

/**
 * Formata um tempo em segundos para string legível (ex: "1:47:32" ou "45:31").
 */
export function formatPrTime(timeSec: number): string {
  const h = Math.floor(timeSec / 3600);
  const m = Math.floor((timeSec % 3600) / 60);
  const s = Math.round(timeSec % 60);

  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Função principal: busca corridas dos últimos 12 meses, extrai PRs por distância
 * e retorna o perfil dinâmico do atleta com VDOT calculado.
 */
export async function getDynamicAthleteProfile(
  accessToken: string
): Promise<DynamicAthleteProfile> {
  const empty: DynamicAthleteProfile = {
    prs:    { km5: null, km10: null, half: null, marathon: null },
    vdot:   null,
    vo2max: null,
    paces:  { km5: null, km10: null, half: null, marathon: null },
  };

  try {
    const runs = await fetchRunsLast12Months(accessToken);
    if (!runs.length) return empty;

    const prs = extractPRsFromRuns(runs);

    // Calcula VDOT de cada PR disponível
    const vdotInputs: { vdot: number; weight: number }[] = [];

    for (const key of Object.keys(prs) as (keyof AthletePersonalRecords)[]) {
      const pr = prs[key];
      if (!pr) continue;

      const vdot = calculateVdot(pr.distanceM, pr.timeSec);
      if (vdot !== null) {
        vdotInputs.push({ vdot, weight: EFFORT_WEIGHTS[key] });
      }
    }

    const vdot = aggregateVdot(vdotInputs);
    if (vdot === null) return { ...empty, prs };

    const vo2max = vo2maxFromVdot(vdot);
    const racePaces = pacesFromVdot(vdot);

    // Margem de ±5s/km para variação de condições (clima, percurso, dia)
    const MARGIN = 5;

    return {
      prs,
      vdot,
      vo2max,
      paces: {
        km5:      racePaces.km5,
        km10:     racePaces.km10,
        half:     { min: racePaces.half - MARGIN, max: racePaces.half + MARGIN },
        marathon: { min: racePaces.marathon - MARGIN, max: racePaces.marathon + MARGIN },
      },
    };
  } catch (error) {
    console.warn("Erro ao buscar perfil dinâmico do atleta:", error);
    return empty;
  }
}