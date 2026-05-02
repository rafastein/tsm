export const dynamic = "force-dynamic";

import { formatBRDate, getBRDate, getActivityDate } from "../lib/date-utils";
import fs from "fs/promises";
import path from "path";
import Link from "next/link";
import WeeklyComparisonChart from "../components/WeeklyComparisonChart";
import { getValidStravaAccessToken } from "../lib/strava-auth";
import {
  getSisrunData,
  getCurrentWeek,
  getTodaySisrunRow,
  getTodayStravaKm,
  getCurrentWeekStravaKm,
  getCurrentWeekLongestRunKm,
  buildWeeklyComparison,
  getWeekStart,
  formatWeekLabel,
  type SisrunWeek,
} from "../lib/sisrun-utils";

// ─── Types ───────────────────────────────────────────────────────────────────

type StravaActivity = {
  id: number;
  name: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  total_elevation_gain: number;
  type: string;
  start_date_local: string;
  average_heartrate?: number;
  max_heartrate?: number;
};

type Athlete = {
  id: number;
  firstname: string;
  lastname: string;
  city: string | null;
  state: string | null;
  profile_medium: string | null;
  profile: string | null;
};

type HrZone = {
  name: string;
  min: number;
  max: number;
  color: string;
};

type VdotPaceRange = {
  minSecondsPerKm: number;
  maxSecondsPerKm: number;
};

type AthleteConfig = {
  hrMax: number;
  hrRest: number;
  lactateThreshold: number;
  vdot: number;
  vo2max: number;
  sex: "mulher" | "homem";
  age: number;
  heightM: number;
  weightKg: number;
  vo2maxSources: string[];
  hrZones: HrZone[];
  vdotPaces: {
    marathon: VdotPaceRange;
    halfMarathon: VdotPaceRange;
    10: VdotPaceRange;
    5: VdotPaceRange;
  };
};

// ─── Data fetchers ────────────────────────────────────────────────────────────

async function getActivities(): Promise<StravaActivity[]> {
  try {
    const accessToken = await getValidStravaAccessToken();
    if (!accessToken) return [];

    const res = await fetch(
      "https://www.strava.com/api/v3/athlete/activities?per_page=80",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      }
    );

    if (!res.ok) {
      console.warn("Falha Strava activities:", res.status);
      return [];
    }

    return res.json();
  } catch (error) {
    console.warn("Erro ao buscar atividades:", error);
    return [];
  }
}

async function getActivityDetail(
  id: number,
  accessToken: string
): Promise<StravaActivity | null> {
  try {
    const res = await fetch(
      `https://www.strava.com/api/v3/activities/${id}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      }
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

async function getAthlete(): Promise<Athlete | null> {
  try {
    const accessToken = await getValidStravaAccessToken();
    if (!accessToken) return null;

    const res = await fetch("https://www.strava.com/api/v3/athlete", {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });

    if (!res.ok) {
      console.warn("Falha Strava athlete:", res.status);
      return null;
    }

    return res.json();
  } catch (error) {
    console.warn("Erro ao buscar atleta:", error);
    return null;
  }
}

const DEFAULT_ATHLETE_CONFIG: AthleteConfig = {
  hrMax: 187,
  hrRest: 64,
  lactateThreshold: 167,
  vdot: 34,
  vo2max: 34,
  sex: "mulher",
  age: 37,
  heightM: 1.59,
  weightKg: 55,
  vo2maxSources: ["PRs reais de 3 km, 5 km, 10 km e meia", "VDOT recalibrado"],
  hrZones: [
    { name: "Recuperação", min: 0, max: 133, color: "bg-cyan-400" },
    { name: "Resistência Aeróbica", min: 134, max: 150, color: "bg-green-500" },
    { name: "Potência Aeróbica", min: 151, max: 159, color: "bg-yellow-400" },
    { name: "Limiar", min: 160, max: 170, color: "bg-amber-400" },
    { name: "Resistência Anaeróbica", min: 171, max: 177, color: "bg-[#e0007a]" },
    { name: "Potência Anaeróbica", min: 178, max: 187, color: "bg-red-500" },
  ],
  vdotPaces: {
    marathon: { minSecondsPerKm: 384, maxSecondsPerKm: 405 },
    halfMarathon: { minSecondsPerKm: 360, maxSecondsPerKm: 370 },
    10: { minSecondsPerKm: 342, maxSecondsPerKm: 350 },
    5: { minSecondsPerKm: 330, maxSecondsPerKm: 338 },
  },
};

function normalizeAthleteConfig(config: Partial<AthleteConfig> | null): AthleteConfig {
  return {
    ...DEFAULT_ATHLETE_CONFIG,
    ...(config ?? {}),
    hrMax: 187,
    hrRest: 64,
    lactateThreshold: 167,
    vdot: 34,
    vo2max: 34,
    sex: "mulher",
    age: 37,
    heightM: 1.59,
    weightKg: 55,
    vo2maxSources: ["PRs reais de 3 km, 5 km, 10 km e meia", "VDOT recalibrado"],
    vdotPaces: DEFAULT_ATHLETE_CONFIG.vdotPaces,
  };
}

async function getAthleteConfig(): Promise<AthleteConfig> {
  const filePath = path.join(process.cwd(), "data", "athlete-config.json");
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return normalizeAthleteConfig(JSON.parse(content));
  } catch {
    return DEFAULT_ATHLETE_CONFIG;
  }
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatDate(dateString: string) {
  return formatBRDate(dateString);
}

function formatFullDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return `${hours}h ${String(minutes).padStart(2, "0")}min ${String(secs).padStart(2, "0")}s`;
}

function formatDurationShort(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}:${String(minutes).padStart(2, "0")}`;
}

function formatSecondsPerKm(secondsPerKm: number) {
  const minutes = Math.floor(secondsPerKm / 60);
  const seconds = Math.round(secondsPerKm % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}/km`;
}

// ─── Business logic ───────────────────────────────────────────────────────────

const HALF_MARATHON_KM = 21.0975;
const HALF_TARGET_PACE_SECONDS_PER_KM = 340; // 5:40/km
const HALF_TARGET_WEEKLY_KM = 35;
const HALF_TARGET_LONG_RUN_KM = 18;
const RELEVANT_LONG_RUN_KM = 16;

// Dados de referência informados pelo atleta/relógio.
// A projeção abaixo não usa VDOT puro, porque ele costuma superestimar
// a meia quando as provas reais ainda não acompanham o potencial fisiológico.
const REFERENCE_THRESHOLD_PACE_SECONDS_PER_KM = 332; // 5:32/km
const REFERENCE_10K_PACE_SECONDS_PER_KM = 348; // 5:48/km
const REFERENCE_HALF_PACE_SECONDS_PER_KM = 390; // 6:30/km


function daysUntil(targetDate: Date) {
  const now = new Date();
  const diff = targetDate.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function halfTimeFromPace(secondsPerKm: number) {
  return Math.round(secondsPerKm * HALF_MARATHON_KM);
}

function getCyclePhase(today: Date, raceDate: Date) {
  const days = daysUntil(raceDate);

  if (days > 112)
    return {
      name: "Base",
      description: "Consolidar consistência, volume e resistência geral.",
      color: "bg-sky-100 text-sky-700",
    };
  if (days > 56)
    return {
      name: "Construção",
      description: "Aumentar volume e trazer mais especificidade para a meia maratona.",
      color: "bg-amber-100 text-amber-700",
    };
  if (days > 14)
    return {
      name: "Pico",
      description: "Bloco mais específico, com longões fortes e sessões-chave.",
      color: "bg-[#e0007a]/10 text-[#b00060]",
    };

  return {
    name: "Taper",
    description: "Redução de carga para chegar descansado e afiado.",
    color: "bg-emerald-100 text-emerald-700",
  };
}

function getIdealWeeklyVolume(daysToRace: number) {
  if (daysToRace > 112) return 24;
  if (daysToRace > 84) return 28;
  if (daysToRace > 56) return 32;
  if (daysToRace > 28) return 35;
  if (daysToRace > 14) return 30;
  return 22;
}

function getReadinessStatus(params: {
  currentWeekKm: number;
  idealWeekKm: number;
  longestRunKm: number;
  longRuns18Plus: number;
}) {
  const volumeRatio =
    params.idealWeekKm > 0 ? params.currentWeekKm / params.idealWeekKm : 0;

  if (
    volumeRatio >= 0.9 &&
    params.longestRunKm >= HALF_TARGET_LONG_RUN_KM &&
    params.longRuns18Plus >= 1
  ) {
    return {
      label: "Verde",
      title: "Prontidão forte",
      description:
        "O ciclo está bem alinhado para a meia: volume suficiente, longão específico e boa aderência ao bloco atual.",
      card: "bg-emerald-50 border-emerald-200",
      dot: "bg-emerald-500",
      text: "text-emerald-700",
    };
  }
  if (volumeRatio >= 0.75 && params.longestRunKm >= RELEVANT_LONG_RUN_KM) {
    return {
      label: "Amarelo",
      title: "Prontidão em construção",
      description:
        "A base está boa para meia, mas ainda falta consolidar o longão-alvo de 18 km ou aproximar o volume da referência da fase.",
      card: "bg-amber-50 border-amber-200",
      dot: "bg-amber-500",
      text: "text-amber-700",
    };
  }
  return {
    label: "Vermelho",
    title: "Prontidão baixa",
    description:
      "Ainda falta consistência específica de meia maratona: aproximar a semana da meta e construir longões entre 16 e 18 km.",
    card: "bg-red-50 border-red-200",
    dot: "bg-red-500",
    text: "text-red-700",
  };
}

function estimateHalfFromRun(activity: StravaActivity) {
  const distanceKm = activity.distance / 1000;
  if (distanceKm < 5) return null;

  const riegelExponent = 1.06;
  let estimatedSeconds = activity.moving_time * Math.pow(HALF_MARATHON_KM / distanceKm, riegelExponent);

  if (distanceKm < 8) estimatedSeconds += 240;
  else if (distanceKm < 12) estimatedSeconds += 150;
  else if (distanceKm < 16) estimatedSeconds += 90;
  else if (distanceKm < 18) estimatedSeconds += 45;

  if (distanceKm > 22.5) estimatedSeconds += 60;

  const elevationGain = activity.total_elevation_gain ?? 0;
  if (elevationGain > 0) {
    const elevationAdjustment = Math.min(elevationGain * 0.45, 90);
    estimatedSeconds -= elevationAdjustment;
  }

  return Math.round(estimatedSeconds);
}

function predictFromLongRun(longestRun: StravaActivity | null) {
  if (!longestRun) return null;
  const distanceKm = longestRun.distance / 1000;
  if (distanceKm < RELEVANT_LONG_RUN_KM) return null;
  return estimateHalfFromRun(longestRun);
}

function predictByTrainingModel(params: {
  runs: StravaActivity[];
  weeklyData: { label: string; distanceKm: number }[];
  targetWeeklyKm: number;
  targetLongRunKm: number;
}) {
  const scoredRuns = params.runs
    .map((run) => {
      const distanceKm = run.distance / 1000;
      const estimate = estimateHalfFromRun(run);
      if (!estimate) return null;

      let weight = 1;
      if (distanceKm >= 18 && distanceKm <= 22.5) weight = 5;
      else if (distanceKm >= 14) weight = 3.5;
      else if (distanceKm >= 10) weight = 2;
      else if (distanceKm >= 5) weight = 1.25;

      const activityDate = new Date(getActivityDate(run));
      const daysAgo = Math.max(0, (Date.now() - activityDate.getTime()) / (1000 * 60 * 60 * 24));
      const recencyMultiplier = daysAgo <= 45 ? 1.25 : daysAgo <= 90 ? 1 : 0.85;

      return { estimate, weight: weight * recencyMultiplier, distanceKm };
    })
    .filter((item): item is { estimate: number; weight: number; distanceKm: number } => Boolean(item))
    .sort((a, b) => a.estimate - b.estimate)
    .slice(0, 8);

  if (scoredRuns.length === 0) return null;

  const weightedTotal = scoredRuns.reduce((sum, item) => sum + item.estimate * item.weight, 0);
  const weightTotal = scoredRuns.reduce((sum, item) => sum + item.weight, 0);
  let prediction = Math.round(weightedTotal / weightTotal);

  const recentWeeklyAverage =
    params.weeklyData.length > 0
      ? params.weeklyData.reduce((sum, item) => sum + item.distanceKm, 0) / params.weeklyData.length
      : 0;

  const longestRunKm = params.runs.reduce((max, run) => Math.max(max, run.distance / 1000), 0);
  const weeklyRatio = params.targetWeeklyKm > 0 ? recentWeeklyAverage / params.targetWeeklyKm : 0;

  if (weeklyRatio >= 0.9) prediction -= 45;
  else if (weeklyRatio >= 0.75) prediction -= 20;
  else if (weeklyRatio < 0.5) prediction += 90;
  else if (weeklyRatio < 0.7) prediction += 45;

  if (longestRunKm >= params.targetLongRunKm) prediction -= 30;
  else prediction += Math.round((params.targetLongRunKm - longestRunKm) * 20);

  return Math.max(prediction, halfTimeFromPace(240));
}

function getRealisticHalfPaceRange(config: AthleteConfig | null) {
  const from10kMin = REFERENCE_10K_PACE_SECONDS_PER_KM + 12;
  const from10kMax = REFERENCE_10K_PACE_SECONDS_PER_KM + 27;

  const fromThresholdMin = REFERENCE_THRESHOLD_PACE_SECONDS_PER_KM + 25;
  const fromThresholdMax = REFERENCE_THRESHOLD_PACE_SECONDS_PER_KM + 45;

  const vdotMin = config?.vdotPaces.halfMarathon.minSecondsPerKm ?? from10kMin;
  const vdotMax = config?.vdotPaces.halfMarathon.maxSecondsPerKm ?? from10kMax;

  // O VDOT entra só como teto de potencial, com freio mínimo de +20s/km
  // sobre a projeção crua quando ela fica mais rápida que as provas reais sugerem.
  const vdotConservativeMin = Math.max(vdotMin + 20, fromThresholdMin);
  const vdotConservativeMax = Math.max(vdotMax + 20, from10kMax);

  const minSecondsPerKm = Math.round(
    from10kMin * 0.45 + fromThresholdMin * 0.35 + vdotConservativeMin * 0.2
  );
  const maxSecondsPerKm = Math.round(
    from10kMax * 0.5 + fromThresholdMax * 0.35 + vdotConservativeMax * 0.15
  );

  return {
    minSecondsPerKm,
    maxSecondsPerKm,
    minTime: halfTimeFromPace(minSecondsPerKm),
    maxTime: halfTimeFromPace(maxSecondsPerKm),
  };
}

function predictFromVdot(config: AthleteConfig | null): {
  min: number;
  max: number;
} | null {
  if (!config) return null;
  const { minSecondsPerKm, maxSecondsPerKm } = config.vdotPaces.halfMarathon;
  return {
    min: halfTimeFromPace(minSecondsPerKm),
    max: halfTimeFromPace(maxSecondsPerKm),
  };
}

function getHrZoneForBpm(bpm: number, zones: HrZone[]): HrZone | null {
  return zones.find((z) => bpm >= z.min && bpm <= z.max) ?? null;
}

function getHrPctMax(bpm: number, hrMax: number) {
  return Math.round((bpm / hrMax) * 100);
}

function buildBuenosAiresAlerts(params: {
  hasPlan: boolean;
  plannedWeekKm: number;
  currentWeekKm: number;
  adherencePct: number;
  plannedLongRunKm: number;
  currentWeekLongestRunKm: number;
  todayStatus: string;
  config: AthleteConfig | null;
}) {
  const alerts: { title: string; text: string; tone: string }[] = [];

  if (!params.hasPlan) {
    alerts.push({
      title: "Planejamento ausente",
      text: "Carregue uma planilha do SisRUN para comparar a semana atual.",
      tone: "bg-white/55 text-gray-700",
    });
    return alerts;
  }

  if (params.adherencePct < 70) {
    alerts.push({
      title: "Semana abaixo da meta",
      text: `Você executou ${params.currentWeekKm.toFixed(1)} km de ${params.plannedWeekKm.toFixed(1)} km planejados.`,
      tone: "bg-red-50 text-red-700",
    });
  } else if (params.adherencePct < 90) {
    alerts.push({
      title: "Semana em construção",
      text: `Boa evolução, mas ainda faltam ${Math.max(
        params.plannedWeekKm - params.currentWeekKm,
        0
      ).toFixed(1)} km para a meta da semana.`,
      tone: "bg-amber-50 text-amber-700",
    });
  } else {
    alerts.push({
      title: "Volume da semana bem encaminhado",
      text: "A execução está acompanhando bem o planejado do SisRUN.",
      tone: "bg-emerald-50 text-emerald-700",
    });
  }

  if (
    params.plannedLongRunKm > 0 &&
    params.currentWeekLongestRunKm < params.plannedLongRunKm
  ) {
    alerts.push({
      title: "Longão ainda não cumprido",
      text: `Previsto: ${params.plannedLongRunKm.toFixed(1)} km • maior treino da semana: ${params.currentWeekLongestRunKm.toFixed(1)} km.`,
      tone: "bg-amber-50 text-amber-700",
    });
  } else if (params.plannedLongRunKm > 0) {
    alerts.push({
      title: "Longão da semana cumprido",
      text: `Previsto: ${params.plannedLongRunKm.toFixed(1)} km • maior treino da semana: ${params.currentWeekLongestRunKm.toFixed(1)} km.`,
      tone: "bg-emerald-50 text-emerald-700",
    });
  }

  if (params.todayStatus === "Pendente") {
    alerts.push({
      title: "Treino de hoje pendente",
      text: "A sessão de hoje ainda não aparece como cumprida no Strava.",
      tone: "bg-amber-50 text-amber-700",
    });
  }

  if (params.config) {
    const realisticRange = getRealisticHalfPaceRange(params.config);
    alerts.push({
      title: "Pace estimado recalibrado",
      text: `Cruzando 10 km real, limiar e VDOT com freio conservador, a faixa mais coerente para meia fica em ${formatSecondsPerKm(realisticRange.minSecondsPerKm)}–${formatSecondsPerKm(realisticRange.maxSecondsPerKm)}. O alvo de 5:40/km segue agressivo-controlado, não conservador demais.`,
      tone: "bg-blue-50 text-blue-700",
    });
  }

  return alerts;
}

// ─── UI Components ────────────────────────────────────────────────────────────

function InfoCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-3xl app-card p-6">
      <p className="text-sm text-gray-500">{title}</p>
      <h3 className="mt-2 text-3xl font-bold text-gray-900">{value}</h3>
    </div>
  );
}

function ProjectionCard({
  title,
  value,
  caption,
  highlight = false,
  badge,
}: {
  title: string;
  value: string;
  caption: string;
  highlight?: boolean;
  badge?: string;
}) {
  return (
    <div
      className={`rounded-2xl p-4 ${
        highlight ? "bg-[#e0007a]/10 ring-1 ring-[#e0007a]/20" : "bg-white/55"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-gray-500">{title}</p>
        {badge && (
          <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
            {badge}
          </span>
        )}
      </div>
      <p className="mt-2 text-2xl font-bold text-gray-900">{value}</p>
      <p className="mt-1 text-sm text-gray-600">{caption}</p>
    </div>
  );
}

function HrZoneBadge({
  bpm,
  zones,
  hrMax,
}: {
  bpm: number;
  zones: HrZone[];
  hrMax: number;
}) {
  const zone = getHrZoneForBpm(bpm, zones);
  const pct = getHrPctMax(bpm, hrMax);
  return (
    <div className="flex flex-col items-end gap-1">
      <span
        className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
        style={{ backgroundColor: zone?.color ?? "#888" }}
      >
        {zone?.name ?? "—"}
      </span>
      <span className="text-xs text-gray-500">{pct}% FCmáx</span>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function BuenosAiresPage() {
  const accessToken = await getValidStravaAccessToken();

  const [athlete, activities, sisrunData, config] = await Promise.all([
    getAthlete(),
    getActivities(),
    getSisrunData(),
    getAthleteConfig(),
  ]);

  const sisrunWeek = getCurrentWeek(sisrunData) as SisrunWeek | null;
  const todaySisrunRow = getTodaySisrunRow(sisrunData);

  const halfMarathonGoal = {
    raceName: "Meia Maratona de Buenos Aires",
    date: new Date("2026-08-23T06:00:00"),
    targetPaceSecondsPerKm: HALF_TARGET_PACE_SECONDS_PER_KM,
    targetWeeklyKm: HALF_TARGET_WEEKLY_KM,
    targetLongRunKm: HALF_TARGET_LONG_RUN_KM,
  };

  const today = new Date();
  const daysToRace = daysUntil(halfMarathonGoal.date);
  const cyclePhase = getCyclePhase(today, halfMarathonGoal.date);

  const runs = activities.filter((a) => a.type === "Run");

  const longestRun =
    runs.length > 0
      ? runs.reduce((max, a) => (a.distance > max.distance ? a : max))
      : null;
  const longestRunKm = longestRun ? longestRun.distance / 1000 : 0;

  // Weekly volume map
  const weekMap = new Map<string, { label: string; distanceKm: number }>();
  runs.forEach((activity) => {
    const date = getBRDate(getActivityDate(activity));
    if (!date) return;
    const weekStart = getWeekStart(date);
    const key = weekStart.toISOString();
    const current = weekMap.get(key);
    if (current) {
      current.distanceKm += activity.distance / 1000;
    } else {
      weekMap.set(key, {
        label: formatWeekLabel(weekStart),
        distanceKm: activity.distance / 1000,
      });
    }
  });

  const weeklyData = Array.from(weekMap.entries())
    .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime())
    .slice(-10)
    .map(([, value]) => ({
      label: value.label,
      distanceKm: Number(value.distanceKm.toFixed(1)),
    }));

  const currentWeekKm = getCurrentWeekStravaKm(activities);
  const currentWeekLongestRunKm = getCurrentWeekLongestRunKm(activities);
  const todayStravaKm = getTodayStravaKm(activities);

  const plannedWeekKm = sisrunWeek?.totalPlannedKm ?? 0;
  const weeklyAdherencePct =
    plannedWeekKm > 0 ? (currentWeekKm / plannedWeekKm) * 100 : 0;

  const weeklyGoalKm = halfMarathonGoal.targetWeeklyKm;
  const weeklyProgress = Math.min((currentWeekKm / weeklyGoalKm) * 100, 100);

  const targetPaceLabel = formatSecondsPerKm(halfMarathonGoal.targetPaceSecondsPerKm);
  const targetPredictionSeconds = halfTimeFromPace(halfMarathonGoal.targetPaceSecondsPerKm);

  const longRuns = runs.filter((a) => a.distance >= RELEVANT_LONG_RUN_KM * 1000);
  const longRunsCount = longRuns.length;

  const idealWeekKm = getIdealWeeklyVolume(daysToRace);
  const weekVsIdealDifference = currentWeekKm - idealWeekKm;

  const readiness = getReadinessStatus({
    currentWeekKm,
    idealWeekKm,
    longestRunKm,
    longRuns18Plus: longRuns.filter((a) => a.distance >= HALF_TARGET_LONG_RUN_KM * 1000).length,
  });

  const predictedFromLongRun = predictFromLongRun(longestRun);
  const predictedBySite = predictByTrainingModel({
    runs,
    weeklyData,
    targetWeeklyKm: halfMarathonGoal.targetWeeklyKm,
    targetLongRunKm: halfMarathonGoal.targetLongRunKm,
  });
  const predictedFromVdotRange = predictFromVdot(config);
  const realisticHalfRange = getRealisticHalfPaceRange(config);

  // Recent long runs — buscar detalhes com FC se tiver accessToken
  const recentLongRunsBase = runs
    .filter((a) => a.distance >= RELEVANT_LONG_RUN_KM * 1000)
    .sort(
      (a, b) =>
        new Date(getActivityDate(b)).getTime() -
        new Date(getActivityDate(a)).getTime()
    )
    .slice(0, 5);

  // Enriquecer com dados detalhados (FC) quando possível
  const recentLongRuns = await Promise.all(
    recentLongRunsBase.map(async (run) => {
      // Se a atividade já tem FC (às vezes vem na listagem), usa direto
      if (run.average_heartrate) return run;
      // Caso contrário busca o detalhe
      if (accessToken) {
        const detail = await getActivityDetail(run.id, accessToken);
        if (detail?.average_heartrate) return { ...run, ...detail };
      }
      return run;
    })
  );

  const weeklyComparison = buildWeeklyComparison(sisrunData, activities, 8);

  const todayStatus = !todaySisrunRow
    ? "Sem treino previsto hoje"
    : todayStravaKm <= 0
    ? "Pendente"
    : todaySisrunRow.plannedDistanceKm > 0 &&
      todayStravaKm >= todaySisrunRow.plannedDistanceKm
    ? "Concluído"
    : "Parcial";

  const alerts = buildBuenosAiresAlerts({
    hasPlan: Boolean(sisrunWeek),
    plannedWeekKm,
    currentWeekKm,
    adherencePct: weeklyAdherencePct,
    plannedLongRunKm: sisrunWeek?.longRunPlannedKm ?? 0,
    currentWeekLongestRunKm,
    todayStatus,
    config,
  });

  // Zonas do atleta para usar nos componentes
  const hrZones = config?.hrZones ?? [];
  const hrMax = config?.hrMax ?? 184;

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#f7eef3] via-[#f3d7e4] to-[#f6b4d2] p-6 md:p-10">
      <div className="mx-auto max-w-7xl">

        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-[#e0007a]">Road to Buenos Aires</p>
            <h1 className="text-3xl font-bold text-gray-900 md:text-4xl">
              {athlete ? `${athlete.firstname} ${athlete.lastname}` : "Atleta"}
            </h1>
          </div>
          <Link
            href="/"
            className="rounded-full app-button px-5 py-3 text-sm font-medium"
          >
            Voltar ao dashboard
          </Link>
        </div>

        {/* Hero */}
        <section className="mb-8 rounded-[32px] bg-gradient-to-r from-[#d6bcc7] via-[#d86aa8] to-[#e0007a] p-6 text-white shadow-sm md:p-10">
          <div className="grid gap-6 lg:grid-cols-[1.2fr_.8fr]">
            <div>
              <p className="text-sm uppercase tracking-wide text-pink-50">Prova-alvo</p>
              <h2 className="mt-2 text-4xl font-bold md:text-5xl">{halfMarathonGoal.raceName}</h2>
              <p className="mt-4 max-w-2xl text-pink-50">
                Painel dedicado ao ciclo com foco em volume, longão, especificidade e prontidão para a meia maratona.
              </p>

              <div className="mt-8 grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl bg-white/15 p-5 backdrop-blur-sm">
                  <p className="text-sm text-pink-50">Dias para a prova</p>
                  <p className="mt-1 text-3xl font-bold">{daysToRace}</p>
                </div>
                <div className="rounded-2xl bg-white/15 p-5 backdrop-blur-sm">
                  <p className="text-sm text-pink-50">Pace-alvo</p>
                  <p className="mt-1 text-3xl font-bold">{targetPaceLabel}</p>
                </div>
                <div className="rounded-2xl bg-white/15 p-5 backdrop-blur-sm">
                  <p className="text-sm text-pink-50">Tempo projetado</p>
                  <p className="mt-1 text-3xl font-bold">
                    {formatFullDuration(targetPredictionSeconds)}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-3xl app-card p-6 text-gray-900">
              <div className="flex items-center gap-3">
                <span className={`h-3 w-3 rounded-full ${readiness.dot}`} />
                <div>
                  <p className={`font-semibold ${readiness.text}`}>{readiness.title}</p>
                  <p className="text-sm text-gray-500">{readiness.label}</p>
                </div>
              </div>
              <div className={`mt-4 rounded-2xl border p-4 ${readiness.card}`}>
                <p className={`font-medium ${readiness.text}`}>{readiness.description}</p>
              </div>
              <div className="mt-4 rounded-2xl app-card-soft p-4">
                <p className="text-sm text-gray-500">Fase do ciclo</p>
                <div className="mt-2">
                  <span className={`rounded-full px-3 py-1 text-sm font-semibold ${cyclePhase.color}`}>
                    {cyclePhase.name}
                  </span>
                </div>
                <p className="mt-3 text-sm text-gray-600">{cyclePhase.description}</p>
              </div>
            </div>
          </div>
        </section>

        {/* Info cards */}
        <section className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <InfoCard
            title="Semana planejada (SisRUN)"
            value={sisrunWeek ? `${plannedWeekKm.toFixed(1)} km` : "-"}
          />
          <InfoCard
            title="Semana feita (Strava)"
            value={`${currentWeekKm.toFixed(1)} km`}
          />
          <InfoCard
            title="Aderência real"
            value={sisrunWeek ? `${Math.min(weeklyAdherencePct, 100).toFixed(0)}%` : "-"}
          />
          <InfoCard
            title="Longão previsto x feito"
            value={
              sisrunWeek
                ? `${sisrunWeek.longRunPlannedKm.toFixed(1)} / ${currentWeekLongestRunKm.toFixed(1)} km`
                : `${currentWeekLongestRunKm.toFixed(1)} km`
            }
          />
        </section>

        {/* Treino de hoje + Meta semanal */}
        <section className="grid gap-4 mb-8 md:grid-cols-2">
          <div className="rounded-3xl app-card p-6">
            <h3 className="text-xl font-semibold text-gray-900">Treino de hoje</h3>
            {todaySisrunRow ? (
              <div className="mt-4 space-y-2">
                <p className="text-sm text-gray-600">
                  Planejado:{" "}
                  <span className="font-semibold">{todaySisrunRow.plannedDistanceKm.toFixed(1)} km</span>
                </p>
                <p className="text-sm text-gray-600">
                  Feito no Strava:{" "}
                  <span className="font-semibold">{todayStravaKm.toFixed(1)} km</span>
                </p>
                <p className="text-sm text-gray-600">
                  Janela de tempo:{" "}
                  <span className="font-semibold">
                    {todaySisrunRow.minPlannedTime ?? "-"} / {todaySisrunRow.maxPlannedTime ?? "-"}
                  </span>
                </p>
                <p className="inline-flex rounded-full bg-[#e0007a]/10 px-3 py-1 text-sm font-medium text-[#b00060]">
                  {todayStatus}
                </p>
              </div>
            ) : (
              <p className="mt-4 text-sm text-gray-500">Nenhum treino previsto para hoje.</p>
            )}
          </div>

          <div className="rounded-3xl app-card p-6">
            <h3 className="text-xl font-semibold text-gray-900">Meta semanal</h3>
            <p className="mt-1 text-sm text-gray-500">
              Planejado no SisRUN x executado no Strava.
            </p>
            <div className="mt-4 rounded-2xl app-card-soft p-5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Progresso real</span>
                <span className="font-medium text-gray-900">
                  {currentWeekKm.toFixed(1)} /{" "}
                  {sisrunWeek ? plannedWeekKm.toFixed(1) : weeklyGoalKm.toFixed(1)} km
                </span>
              </div>
              <div className="mt-3 h-4 w-full rounded-full bg-[#e0007a]/10">
                <div
                  className="h-4 rounded-full bg-gradient-to-r from-[#d86aa8] to-[#e0007a]"
                  style={{
                    width: `${
                      sisrunWeek
                        ? Math.min(weeklyAdherencePct, 100)
                        : weeklyProgress
                    }%`,
                  }}
                />
              </div>
              {sisrunWeek ? (
                <>
                  <p className="mt-3 text-sm text-gray-600">
                    Faltam {Math.max(plannedWeekKm - currentWeekKm, 0).toFixed(1)} km para cumprir o planejado da semana.
                  </p>
                  <p className="mt-2 text-sm text-gray-600">
                    Planejado: {plannedWeekKm.toFixed(1)} km • Executado:{" "}
                    {currentWeekKm.toFixed(1)} km
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-3 text-sm text-gray-600">
                    Faltam {Math.max(weeklyGoalKm - currentWeekKm, 0).toFixed(1)} km para cumprir a meta configurada.
                  </p>
                  <p className="mt-2 text-sm text-gray-600">
                    Você está {Math.abs(weekVsIdealDifference).toFixed(1)} km{" "}
                    {weekVsIdealDifference >= 0 ? "acima" : "abaixo"} da referência ideal da fase atual.
                  </p>
                </>
              )}
            </div>
          </div>
        </section>

        {/* Alertas */}
        <section className="grid gap-4 mb-8 md:grid-cols-2">
          {alerts.map((alert, index) => (
            <div key={index} className={`rounded-3xl p-5 shadow-sm ${alert.tone}`}>
              <p className="font-semibold">{alert.title}</p>
              <p className="mt-2 text-sm">{alert.text}</p>
            </div>
          ))}
        </section>

        {/* Gráfico semanal */}
        <section className="mb-8">
          <WeeklyComparisonChart
            items={weeklyComparison}
            title="Planejado x executado por semana"
            subtitle="Comparação entre o volume semanal do SisRUN e o que saiu no Strava."
          />
        </section>

        {/* ─── NOVO: VO2max + Zonas cardíacas ─────────────────────────────── */}
        {config && (
          <section className="mb-8 grid gap-4 lg:grid-cols-2">

            {/* Card VO2max */}
            <div className="rounded-3xl app-card p-6">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-xl font-semibold text-gray-900">VO2max estimado</h3>
                  <p className="mt-1 text-sm text-gray-500">
                    VDOT calculado por resultados de prova; classificação ajustada por sexo e idade.
                  </p>
                </div>
                <span className="rounded-full bg-[#e0007a]/10 px-3 py-1 text-xs font-medium text-[#b00060]">
                  VDOT {config.vdot}
                </span>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-2xl app-card-soft p-4">
                  <p className="text-sm text-blue-600">VO2max</p>
                  <p className="mt-1 text-3xl font-bold text-blue-700">{config.vo2max}</p>
                  <p className="text-xs text-blue-500">ml/kg/min</p>
                </div>
                <div className="rounded-2xl app-card-soft p-4">
                  <p className="text-sm text-gray-500">Limiar de lactato</p>
                  <p className="mt-1 text-3xl font-bold text-gray-900">{config.lactateThreshold}</p>
                  <p className="text-xs text-gray-400">bpm</p>
                </div>
                <div className="rounded-2xl app-card-soft p-4">
                  <p className="text-sm text-gray-500">FC máxima</p>
                  <p className="mt-1 text-3xl font-bold text-gray-900">{config.hrMax}</p>
                  <p className="text-xs text-gray-400">bpm · Coros</p>
                </div>
                <div className="rounded-2xl app-card-soft p-4">
                  <p className="text-sm text-gray-500">FC repouso</p>
                  <p className="mt-1 text-3xl font-bold text-gray-900">{config.hrRest}</p>
                  <p className="text-xs text-gray-400">bpm · Coros</p>
                </div>
              </div>

              <div className="mt-4 rounded-2xl bg-indigo-50 p-4">
                <p className="text-sm font-medium text-indigo-700">Perfil usado na classificação</p>
                <p className="mt-1 text-sm text-indigo-900">
                  Mulher · {config.age} anos · {config.heightM.toFixed(2).replace(".", ",")} m · {config.weightKg} kg
                </p>
                <p className="mt-1 text-xs text-indigo-600">
                  Sexo, idade, altura e peso não entram no cálculo do VDOT; eles apenas contextualizam a classificação do VO2max.
                </p>
              </div>

              {/* Barra de classificação */}
              <div className="mt-5 rounded-2xl app-card-soft p-4">
                <p className="mb-2 text-sm text-gray-500">Classificação de referência (mulher, 30–39 anos)</p>
                <div className="relative h-3 w-full overflow-hidden rounded-full">
                  <div
                    className="absolute inset-0 rounded-full"
                    style={{
                      background:
                        "linear-gradient(to right, #F09595, #FAC775, #97C459, #1D9E75, #0F6E56)",
                    }}
                  />
                  {/* Marcador na posição ~30% (VO2max 34 numa escala feminina 30–39) */}
                  <div
                    className="absolute top-0 h-full w-1 rounded-full bg-blue-600"
                    style={{ left: "32%" }}
                  />
                </div>
                <div className="mt-1 flex justify-between text-xs text-gray-400">
                  <span>Baixo ≤30</span>
                  <span>Razoável</span>
                  <span>Bom</span>
                  <span>Muito bom</span>
                  <span>Excelente 45+</span>
                </div>
                <p className="mt-2 text-sm font-medium text-emerald-700">
                  Razoável, com margem de evolução — VO2max {config.vo2max} ml/kg/min
                </p>
              </div>

              {/* FC alvo para Buenos Aires */}
              <div className="mt-4 rounded-2xl bg-[#e0007a]/10 p-4">
                <p className="text-sm font-medium text-[#b00060]">FC alvo em Buenos Aires</p>
                <p className="mt-1 text-2xl font-bold text-[#8a1452]">155–167 bpm</p>
                <p className="mt-1 text-sm text-[#e0007a]">
                  Zona de potência aeróbica → limiar. Próximo ao limiar de lactato.
                </p>
              </div>
            </div>

            {/* Card Zonas cardíacas */}
            <div className="rounded-3xl app-card p-6">
              <h3 className="text-xl font-semibold text-gray-900">Zonas cardíacas</h3>
              <p className="mt-1 text-sm text-gray-500">
                Baseadas no limiar de lactato. FCmáx: {config.hrMax} bpm.
              </p>

              <div className="mt-5 space-y-2">
                {hrZones.map((zone) => {
                  const isHalfMarathonZone = zone.name === "Tempo" || zone.name === "Limiar";
                  const isRaceZone = zone.name === "Limiar";
                  const rangeLabel =
                    zone.min === 0
                      ? `< ${zone.max + 1}`
                      : zone.max === 999
                      ? `> ${zone.min - 1}`
                      : `${zone.min}–${zone.max}`;

                  return (
                    <div
                      key={zone.name}
                      className={`flex items-center gap-3 rounded-2xl p-3 ${
                        isRaceZone
                          ? "bg-blue-50 ring-1 ring-blue-200"
                          : isHalfMarathonZone
                          ? "bg-[#e0007a]/10"
                          : "bg-white/55"
                      }`}
                    >
                      <div
                        className="h-3 w-3 shrink-0 rounded-full"
                        style={{ backgroundColor: zone.color }}
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p
                            className={`text-sm font-medium ${
                              isRaceZone ? "text-blue-800" : "text-gray-800"
                            }`}
                          >
                            {zone.name}
                          </p>
                          {isRaceZone && (
                            <span className="rounded-full bg-[#e0007a]/15 px-2 py-0.5 text-xs text-[#8a1452]">
                              Alvo Buenos Aires
                            </span>
                          )}
                        </div>
                      </div>
                      <p
                        className={`shrink-0 text-sm font-semibold ${
                          isRaceZone ? "text-blue-700" : "text-gray-700"
                        }`}
                      >
                        {rangeLabel} bpm
                      </p>
                    </div>
                  );
                })}
              </div>

            </div>
          </section>
        )}

        {/* Projeções + Longões recentes */}
        <section className="grid gap-4 mb-8 lg:grid-cols-[1.1fr_.9fr]">
          <div className="rounded-3xl app-card p-6">
            <h3 className="text-xl font-semibold text-gray-900">Projeções da meia maratona</h3>
            <p className="mt-1 text-sm text-gray-500">
              Comparação entre alvo, treinos feitos, dados reais de prova e VDOT recalibrado.
            </p>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <ProjectionCard
                title="Pelo pace-alvo"
                value={formatFullDuration(targetPredictionSeconds)}
                caption={targetPaceLabel}
              />


              <ProjectionCard
                title="Pelo longão mais forte"
                value={
                  predictedFromLongRun && longestRun
                    ? formatFullDuration(predictedFromLongRun)
                    : "Sem dado"
                }
                caption={
                  predictedFromLongRun && longestRun
                    ? `${longestRun.name} • ${(longestRun.distance / 1000).toFixed(1)} km`
                    : "Ainda falta um longão mais robusto."
                }
              />

              <ProjectionCard
                title="Projeção calculada pelo site"
                value={predictedBySite ? formatFullDuration(predictedBySite) : "Sem dado"}
                caption={
                  predictedBySite
                    ? "Modelo híbrido com treinos feitos, longão, altimetria e consistência semanal."
                    : "Dados insuficientes para projeção."
                }
                highlight
              />

              {/* Projeção recalibrada */}
              <div className="col-span-full rounded-2xl app-card-soft p-4 ring-1 ring-blue-200">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm text-blue-600">Projeção recalibrada</p>
                  {config?.vo2maxSources && (
                    <span className="rounded-full bg-blue-200 px-2 py-0.5 text-xs font-medium text-blue-800">
                      VDOT {config.vdot} · dados reais
                    </span>
                  )}
                </div>
                <p className="mt-2 text-2xl font-bold text-blue-900">
                  {formatDurationShort(realisticHalfRange.minTime)}–
                  {formatDurationShort(realisticHalfRange.maxTime)}
                </p>
                <p className="mt-1 text-sm text-blue-700">
                  Pace {formatSecondsPerKm(realisticHalfRange.minSecondsPerKm)}–
                  {formatSecondsPerKm(realisticHalfRange.maxSecondsPerKm)} · baseado em 10 km real,
                  limiar de 5:32/km e VDOT com ajuste conservador.
                </p>
                {predictedFromVdotRange && (
                  <p className="mt-2 text-xs text-blue-600">
                    VDOT bruto: {formatDurationShort(predictedFromVdotRange.min)}–
                    {formatDurationShort(predictedFromVdotRange.max)}. Usado apenas como teto de potencial,
                    não como previsão direta de prova.
                  </p>
                )}
              </div>
            </div>

          </div>

          {/* Longões recentes — agora com pace e FC */}
          <div className="rounded-3xl app-card p-6">
            <h3 className="text-xl font-semibold text-gray-900">Longões recentes</h3>
            <p className="mt-1 text-sm text-gray-500">
              Foco nos treinos mais relevantes para a meia maratona.
            </p>

            <div className="mt-5 space-y-3">
              {recentLongRuns.length > 0 ? (
                recentLongRuns.map((run) => {
                  const km = run.distance / 1000;
                  const paceSecPerKm = run.moving_time / km;
                  const paceLabel = formatSecondsPerKm(paceSecPerKm);
                  const hr = run.average_heartrate;

                  return (
                    <div
                      key={run.id}
                      className="rounded-2xl border border-pink-200/60 p-4"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-gray-900">{run.name}</p>
                          <p className="text-sm text-gray-500">
                            {km.toFixed(1)} km • {formatDate(run.start_date_local)}
                          </p>
                        </div>
                        {hr && hrZones.length > 0 && (
                          <HrZoneBadge bpm={Math.round(hr)} zones={hrZones} hrMax={hrMax} />
                        )}
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="rounded-full bg-[#e0007a]/10 px-3 py-1 text-xs font-medium text-gray-700">
                          {paceLabel}
                        </span>
                        {hr ? (
                          <span
                            className="rounded-full px-3 py-1 text-xs font-medium text-white"
                            style={{
                              backgroundColor:
                                getHrZoneForBpm(Math.round(hr), hrZones)?.color ?? "#888",
                            }}
                          >
                            {Math.round(hr)} bpm
                          </span>
                        ) : (
                          <span className="rounded-full bg-[#e0007a]/10 px-3 py-1 text-xs text-gray-400">
                            FC não disponível
                          </span>
                        )}
                        {run.total_elevation_gain > 0 && (
                          <span className="rounded-full bg-[#e0007a]/10 px-3 py-1 text-xs text-gray-600">
                            +{Math.round(run.total_elevation_gain)}m alt.
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-gray-500">Nenhum longão identificado ainda.</p>
              )}
            </div>
          </div>
        </section>

        {/* Resumo estratégico */}
        <section className="rounded-3xl app-card p-6">
          <h3 className="text-xl font-semibold text-gray-900">Resumo estratégico</h3>

          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-2xl app-card-soft p-5">
              <p className="text-sm text-gray-500">Leitura do momento</p>
              <p className="mt-2 text-sm leading-6 text-gray-700">
                O alvo configurado está em{" "}
                <span className="font-semibold">{targetPaceLabel}</span>, projetando{" "}
                <span className="font-semibold">{formatFullDuration(targetPredictionSeconds)}</span>. Hoje, o
                ciclo está em <span className="font-semibold">{cyclePhase.name}</span> e o semáforo
                está em{" "}
                <span className={`font-semibold ${readiness.text}`}>{readiness.label}</span>.
              </p>
            </div>

            <div className="rounded-2xl app-card-soft p-5">
              <p className="text-sm text-gray-500">Planejado x executado</p>
              <p className="mt-2 text-sm leading-6 text-gray-700">
                {sisrunWeek ? (
                  <>
                    O SisRUN prevê{" "}
                    <span className="font-semibold">{plannedWeekKm.toFixed(1)} km</span> nesta
                    semana, e o Strava mostra{" "}
                    <span className="font-semibold">{currentWeekKm.toFixed(1)} km</span> executados
                    até agora.
                  </>
                ) : (
                  <>Sem semana do SisRUN carregada. Usando apenas o executado no Strava.</>
                )}
              </p>
            </div>

            {/* NOVO: Bloco VO2max no resumo */}
            {config && (
              <div className="rounded-2xl bg-blue-50 p-5">
                <p className="text-sm text-blue-600">Potencial pelo VO2max</p>
                <p className="mt-2 text-sm leading-6 text-blue-800">
                  O VO2max estimado de{" "}
                  <span className="font-semibold">{config.vo2max} ml/kg/min</span> (VDOT{" "}
                  {config.vdot}, mulher, {config.age} anos) indica potencial recalibrado para{" "}
                  <span className="font-semibold">
                    {config
                      ? `${formatSecondsPerKm(config.vdotPaces.halfMarathon.minSecondsPerKm)}–${formatSecondsPerKm(config.vdotPaces.halfMarathon.maxSecondsPerKm)}`
                      : "—"}
                  </span>{" "}
                  na meia maratona. O pace-alvo atual está configurado em 5:40/km, portanto deve ser tratado como meta de evolução, não como pace conservador.
                </p>
              </div>
            )}
          </div>
        </section>

      </div>
    </main>
  );
}
