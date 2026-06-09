export const dynamic = "force-dynamic";

import { formatBRDate, getBRDate, getActivityDate } from "../lib/date-utils";

import Link from "next/link";
import HalfMarathonProjection from "../components/HalfMarathonProjection";
import { getValidStravaAccessToken } from "../lib/strava-auth";
import { getDynamicAthleteProfile, formatPrTime } from "../lib/strava-prs";
import { trainingPacesFromVdot } from "../lib/vdot";
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

// AthleteConfig removido — VDOT e paces vêm do athleteProfile dinâmico via getDynamicAthleteProfile

// ─── Data fetchers ────────────────────────────────────────────────────────────

async function getActivities(): Promise<StravaActivity[]> {
  try {
    const accessToken = await getValidStravaAccessToken();
    if (!accessToken) return [];

    // Busca os últimos 6 meses paginando (200/página) para garantir que
    // os longões mais antigos sejam incluídos
    const after = Math.floor((Date.now() - 180 * 24 * 3600 * 1000) / 1000);
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
const PROJECTION_LONG_RUN_MIN_KM = 13; // mínimo para entrar na calculadora (igual ao RELEVANT_LONG_RUN_KM)

// Paces de referência vêm do athleteProfile dinâmico — sem hardcode

// ─── Business logic ───────────────────────────────────────────────────────────

function daysUntil(targetDate: Date) {
  return Math.ceil((targetDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
}

function halfTimeFromPace(secondsPerKm: number) {
  return Math.round(secondsPerKm * HALF_MARATHON_KM);
}

function getCyclePhase(today: Date, raceDate: Date) {
  const days = daysUntil(raceDate);
  // Fases calibradas para ciclo de meia maratona (~16 semanas)
  if (days > 77) return { name: "Base",        description: "Consolidar consistência, volume e resistência geral. Foco em rodagem e corridas longas progressivas.",  color: "bg-sky-100 text-sky-700"         };
  if (days > 35) return { name: "Construção",  description: "Aumentar volume e especificidade para a meia. Longões acima de 16 km e treinos de limiar.",               color: "bg-amber-100 text-amber-700"     };
  if (days > 14) return { name: "Pico",        description: "Bloco específico com longões de 18–21 km e sessões de pace de prova. Semana mais dura do ciclo.",         color: "bg-[#e0007a]/10 text-[#b00060]"  };
  return                { name: "Taper",       description: "Redução de carga para chegar descansada e afiada em Buenos Aires.",                                       color: "bg-emerald-100 text-emerald-700" };
}

function getIdealWeeklyVolume(daysToRace: number) {
  // Volume semanal de referência para um ciclo de meia maratona
  if (daysToRace > 77) return 30;   // Base: construção progressiva
  if (daysToRace > 56) return 38;   // Construção: pico de volume
  if (daysToRace > 35) return 42;   // Construção avançada: semanas mais duras
  if (daysToRace > 14) return 38;   // Pico: manter volume com qualidade
  return 25;                         // Taper: redução progressiva
}

function getReadinessStatus(params: { currentWeekKm: number; idealWeekKm: number; longestRunKm: number; longRuns18Plus: number }) {
  const ratio = params.idealWeekKm > 0 ? params.currentWeekKm / params.idealWeekKm : 0;
  // Verde: volume na fase + longão ≥18km já feito
  if (ratio >= 0.85 && params.longestRunKm >= HALF_TARGET_LONG_RUN_KM && params.longRuns18Plus >= 1)
    return { label: "Verde",    title: "Prontidão forte",         description: "Ciclo bem alinhado: volume na fase, longão de 18 km consolidado e boa aderência ao bloco atual.",                        card: "bg-emerald-50 border-emerald-200", dot: "bg-emerald-500", text: "text-emerald-700" };
  // Amarelo: longão ≥16km ou volume ok mas sem 18km ainda
  if (ratio >= 0.7 && params.longestRunKm >= 16)
    return { label: "Amarelo",  title: "Prontidão em construção", description: "Base sólida para a meia, mas ainda falta consolidar o longão-alvo de 18 km ou atingir o volume de referência da fase.", card: "bg-amber-50 border-amber-200",    dot: "bg-amber-500",   text: "text-amber-700"   };
  // Amarelo fraco: tem longão razoável mas volume baixo
  if (params.longestRunKm >= 13)
    return { label: "Amarelo",  title: "Prontidão em construção", description: "Longões em andamento, mas o volume semanal ainda está abaixo da referência da fase. Priorizar consistência.",            card: "bg-amber-50 border-amber-200",    dot: "bg-amber-500",   text: "text-amber-700"   };
  return   { label: "Vermelho", title: "Prontidão baixa",         description: "Falta consistência específica de meia: volume semanal abaixo do ideal e longões abaixo de 13 km.",                        card: "bg-red-50 border-red-200",        dot: "bg-red-500",     text: "text-red-700"     };
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

// Projeção direta de uma prova de meia maratona (Riegel, 1.06)
// É o dado mais confiável — uma prova real supera qualquer estimativa de treino
function predictFromHalfRace(half: StravaActivity | null): number | null {
  if (!half) return null;
  const km = half.distance / 1000;
  if (km < 20 || km > 22.5) return null;
  // Projeta a meia oficial (21.0975 km) a partir da distância real da prova
  return Math.round(half.moving_time * Math.pow(HALF_MARATHON_KM / km, 1.06));
}

// Filtra longões: corridas acima de 13km
// e retorna o melhor tempo estimado para a meia maratona
function predictFromLongRun(runs: StravaActivity[]) {
  // Usa Riegel puro (1.06) para projetar meia a partir de longões ≥13km
  // Pesos por distância: longão ≥18km (mais confiável) tem peso dobrado
  const candidates = runs
    .filter((a) => a.distance / 1000 >= 13)
    .map((r) => {
      const km  = r.distance / 1000;
      const est = estimateHalfFromRun(r);
      if (!est) return null;
      // Longões mais próximos da distância-alvo têm mais peso
      const weight = km >= 18 ? 2.0 : km >= 16 ? 1.5 : 1.0;
      return { run: r, est, weight };
    })
    .filter((x): x is { run: StravaActivity; est: number; weight: number } => x !== null);

  if (!candidates.length) return null;

  // Retorna o melhor estimado (menor tempo = mais rápido)
  return candidates.reduce((a, b) => (a.est <= b.est ? a : b));
}

// Penalidade pelo longão mais longo — calibrada para meia maratona
// Referência: longão de 18km = prontidão completa
function getLongRunPenaltySeconds(longestRunKm: number): number {
  if (longestRunKm >= 20) return -2 * 60;   // acima da distância-alvo: bônus
  if (longestRunKm >= 18) return  0;          // no alvo: sem penalidade
  if (longestRunKm >= 16) return  3 * 60;
  if (longestRunKm >= 14) return  6 * 60;
  if (longestRunKm >= 13) return  9 * 60;
  return 14 * 60;                              // < 13km: penalidade máxima
}

// Penalidade pelo volume médio semanal — calibrada para meia maratona
// Referência: 38–42km/semana = prontidão de meia
function getVolumePenaltySeconds(avgWeeklyKm: number): number {
  if (avgWeeklyKm >= 45) return -2 * 60;   // acima do alvo: bônus leve
  if (avgWeeklyKm >= 38) return  0;
  if (avgWeeklyKm >= 30) return  3 * 60;
  if (avgWeeklyKm >= 22) return  7 * 60;
  if (avgWeeklyKm >= 14) return 12 * 60;
  return 18 * 60;
}

function getProjectionConfidence(longestRunKm: number, avgWeeklyKm: number): "Alta" | "Média" | "Baixa" {
  if (longestRunKm >= 18 && avgWeeklyKm >= 35) return "Alta";
  if (longestRunKm >= 14 && avgWeeklyKm >= 25) return "Média";
  return "Baixa";
}

function predictByTrainingModel(params: {
  bestHalfRace: StravaActivity | null;
  longestRun: StravaActivity | null;
  weeklyData: { label: string; distanceKm: number }[];
}): { seconds: number | null; confidence: "Alta" | "Média" | "Baixa"; caption: string } {
  const halfP    = predictFromHalfRace(params.bestHalfRace);
  const longRunP = params.longestRun ? estimateHalfFromRun(params.longestRun) : null;

  const avgWeekly  = params.weeklyData.length
    ? params.weeklyData.reduce((s, x) => s + x.distanceKm, 0) / params.weeklyData.length
    : 0;
  const longestRunKm      = params.longestRun ? params.longestRun.distance / 1000 : 0;
  const longRunPenalty    = getLongRunPenaltySeconds(longestRunKm);
  const volumePenalty     = getVolumePenaltySeconds(avgWeekly);
  const totalPenalty      = Math.min(Math.max(longRunPenalty + volumePenalty, -3 * 60), 20 * 60);
  const confidence        = getProjectionConfidence(longestRunKm, avgWeekly);

  function penaltyLabel(s: number) {
    const m = Math.round(Math.abs(s) / 60);
    return s < 0 ? `-${m}min` : s > 0 ? `+${m}min` : "0min";
  }

  if (halfP !== null) {
    // Prova real de meia já reflete volume, prontidão e condições do dia —
    // nenhum ajuste adicional: seria dupla contagem.
    return {
      seconds: halfP,
      confidence: "Alta",
      caption: "confiança alta · prova real de meia",
    };
  }

  if (longRunP !== null) {
    const volOnly = Math.min(Math.max(volumePenalty, 0), 10 * 60);
    return {
      seconds: longRunP + volOnly,
      confidence,
      caption: `confiança ${confidence.toLowerCase()} · longão ${longestRunKm.toFixed(1)}km · ajuste ${penaltyLabel(volOnly)}`,
    };
  }

  return {
    seconds: null,
    confidence: "Baixa",
    caption: "aguardando meia ou longão ≥13km",
  };
}

// getRealisticHalfPaceRange e predictFromVdot foram substituídos pelo athleteProfile dinâmico
// Os paces vêm de getDynamicAthleteProfile → pacesFromVdot → halfPaces

function getHrZoneForBpm(bpm: number, zones: HrZone[]): HrZone | null {
  return zones.find((z) => bpm >= z.min && bpm <= z.max) ?? null;
}
function getHrPctMax(bpm: number, hrMax: number) { return Math.round((bpm / hrMax) * 100); }

function buildBuenosAiresAlerts(params: {
  hasPlan: boolean;
  plannedWeekKm: number;
  currentWeekKm: number;
  adherencePct: number;
  plannedLongRunKm: number;
  currentWeekLongestRunKm: number;
  todayStatus: string;
  halfPaces: { min: number; max: number } | null;
}) {
  const alerts: { title: string; text: string; tone: string }[] = [];

  if (!params.hasPlan) {
    alerts.push({ title: "Planejamento ausente", text: "Carregue uma planilha do SisRUN para comparar a semana atual.", tone: "bg-white/55 text-gray-700" });
    return alerts;
  }

  if (params.adherencePct < 70)
    alerts.push({ title: "Semana abaixo da meta", text: `Você executou ${params.currentWeekKm.toFixed(1)} km de ${params.plannedWeekKm.toFixed(1)} km planejados.`, tone: "bg-red-50 text-red-700" });
  else if (params.adherencePct < 90)
    alerts.push({ title: "Semana em construção", text: `Boa evolução, mas ainda faltam ${Math.max(params.plannedWeekKm - params.currentWeekKm, 0).toFixed(1)} km para a meta da semana.`, tone: "bg-amber-50 text-amber-700" });
  else
    alerts.push({ title: "Volume da semana bem encaminhado", text: "A execução está acompanhando bem o planejado do SisRUN.", tone: "bg-emerald-50 text-emerald-700" });

  if (params.plannedLongRunKm > 0 && params.currentWeekLongestRunKm < params.plannedLongRunKm)
    alerts.push({ title: "Longão ainda não cumprido", text: `Previsto: ${params.plannedLongRunKm.toFixed(1)} km • maior treino da semana: ${params.currentWeekLongestRunKm.toFixed(1)} km.`, tone: "bg-amber-50 text-amber-700" });
  else if (params.plannedLongRunKm > 0)
    alerts.push({ title: "Longão da semana cumprido", text: `Previsto: ${params.plannedLongRunKm.toFixed(1)} km • maior treino da semana: ${params.currentWeekLongestRunKm.toFixed(1)} km.`, tone: "bg-emerald-50 text-emerald-700" });

  if (params.todayStatus === "Pendente")
    alerts.push({ title: "Treino de hoje pendente", text: "A sessão de hoje ainda não aparece como cumprida no Strava.", tone: "bg-amber-50 text-amber-700" });

  if (params.halfPaces) {
    alerts.push({
      title: "Faixa de pace pelo VDOT dinâmico",
      text: `Com base nos PRs do Strava, o VDOT atual projeta pace de ${formatSecondsPerKm(params.halfPaces.min)}–${formatSecondsPerKm(params.halfPaces.max)} para a meia. Atualiza automaticamente a cada novo resultado.`,
      tone: "bg-blue-50 text-blue-700",
    });
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
      return a.distance / 1000 >= PROJECTION_LONG_RUN_MIN_KM;
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

  // Melhor meia maratona real (20–22.5 km) — dado mais confiável para projeção
  // Exclui longões e treinos pelo nome para evitar falsos positivos
  const TRAINING_NAME_PATTERN = /longão|longao|treino|fartlek|intervalado|progressivo|regenerativo|regen|easy|recovery|warm.?up|cool.?down/i;
  const bestHalfRace = runs
    .filter((a) => {
      const km = a.distance / 1000;
      if (km < 20 || km > 22.5) return false;
      if (TRAINING_NAME_PATTERN.test(a.name)) return false;
      return true;
    })
    .sort((a, b) => a.moving_time - b.moving_time)[0] ?? null;
  const predictedFromHalfRace = predictFromHalfRace(bestHalfRace);

  // Provas para plotar no gráfico da calculadora (9.5–22.5 km, pace razoável)
  const racePointsForProjection = runs
    .filter((a) => {
      const km = a.distance / 1000;
      return km >= 9.5 && km <= 22.5;
    })
    .map((a) => ({
      date:       a.start_date_local,
      name:       a.name,
      distanceKm: a.distance / 1000,
      paceSeconds: Math.round(a.moving_time / (a.distance / 1000)),
    }))
    .filter((r) => r.paceSeconds > 200 && r.paceSeconds < 500)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

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

  const longRuns18Plus       = runs.filter((a) => a.distance >= HALF_TARGET_LONG_RUN_KM * 1000).length;
  const readiness            = getReadinessStatus({ currentWeekKm, idealWeekKm, longestRunKm, longRuns18Plus });
  const longRunResult        = predictFromLongRun(runs);
  const predictedFromLongRun = longRunResult?.est ?? null;
  const bestLongRun          = longRunResult?.run ?? null;
  const siteModel        = predictByTrainingModel({ bestHalfRace, longestRun, weeklyData });
  const predictedBySite  = siteModel.seconds;
  const siteModelCaption = siteModel.caption;
  const siteModelConfidence = siteModel.confidence;
  // Derivados do athleteProfile — precisam estar antes de predictedFromVdotRange e realisticHalfRange
  const vdot          = athleteProfile?.vdot ?? null;
  const vo2max        = athleteProfile?.vo2max ?? null;
  const halfPaces     = athleteProfile?.paces.half ?? null;
  const trainingPaces = vdot ? trainingPacesFromVdot(vdot) : null;

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
  // Longões para a calculadora: últimos 6 meses, ≥13km, ordenados do mais antigo ao mais recente
  const sixMonthsAgo = Date.now() - 180 * 24 * 3600 * 1000;
  const projRunsBase = runs
    .filter((a) => {
      const km = a.distance / 1000;
      const actDate = new Date(getActivityDate(a)).getTime();
      return km >= PROJECTION_LONG_RUN_MIN_KM && actDate >= sixMonthsAgo;
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

  const alerts       = buildBuenosAiresAlerts({ hasPlan: Boolean(sisrunWeek), plannedWeekKm, currentWeekKm, adherencePct: weeklyAdherencePct, plannedLongRunKm: sisrunWeek?.longRunPlannedKm ?? 0, currentWeekLongestRunKm, todayStatus, halfPaces });
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
                <p className="mt-1 text-2xl font-bold text-[#8a1452]">
                  {athleteProfile ? `${Math.round((athleteProfile.vo2max ?? 44) * 0.83 * 187 / 44)}–${Math.round((athleteProfile.vo2max ?? 44) * 0.92 * 187 / 44)} bpm` : "158–175 bpm"}
                </p>
                <p className="mt-1 text-sm text-[#e0007a]">Zona aeróbica → limiar (83–92% FCmáx). Ritmo sustentável para 21 km.</p>
              </div>
            </div>

            <div className="rounded-3xl app-card p-6">
              <h3 className="text-xl font-semibold text-gray-900">Paces de treino pelo VDOT</h3>
              <p className="mt-1 text-sm text-gray-500">Referências de Daniels derivadas do VDOT {vdot.toFixed(1)}.</p>
              <div className="mt-5 space-y-2">
                {[
                  { label: "Regenerativo / Fácil", pace: trainingPaces ? `${formatSecondsPerKm(trainingPaces.easy.min)}–${formatSecondsPerKm(trainingPaces.easy.max)}` : "—", desc: "59–74% VDOT", color: "bg-white/55" },
                  { label: "Pace de meia maratona", pace: halfPaces ? `${formatSecondsPerKm(halfPaces.min)}–${formatSecondsPerKm(halfPaces.max)}` : "—", desc: "Z3–Z4", color: "bg-[#e0007a]/10 ring-1 ring-[#e0007a]/20" },
                  { label: "Limiar (Threshold)",   pace: trainingPaces ? `${formatSecondsPerKm(trainingPaces.threshold.min)}–${formatSecondsPerKm(trainingPaces.threshold.max)}` : "—", desc: "83–88% VDOT", color: "bg-white/55" },
                  { label: "Intervalado (VO2max)", pace: trainingPaces ? formatSecondsPerKm(trainingPaces.interval) : "—", desc: "97–100% VDOT", color: "bg-white/55" },
                  { label: "Repetição",            pace: trainingPaces ? formatSecondsPerKm(trainingPaces.repetition) : "—", desc: "105% VDOT", color: "bg-white/55" },
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

              {/* Prova real — ancôra mais confiável */}
              {predictedFromHalfRace && bestHalfRace && (
                <div className="col-span-full rounded-2xl bg-[#e0007a]/10 ring-1 ring-[#e0007a]/30 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-[#b00060]">Pela prova real ⭐ mais confiável</p>
                    <span className="rounded-full bg-[#e0007a]/20 px-2 py-0.5 text-xs font-semibold text-[#8a1452]">
                      Riegel 1.06
                    </span>
                  </div>
                  <p className="mt-2 text-3xl font-bold text-[#8a1452]">{formatFullDuration(predictedFromHalfRace)}</p>
                  <p className="mt-1 text-sm text-[#b00060]">
                    {bestHalfRace.name} · {(bestHalfRace.distance / 1000).toFixed(1)} km · {formatSecondsPerKm(Math.round(bestHalfRace.moving_time / (bestHalfRace.distance / 1000)))}/km · {formatDate(bestHalfRace.start_date_local)}
                  </p>
                  <p className="mt-2 text-xs text-[#c0006b]">
                    Uma prova de meia completa supera qualquer estimativa de treino. Este é o dado mais representativo do potencial atual.
                  </p>
                </div>
              )}

              <ProjectionCard title="Pelo pace-alvo" value={formatFullDuration(targetPredictionSeconds)} caption={targetPaceLabel} />
              <ProjectionCard title="Pelo melhor longão (6 meses)" value={predictedFromLongRun && bestLongRun ? formatFullDuration(predictedFromLongRun) : "Sem dado"} caption={predictedFromLongRun && bestLongRun ? `${bestLongRun.name} • ${(bestLongRun.distance / 1000).toFixed(1)} km` : "Nenhum longão encontrado nos últimos 6 meses."} />
              <ProjectionCard title="Modelo híbrido (site)" value={predictedBySite ? formatFullDuration(predictedBySite) : "Sem dado"} caption={siteModelCaption} badge={siteModelConfidence} highlight />

              <div className="rounded-2xl app-card-soft p-4 ring-1 ring-blue-200">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm text-blue-600">Potencial pelo VDOT</p>
                  {vdot && <span className="rounded-full bg-blue-200 px-2 py-0.5 text-xs font-medium text-blue-800">VDOT {vdot.toFixed(1)}</span>}
                </div>
                <p className="mt-2 text-2xl font-bold text-blue-900">{formatDurationShort(realisticHalfRange.minTime)}–{formatDurationShort(realisticHalfRange.maxTime)}</p>
                <p className="mt-1 text-sm text-blue-700">Pace {formatSecondsPerKm(realisticHalfRange.minSecondsPerKm)}–{formatSecondsPerKm(realisticHalfRange.maxSecondsPerKm)} · PRs do Strava com margem conservadora.</p>
                {predictedFromVdotRange && <p className="mt-2 text-xs text-blue-600">VDOT bruto: {formatDurationShort(predictedFromVdotRange.min)}–{formatDurationShort(predictedFromVdotRange.max)} — teto de potencial.</p>}
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
            <HalfMarathonProjection longRuns={projectionLongRuns} weeksToRace={weeksToRace} races={racePointsForProjection} />
          </section>
        )}

        {/* Resumo estratégico */}
        <section className="rounded-3xl app-card p-6">
          <h3 className="text-xl font-semibold text-gray-900">Resumo estratégico</h3>
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <div className="rounded-2xl app-card-soft p-5">
              <p className="text-sm text-gray-500">Leitura do momento</p>
              <p className="mt-2 text-sm leading-6 text-gray-700">Alvo de <span className="font-semibold">{targetPaceLabel}</span> projeta <span className="font-semibold">{formatFullDuration(targetPredictionSeconds)}</span> em Buenos Aires ({daysToRace} dias). Ciclo em <span className="font-semibold">{cyclePhase.name}</span> — semáforo <span className={`font-semibold ${readiness.text}`}>{readiness.label}</span>. Longão mais longo: <span className="font-semibold">{longestRunKm.toFixed(1)} km</span>.</p>
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
