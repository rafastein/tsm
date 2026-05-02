import Link from "next/link";
import SisrunUploadForm from "../components/SisrunUploadForm";
import { getSisrunData, getCurrentWeek, getTodaySisrunRow } from "../lib/sisrun-utils";

export default async function SisrunPage() {
  const sisrunData = await getSisrunData();
  const currentWeek = getCurrentWeek(sisrunData);
  const todayRow = getTodaySisrunRow(sisrunData);

  return (
    <main className="min-h-screen app-page-bg p-6 md:p-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-[#e0007a]">SisRUN</p>
            <h1 className="text-3xl font-bold text-gray-900 md:text-4xl">
              Planejamento semanal
            </h1>
          </div>

          <Link
            href="/"
            className="rounded-full app-button px-5 py-3 text-sm font-medium"
          >
            Voltar ao dashboard
          </Link>
        </div>

        <section className="mb-8 grid gap-4 lg:grid-cols-[1fr_.9fr]">
          <SisrunUploadForm />

          <div className="rounded-3xl app-card p-6">
            <h2 className="text-xl font-semibold text-gray-900">Resumo da semana</h2>
            <p className="mt-1 text-sm text-gray-500">
              Dados carregados da planilha atual do SisRUN.
            </p>

            {currentWeek ? (
              <div className="mt-5 space-y-4">
                <div className="rounded-2xl app-card-soft p-4">
                  <p className="text-sm text-gray-500">Período</p>
                  <p className="mt-1 text-lg font-semibold text-gray-900">
                    {currentWeek.weekStart} até {currentWeek.weekEnd}
                  </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <InfoCard
                    title="Km planejados"
                    value={`${currentWeek.totalPlannedKm.toFixed(1)} km`}
                  />
                  <InfoCard
                    title="Longão planejado"
                    value={`${currentWeek.longRunPlannedKm.toFixed(1)} km`}
                  />
                </div>

                <div className="rounded-2xl app-card-soft p-4">
                  <p className="text-sm text-gray-500">Treino de hoje</p>
                  {todayRow ? (
                    <div className="mt-2 text-sm text-gray-700">
                      <p>
                        Distância planejada:{" "}
                        <span className="font-semibold">
                          {todayRow.plannedDistanceKm.toFixed(1)} km
                        </span>
                      </p>
                      <p className="mt-1">
                        Janela de tempo:{" "}
                        <span className="font-semibold">
                          {todayRow.minPlannedTime ?? "-"} / {todayRow.maxPlannedTime ?? "-"}
                        </span>
                      </p>
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-gray-500">
                      Nenhum treino previsto para hoje.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <p className="mt-5 text-sm text-gray-500">
                Nenhuma planilha carregada ainda.
              </p>
            )}
          </div>
        </section>

        <section className="rounded-3xl app-card p-6">
          <h2 className="text-xl font-semibold text-gray-900">Dias da semana atual</h2>
          <p className="mt-1 text-sm text-gray-500">
            Planejamento diário extraído da planilha.
          </p>

          {!sisrunData?.rows?.length || !currentWeek ? (
            <p className="mt-5 text-sm text-gray-500">Sem dados para exibir.</p>
          ) : (
            <div className="mt-5 grid gap-3">
              {sisrunData.rows
                .filter((row) => {
                  const start = new Date(currentWeek.weekStart.split("/").reverse().join("-"));
                  const end = new Date(currentWeek.weekEnd.split("/").reverse().join("-"));
                  const rowDate = new Date(row.date.split("/").reverse().join("-"));
                  return rowDate >= start && rowDate <= end;
                })
                .map((row, index) => (
                  <div
                    key={`${row.date}-${index}`}
                    className="rounded-2xl app-card-soft p-4"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-sm text-gray-500">{row.date}</p>
                        <p className="mt-1 font-semibold text-gray-900">
                          {row.plannedDistanceKm > 0
                            ? `${row.plannedDistanceKm.toFixed(1)} km planejados`
                            : "Descanso / sem volume planejado"}
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
                        <div>
                          <p className="text-gray-500">Planejado</p>
                          <p className="font-semibold text-gray-900">
                            {row.plannedDistanceKm.toFixed(1)} km
                          </p>
                        </div>

                        <div>
                          <p className="text-gray-500">Feito (planilha)</p>
                          <p className="font-semibold text-gray-900">
                            {row.completedDistanceKm.toFixed(1)} km
                          </p>
                        </div>

                        <div>
                          <p className="text-gray-500">Tempo mín.</p>
                          <p className="font-semibold text-gray-900">
                            {row.minPlannedTime ?? "-"}
                          </p>
                        </div>

                        <div>
                          <p className="text-gray-500">Tempo máx.</p>
                          <p className="font-semibold text-gray-900">
                            {row.maxPlannedTime ?? "-"}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function InfoCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/80 p-4 shadow-sm">
      <p className="text-sm text-gray-500">{title}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
    </div>
  );
}