export const dynamic = "force-dynamic";

import Link from "next/link";
import SisrunUploadForm from "../components/SisrunUploadForm";
import { getValidStravaAccessToken } from "../lib/strava-auth";
import { getSisrunData, getCurrentWeek, getTodaySisrunRow } from "../lib/sisrun-utils";

type StravaActivity = {
  id: number;
  type: string;
  distance: number;
  start_date?: string;
  start_date_local?: string;
};

type WeekRow = NonNullable<Awaited<ReturnType<typeof getSisrunData>>>["rows"][number];

function parseBrDateLocal(date: string) {
  const [day, month, year] = date.split("/").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function getWeekRows(
  sisrunData: Awaited<ReturnType<typeof getSisrunData>>,
  currentWeek: ReturnType<typeof getCurrentWeek>
) {
  if (!sisrunData?.rows?.length || !currentWeek) return [];
  const start = parseBrDateLocal(currentWeek.weekStart);
  const end   = parseBrDateLocal(currentWeek.weekEnd);
  return sisrunData.rows.filter((row) => {
    const rowDate = parseBrDateLocal(row.date);
    return rowDate >= start && rowDate <= end;
  });
}

function getDayLabel(date: string) {
  return new Intl.DateTimeFormat("pt-BR", { weekday: "short" })
    .format(parseBrDateLocal(date))
    .replace(".", "")
    .toUpperCase();
}

function getActivityDateKey(activity: StravaActivity) {
  const raw = activity.start_date_local ?? activity.start_date;
  if (!raw) return null;
  const match = String(raw).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

async function getWeekStravaKmByDate(currentWeek: ReturnType<typeof getCurrentWeek>) {
  if (!currentWeek) return new Map<string, number>();
  try {
    const token = await getValidStravaAccessToken();
    if (!token) return new Map<string, number>();
    const start = parseBrDateLocal(currentWeek.weekStart);
    const end   = parseBrDateLocal(currentWeek.weekEnd);
    end.setHours(23, 59, 59, 999);
    const url = new URL("https://www.strava.com/api/v3/athlete/activities");
    url.searchParams.set("per_page", "100");
    url.searchParams.set("after",  String(Math.floor(start.getTime() / 1000)));
    url.searchParams.set("before", String(Math.floor(end.getTime() / 1000)));
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return new Map<string, number>();
    const activities = (await res.json()) as StravaActivity[];
    const map = new Map<string, number>();
    activities.filter((a) => a.type === "Run").forEach((a) => {
      const key = getActivityDateKey(a);
      if (!key) return;
      map.set(key, (map.get(key) ?? 0) + a.distance / 1000);
    });
    return map;
  } catch { return new Map<string, number>(); }
}

function getCompletedKm(row: WeekRow, stravaKmByDate: Map<string, number>) {
  return Number(Math.max(row.completedDistanceKm ?? 0, stravaKmByDate.get(row.date) ?? 0).toFixed(1));
}

function formatKm(value: number) { return `${value.toFixed(1)} km`; }

export default async function SisrunPage() {
  const sisrunData      = await getSisrunData();
  const currentWeek     = getCurrentWeek(sisrunData);
  const todayRow        = getTodaySisrunRow(sisrunData);
  const weekRows        = getWeekRows(sisrunData, currentWeek);
  const stravaKmByDate  = await getWeekStravaKmByDate(currentWeek);
  const plannedDays     = weekRows.filter((r) => r.plannedDistanceKm > 0).length;
  const completedTodayKm = todayRow ? getCompletedKm(todayRow, stravaKmByDate) : 0;

  return (
    <main className="min-h-screen app-page-bg p-6 md:p-10">
      <div className="mx-auto max-w-6xl">

        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium" style={{ color: "#e0007a" }}>SisRUN</p>
            <h1 className="text-3xl font-bold text-gray-900 md:text-4xl">
              Planejamento semanal
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Planejamento extraído da planilha atual, com resumo da semana e execução real do Strava.
            </p>
          </div>
          <Link href="/" className="rounded-full app-button px-5 py-3 text-sm font-medium">
            Voltar ao dashboard
          </Link>
        </div>

        {/* Upload + Resumo */}
        <section className="mb-8 grid gap-4 lg:grid-cols-[1fr_.9fr]">
          <SisrunUploadForm />

          <div className="rounded-3xl app-card p-6">
            <div className="flex items-start justify-between gap-3 mb-5">
              <div>
                <p className="text-sm text-gray-500">Semana atual</p>
                <h2 className="text-xl font-semibold text-gray-900 mt-1">Resumo da semana</h2>
              </div>
              {currentWeek && (
                <span className="rounded-full px-3 py-1 text-xs font-semibold"
                  style={{ background: "rgba(224,0,122,0.10)", color: "#c0006b", border: "1px solid rgba(224,0,122,0.2)" }}>
                  {plannedDays} dias com treino
                </span>
              )}
            </div>

            {currentWeek ? (
              <div className="space-y-3">
                <div className="rounded-2xl app-card-soft p-4">
                  <p className="text-sm text-gray-500">Período</p>
                  <p className="mt-1 text-base font-semibold" style={{ color: "#c0006b" }}>
                    {currentWeek.weekStart} até {currentWeek.weekEnd}
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <InfoCard title="Km planejados"  value={formatKm(currentWeek.totalPlannedKm)} />
                  <InfoCard title="Longão planejado" value={formatKm(currentWeek.longRunPlannedKm)} />
                </div>

                <div className="rounded-2xl app-card-soft p-4">
                  <p className="text-sm text-gray-500 mb-2">Treino de hoje</p>
                  {todayRow ? (
                    <div className="grid grid-cols-3 gap-3 text-center text-sm">
                      {[
                        { label: "Planejado", value: formatKm(todayRow.plannedDistanceKm) },
                        { label: "Feito",     value: formatKm(completedTodayKm) },
                        { label: "Janela",    value: `${todayRow.minPlannedTime ?? "-"} / ${todayRow.maxPlannedTime ?? "-"}` },
                      ].map((m) => (
                        <div key={m.label}>
                          <p className="text-gray-500">{m.label}</p>
                          <p className="font-semibold text-gray-900 mt-0.5">{m.value}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">Nenhum treino previsto para hoje.</p>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500 mt-2">Nenhuma planilha carregada ainda.</p>
            )}
          </div>
        </section>

        {/* Agenda */}
        <section className="rounded-3xl app-card p-6">
          <div className="flex items-start justify-between gap-3 mb-5">
            <div>
              <p className="text-sm text-gray-500">Agenda</p>
              <h2 className="text-xl font-semibold text-gray-900 mt-1">Dias da semana atual</h2>
              <p className="mt-1 text-sm text-gray-500">
                Planejamento diário com execução preenchida pelo maior valor entre planilha e Strava.
              </p>
            </div>
            {currentWeek && (
              <span className="rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap"
                style={{ background: "rgba(224,0,122,0.08)", color: "#8a1452", border: "1px solid rgba(224,0,122,0.15)" }}>
                {currentWeek.weekStart} — {currentWeek.weekEnd}
              </span>
            )}
          </div>

          {!sisrunData?.rows?.length || !currentWeek ? (
            <p className="text-sm text-gray-500">Sem dados para exibir.</p>
          ) : (
            <div className="grid gap-3">
              {weekRows.map((row, index) => {
                const hasWorkout  = row.plannedDistanceKm > 0;
                const completedKm = getCompletedKm(row, stravaKmByDate);
                const done        = completedKm >= row.plannedDistanceKm && hasWorkout;

                return (
                  <div key={`${row.date}-${index}`} className="rounded-2xl app-card-soft p-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div className="flex items-center gap-3">
                        <span className="rounded-lg px-2.5 py-1 text-xs font-bold"
                          style={{
                            background: hasWorkout ? "rgba(224,0,122,0.10)" : "rgba(0,0,0,0.04)",
                            color: hasWorkout ? "#c0006b" : "#8a1452",
                            border: `1px solid ${hasWorkout ? "rgba(224,0,122,0.2)" : "rgba(0,0,0,0.08)"}`,
                          }}>
                          {getDayLabel(row.date)}
                        </span>
                        <div>
                          <p className="text-xs text-gray-500">{row.date}</p>
                          <p className="font-semibold text-gray-900 text-sm mt-0.5">
                            {hasWorkout ? `${formatKm(row.plannedDistanceKm)} planejados` : "Descanso / sem volume planejado"}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-4 gap-4 text-sm">
                        {[
                          { label: "Planejado",  value: formatKm(row.plannedDistanceKm) },
                          { label: "Feito",      value: formatKm(completedKm), accent: done },
                          { label: "Tempo mín.", value: row.minPlannedTime ?? "-" },
                          { label: "Tempo máx.", value: row.maxPlannedTime ?? "-" },
                        ].map((m) => (
                          <div key={m.label}>
                            <p className="text-gray-500">{m.label}</p>
                            <p className="font-semibold mt-0.5"
                              style={{ color: m.accent ? "#0a7a54" : "#1a1a1a" }}>
                              {m.value}
                            </p>
                          </div>
                        ))}
                      </div>
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

function InfoCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl app-card-soft p-4 text-center">
      <p className="text-sm text-gray-500">{title}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
    </div>
  );
}
