type WeeklyComparisonItem = {
  label: string;
  plannedKm?: number | null;
  actualKm?: number | null;
  executedKm?: number | null;
  completedKm?: number | null;
  adherencePct?: number | null;
  isCurrentWeek?: boolean | null;
  current?: boolean | null;
};

type Props = {
  items: WeeklyComparisonItem[];
  title?: string;
  subtitle?: string;
};

function safeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function resolvePlannedKm(item: WeeklyComparisonItem) {
  return safeNumber(item.plannedKm);
}

function resolveActualKm(item: WeeklyComparisonItem) {
  if (typeof item.actualKm === "number") return safeNumber(item.actualKm);
  if (typeof item.executedKm === "number") return safeNumber(item.executedKm);
  if (typeof item.completedKm === "number") return safeNumber(item.completedKm);
  return 0;
}

function resolveAdherencePct(
  item: WeeklyComparisonItem,
  actualKm: number,
  plannedKm: number
) {
  if (
    typeof item.adherencePct === "number" &&
    Number.isFinite(item.adherencePct)
  ) {
    return item.adherencePct;
  }

  if (plannedKm <= 0) return actualKm > 0 ? 100 : 0;
  return (actualKm / plannedKm) * 100;
}

function getProgressPct(actualKm: number, plannedKm: number) {
  if (plannedKm <= 0) return actualKm > 0 ? 100 : 0;
  return Math.min((actualKm / plannedKm) * 100, 100);
}

function parseWeekLabel(label: string) {
  const match = label.match(/^(\d{2})\/(\d{2})\s*[-–]\s*(\d{2})\/(\d{2})$/);

  if (!match) return null;

  const [, startDayStr, startMonthStr, endDayStr, endMonthStr] = match;

  const startDay = Number(startDayStr);
  const startMonth = Number(startMonthStr);
  const endDay = Number(endDayStr);
  const endMonth = Number(endMonthStr);

  if (
    !Number.isFinite(startDay) ||
    !Number.isFinite(startMonth) ||
    !Number.isFinite(endDay) ||
    !Number.isFinite(endMonth)
  ) {
    return null;
  }

  return {
    startDay,
    startMonth,
    endDay,
    endMonth,
  };
}

function isDateWithinWeekLabel(label: string, now = new Date()) {
  const parsed = parseWeekLabel(label);
  if (!parsed) return false;

  const currentYear = now.getFullYear();

  const start = new Date(
    currentYear,
    parsed.startMonth - 1,
    parsed.startDay,
    0,
    0,
    0,
    0
  );

  let endYear = currentYear;

  if (parsed.endMonth < parsed.startMonth) {
    endYear += 1;
  }

  const end = new Date(
    endYear,
    parsed.endMonth - 1,
    parsed.endDay,
    23,
    59,
    59,
    999
  );

  return now >= start && now <= end;
}

function isCurrent(item: WeeklyComparisonItem) {
  if (item.isCurrentWeek || item.current) return true;
  return isDateWithinWeekLabel(item.label);
}

export default function WeeklyComparisonChart({
  items,
  title = "Planejado x executado por semana",
  subtitle,
}: Props) {
  return (
    <div className="rounded-3xl bg-white p-6 shadow-sm">
      <h2 className="text-2xl font-bold text-gray-900">{title}</h2>

      {subtitle ? <p className="mt-1 text-sm text-gray-500">{subtitle}</p> : null}

      <p className="mt-2 text-sm font-medium uppercase tracking-wide text-gray-400">
        Da semana mais recente para a mais antiga
      </p>

      <div className="mt-5 space-y-5">
        {items.map((item) => {
          const plannedKm = resolvePlannedKm(item);
          const actualKm = resolveActualKm(item);
          const adherencePct = resolveAdherencePct(item, actualKm, plannedKm);
          const progressPct = getProgressPct(actualKm, plannedKm);
          const currentWeek = Boolean(item.isCurrentWeek || isCurrent(item));

          return (
            <div
              key={item.label}
              className={`rounded-2xl border p-4 ${
                currentWeek
                  ? "border-orange-200 bg-orange-50/40"
                  : "border-gray-200 bg-gray-50"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-2">
                  <p className="text-lg font-semibold text-gray-900">
                    {item.label}
                  </p>

                  {currentWeek ? (
                    <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-700">
                      Atual
                    </span>
                  ) : null}
                </div>

                <p className="text-sm font-medium text-gray-700">
                  {actualKm.toFixed(1)} / {plannedKm.toFixed(1)} km
                </p>
              </div>

              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between text-sm text-gray-600">
                  <span>Progresso real</span>
                  <span>
                    {actualKm.toFixed(1)} / {plannedKm.toFixed(1)} km
                  </span>
                </div>

                <div className="h-4 overflow-hidden rounded-full bg-gray-200">
                  <div
                    className="h-full rounded-full bg-orange-500 transition-all"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>

                <div className="mt-3 text-sm text-gray-600">
                  {plannedKm > 0 ? (
                    actualKm >= plannedKm ? (
                      <p>
                        Meta semanal cumprida. Excedente de{" "}
                        {(actualKm - plannedKm).toFixed(1)} km.
                      </p>
                    ) : (
                      <p>
                        Faltam {(plannedKm - actualKm).toFixed(1)} km para cumprir
                        o planejado da semana.
                      </p>
                    )
                  ) : actualKm > 0 ? (
                    <p>Semana sem planejamento definido, mas houve execução.</p>
                  ) : (
                    <p>Semana sem planejamento e sem execução registrada.</p>
                  )}

                  <p className="mt-2">
                    Planejado: {plannedKm.toFixed(1)} km • Executado:{" "}
                    {actualKm.toFixed(1)} km
                  </p>

                  <p className="mt-1">{adherencePct.toFixed(0)}% de aderência</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}