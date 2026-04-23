export const dynamic = "force-dynamic";

import Link from "next/link";
import { formatBRDate } from "./lib/date-utils";
import ActivitiesPanel from "./components/ActivitiesPanel";
import WeeklyComparisonChart from "./components/WeeklyComparisonChart";
import {
  buildWeeklyComparison,
  getCurrentWeek,
  getCurrentWeekLongestRunKm,
  getCurrentWeekStravaKm,
  getSisrunData,
  getTodaySisrunRow,
  getTodayStravaKm,
  type SisrunWeek,
} from "./lib/sisrun-utils";
import { getValidStravaAccessToken } from "./lib/strava-auth";
import {
  formatEfficiency,
  formatLongRunPace,
  getLongRunSummary,
  getLongRunsFromActivities,
} from "./lib/strava-long-runs";

type StravaActivity = {
  id: number;
  name: string;
  distance: number;
  moving_time: number;
  elapsed_time?: number;
  total_elevation_gain: number;
  average_heartrate?: number;
  max_heartrate?: number;
  type: string;
  start_date: string;
  start_date_local: string;
  location_city?: string | null;
  location_state?: string | null;
};

type Athlete = {
  id: number;
  firstname: string;
  lastname: string;
  city: string | null;
  state: string | null;
  profile_medium: string | null;
};

const YEAR_SUMMARY = 2026;
const YEAR_START_EPOCH = Math.floor(
  new Date(`${YEAR_SUMMARY}-01-01T00:00:00Z`).getTime() / 1000
);
const YEAR_END_EPOCH = Math.floor(
  new Date(`${YEAR_SUMMARY + 1}-01-01T00:00:00Z`).getTime() / 1000
);

async function getActivities(): Promise<StravaActivity[]> {
  try {
    const accessToken = await getValidStravaAccessToken();
    if (!accessToken) {
      console.warn("[HOME] sem access token para atividades");
      return [];
    }

    const allActivities: StravaActivity[] = [];
    const perPage = 200;
    const maxPages = 20;

    for (let page = 1; page <= maxPages; page++) {
      const url = new URL("https://www.strava.com/api/v3/athlete/activities");
      url.searchParams.set("per_page", String(perPage));
      url.searchParams.set("page", String(page));
      url.searchParams.set("after", String(YEAR_START_EPOCH));
      url.searchParams.set("before", String(YEAR_END_EPOCH));

      const res = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: "no-store",
      });

      if (!res.ok) {
        const text = await res.text();
        console.warn("[HOME] falha ao buscar activities:", res.status, text);
        break;
      }

      const pageActivities = (await res.json()) as StravaActivity[];

      if (!Array.isArray(pageActivities) || pageActivities.length === 0) {
        break;
      }

      allActivities.push(...pageActivities);

      if (pageActivities.length < perPage) {
        break;
      }
    }

    console.log("[HOME] atividades carregadas:", allActivities.length);
    return allActivities;
  } catch (error) {
    console.warn("Erro ao buscar atividades:", error);
    return [];
  }
}

async function getAthlete(): Promise<Athlete | null> {
  try {
    const accessToken = await getValidStravaAccessToken();
    if (!accessToken) return null;

    const res = await fetch("https://www.strava.com/api/v3/athlete", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
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

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

function formatDate(dateString: string) {
  return formatBRDate(dateString);
}

function formatPace(distance: number, time: number) {
  if (!distance || !time) return "-";

  const pace = time / (distance / 1000);
  const min = Math.floor(pace / 60);
  const sec = Math.round(pace % 60);

  return `${min}:${String(sec).padStart(2, "0")}/km`;
}

function buildAlerts(params: {
  hasSisrunWeek: boolean;
  plannedWeekKm: number;
  currentWeekKm: number;
  adherencePct: number;
  longRunPlannedKm: number;
  longRunDoneKm: number;
}) {
  const alerts: { title: string; text: string; tone: string }[] = [];

  if (!params.hasSisrunWeek) {
    alerts.push({
      title: "SisRUN ausente",
      text: "Carregue uma planilha para comparar planejamento e execução.",
      tone: "bg-gray-50 text-gray-700",
    });
    return alerts;
  }

  if (params.adherencePct < 70) {
    alerts.push({
      title: "Semana abaixo da meta",
      text: "O volume executado ainda está bem abaixo do planejado.",
      tone: "bg-red-50 text-red-700",
    });
  } else if (params.adherencePct < 90) {
    alerts.push({
      title: "Semana em construção",
      text: "Você está no caminho, mas ainda falta volume para fechar bem a semana.",
      tone: "bg-amber-50 text-amber-700",
    });
  } else {
    alerts.push({
      title: "Boa aderência semanal",
      text: "A execução está acompanhando bem o volume planejado.",
      tone: "bg-emerald-50 text-emerald-700",
    });
  }

  if (params.longRunPlannedKm > 0 && params.longRunDoneKm < params.longRunPlannedKm) {
    alerts.push({
      title: "Longão não cumprido",
      text: `Maior treino da semana: ${params.longRunDoneKm.toFixed(
        1
      )} km • previsto: ${params.longRunPlannedKm.toFixed(1)} km.`,
      tone: "bg-amber-50 text-amber-700",
    });
  } else if (params.longRunPlannedKm > 0) {
    alerts.push({
      title: "Longão cumprido",
      text: `Maior treino da semana: ${params.longRunDoneKm.toFixed(
        1
      )} km • previsto: ${params.longRunPlannedKm.toFixed(1)} km.`,
      tone: "bg-emerald-50 text-emerald-700",
    });
  }

  return alerts;
}

function Card({ title, value }: { title: string; value: React.ReactNode }) {
  return (
    <div className="rounded-3xl bg-white p-6 shadow-sm">
      <p className="text-sm text-gray-500">{title}</p>
      <h2 className="mt-2 text-2xl font-bold text-gray-900">{value}</h2>
    </div>
  );
}

export default async function Home() {
  const [athlete, activities, sisrunData] = await Promise.all([
    getAthlete(),
    getActivities(),
    getSisrunData(),
  ]);

  const sisrunWeek = getCurrentWeek(sisrunData) as SisrunWeek | null;
  const todaySisrunRow = getTodaySisrunRow(sisrunData);

  const runs = activities.filter((a) => a.type === "Run");

  const totalKm = runs.reduce((acc, a) => acc + a.distance, 0) / 1000;
  const totalTime = runs.reduce((acc, a) => acc + a.moving_time, 0);
  const totalElevation = runs.reduce((acc, a) => acc + a.total_elevation_gain, 0);

  const pace = formatPace(totalKm * 1000, totalTime);

  const longest =
    runs.length > 0
      ? runs.reduce((max, a) => (a.distance > max.distance ? a : max))
      : null;

  const currentWeekKm = getCurrentWeekStravaKm(activities);
  const currentWeekLongestRunKm = getCurrentWeekLongestRunKm(activities);
  const todayStravaKm = getTodayStravaKm(activities);

  const plannedWeekKm = sisrunWeek?.totalPlannedKm ?? 0;
  const weeklyAdherencePct =
    plannedWeekKm > 0 ? Math.min((currentWeekKm / plannedWeekKm) * 100, 100) : 0;

  const weeklyComparison = buildWeeklyComparison(sisrunData, activities, 6);
  const longRuns = getLongRunsFromActivities(activities);
  const longRunSummary = getLongRunSummary(longRuns);

  const connected = Boolean(athlete) || activities.length > 0;

  const todayStatus = !todaySisrunRow
    ? "Sem treino previsto hoje"
    : todaySisrunRow.plannedDistanceKm === 0
    ? "Descanso"
    : todayStravaKm <= 0
    ? "Pendente"
    : todayStravaKm >= todaySisrunRow.plannedDistanceKm
    ? "Concluído"
    : "Parcial";

  const alerts = buildAlerts({
    hasSisrunWeek: Boolean(sisrunWeek),
    plannedWeekKm,
    currentWeekKm,
    adherencePct: weeklyAdherencePct,
    longRunPlannedKm: sisrunWeek?.longRunPlannedKm ?? 0,
    longRunDoneKm: currentWeekLongestRunKm,
  });

  return (
    <main className="min-h-screen bg-gray-100 p-6">
      <div className="mx-auto max-w-6xl">
        <section className="mb-8 rounded-3xl bg-white p-6 shadow-sm">
          <div className="grid gap-6 lg:grid-cols-[1.2fr_.8fr]">
            <div className="flex items-center gap-4">
              {athlete?.profile_medium ? (
                <img
                  src={athlete.profile_medium}
                  alt={athlete ? `${athlete.firstname} ${athlete.lastname}` : "Atleta"}
                  className="h-20 w-20 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-orange-200 text-xl font-bold">
                  {athlete?.firstname?.[0] ?? "A"}
                </div>
              )}

              <div>
                <p className="text-sm font-medium text-orange-600">Strava Dashboard</p>
                <h1 className="text-3xl font-bold">
                  {athlete ? `${athlete.firstname} ${athlete.lastname}` : "Atleta"}
                </h1>

                <p className="text-gray-500">
                  {athlete?.city ?? "Cidade não informada"}
                  {athlete?.state ? `, ${athlete.state}` : ""}
                </p>

                {!connected && (
                  <p className="mt-2 text-sm text-red-500">
                    Strava não conectado. Faça a autorização novamente para gerar o token automático.
                  </p>
                )}
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Link
                href="/buenos-aires"
                className="group rounded-3xl bg-gradient-to-r from-orange-500 to-red-500 p-5 text-white shadow-sm transition hover:scale-[1.01]"
              >
                <p className="text-xs font-medium uppercase tracking-wide text-orange-100">
                  Road to Buenos Aires
                </p>
                <h2 className="mt-2 text-xl font-bold">Abrir modo maratona</h2>
                <p className="mt-2 text-sm text-orange-50">
                  Acompanhe prontidão, ciclo, projeções e longões.
                </p>
                <p className="mt-4 text-sm font-semibold text-white/90 group-hover:text-white">
                  Entrar →
                </p>
              </Link>

              <Link
                href="/sisrun"
                className="rounded-3xl bg-white p-5 shadow-sm transition hover:bg-gray-50"
              >
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                  Planejamento
                </p>
                <h2 className="mt-2 text-xl font-bold text-gray-900">SisRUN</h2>
                <p className="mt-2 text-sm text-gray-500">
                  Atualize o planejamento e acompanhe aderência semanal.
                </p>
              </Link>
            </div>
          </div>
        </section>

        <section className="mb-8 grid gap-4 md:grid-cols-4">
          <Card
            title="Km previstos (SisRUN)"
            value={sisrunWeek ? `${plannedWeekKm.toFixed(1)} km` : "-"}
          />
          <Card title="Km feitos (Strava)" value={`${currentWeekKm.toFixed(1)} km`} />
          <Card
            title="Aderência semanal"
            value={sisrunWeek ? `${weeklyAdherencePct.toFixed(0)}%` : "-"}
          />
          <Card
            title="Longão previsto x feito"
            value={
              sisrunWeek
                ? `${(sisrunWeek.longRunPlannedKm ?? 0).toFixed(1)} / ${currentWeekLongestRunKm.toFixed(1)} km`
                : `${currentWeekLongestRunKm.toFixed(1)} km`
            }
          />
        </section>

        <section className="mb-8 grid gap-4 md:grid-cols-2">
          <div className="rounded-3xl bg-white p-6 shadow-sm">
            <h3 className="mb-2 font-semibold">Treino de hoje</h3>

            {todaySisrunRow ? (
              <>
                <p className="text-sm text-gray-500">
                  Planejado: {todaySisrunRow.plannedDistanceKm.toFixed(1)} km
                </p>
                <p className="mt-1 text-sm text-gray-500">
                  Feito no Strava: {todayStravaKm.toFixed(1)} km
                </p>
                <p
                  className={`mt-3 inline-flex rounded-full px-3 py-1 text-sm font-medium ${
                    todayStatus === "Descanso"
                      ? "bg-gray-100 text-gray-700"
                      : "bg-orange-100 text-orange-700"
                  }`}
                >
                  {todayStatus}
                </p>
              </>
            ) : (
              <p className="text-gray-500">Nenhum treino previsto para hoje.</p>
            )}
          </div>

          <div className="rounded-3xl bg-white p-6 shadow-sm">
            <h3 className="mb-2 font-semibold">Resumo geral 2026</h3>
            <p className="text-gray-600">
              Consolidado de todos os treinos do ano no Strava.
            </p>
            <p className="mt-3 text-sm text-gray-500">
              Distância total no Strava: {totalKm.toFixed(1)} km
            </p>
            <p className="mt-1 text-sm text-gray-500">
              Pace médio consolidado: {pace}
            </p>
            <p className="mt-1 text-sm text-gray-500">
              Elevação acumulada: {totalElevation.toFixed(0)} m
            </p>
            <p className="mt-1 text-sm text-gray-500">
              Tempo total: {formatDuration(totalTime)}
            </p>
          </div>
        </section>

        <section className="mb-8 grid gap-4 md:grid-cols-[1.4fr_.6fr]">
          <div className="rounded-3xl bg-white p-6 shadow-sm">
            <h3 className="mb-2 font-semibold">Card de eficiência</h3>

            {longRunSummary.totalLongRuns > 0 ? (
              <>
                <p className="text-sm text-gray-500">
                  Eficiência média:{" "}
                  <span className="font-semibold text-gray-900">
                    {formatEfficiency(longRunSummary.averageEfficiency)}
                  </span>
                </p>

                <p className="mt-1 text-sm text-gray-500">
                  Pace médio dos longões:{" "}
                  <span className="font-semibold text-gray-900">
                    {formatLongRunPace(longRunSummary.averagePaceSecPerKm)}
                  </span>
                </p>

                <p className="mt-1 text-sm text-gray-500">
                  FC média dos longões:{" "}
                  <span className="font-semibold text-gray-900">
                    {longRunSummary.averageHeartrate
                      ? `${longRunSummary.averageHeartrate.toFixed(0)} bpm`
                      : "-"}
                  </span>
                </p>

                <p className="mt-1 text-sm text-gray-500">
                  Melhor eficiência:{" "}
                  <span className="font-semibold text-gray-900">
                    {formatEfficiency(longRunSummary.bestEfficiency)}
                  </span>
                </p>

                <p className="mt-3 text-xs text-gray-400">
                  Quanto maior o número, melhor a relação entre velocidade e esforço cardíaco.
                </p>
              </>
            ) : (
              <p className="text-sm text-gray-500">
                Nenhum longão encontrado ainda. Renomeie as atividades como “Longão”.
              </p>
            )}
          </div>

          <Link
            href="/longoes"
            className="rounded-3xl bg-white p-6 shadow-sm transition hover:bg-gray-50"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-orange-500">
              Treinos
            </p>
            <h3 className="mt-2 text-2xl font-bold text-gray-900">
              Página de longões
            </h3>
            <p className="mt-2 text-sm text-gray-500">
              Veja evolução, eficiência, FC e histórico completo dos longões.
            </p>
          </Link>
        </section>

        <section className="mb-8 grid gap-4 md:grid-cols-2">
          <Link
            href="/corridas-brasil"
            className="rounded-3xl bg-white p-6 shadow-sm transition hover:bg-gray-50"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-orange-500">
              Mapas
            </p>
            <h3 className="mt-2 flex items-center gap-2 text-2xl font-bold text-gray-900">
              <img
                src="https://flagcdn.com/w40/br.png"
                alt="Bandeira do Brasil"
                className="h-5 w-7 rounded-[2px] object-cover shadow-sm"
                loading="lazy"
              />
              <span>Corridas pelo Brasil</span>
            </h3>
            <p className="mt-2 text-sm text-gray-500">
              Veja o mapa do Brasil com a quantidade de corridas por estado.
            </p>
          </Link>

          <Link
            href="/corridas-mundo"
            className="rounded-3xl bg-white p-6 shadow-sm transition hover:bg-gray-50"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-orange-500">
              Mapas
            </p>
            <h3 className="mt-2 flex items-center gap-2 text-2xl font-bold text-gray-900">
              <span>🌍</span>
              <span>Corridas pelo mundo</span>
            </h3>
            <p className="mt-2 text-sm text-gray-500">
              Explore o mapa-múndi com a quantidade de corridas por país.
            </p>
          </Link>
        </section>

        <section className="mb-8 grid gap-4 md:grid-cols-2">
          {alerts.map((alert, index) => (
            <div key={index} className={`rounded-3xl p-5 shadow-sm ${alert.tone}`}>
              <p className="font-semibold">{alert.title}</p>
              <p className="mt-2 text-sm">{alert.text}</p>
            </div>
          ))}
        </section>

        <section className="mb-8">
          <WeeklyComparisonChart
            items={weeklyComparison}
            title="Planejado x executado por semana"
            subtitle="Volume planejado no SisRUN comparado com o executado no Strava."
          />
        </section>

        <section className="mb-8 grid gap-4 md:grid-cols-2">
          <div className="rounded-3xl bg-white p-6 shadow-sm">
            <h3 className="mb-2 font-semibold">Maior corrida recente</h3>
            {longest ? (
              <>
                <p className="text-2xl font-bold">
                  {(longest.distance / 1000).toFixed(2)} km
                </p>
                <p className="mt-1 text-sm text-gray-500">
                  {longest.name} • {formatDate(longest.start_date_local)}
                </p>
              </>
            ) : (
              <p className="text-gray-500">Sem dados</p>
            )}
          </div>

          <div className="rounded-3xl bg-white p-6 shadow-sm">
            <h3 className="mb-2 font-semibold">Strava</h3>
            <p className="text-gray-600">Corridas registradas: {runs.length}</p>
            <p className="mt-1 text-sm text-gray-500">
              Distância total: {totalKm.toFixed(1)} km
            </p>
            <p className="mt-1 text-sm text-gray-500">
              Tempo total: {formatDuration(totalTime)}
            </p>
          </div>
        </section>

        <ActivitiesPanel activities={activities} />
      </div>
    </main>
  );
}