/**
 * Busca os melhores tempos do atleta por faixa de distância e calcula
 * o VDOT dinamicamente pela fórmula de Jack Daniels.
 *
 * Estratégia de janela temporal:
 * - Últimos 6 meses: peso total (100%) — forma atual
 * - 6–18 meses: peso 50% — ainda relevante, mas decrescente
 * - Acima de 18 meses: descartado
 *
 * Justificativa: durante ciclos de meia maratona, provas a fundo ficam
 * escassas por meses. Cortar em 12 meses perderia referências válidas
 * justamente quando mais precisamos delas.
 * A ponderação por tempo preserva os melhores resultados recentes
 * como âncora sem deixar performances antigas distorcer para cima.
 */

import { calculateVdot, vo2maxFromVdot, pacesFromVdot } from "./vdot";

type StravaActivity = {
  id: number;
  name: string;
  distance: number;
  moving_time: number;
  type: string;
  start_date: string;
  start_date_local?: string;
};

type AthletePersonalRecord = {
  timeSec: number;
  distanceM: number;
  activityId: number;
  activityName: string;
  ageMonths: number;
};

type AthletePersonalRecords = {
  km5:      AthletePersonalRecord | null;
  km10:     AthletePersonalRecord | null;
  half:     AthletePersonalRecord | null;
  marathon: AthletePersonalRecord | null;
};

// Faixas de distância aceitas para cada PR (em metros)
const PR_DISTANCE_RANGES: Record<
  keyof AthletePersonalRecords,
  { min: number; max: number; target: number }
> = {
  km5:      { min: 4800,  max: 5300,  target: 5000   },
  km10:     { min: 9700,  max: 10400, target: 10000  },
  half:     { min: 20500, max: 21800, target: 21097  },
  marathon: { min: 41500, max: 43000, target: 42195  },
};

// Pesos para a média ponderada do VDOT — provas mais longas = mais confiáveis para meia maratona
const DISTANCE_WEIGHTS: Record<keyof AthletePersonalRecords, number> = {
  km5: 1, km10: 2, half: 3, marathon: 4,
};

const WINDOW_FULL_MONTHS    = 6;
const WINDOW_PARTIAL_MONTHS = 18;
const PARTIAL_WEIGHT        = 0.5;

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

    all.push(...data.filter((a) => a.type === "Run"));
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

  for (const [key, range] of Object.entries(PR_DISTANCE_RANGES) as [keyof AthletePersonalRecords, typeof PR_DISTANCE_RANGES[keyof AthletePersonalRecords]][]) {
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

    const best = candidates.reduce((a, b) =>
      a.normalizedTime <= b.normalizedTime ? a : b
    );

    prs[key] = {
      timeSec:      best.normalizedTime,
      distanceM:    range.target,
      activityId:   best.run.id,
      activityName: best.run.name,
      ageMonths:    ageInMonths(best.run.start_date_local ?? best.run.start_date),
    };

    // VDOT ponderado: usa apenas o MELHOR tempo por distância
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

/**
 * Função principal: busca corridas dos últimos 18 meses, extrai PRs
 * com peso temporal e retorna o perfil dinâmico do atleta com VDOT calculado.
 */
export async function getDynamicAthleteProfile(accessToken: string) {
  try {
    const runs = await fetchRunsLast18Months(accessToken);

    const { prs, vdotInputs } = extractPRsFromRuns(runs);

    if (vdotInputs.length === 0) return null;

    const totalWeight = vdotInputs.reduce((s, x) => s + x.weight, 0);
    const vdot        = vdotInputs.reduce((s, x) => s + x.vdot * x.weight, 0) / totalWeight;
    const vo2max      = vo2maxFromVdot(vdot);
    const racePaces   = pacesFromVdot(vdot);

    const MARGIN = 5;

    return {
      vdot:    Math.round(vdot * 10) / 10,
      vo2max:  Math.round(vo2max * 10) / 10,
      prs,
      paces: {
        km5:      racePaces.km5,
        km10:     racePaces.km10,
        half:     { min: racePaces.half - MARGIN, max: racePaces.half + MARGIN },
        marathon: { min: racePaces.marathon - MARGIN, max: racePaces.marathon + MARGIN },
      },
    };
  } catch (err) {
    console.warn("getDynamicAthleteProfile error:", err);
    return null;
  }
}
