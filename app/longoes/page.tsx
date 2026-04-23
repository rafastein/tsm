export const dynamic = "force-dynamic";

import Link from "next/link";
import { getValidStravaAccessToken } from "../lib/strava-auth";
import { formatBRDate } from "../lib/date-utils";
import {
  formatEfficiency,
  formatLongRunDuration,
  formatLongRunPace,
  getLongRunSummary,
  getLongRunsFromActivities,
} from "../lib/strava-long-runs";

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

const STRAVA_AFTER_EPOCH = Math.floor(
  new Date("2024-01-01T00:00:00Z").getTime() / 1000
);

async function getActivities(): Promise<StravaActivity[]> {
  try {
    const accessToken = await getValidStravaAccessToken();
    if (!accessToken) return [];

    const allActivities: StravaActivity[] = [];
    const perPage = 200;
    const maxPages = 20;

    for (let page = 1; page <= maxPages; page++) {
      const url = new URL("https://www.strava.com/api/v3/athlete/activities");
      url.searchParams.set("per_page", String(perPage));
      url.searchParams.set("page", String(page));
      url.searchParams.set("after", String(STRAVA_AFTER_EPOCH));

      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });

      if (!res.ok) break;

      const pageActivities = (await res.json()) as StravaActivity[];
      if (!Array.isArray(pageActivities) || pageActivities.length === 0) break;

      allActivities.push(...pageActivities);
      if (pageActivities.length < perPage) break;
    }

    return allActivities;
  } catch {
    return [];
  }
}

function formatDate(dateString: string) {
  return formatBRDate(dateString);
}

function getEfficiencyTrend(current?: number | null, previous?: number | null) {
  if (!current || !previous) {
    return {
      emoji: "➖",
      label: "Sem base anterior",
      detail: "Ainda não há longão anterior com eficiência para comparar.",
      tone: "text-gray-500",
    };
  }

  const diff = current - previous;

  if (Math.abs(diff) < 1) {
    return {
      emoji: "➖",
      label: "Estável",
      detail: `Variação de ${diff >= 0 ? "+" : ""}${diff.toFixed(0)} ponto em relação ao longão anterior.`,
      tone: "text-gray-600",
    };
  }

  if (diff > 0) {
    return {
      emoji: "📈",
      label: "Melhorou",
      detail: `+${diff.toFixed(0)} pontos em relação ao longão anterior.`,
      tone: "text-emerald-600",
    };
  }

  return {
    emoji: "📉",
    label: "Piorou",
    detail: `${diff.toFixed(0)} pontos em relação ao longão anterior.`,
    tone: "text-red-600",
  };
}

function InfoCard({ title, value }: { title: string; value: React.ReactNode }) {
  return (
    <div className="rounded-3xl bg-white p-6 shadow-sm">
      <p className="text-sm text-gray-500">{title}</p>
      <h2 className="mt-2 text-2xl font-bold text-gray-900">{value}</h2>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white p-3">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 font-semibold text-gray-900">{value}</p>
    </div>
  );
}

export default async function LongoesPage() {
  const activities = await getActivities();
  const longRuns = getLongRunsFromActivities(activities);
  const summary = getLongRunSummary(longRuns);

  const lastLongRun = longRuns[0] ?? null;
  const previousLongRun = longRuns[1] ?? null;

  const efficiencyTrend = getEfficiencyTrend(
    lastLongRun?.efficiency,
    previousLongRun?.efficiency
  );

  return (
    <main className="min-h-screen bg-gray-100 p-6 md:p-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-orange-600">Treinos</p>
            <h1 className="text-3xl font-bold text-gray-900 md:text-4xl">
              Página de longões
            </h1>
            <p className="mt-2 text-sm text-gray-500">
              Análise dos treinos renomeados como “Longão”.
            </p>
          </div>

          <Link
            href="/"
            className="rounded-full bg-white px-5 py-3 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          >
            Voltar ao dashboard
          </Link>
        </div>

        <section className="mb-8 grid gap-4 md:grid-cols-5">
          <InfoCard title="Total de longões" value={String(summary.totalLongRuns)} />
          <InfoCard title="Maior longão" value={`${summary.longestRunKm.toFixed(1)} km`} />
          <InfoCard title="Pace médio" value={formatLongRunPace(summary.averagePaceSecPerKm)} />
          <InfoCard
            title="FC média"
            value={
              summary.averageHeartrate
                ? `${summary.averageHeartrate.toFixed(0)} bpm`
                : "-"
            }
          />
          <InfoCard
            title="Eficiência média"
            value={formatEfficiency(summary.averageEfficiency)}
          />
        </section>

        <section className="mb-8 grid gap-4 md:grid-cols-3">
          <div className="rounded-3xl bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900">Último longão</h3>
            {summary.lastLongRun ? (
              <>
                <p className="mt-3 text-sm text-gray-500">
                  {summary.lastLongRun.name}
                </p>
                <p className="mt-1 text-sm text-gray-500">
                  {formatDate(summary.lastLongRun.date)}
                </p>
                <p className="mt-1 text-sm text-gray-500">
                  {summary.lastLongRun.distanceKm.toFixed(2)} km •{" "}
                  {formatLongRunDuration(summary.lastLongRun.movingTimeSec)} •{" "}
                  {formatLongRunPace(summary.lastLongRun.paceSecPerKm)}
                </p>
              </>
            ) : (
              <p className="mt-3 text-sm text-gray-500">
                Nenhum longão encontrado.
              </p>
            )}
          </div>

          <div className="rounded-3xl bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900">
              Card de eficiência
            </h3>

            <div className="mt-3 flex items-center gap-3">
              <span className="text-3xl">{efficiencyTrend.emoji}</span>
              <div>
                <p className={`text-2xl font-bold ${efficiencyTrend.tone}`}>
                  {efficiencyTrend.label}
                </p>
                <p className="mt-1 text-sm text-gray-500">
                  {efficiencyTrend.detail}
                </p>
              </div>
            </div>

            <p className="mt-4 text-sm text-gray-500">
              Último longão:{" "}
              <span className="font-semibold text-gray-900">
                {formatEfficiency(lastLongRun?.efficiency ?? null)}
              </span>
            </p>

            <p className="mt-1 text-sm text-gray-500">
              Longão anterior:{" "}
              <span className="font-semibold text-gray-900">
                {formatEfficiency(previousLongRun?.efficiency ?? null)}
              </span>
            </p>
          </div>

          <div className="rounded-3xl bg-white p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-900">
              Elevação média
            </h3>
            <p className="mt-3 text-2xl font-bold text-gray-900">
              {summary.averageElevationGain.toFixed(0)} m
            </p>
            <p className="mt-1 text-sm text-gray-500">
              Média de ganho de elevação dos longões.
            </p>
          </div>
        </section>

        <section className="rounded-3xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-gray-900">
            Histórico de longões
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Lista com distância, tempo, pace, FC, elevação, eficiência e comparação com o longão anterior.
          </p>

          {longRuns.length === 0 ? (
            <p className="mt-5 text-sm text-gray-500">
              Nenhuma atividade com nome “Longão” foi encontrada.
            </p>
          ) : (
            <div className="mt-5 space-y-3">
              {longRuns.map((run, index) => {
                const previous = longRuns[index + 1];
                const trend = getEfficiencyTrend(run.efficiency, previous?.efficiency);

                return (
                  <div
                    key={run.id}
                    className="rounded-2xl border border-gray-200 bg-gray-50 p-4"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="text-lg font-semibold text-gray-900">
                          {run.name}
                        </p>
                        <p className="mt-1 text-sm text-gray-500">
                          {formatDate(run.date)} • {run.city || "Não identificado"}
                          {run.state ? `, ${run.state}` : ""}
                        </p>
                      </div>

                      <div className="rounded-full bg-orange-100 px-3 py-1 text-sm font-semibold text-orange-700">
                        {run.distanceKm.toFixed(2)} km
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-6">
                      <MetricCard
                        label="Tempo"
                        value={formatLongRunDuration(run.movingTimeSec)}
                      />
                      <MetricCard
                        label="Pace"
                        value={formatLongRunPace(run.paceSecPerKm)}
                      />
                      <MetricCard
                        label="FC média"
                        value={
                          run.averageHeartrate
                            ? `${run.averageHeartrate.toFixed(0)} bpm`
                            : "-"
                        }
                      />
                      <MetricCard
                        label="Elevação"
                        value={`${run.elevationGain.toFixed(0)} m`}
                      />
                      <MetricCard
                        label="Eficiência"
                        value={formatEfficiency(run.efficiency)}
                      />
                      <MetricCard
                        label="Tendência"
                        value={`${trend.emoji} ${trend.label}`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}