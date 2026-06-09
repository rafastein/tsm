/**
 * Busca os melhores tempos do atleta por faixa de distância e calcula
 * o VDOT dinamicamente pela fórmula de Jack Daniels.
 *
 * Estratégia de janela temporal:
 * - Últimos 6 meses: peso total (100%) — forma atual
 * - 6–18 meses: peso 50% — ainda relevante, mas decrescente
 * - Acima de 18 meses: descartado
 *
 * Justificativa: durante ciclos de maratona, provas a fundo ficam
 * escassas por meses. Cortar em 12 meses perderia referências válidas
 * (ex: Lisboa/Berlim) justamente quando mais precisamos delas.
 * A ponderação por tempo preserva os melhores resultados recentes
 * como âncora sem deixar performances antigas distorcer para cima.
 */

import { calculateVdot, aggregateVdot, pacesFromVdot, vo2maxFromVdot } from "./vdot";

export type BestEffort = {
  name: string;
  distanceM: number;
  timeSec: number;
  activityId: number;
  startDate: string;
  ageMonths: number;
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
    km5:      number | null;
    km10:     number | null;
    half:     { min: number; max: number } | null;
    marathon: { min: number; max: number } | null;
  };
};

const PR_DISTANCE_RANGES: Record<
  keyof AthletePersonalRecords,
  { min: number; max: number; target: number }
> = {
  km5:      { min: 4800,  max: 5300,  target: 5000  },
  km10:     { min: 9700,  max: 10400, target: 10000 },
  half:     { min: 20500, max: 21800, target: 21097 },
  marathon: { min: 41500, max: 43000, target: 42195 },
};

const DISTANCE_WEIGHTS: Record<keyof AthletePersonalRecords, number> = {
  km5: 1, km10: 2, half: 3, marathon: 4,
};

const WINDOW_FULL_MONTHS    = 6;
const WINDOW_PARTIAL_MONTHS = 18;
const PARTIAL_WEIGHT        = 0.5;

type StravaActivity = {
  id: number;
  name: string;
  type: string;
  sport_type?: string; // campo atual da API v3 (substitui `type`)
  distance: number;
  moving_time: number;
  start_date: string;
  start_date_local: string;
};

function temporalWeight(startDate: string): number {
  const ageMs     = Date.now() - new Date(startDate).getTime();
  const ageMonths = ageMs / (1000 * 60 * 60 * 24 * 30.44);
  if (ageMonths <= WINDOW_FULL_MONTHS)    return 1.0;
  if (ageMonths <= WINDOW_PARTIAL_MONTHS) return PARTIAL_WEIGHT;
  return 0;
}

function ageInMonths(startDate: string): number {
  const ageMs = Date.now() - new Date(startDate).getTime();
  return Math.round(ageMs / (1000 * 60 * 60 * 24 * 30.44));
}

async function fetchRunsLast18Months(accessToken: string): Promise<StravaActivity[]> {
  const after = Math.floor(Date.now() / 1000) - Math.ceil(WINDOW_PARTIAL_MONTHS * 30.44) * 24 * 3600;
  const all: StravaActivity[] = [];

  for (let page = 1; page <= 15; page++) {
    const url = new URL("https://www.strava.com/api/v3/athlete/activities");
    url.searchParams.set("per_page", "200");
    url.searchParams.set("page",     String(page));
    url.searchParams.set("after",    String(after));

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!res.ok) break;

    const data = (await res.json()) as StravaActivity[];
    if (!Array.isArray(data) || data.length === 0) break;

    all.push(...data.filter((a) => a.type === "Run" || a.sport_type === "Run"));
    if (data.length < 200) break;
  }

  return all;
}

function extractPRsFromRuns(runs: StravaActivity[]): {
  prs: AthletePersonalRecords;
  vdotInputs: { vdot: number; weight: number }[];
} {
  const prs: AthletePersonalRecords = { km5: null, km10: null, half: null, marathon: null };
  const vdotInputs: { vdot: number; weight: number }[] = [];

  for (const key of Object.keys(PR_DISTANCE_RANGES) as (keyof AthletePersonalRecords)[]) {
    const range = PR_DISTANCE_RANGES[key];

    const candidates = runs
      .filter((r) => r.distance >= range.min && r.distance <= range.max)
      .map((r) => {
        const paceSecPerM    = r.moving_time / r.distance;
        const normalizedTime = Math.round(paceSecPerM * range.target);
        const tw             = temporalWeight(r.start_date_local ?? r.start_date);
        return { run: r, normalizedTime, tw };
      })
      .filter((c) => c.tw > 0);

    if (!candidates.length) continue;

    // PR para exibição = melhor tempo absoluto na janela
    const best = candidates.reduce((a, b) =>
      a.normalizedTime <= b.normalizedTime ? a : b
    );

    prs[key] = {
      name:       best.run.name,
      distanceM:  range.target,
      timeSec:    best.normalizedTime,
      activityId: best.run.id,
      startDate:  best.run.start_date_local ?? best.run.start_date,
      ageMonths:  ageInMonths(best.run.start_date_local ?? best.run.start_date),
    };

    // VDOT ponderado: usa apenas o MELHOR tempo por distância (não todas as corridas)
    // Usar todas puxaria o VDOT para baixo por causa dos treinos leves
    const vdot = calculateVdot(range.target, best.normalizedTime);
    if (vdot !== null && vdot > 20) {
      vdotInputs.push({ vdot, weight: best.tw * DISTANCE_WEIGHTS[key] });
    }
  }

  return { prs, vdotInputs };
}

export function formatPrTime(timeSec: number): string {
  const h = Math.floor(timeSec / 3600);
  const m = Math.floor((timeSec % 3600) / 60);
  const s = Math.round(timeSec % 60);
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

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
    const runs = await fetchRunsLast18Months(accessToken);
    if (!runs.length) return empty;

    const { prs, vdotInputs } = extractPRsFromRuns(runs);

    const vdot = aggregateVdot(vdotInputs);
    if (vdot === null) return { ...empty, prs };

    const vo2max    = vo2maxFromVdot(vdot);
    const racePaces = pacesFromVdot(vdot);
    const MARGIN    = 5;

    return {
      prs,
      vdot,
      vo2max,
      paces: {
        km5:      racePaces.km5,
        km10:     racePaces.km10,
        half:     { min: racePaces.half     - MARGIN, max: racePaces.half     + MARGIN },
        marathon: { min: racePaces.marathon - MARGIN, max: racePaces.marathon + MARGIN },
      },
    };
  } catch (error) {
    console.warn("Erro ao buscar perfil dinâmico do atleta:", error);
    return empty;
  }
}