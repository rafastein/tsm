export const dynamic = "force-dynamic";

import { formatBRDate, getBRDate, getActivityDate } from "../lib/date-utils";

import path from "path";
import Link from "next/link";
import HalfMarathonProjection from "../components/HalfMarathonProjection";
import { getValidStravaAccessToken } from "../lib/strava-auth";
import { getDynamicAthleteProfile, formatPrTime } from "../lib/strava-prs";
import {
  getSisrunData,
  getCurrentWeek,
  getTodaySisrunRow,
  getTodayStravaKm,
  getCurrentWeekStravaKm,
  getCurrentWeekLongestRunKm,
  getWeekStart,
  formatWeekLabel,
  type SisrunWeek,
} from "../lib/sisrun-utils";

// ─── Types ────────────────────────────────────────────────────────────────────

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

    // Busca os últimos 6 meses paginando (200/página) para garantir que
    // os longões mais antigos sejam incluídos
    const after = Math.floor((Date.now() - 365 * 24 * 3600 * 1000) / 1000);
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

      if (!res.ok) { console.warn("Falha Strava activities:", res.status); break; }

      const data = (await res.json()) as StravaActivity[];
      if (!Array.isArray(data) || data.length === 0) break;

      all.push(...data);
      if (data.length < perPage) break;
    }

    return all;
  } catch (error) { console.warn("Erro ao buscar atividades:", error); return []; }
}

async function getActivityDetail(id: number, accessToken: string): Promise<StravaActivity | null> {
  try {
    const res = await fetch(`https://www.strava.com/api/v3/activities/${id}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}

async function getAthlete(): Promise<Athlete | null> {
  try {
    const accessToken = await getValidStravaAccessToken();
    if (!accessToken) return null;
    const res = await fetch("https://www.strava.com/api/v3/athlete", {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (!res.ok) { console.warn("Falha Strava athlete:", res.status); return null; }
    return res.json();
  } catch (error) { console.warn("Erro ao buscar atleta:", error); return null; }
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
    { name: "Recuperação",           min: 0,   max: 133, color: "bg-cyan-400"      },
    { name: "Resistência Aeróbica",  min: 134, max: 150, color: "bg-green-500"     },
    { name: "Potência Aeróbica",     min: 151, max: 159, color: "bg-yellow-400"    },
    { name: "Limiar",                min: 160, max: 170, color: "bg-amber-400"     },
    { name: "Resistência Anaeróbica",min: 171, max: 177, color: "bg-[#e0007a]"    },
    { name: "Potência Anaeróbica",   min: 178, max: 187, color: "bg-red-500"       },
  ],
  vdotPaces: {
    marathon:     { minSecondsPerKm: 384, maxSecondsPerKm: 405 },
    halfMarathon: { minSecondsPerKm: 360, maxSecondsPerKm: 370 },
    10:           { minSecondsPerKm: 342, maxSecondsPerKm: 350 },
    5:            { minSecondsPerKm: 330, maxSecondsPerKm: 338 },
  },
};

function normalizeAthleteConfig(config: Partial<AthleteConfig> | null): AthleteConfig {
  return {
    ...DEFAULT_ATHLETE_CONFIG,
    ...(config ?? {}),
    hrMax: 187, hrRest: 64, lactateThreshold: 167,
    vdot: 34, vo2max: 34, sex: "mulher", age: 37,
    heightM: 1.59, weightKg: 55,
    vo2maxSources: ["PRs reais de 3 km, 5 km, 10 km e meia", "VDOT recalibrado"],
    vdotPaces: DEFAULT_ATHLETE_CONFIG.vdotPaces,
  };
}

async function getAthleteConfig(): Promise<AthleteConfig> {
  const filePath = path.join(process.cwd(), "data", "athlete-config.json");
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return normalizeAthleteConfig(JSON.parse(content));
  } catch { return DEFAULT_ATHLETE_CONFIG; }
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function formatDate(dateString: string) { return formatBRDate(dateString); }

function formatFullDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h}h ${String(m).padStart(2, "0")}min ${String(s).padStart(2, "0")}s`;
}

function formatDurationShort(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}`;
}

function formatSecondsPerKm(secondsPerKm: number) {
  const m = Math.floor(secondsPerKm / 60);
  const s = Math.round(secondsPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")}/km`;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const HALF_MARATHON_KM = 21.0975;
const HALF_TARGET_PACE_SECONDS_PER_KM = 340;
const HALF_TARGET_WEEKLY_KM = 35;
const HALF_TARGET_LONG_RUN_KM = 18;
const RELEVANT_LONG_RUN_KM = 13; // longões = corridas acima de 13km
const PROJECTION_LONG_RUN_MIN_KM = 8;

const REFERENCE_THRESHOLD_PACE_SECONDS_PER_KM = 332;
const REFERENCE_10K_PACE_SECONDS_PER_KM = 348;

// ─── Business logic ───────────────────────────────────────────────────────────

function daysUntil(targetDate: Date) {
  return Math.ceil((targetDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
}

function halfTimeFromPace(secondsPerKm: number) {
  return Math.round(secondsPerKm * HALF_MARATHON_KM);
}

function getCyclePhase(today: Date, raceDate: Date) {
  const days = daysUntil(raceDate);
  if (days > 112) return { name: "Base",       description: "Consolidar consistência, volume e resistência geral.",                           color: "bg-sky-100 text-sky-700"          };
  if (days > 56)  return { name: "Construção", description: "Aumentar volume e trazer mais especificidade para a meia maratona.",             color: "bg-amber-100 text-amber-700"      };
  if (days > 14)  return { name: "Pico",       description: "Bloco mais específico, com longões fortes e sessões-chave.",                    color: "bg-[#e0007a]/10 text-[#b00060]"  };
  return               { name: "Taper",      description: "Redução de carga para chegar descansado e afiado.",                              color: "bg-emerald-100 text-emerald-700"  };
}

function getIdealWeeklyVolume(daysToRace: number) {
  if (daysToRace > 112) return 24;
  if (daysToRace > 84)  return 28;
  if (daysToRace > 56)  return 32;
  if (daysToRace > 28)  return 35;
  if (daysToRace > 14)  return 30;
  return 22;
}

function getReadinessStatus(params: { currentWeekKm: number; idealWeekKm: number; longestRunKm: number; longRuns18Plus: number }) {
  const ratio = params.idealWeekKm > 0 ? params.currentWeekKm / params.idealWeekKm : 0;
  if (ratio >= 0.9 && params.longestRunKm >= HALF_TARGET_LONG_RUN_KM && params.longRuns18Plus >= 1)
    return { label: "Verde",    title: "Prontidão forte",         description: "O ciclo está bem alinhado para a meia: volume suficiente, longão específico e boa aderência ao bloco atual.",                              card: "bg-emerald-50 border-emerald-200", dot: "bg-emerald-500", text: "text-emerald-700" };
  if (ratio >= 0.75 && params.longestRunKm >= RELEVANT_LONG_RUN_KM)
    return { label: "Amarelo",  title: "Prontidão em construção", description: "A base está boa para meia, mas ainda falta consolidar o longão-alvo de 18 km ou aproximar o volume da referência da fase.",              card: "bg-amber-50 border-amber-200",    dot: "bg-amber-500",   text: "text-amber-700"   };
  return   { label: "Vermelho", title: "Prontidão baixa",         description: "Ainda falta consistência específica de meia maratona: aproximar a semana da meta e construir longões entre 16 e 18 km.", card: "bg-red-50 border-red-200",        dot: "bg-red-500",     text: "text-red-700"     };
}

function estimateHalfFromRun(activity: StravaActivity) {
  const km = activity.distance / 1000;
  if (km < 5) return null;
  let est = activity.moving_time * Math.pow(HALF_MARATHON_KM / km, 1.06);
  if (km < 8)        est += 240;
  else if (km < 12)  est += 150;
  else if (km < 16)  est += 90;
  else if (km < 18)  est += 45;
  if (km > 22.5)     est += 60;
  const elev = activity.total_elevation_gain ?? 0;
  if (elev > 0) est -= Math.min(elev * 0.45, 90);
  return Math.round(est);
}

// Filtra longões: corridas acima de 13km
// e retorna o melhor tempo estimado para a meia maratona
function predictFromLongRun(runs: StravaActivity[]) {
  const longRuns = runs.filter((a) => {
    const km = a.distance / 1000;
    return km >= 13;
  });
  if (!longRuns.length) return null;
  // Pega o melhor (menor tempo estimado) dentre todos os longões
  const estimates = longRuns
    .map((r) => ({ run: r, est: estimateHalfFromRun(r) }))
    .filter((x): x is { run: StravaActivity; est: number } => x.est !== null);
  if (!estimates.length) return null;
  return estimates.reduce((a, b) => (a.est <= b.est ? a : b));
}

function predictByTrainingModel(params: { runs: StravaActivity[]; weeklyData: { label: string; distanceKm: number }[]; targetWeeklyKm: number; targetLongRunKm: number }) {
  const scored = params.runs
    .map((run) => {
      const km = run.distance / 1000;
      const est = estimateHalfFromRun(run);
      if (!est) return null;
      let w = km >= 18 && km <= 22.5 ? 5 : km >= 14 ? 3.5 : km >= 10 ? 2 : 1.25;
      const daysAgo = Math.max(0, (Date.now() - new Date(getActivityDate(run)).getTime()) / 86400000);
      w *= daysAgo <= 45 ? 1.25 : daysAgo <= 90 ? 1 : 0.85;
      return { est, w, km };
    })
    .filter((x): x is { est: number; w: number; km: number } => Boolean(x))
    .sort((a, b) => a.est - b.est)
    .slice(0, 8);

  if (!scored.length) return null;
  let pred = Math.round(scored.reduce((s, x) => s + x.est * x.w, 0) / scored.reduce((s, x) => s + x.w, 0));
  const avgWeekly = params.weeklyData.length ? params.weeklyData.reduce((s, x) => s + x.distanceKm, 0) / params.weeklyData.length : 0;
  const maxKm = params.runs.reduce((m, r) => Math.max(m, r.distance / 1000), 0);
  const ratio = params.targetWeeklyKm > 0 ? avgWeekly / params.targetWeeklyKm : 0;
  if (ratio >= 0.9) pred -= 45; else if (ratio >= 0.75) pred -= 20; else if (ratio < 0.5) pred += 90; else if (ratio < 0.7) pred += 45;
  if (maxKm >= params.targetLongRunKm) pred -= 30; else pred += Math.round((params.targetLongRunKm - maxKm) * 20);
  return Math.max(pred, halfTimeFromPace(240));
}

function getRealisticHalfPaceRange(config: AthleteConfig | null) {
  const from10kMin = REFERENCE_10K_PACE_SECONDS_PER_KM + 12;
  const from10kMax = REFERENCE_10K_PACE_SECONDS_PER_KM + 27;
  const fromThresholdMin = REFERENCE_THRESHOLD_PACE_SECONDS_PER_KM + 25;
  const fromThresholdMax = REFERENCE_THRESHOLD_PACE_SECONDS_PER_KM + 45;
  const vdotMin = Math.max((config?.vdotPaces.halfMarathon.minSecondsPerKm ?? from10kMin) + 20, fromThresholdMin);
  const vdotMax = Math.max((config?.vdotPaces.halfMarathon.maxSecondsPerKm ?? from10kMax) + 20, from10kMax);
  const minSec = Math.round(from10kMin * 0.45 + fromThresholdMin * 0.35 + vdotMin * 0.2);
  const maxSec = Math.round(from10kMax * 0.5  + fromThresholdMax * 0.35 + vdotMax * 0.15);
  return { minSecondsPerKm: minSec, maxSecondsPerKm: maxSec, minTime: halfTimeFromPace(minSec), maxTime: halfTimeFromPace(maxSec) };
}

function predictFromVdot(config: AthleteConfig | null) {
  if (!config) return null;
  return { min: halfTimeFromPace(config.vdotPaces.halfMarathon.minSecondsPerKm), max: halfTimeFromPace(config.vdotPaces.halfMarathon.maxSecondsPerKm) };
}

function getHrZoneForBpm(bpm: number, zones: HrZone[]): HrZone | null {
  return zones.find((z) => bpm >= z.min && bpm <= z.max) ?? null;
}
function getHrPctMax(bpm: number, hrMax: number) { return Math.round((bpm / hrMax) * 100); }

function buildBuenosAiresAlerts(params: { hasPlan: boolean; plannedWeekKm: number; currentWeekKm: number; adherencePct: number; plannedLongRunKm: number; currentWeekLongestRunKm: number; todayStatus: string; config: AthleteConfig | null }) {
  const alerts: { title: string; text: string; tone: string }[] = [];
  if (!params.hasPlan) { alerts.push({ title: "Planejamento ausente", text: "Carregue uma planilha do SisRUN para comparar a semana atual.", tone: "bg-white/55 text-gray-700" }); return alerts; }
  if (params.adherencePct < 70)       alerts.push({ title: "Semana abaixo da meta",              text: `Você executou ${params.currentWeekKm.toFixed(1)} km de ${params.plannedWeekKm.toFixed(1)} km planejados.`,                                                    tone: "bg-red-50 text-red-700"     });
  else if (params.adherencePct < 90)  alerts.push({ title: "Semana em construção",               text: `Boa evolução, mas ainda faltam ${Math.max(params.plannedWeekKm - params.currentWeekKm, 0).toFixed(1)} km para a meta da semana.`,                           tone: "bg-amber-50 text-amber-700" });
  else                                alerts.push({ title: "Volume da semana bem encaminhado",   text: "A execução está acompanhando bem o planejado do SisRUN.",                                                                                                     tone: "bg-emerald-50 text-emerald-700" });
  if (params.plannedLongRunKm > 0 && params.currentWeekLongestRunKm < params.plannedLongRunKm)
    alerts.push({ title: "Longão ainda não cumprido", text: `Previsto: ${params.plannedLongRunKm.toFixed(1)} km • maior treino da semana: ${params.currentWeekLongestRunKm.toFixed(1)} km.`, tone: "bg-amber-50 text-amber-700" });
  else if (params.plannedLongRunKm > 0)
    alerts.push({ title: "Longão da semana cumprido", text: `Previsto: ${params.plannedLongRunKm.toFixed(1)} km • maior treino da semana: ${params.currentWeekLongestRunKm.toFixed(1)} km.`, tone: "bg-emerald-50 text-emerald-700" });
  if (params.todayStatus === "Pendente")
    alerts.push({ title: "Treino de hoje pendente", text: "A sessão de hoje ainda não aparece como cumprida no Strava.", tone: "bg-amber-50 text-amber-700" });
  if (params.config) {
    const r = getRealisticHalfPaceRange(params.config);
    alerts.push({ title: "Pace estimado recalibrado", text: `Cruzando 10 km real, limiar e VDOT com freio conservador, a faixa mais coerente para meia fica em ${formatSecondsPerKm(r.minSecondsPerKm)}–${formatSecondsPerKm(r.maxSecondsPerKm)}. O alvo de 5:40/km segue agressivo-controlado, não conservador demais.`, tone: "bg-blue-50 text-blue-700" });
  }
  return alerts;
}

// ─── Helpers para a calculadora ───────────────────────────────────────────────

function calculateEfficiency(km: number, timeSec: number, hr: number | null | undefined, elev: number): number | null {
  if (!km || !timeSec || !hr) return null;
  const speed = km / (timeSec / 3600);
  const elevFactor = elev > 0 ? 1 + elev / (km * 100) : 1;
  return ((speed * elevFactor) / hr) * 1000;
}

function buildProjectionLongRuns(runs: StravaActivity[], enriched: StravaActivity[]) {
  const map = new Map(enriched.map((r) => [r.id, r]));
  return runs
    .filter((a) => {
      const km = a.distance / 1000;
      const n = a.name.toLowerCase();
      return km >= PROJECTION_LONG_RUN_MIN_KM && (n.includes("long") || n.includes("longão") || n.includes("longao") || km >= 10);
    })
    .sort((a, b) => new Date(getActivityDate(a)).getTime() - new Date(getActivityDate(b)).getTime())
    .map((run) => {
      const e = map.get(run.id) ?? run;
      const km = run.distance / 1000;
      const fc = e.average_heartrate ? Math.round(e.average_heartrate) : null;
      return {
        date: getActivityDate(run),
        km: Number(km.toFixed(2)),
        paceSeconds: Math.round(run.moving_time / km),
        efficiency: calculateEfficiency(km, run.moving_time, e.average_heartrate, run.total_elevation_gain ?? 0),
        fc,
      };
    });
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

function ProjectionCard({ title, value, caption, highlight = false, badge }: { title: string; value: string; caption: string; highlight?: boolean; badge?: string }) {
  return (
    <div className={`rounded-2xl p-4 ${highlight ? "bg-[#e0007a]/10 ring-1 ring-[#e0007a]/20" : "bg-white/55"}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-gray-500">{title}</p>
        {badge && <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">{badge}</span>}
      </div>
      <p className="mt-2 text-2xl font-bold text-gray-900">{value}</p>
      <p className="mt-1 text-sm text-gray-600">{caption}</p>
    </div>
  );
}

function HrZoneBadge({ bpm, zones, hrMax }: { bpm: number; zones: HrZone[]; hrMax: number }) {
  const zone = getHrZoneForBpm(bpm, zones);
  const pct  = getHrPctMax(bpm, hrMax);
  return (
    <div className="flex flex-col items-end gap-1">
      <span className="rounded-full px-2 py-0.5 text-xs font-medium text-white" style={{ backgroundColor: zone?.color ?? "#888" }}>{zone?.name ?? "—"}</span>
      <span className="text-xs text-gray-500">{pct}% FCmáx</span>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function BuenosAiresPage() {
  const accessToken = await getValidStravaAccessToken();
  const [athlete, activities, sisrunData, athleteProfile] = await Promise.all([
    getAthlete(), getActivities(), getSisrunData(),
    accessToken ? getDynamicAthleteProfile(accessToken) : Promise.resolve(null),
  ]);

  const sisrunWeek  = getCurrentWeek(sisrunData) as SisrunWeek | null;
  const todaySisrunRow = getTodaySisrunRow(sisrunData);

  const halfMarathonGoal = {
    raceName: "Meia Maratona de Buenos Aires",
    date: new Date("2026-08-23T06:00:00"),
    targetPaceSecondsPerKm: HALF_TARGET_PACE_SECONDS_PER_KM,
    targetWeeklyKm: HALF_TARGET_WEEKLY_KM,
    targetLongRunKm: HALF_TARGET_LONG_RUN_KM,
  };

  const today      = new Date();
  const daysToRace = daysUntil(halfMarathonGoal.date);
  const cyclePhase = getCyclePhase(today, halfMarathonGoal.date);
  const runs       = activities.filter((a) => a.type === "Run");

  // Longões = atividades com nome iniciado em "Longão" (já filtradas por 6 meses via getActivities)
  const namedLongRuns = runs.filter((a) => a.distance >= 13000);
  const longestRun   = namedLongRuns.length
    ? namedLongRuns.reduce((m, a) => (a.distance > m.distance ? a : m))
    : null;
  const longestRunKm = longestRun ? longestRun.distance / 1000 : 0;

  const weekMap = new Map<string, { label: string; distanceKm: number }>();
  runs.forEach((a) => {
    const date = getBRDate(getActivityDate(a));
    if (!date) return;
    const ws  = getWeekStart(date);
    const key = ws.toISOString();
    const cur = weekMap.get(key);
    if (cur) cur.distanceKm += a.distance / 1000;
    else weekMap.set(key, { label: formatWeekLabel(ws), distanceKm: a.distance / 1000 });
  });

  const weeklyData = Array.from(weekMap.entries())
    .sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime())
    .slice(-10)
    .map(([, v]) => ({ label: v.label, distanceKm: Number(v.distanceKm.toFixed(1)) }));

  const currentWeekKm            = getCurrentWeekStravaKm(activities);
  const currentWeekLongestRunKm  = getCurrentWeekLongestRunKm(activities);
  const todayStravaKm            = getTodayStravaKm(activities);
  const plannedWeekKm            = sisrunWeek?.totalPlannedKm ?? 0;
  const weeklyAdherencePct       = plannedWeekKm > 0 ? (currentWeekKm / plannedWeekKm) * 100 : 0;
  const weeklyGoalKm             = halfMarathonGoal.targetWeeklyKm;
  const weeklyProgress           = Math.min((currentWeekKm / weeklyGoalKm) * 100, 100);
  const targetPaceLabel          = formatSecondsPerKm(halfMarathonGoal.targetPaceSecondsPerKm);
  const targetPredictionSeconds  = halfTimeFromPace(halfMarathonGoal.targetPaceSecondsPerKm);
  const longRuns                 = namedLongRuns.filter((a) => a.distance >= RELEVANT_LONG_RUN_KM * 1000);
  const idealWeekKm              = getIdealWeeklyVolume(daysToRace);
  const weekVsIdealDifference    = currentWeekKm - idealWeekKm;

  const readiness            = getReadinessStatus({ currentWeekKm, idealWeekKm, longestRunKm, longRuns18Plus: longRuns.filter((a) => a.distance >= HALF_TARGET_LONG_RUN_KM * 1000).length });
  const longRunResult        = predictFromLongRun(runs);
  const predictedFromLongRun = longRunResult?.est ?? null;
  const bestLongRun          = longRunResult?.run ?? null;
  const predictedBySite      = predictByTrainingModel({ runs, weeklyData, targetWeeklyKm: halfMarathonGoal.targetWeeklyKm, targetLongRunKm: halfMarathonGoal.targetLongRunKm });
  // Derivados do athleteProfile — precisam estar antes de predictedFromVdotRange e realisticHalfRange
  const vdot         = athleteProfile?.vdot ?? null;
  const vo2max       = athleteProfile?.vo2max ?? null;
  const halfPaces    = athleteProfile?.paces.half ?? null;

  // VDOT dinâmico via athleteProfile — substitui predictFromVdot(config) e getRealisticHalfPaceRange(config)
  const predictedFromVdotRange = halfPaces
    ? { min: Math.round(halfPaces.min * 21.0975), max: Math.round(halfPaces.max * 21.0975) }
    : null;
  const realisticHalfRange = halfPaces
    ? { minSecondsPerKm: halfPaces.min, maxSecondsPerKm: halfPaces.max, minTime: Math.round(halfPaces.min * 21.0975), maxTime: Math.round(halfPaces.max * 21.0975) }
    : { minSecondsPerKm: 360, maxSecondsPerKm: 390, minTime: Math.round(360 * 21.0975), maxTime: Math.round(390 * 21.0975) };

  const recentLongRunsBase = runs
    .filter((a) => a.distance >= RELEVANT_LONG_RUN_KM * 1000)
    .sort((a, b) => new Date(getActivityDate(b)).getTime() - new Date(getActivityDate(a)).getTime())
    .slice(0, 5);

  const recentLongRuns = await Promise.all(
    recentLongRunsBase.map(async (run) => {
      if (run.average_heartrate) return run;
      if (accessToken) { const d = await getActivityDetail(run.id, accessToken); if (d?.average_heartrate) return { ...run, ...d }; }
      return run;
    })
  );

  // ── Dados para a calculadora de projeção ──────────────────────────────────
  const projRunsBase = runs
    .filter((a) => {
      const km = a.distance / 1000;
      const n  = a.name.toLowerCase();
      return km >= PROJECTION_LONG_RUN_MIN_KM && (n.includes("long") || n.includes("longão") || n.includes("longao") || km >= 10);
    })
    .sort((a, b) => new Date(getActivityDate(a)).getTime() - new Date(getActivityDate(b)).getTime());

  const projRunsEnriched = await Promise.all(
    projRunsBase.map(async (run) => {
      if (run.average_heartrate) return run;
      if (accessToken) { const d = await getActivityDetail(run.id, accessToken); if (d?.average_heartrate) return { ...run, ...d }; }
      return run;
    })
  );

  const projectionLongRuns = buildProjectionLongRuns(projRunsBase, projRunsEnriched);
  const weeksToRace = Math.max(1, Math.ceil(daysToRace / 7));
  // ──────────────────────────────────────────────────────────────────────────

  const todayStatus = !todaySisrunRow ? "Sem treino previsto hoje"
    : todayStravaKm <= 0 ? "Pendente"
    : todaySisrunRow.plannedDistanceKm > 0 && todayStravaKm >= todaySisrunRow.plannedDistanceKm ? "Concluído"
    : "Parcial";

  const alerts       = buildBuenosAiresAlerts({ hasPlan: Boolean(sisrunWeek), plannedWeekKm, currentWeekKm, adherencePct: weeklyAdherencePct, plannedLongRunKm: sisrunWeek?.longRunPlannedKm ?? 0, currentWeekLongestRunKm, todayStatus, config: null });
  const hrZones: HrZone[] = [];
  const hrMax   = 184;

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
          <Link href="/" className="rounded-full app-button px-5 py-3 text-sm font-medium">
            Voltar ao dashboard
          </Link>
        </div>

        {/* Hero */}
        <section className="mb-8 rounded-[32px] bg-gradient-to-r from-[#d6bcc7] via-[#d86aa8] to-[#e0007a] p-6 text-white shadow-sm md:p-10">
          <div className="grid gap-6 lg:grid-cols-[1.2fr_.8fr]">
            <div>
              <p className="text-sm uppercase tracking-wide text-pink-50">Prova-alvo</p>
              <h2 className="mt-2 text-4xl font-bold md:text-5xl">{halfMarathonGoal.raceName}</h2>
              <p className="mt-4 max-w-2xl text-pink-50">Painel dedicado ao ciclo com foco em volume, longão, especificidade e prontidão para a meia maratona.</p>
              <div className="mt-8 grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl bg-white/15 p-5 backdrop-blur-sm"><p className="text-sm text-pink-50">Dias para a prova</p><p className="mt-1 text-3xl font-bold">{daysToRace}</p></div>
                <div className="rounded-2xl bg-white/15 p-5 backdrop-blur-sm"><p className="text-sm text-pink-50">Pace-alvo</p><p className="mt-1 text-3xl font-bold">{targetPaceLabel}</p></div>
                <div className="rounded-2xl bg-white/15 p-5 backdrop-blur-sm"><p className="text-sm text-pink-50">Tempo projetado</p><p className="mt-1 text-3xl font-bold">{formatFullDuration(targetPredictionSeconds)}</p></div>
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
                <div className="mt-2"><span className={`rounded-full px-3 py-1 text-sm font-semibold ${cyclePhase.color}`}>{cyclePhase.name}</span></div>
                <p className="mt-3 text-sm text-gray-600">{cyclePhase.description}</p>
              </div>
            </div>
          </div>
        </section>

        {/* Info cards */}
        <section className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <InfoCard title="Semana planejada (SisRUN)" value={sisrunWeek ? `${plannedWeekKm.toFixed(1)} km` : "-"} />
          <InfoCard title="Semana feita (Strava)"     value={`${currentWeekKm.toFixed(1)} km`} />
          <InfoCard title="Aderência real"             value={sisrunWeek ? `${Math.min(weeklyAdherencePct, 100).toFixed(0)}%` : "-"} />
          <InfoCard title="Longão previsto x feito"    value={sisrunWeek ? `${sisrunWeek.longRunPlannedKm.toFixed(1)} / ${currentWeekLongestRunKm.toFixed(1)} km` : `${currentWeekLongestRunKm.toFixed(1)} km`} />
        </section>

        {/* Treino de hoje + Meta semanal */}
        <section className="grid gap-4 mb-8 md:grid-cols-2">
          <div className="rounded-3xl app-card p-6">
            <h3 className="text-xl font-semibold text-gray-900">Treino de hoje</h3>
            {todaySisrunRow ? (
              <div className="mt-4 space-y-2">
                <p className="text-sm text-gray-600">Planejado: <span className="font-semibold">{todaySisrunRow.plannedDistanceKm.toFixed(1)} km</span></p>
                <p className="text-sm text-gray-600">Feito no Strava: <span className="font-semibold">{todayStravaKm.toFixed(1)} km</span></p>
                <p className="text-sm text-gray-600">Janela de tempo: <span className="font-semibold">{todaySisrunRow.minPlannedTime ?? "-"} / {todaySisrunRow.maxPlannedTime ?? "-"}</span></p>
                <p className="inline-flex rounded-full bg-[#e0007a]/10 px-3 py-1 text-sm font-medium text-[#b00060]">{todayStatus}</p>
              </div>
            ) : (
              <p className="mt-4 text-sm text-gray-500">Nenhum treino previsto para hoje.</p>
            )}
          </div>
          <div className="rounded-3xl app-card p-6">
            <h3 className="text-xl font-semibold text-gray-900">Meta semanal</h3>
            <p className="mt-1 text-sm text-gray-500">Planejado no SisRUN x executado no Strava.</p>
            <div className="mt-4 rounded-2xl app-card-soft p-5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Progresso real</span>
                <span className="font-medium text-gray-900">{currentWeekKm.toFixed(1)} / {sisrunWeek ? plannedWeekKm.toFixed(1) : weeklyGoalKm.toFixed(1)} km</span>
              </div>
              <div className="mt-3 h-4 w-full rounded-full bg-[#e0007a]/10">
                <div className="h-4 rounded-full bg-gradient-to-r from-[#d86aa8] to-[#e0007a]" style={{ width: `${sisrunWeek ? Math.min(weeklyAdherencePct, 100) : weeklyProgress}%` }} />
              </div>
              {sisrunWeek ? (
                <>
                  <p className="mt-3 text-sm text-gray-600">Faltam {Math.max(plannedWeekKm - currentWeekKm, 0).toFixed(1)} km para cumprir o planejado da semana.</p>
                  <p className="mt-2 text-sm text-gray-600">Planejado: {plannedWeekKm.toFixed(1)} km • Executado: {currentWeekKm.toFixed(1)} km</p>
                </>
              ) : (
                <>
                  <p className="mt-3 text-sm text-gray-600">Faltam {Math.max(weeklyGoalKm - currentWeekKm, 0).toFixed(1)} km para cumprir a meta configurada.</p>
                  <p className="mt-2 text-sm text-gray-600">Você está {Math.abs(weekVsIdealDifference).toFixed(1)} km {weekVsIdealDifference >= 0 ? "acima" : "abaixo"} da referência ideal da fase atual.</p>
                </>
              )}
            </div>
          </div>
        </section>

        {/* Alertas */}
        <section className="grid gap-4 mb-8 md:grid-cols-2">
          {alerts.map((alert, i) => (
            <div key={i} className={`rounded-3xl p-5 shadow-sm ${alert.tone}`}>
              <p className="font-semibold">{alert.title}</p>
              <p className="mt-2 text-sm">{alert.text}</p>
            </div>
          ))}
        </section>

        {/* VO2max dinâmico — PRs do Strava */}
        {athleteProfile && vdot && (
          <section className="mb-8 grid gap-4 lg:grid-cols-2">
            <div className="rounded-3xl app-card p-6">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-xl font-semibold text-gray-900">VO2max estimado</h3>
                  <p className="mt-1 text-sm text-gray-500">Calculado automaticamente a partir dos PRs do Strava (best efforts).</p>
                </div>
                <span className="rounded-full bg-[#e0007a]/10 px-3 py-1 text-xs font-medium text-[#b00060]">VDOT {vdot.toFixed(1)}</span>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-2xl app-card-soft p-4"><p className="text-sm text-blue-600">VO2max</p><p className="mt-1 text-3xl font-bold text-blue-700">{vo2max?.toFixed(1)}</p><p className="text-xs text-blue-500">ml/kg/min</p></div>
                <div className="rounded-2xl app-card-soft p-4"><p className="text-sm text-[#b00060]">Pace meia (VDOT)</p><p className="mt-1 text-2xl font-bold text-[#8a1452]">{halfPaces ? `${formatSecondsPerKm(halfPaces.min)}–${formatSecondsPerKm(halfPaces.max)}` : "—"}</p><p className="text-xs text-[#e0007a]">pelo VDOT</p></div>
                {athleteProfile.paces.km10 && <div className="rounded-2xl app-card-soft p-4"><p className="text-sm text-gray-500">Pace 10km (VDOT)</p><p className="mt-1 text-2xl font-bold text-gray-900">{formatSecondsPerKm(athleteProfile.paces.km10)}</p><p className="text-xs text-gray-400">potencial estimado</p></div>}
                {athleteProfile.paces.km5 && <div className="rounded-2xl app-card-soft p-4"><p className="text-sm text-gray-500">Pace 5km (VDOT)</p><p className="mt-1 text-2xl font-bold text-gray-900">{formatSecondsPerKm(athleteProfile.paces.km5)}</p><p className="text-xs text-gray-400">potencial estimado</p></div>}
              </div>
              <div className="mt-4 rounded-2xl app-card-soft p-4">
                <p className="mb-3 text-sm font-medium text-gray-700">PRs usados no cálculo</p>
                <div className="space-y-2">
                  {(["km5", "km10", "half", "marathon"] as const).map((key) => {
                    const pr = athleteProfile.prs[key];
                    const labels = { km5: "5 km", km10: "10 km", half: "Meia maratona", marathon: "Maratona" };
                    return (
                      <div key={key} className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">{labels[key]}</span>
                        {pr ? <span className="text-sm font-semibold text-gray-900">{formatPrTime(pr.timeSec)}</span> : <span className="text-xs text-gray-400">Não encontrado</span>}
                      </div>
                    );
                  })}
                </div>
                <p className="mt-3 text-xs text-gray-400">Atualiza automaticamente a cada novo PR registrado no Strava.</p>
              </div>
              <div className="mt-4 rounded-2xl bg-[#e0007a]/10 p-4">
                <p className="text-sm font-medium text-[#b00060]">FC alvo em Buenos Aires</p>
                <p className="mt-1 text-2xl font-bold text-[#8a1452]">155–167 bpm</p>
                <p className="mt-1 text-sm text-[#e0007a]">Zona de potência aeróbica → limiar. Próximo ao limiar de lactato.</p>
              </div>
            </div>

            <div className="rounded-3xl app-card p-6">
              <h3 className="text-xl font-semibold text-gray-900">Paces de treino pelo VDOT</h3>
              <p className="mt-1 text-sm text-gray-500">Referências de Daniels derivadas do VDOT {vdot.toFixed(1)}.</p>
              <div className="mt-5 space-y-2">
                {[
                  { label: "Regenerativo / Fácil", pace: halfPaces ? `${formatSecondsPerKm(Math.round(halfPaces.max * 1.15))}–${formatSecondsPerKm(Math.round(halfPaces.max * 1.22))}` : "—", desc: "Z1–Z2", color: "bg-white/55" },
                  { label: "Pace de meia maratona", pace: halfPaces ? `${formatSecondsPerKm(halfPaces.min)}–${formatSecondsPerKm(halfPaces.max)}` : "—", desc: "Z3–Z4", color: "bg-[#e0007a]/10 ring-1 ring-[#e0007a]/20" },
                  { label: "Limiar (Threshold)",   pace: athleteProfile.paces.km10 ? formatSecondsPerKm(Math.round(athleteProfile.paces.km10 * 1.07)) : "—", desc: "Z4", color: "bg-white/55" },
                  { label: "Intervalado (VO2max)", pace: athleteProfile.paces.km5 ? formatSecondsPerKm(athleteProfile.paces.km5) : "—", desc: "Z5", color: "bg-white/55" },
                ].map((row) => (
                  <div key={row.label} className={`flex items-center justify-between rounded-2xl p-3 ${row.color}`}>
                    <div>
                      <p className="text-sm font-medium text-gray-800">{row.label}</p>
                      <p className="text-xs text-gray-400">{row.desc}</p>
                    </div>
                    <p className="text-sm font-bold text-gray-900">{row.pace}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Projeções + Longões recentes */}
        <section className="grid gap-4 mb-8 lg:grid-cols-[1.1fr_.9fr]">
          <div className="rounded-3xl app-card p-6">
            <h3 className="text-xl font-semibold text-gray-900">Projeções da meia maratona</h3>
            <p className="mt-1 text-sm text-gray-500">Comparação entre alvo, treinos feitos, dados reais de prova e VDOT recalibrado.</p>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <ProjectionCard title="Pelo pace-alvo"              value={formatFullDuration(targetPredictionSeconds)} caption={targetPaceLabel} />
              <ProjectionCard title="Pelo melhor longão (6 meses)" value={predictedFromLongRun && bestLongRun ? formatFullDuration(predictedFromLongRun) : "Sem dado"} caption={predictedFromLongRun && bestLongRun ? `${bestLongRun.name} • ${(bestLongRun.distance / 1000).toFixed(1)} km` : "Nenhum longão nomeado encontrado nos últimos 6 meses."} />
              <ProjectionCard title="Projeção calculada pelo site" value={predictedBySite ? formatFullDuration(predictedBySite) : "Sem dado"} caption={predictedBySite ? "Modelo híbrido com treinos feitos, longão, altimetria e consistência semanal." : "Dados insuficientes para projeção."} highlight />
              <div className="col-span-full rounded-2xl app-card-soft p-4 ring-1 ring-blue-200">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm text-blue-600">Projeção recalibrada</p>
                  {vdot && <span className="rounded-full bg-blue-200 px-2 py-0.5 text-xs font-medium text-blue-800">VDOT {vdot.toFixed(1)} · PRs Strava</span>}
                </div>
                <p className="mt-2 text-2xl font-bold text-blue-900">{formatDurationShort(realisticHalfRange.minTime)}–{formatDurationShort(realisticHalfRange.maxTime)}</p>
                <p className="mt-1 text-sm text-blue-700">Pace {formatSecondsPerKm(realisticHalfRange.minSecondsPerKm)}–{formatSecondsPerKm(realisticHalfRange.maxSecondsPerKm)} · baseado em 10 km real, limiar de 5:32/km e VDOT com ajuste conservador.</p>
                {predictedFromVdotRange && <p className="mt-2 text-xs text-blue-600">VDOT bruto: {formatDurationShort(predictedFromVdotRange.min)}–{formatDurationShort(predictedFromVdotRange.max)}. Usado apenas como teto de potencial, não como previsão direta de prova.</p>}
              </div>
            </div>
          </div>

          <div className="rounded-3xl app-card p-6">
            <h3 className="text-xl font-semibold text-gray-900">Longões recentes</h3>
            <p className="mt-1 text-sm text-gray-500">Foco nos treinos mais relevantes para a meia maratona.</p>
            <div className="mt-5 space-y-3">
              {recentLongRuns.length > 0 ? recentLongRuns.map((run) => {
                const km  = run.distance / 1000;
                const hr  = run.average_heartrate;
                return (
                  <div key={run.id} className="rounded-2xl border border-pink-200/60 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-gray-900">{run.name}</p>
                        <p className="text-sm text-gray-500">{km.toFixed(1)} km • {formatDate(run.start_date_local)}</p>
                      </div>
                      {hr && hrZones.length > 0 && <HrZoneBadge bpm={Math.round(hr)} zones={hrZones} hrMax={hrMax} />}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="rounded-full bg-[#e0007a]/10 px-3 py-1 text-xs font-medium text-gray-700">{formatSecondsPerKm(run.moving_time / km)}</span>
                      {hr ? (
                        <span className="rounded-full px-3 py-1 text-xs font-medium text-white" style={{ backgroundColor: getHrZoneForBpm(Math.round(hr), hrZones)?.color ?? "#888" }}>{Math.round(hr)} bpm</span>
                      ) : (
                        <span className="rounded-full bg-[#e0007a]/10 px-3 py-1 text-xs text-gray-400">FC não disponível</span>
                      )}
                      {run.total_elevation_gain > 0 && <span className="rounded-full bg-[#e0007a]/10 px-3 py-1 text-xs text-gray-600">+{Math.round(run.total_elevation_gain)}m alt.</span>}
                    </div>
                  </div>
                );
              }) : <p className="text-gray-500">Nenhum longão identificado ainda.</p>}
            </div>
          </div>
        </section>

        {/* ─── CALCULADORA DE PROJEÇÃO ─────────────────────────────────────── */}
        {projectionLongRuns.length >= 3 && (
          <section className="mb-8">
            <HalfMarathonProjection longRuns={projectionLongRuns} weeksToRace={weeksToRace} />
          </section>
        )}

        {/* Resumo estratégico */}
        <section className="rounded-3xl app-card p-6">
          <h3 className="text-xl font-semibold text-gray-900">Resumo estratégico</h3>
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-2xl app-card-soft p-5">
              <p className="text-sm text-gray-500">Leitura do momento</p>
              <p className="mt-2 text-sm leading-6 text-gray-700">O alvo configurado está em <span className="font-semibold">{targetPaceLabel}</span>, projetando <span className="font-semibold">{formatFullDuration(targetPredictionSeconds)}</span>. Hoje, o ciclo está em <span className="font-semibold">{cyclePhase.name}</span> e o semáforo está em <span className={`font-semibold ${readiness.text}`}>{readiness.label}</span>.</p>
            </div>
            <div className="rounded-2xl app-card-soft p-5">
              <p className="text-sm text-gray-500">Planejado x executado</p>
              <p className="mt-2 text-sm leading-6 text-gray-700">
                {sisrunWeek ? <>O SisRUN prevê <span className="font-semibold">{plannedWeekKm.toFixed(1)} km</span> nesta semana, e o Strava mostra <span className="font-semibold">{currentWeekKm.toFixed(1)} km</span> executados até agora.</> : <>Sem semana do SisRUN carregada. Usando apenas o executado no Strava.</>}
              </p>
            </div>
            {vdot && halfPaces && (
              <div className="rounded-2xl bg-blue-50 p-5">
                <p className="text-sm text-blue-600">Potencial pelo VO2max</p>
                <p className="mt-2 text-sm leading-6 text-blue-800">VO2max estimado de <span className="font-semibold">{vo2max?.toFixed(1)} ml/kg/min</span> (VDOT {vdot.toFixed(1)}) calculado automaticamente dos PRs do Strava. Indica potencial para <span className="font-semibold">{formatSecondsPerKm(halfPaces.min)}–{formatSecondsPerKm(halfPaces.max)}</span> na meia maratona. Atualiza sozinho a cada novo PR.</p>
              </div>
            )}
          </div>
        </section>

      </div>
    </main>
  );
}