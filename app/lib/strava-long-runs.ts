type ActivityLike = {
  id: number | string;
  name?: string;
  type?: string;
  distance?: number | null; // metros
  moving_time?: number | null; // segundos
  elapsed_time?: number | null;
  total_elevation_gain?: number | null;
  average_heartrate?: number | null;
  max_heartrate?: number | null;
  start_date?: string | null;
  start_date_local?: string | null;
  location_city?: string | null;
  location_state?: string | null;
};

export type LongRunEntry = {
  id: number | string;
  name: string;
  date: string;
  city: string;
  state: string;
  distanceKm: number;
  movingTimeSec: number;
  elevationGain: number;
  averageHeartrate: number | null;
  maxHeartrate: number | null;
  paceSecPerKm: number | null;
  efficiency: number | null; // km/h por bpm
};

export type LongRunSummary = {
  totalLongRuns: number;
  longestRunKm: number;
  averageDistanceKm: number;
  averagePaceSecPerKm: number | null;
  averageHeartrate: number | null;
  averageElevationGain: number;
  averageEfficiency: number | null;
  bestEfficiency: number | null;
  lastLongRun: LongRunEntry | null;
};

function normalizeText(value: string) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function safeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function parseDateValue(value?: string | null) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

export function isLongRunActivityName(name?: string | null) {
  const normalized = normalizeText(name ?? "");
  return normalized.includes("longao");
}

export function formatLongRunPace(paceSecPerKm: number | null) {
  if (!paceSecPerKm || !Number.isFinite(paceSecPerKm)) return "-";

  const min = Math.floor(paceSecPerKm / 60);
  const sec = Math.round(paceSecPerKm % 60);

  if (sec === 60) {
    return `${min + 1}:00/km`;
  }

  return `${min}:${String(sec).padStart(2, "0")}/km`;
}

export function formatLongRunDuration(seconds: number) {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;

  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatEfficiency(value: number | null) {
  if (!value || !Number.isFinite(value)) return "-";
  return value.toFixed(3);
}

export function calculateEfficiency(
  distanceKm: number,
  movingTimeSec: number,
  averageHeartrate: number | null
) {
  if (!averageHeartrate || averageHeartrate <= 0) return null;
  if (!distanceKm || distanceKm <= 0 || !movingTimeSec || movingTimeSec <= 0) {
    return null;
  }

  const speedKmh = distanceKm / (movingTimeSec / 3600);
  return speedKmh / averageHeartrate;
}

export function getLongRunsFromActivities(
  activities: ActivityLike[]
): LongRunEntry[] {
  return activities
    .filter((activity) => activity.type === "Run")
    .filter((activity) => isLongRunActivityName(activity.name))
    .map((activity) => {
      const distanceKm = safeNumber(activity.distance) / 1000;
      const movingTimeSec = safeNumber(activity.moving_time);
      const averageHeartrate =
        typeof activity.average_heartrate === "number" &&
        Number.isFinite(activity.average_heartrate)
          ? activity.average_heartrate
          : null;

      const maxHeartrate =
        typeof activity.max_heartrate === "number" &&
        Number.isFinite(activity.max_heartrate)
          ? activity.max_heartrate
          : null;

      const paceSecPerKm =
        distanceKm > 0 && movingTimeSec > 0 ? movingTimeSec / distanceKm : null;

      return {
        id: activity.id,
        name: activity.name ?? "Longão",
        date: String(activity.start_date_local ?? activity.start_date ?? ""),
        city: String(activity.location_city ?? "Não identificado"),
        state: String(activity.location_state ?? ""),
        distanceKm,
        movingTimeSec,
        elevationGain: safeNumber(activity.total_elevation_gain),
        averageHeartrate,
        maxHeartrate,
        paceSecPerKm,
        efficiency: calculateEfficiency(
          distanceKm,
          movingTimeSec,
          averageHeartrate
        ),
      };
    })
    .sort((a, b) => parseDateValue(b.date) - parseDateValue(a.date));
}

function average(numbers: number[]) {
  if (numbers.length === 0) return 0;
  return numbers.reduce((acc, value) => acc + value, 0) / numbers.length;
}

function averageNullable(numbers: Array<number | null>) {
  const valid = numbers.filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value)
  );

  if (valid.length === 0) return null;
  return average(valid);
}

export function getLongRunSummary(longRuns: LongRunEntry[]): LongRunSummary {
  if (longRuns.length === 0) {
    return {
      totalLongRuns: 0,
      longestRunKm: 0,
      averageDistanceKm: 0,
      averagePaceSecPerKm: null,
      averageHeartrate: null,
      averageElevationGain: 0,
      averageEfficiency: null,
      bestEfficiency: null,
      lastLongRun: null,
    };
  }

  const longestRunKm = Math.max(...longRuns.map((run) => run.distanceKm));
  const averageDistanceKm = average(longRuns.map((run) => run.distanceKm));
  const averagePaceSecPerKm = averageNullable(
    longRuns.map((run) => run.paceSecPerKm)
  );
  const averageHeartrate = averageNullable(
    longRuns.map((run) => run.averageHeartrate)
  );
  const averageElevationGain = average(
    longRuns.map((run) => run.elevationGain)
  );
  const averageEfficiency = averageNullable(
    longRuns.map((run) => run.efficiency)
  );
  const bestEfficiency = Math.max(
    ...longRuns.map((run) => run.efficiency ?? 0)
  );

  return {
    totalLongRuns: longRuns.length,
    longestRunKm,
    averageDistanceKm,
    averagePaceSecPerKm,
    averageHeartrate,
    averageElevationGain,
    averageEfficiency,
    bestEfficiency: bestEfficiency > 0 ? bestEfficiency : null,
    lastLongRun: longRuns[0] ?? null,
  };
}