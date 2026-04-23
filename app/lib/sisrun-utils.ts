import fs from "fs/promises";
import path from "path";

export type SisrunRow = {
  date: string;
  plannedDistanceKm: number;
  completedDistanceKm: number;
  minPlannedTime: string | null;
  maxPlannedTime: string | null;
};

export type SisrunWeek = {
  weekStart: string;
  weekEnd: string;
  totalPlannedKm: number;
  longRunPlannedKm: number;
};

export type SisrunParsedData = {
  rows: SisrunRow[];
  weeks: SisrunWeek[];
};

export type WeeklyComparisonItem = {
  key: string;
  label: string;
  plannedKm: number;
  executedKm: number;
  adherencePct: number | null;
};

function getActivityDate(activity: any): Date | null {
  const raw = activity.start_date_local ?? activity.start_date;
  if (!raw) return null;

  // Strava start_date_local vem como horário local, mas às vezes com "Z".
  // Aqui a gente interpreta como data local, sem deixar o JS deslocar o dia.
  if (activity.start_date_local) {
    const match = String(raw).match(
      /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/
    );

    if (match) {
      const [, y, m, d, h, min, s] = match;
      return new Date(
        Number(y),
        Number(m) - 1,
        Number(d),
        Number(h),
        Number(min),
        Number(s)
      );
    }
  }

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function getTodayBrazilDate() {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const [y, m, d] = parts.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function getDateKey(date: Date) {
  return date.toLocaleDateString("sv-SE");
}

export async function getSisrunData(): Promise<SisrunParsedData | null> {
  try {
    const filePath = path.join(process.cwd(), "data", "sisrun-latest.json");
    const content = await fs.readFile(filePath, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

export function parseBrDate(dateStr: string) {
  if (!dateStr || typeof dateStr !== "string") return null;

  const clean = dateStr.trim();
  const match = clean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;

  const [, d, m, y] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d));

  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export function getWeekStart(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;

  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);

  return d;
}

export function getWeekEnd(date: Date) {
  const d = new Date(getWeekStart(date));
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);

  return d;
}

export function formatWeekLabel(date: Date) {
  const start = getWeekStart(date);
  const end = getWeekEnd(date);

  const startLabel = start.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });

  const endLabel = end.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  });

  return `${startLabel}–${endLabel}`;
}

export function getCurrentWeek(data: SisrunParsedData | null) {
  if (!data?.weeks?.length) return null;

  const today = getTodayBrazilDate();

  return (
    data.weeks.find((w) => {
      const start = parseBrDate(w.weekStart);
      const end = parseBrDate(w.weekEnd);

      if (!start || !end) return false;

      const endWithTime = new Date(end);
      endWithTime.setHours(23, 59, 59, 999);

      return today >= start && today <= endWithTime;
    }) ?? data.weeks[data.weeks.length - 1]
  );
}

export function getTodaySisrunRow(data: SisrunParsedData | null) {
  if (!data?.rows?.length) return null;

  const today = getTodayBrazilDate().toLocaleDateString("pt-BR");
  return data.rows.find((r) => r.date === today) ?? null;
}

export function getCurrentWeekStravaKm(activities: any[]) {
  const currentWeekKey = getWeekStart(getTodayBrazilDate()).toISOString();

  return Number(
    activities
      .filter((a) => a.type === "Run")
      .filter((a) => {
        const date = getActivityDate(a);
        if (!date) return false;

        return getWeekStart(date).toISOString() === currentWeekKey;
      })
      .reduce((sum, a) => sum + a.distance / 1000, 0)
      .toFixed(1)
  );
}

export function getTodayStravaKm(activities: any[]) {
  const todayKey = getDateKey(getTodayBrazilDate());

  return Number(
    activities
      .filter((a) => a.type === "Run")
      .filter((a) => {
        const date = getActivityDate(a);
        if (!date) return false;

        return getDateKey(date) === todayKey;
      })
      .reduce((sum, a) => sum + a.distance / 1000, 0)
      .toFixed(1)
  );
}

export function getCurrentWeekLongestRunKm(activities: any[]) {
  const currentWeekKey = getWeekStart(getTodayBrazilDate()).toISOString();

  const runs = activities
    .filter((a) => a.type === "Run")
    .filter((a) => {
      const date = getActivityDate(a);
      if (!date) return false;

      return getWeekStart(date).toISOString() === currentWeekKey;
    });

  if (!runs.length) return 0;

  return Number(Math.max(...runs.map((a) => a.distance / 1000)).toFixed(1));
}

function getLastWeekAllowedInCurrentMonth() {
  const today = getTodayBrazilDate();
  const currentMonth = today.getMonth();
  const currentYear = today.getFullYear();

  const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0);
  return getWeekStart(lastDayOfMonth).getTime();
}

export function buildWeeklyComparison(
  sisrunData: SisrunParsedData | null,
  activities: any[],
  limit = 6
): WeeklyComparisonItem[] {
  const map = new Map<string, WeeklyComparisonItem>();
  const maxAllowedWeekStart = getLastWeekAllowedInCurrentMonth();

  sisrunData?.rows?.forEach((row) => {
    const date = parseBrDate(row.date);
    if (!date) return;

    const weekStart = getWeekStart(date);
    if (weekStart.getTime() > maxAllowedWeekStart) return;

    const key = weekStart.toISOString();

    if (!map.has(key)) {
      map.set(key, {
        key,
        label: formatWeekLabel(weekStart),
        plannedKm: 0,
        executedKm: 0,
        adherencePct: null,
      });
    }

    map.get(key)!.plannedKm += row.plannedDistanceKm || 0;
  });

  activities
    .filter((a) => a.type === "Run")
    .forEach((a) => {
      const activityDate = getActivityDate(a);
      if (!activityDate) return;

      const weekStart = getWeekStart(activityDate);
      if (weekStart.getTime() > maxAllowedWeekStart) return;

      const key = weekStart.toISOString();

      if (!map.has(key)) {
        map.set(key, {
          key,
          label: formatWeekLabel(weekStart),
          plannedKm: 0,
          executedKm: 0,
          adherencePct: null,
        });
      }

      map.get(key)!.executedKm += a.distance / 1000;
    });

  return Array.from(map.values())
    .map((item) => {
      const plannedKm = Number(item.plannedKm.toFixed(1));
      const executedKm = Number(item.executedKm.toFixed(1));

      return {
        ...item,
        plannedKm,
        executedKm,
        isCurrentWeek:
  getWeekStart(getTodayBrazilDate()).toISOString() === item.key,
        adherencePct:
          plannedKm > 0
            ? Number(((executedKm / plannedKm) * 100).toFixed(0))
            : null,
      };
    })
    .filter((item) => item.plannedKm > 0 || item.executedKm > 0)
    .sort((a, b) => new Date(b.key).getTime() - new Date(a.key).getTime())
    .slice(0, limit);
}