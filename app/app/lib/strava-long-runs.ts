import fs from "fs";
import path from "path";
import { getActivityDate } from "./date-utils";

type ActivityLike = {
  id: number | string;
  name?: string;
  type?: string;
  distance?: number | null;
  moving_time?: number | null;
  elapsed_time?: number | null;
  total_elevation_gain?: number | null;
  average_heartrate?: number | null;
  max_heartrate?: number | null;
  start_date?: string | null;
  start_date_local?: string | null;
  location_city?: string | null;
  location_state?: string | null;
  start_latlng?: [number, number] | [] | null;
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
  adjustedPaceSecPerKm: number | null;
  elevationFactor: number;
  efficiency: number | null;
};

export type LongRunSummary = {
  totalLongRuns: number;
  longestRunKm: number;
  averageDistanceKm: number;
  averagePaceSecPerKm: number | null;
  averageAdjustedPaceSecPerKm: number | null;
  averageHeartrate: number | null;
  averageElevationGain: number;
  averageElevationFactor: number;
  averageEfficiency: number | null;
  bestEfficiency: number | null;
  lastLongRun: LongRunEntry | null;
};

type ReverseGeocodeResult = {
  city: string | null;
  state: string | null;
  country: string | null;
  status?: "ok" | "rate_limited";
  cachedAt?: number;
};

const cachePath = path.join(process.cwd(), "app/data/geocode-cache.json");
const isProduction = process.env.NODE_ENV === "production";
const memoryCache: Record<string, ReverseGeocodeResult | null> = {};
const GEOCODE_RATE_LIMIT_TTL_MS = 1000 * 60 * 30;

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

function cleanCity(value?: string | null) {
  if (!value?.trim()) return "Não identificado";
  return value.trim();
}

function cleanState(value?: string | null) {
  if (!value?.trim()) return "";
  return value.trim();
}

function coordKey(lat: number, lon: number) {
  return `${lat.toFixed(3)},${lon.toFixed(3)}`;
}

function ensureCacheDir() {
  const dir = path.dirname(cachePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadFileCache(): Record<string, ReverseGeocodeResult | null> {
  if (isProduction) return memoryCache;

  try {
    ensureCacheDir();

    if (!fs.existsSync(cachePath)) {
      fs.writeFileSync(cachePath, "{}");
      return {};
    }

    return JSON.parse(fs.readFileSync(cachePath, "utf-8"));
  } catch {
    return {};
  }
}

function saveFileCache(cache: Record<string, ReverseGeocodeResult | null>) {
  if (isProduction) {
    Object.assign(memoryCache, cache);
    return;
  }

  try {
    ensureCacheDir();
    fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));
  } catch (error) {
    console.warn("Erro ao salvar geocode-cache.json:", error);
  }
}

async function getOrFetchGeocode(
  lat: number,
  lon: number
): Promise<ReverseGeocodeResult | null> {
  const key = coordKey(lat, lon);
  const cache = loadFileCache();
  const cached = cache[key];

  if (cached) {
    if (
      cached.status === "rate_limited" &&
      cached.cachedAt &&
      Date.now() - cached.cachedAt < GEOCODE_RATE_LIMIT_TTL_MS
    ) {
      return null;
    }

    if (cached.status !== "rate_limited") return cached;
  }

  try {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("format", "json");
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lon));
    url.searchParams.set("zoom", "10");
    url.searchParams.set("addressdetails", "1");

    const res = await fetch(url.toString(), {
      headers: {
        "User-Agent": "strava-long-runs/1.0",
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (res.status === 429) {
      cache[key] = {
        city: null,
        state: null,
        country: null,
        status: "rate_limited",
        cachedAt: Date.now(),
      };
      saveFileCache(cache);
      return null;
    }

    if (!res.ok) {
      cache[key] = null;
      saveFileCache(cache);
      return null;
    }

    const data = await res.json();

    const result: ReverseGeocodeResult = {
      city:
        data?.address?.city ||
        data?.address?.town ||
        data?.address?.village ||
        data?.address?.municipality ||
        null,
      state:
        data?.address?.state ||
        data?.address?.region ||
        data?.address?.state_district ||
        null,
      country: data?.address?.country || null,
      status: "ok",
      cachedAt: Date.now(),
    };

    cache[key] = result;
    saveFileCache(cache);

    return result;
  } catch {
    return null;
  }
}

async function resolveActivityLocation(activity: ActivityLike) {
  const stravaCity = cleanCity(activity.location_city);
  const stravaState = cleanState(activity.location_state);

  if (stravaCity !== "Não identificado") {
    return {
      city: stravaCity,
      state: stravaState,
    };
  }

  const coords = activity.start_latlng;

  if (Array.isArray(coords) && coords.length === 2) {
    const [lat, lon] = coords;

    if (
      typeof lat === "number" &&
      typeof lon === "number" &&
      Number.isFinite(lat) &&
      Number.isFinite(lon)
    ) {
      const geo = await getOrFetchGeocode(lat, lon);

      return {
        city: cleanCity(geo?.city),
        state: cleanState(geo?.state),
      };
    }
  }

  return {
    city: "Não identificado",
    state: "",
  };
}

export function isLongRunActivityName(name?: string | null) {
  const normalized = normalizeText(name ?? "");
  return normalized.includes("longao");
}

export function formatLongRunPace(paceSecPerKm: number | null) {
  if (!paceSecPerKm || !Number.isFinite(paceSecPerKm)) return "-";

  const min = Math.floor(paceSecPerKm / 60);
  const sec = Math.round(paceSecPerKm % 60);

  if (sec === 60) return `${min + 1}:00/km`;

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

export function calculateElevationFactor(
  distanceKm: number,
  elevationGain: number
) {
  if (!distanceKm || distanceKm <= 0 || !elevationGain || elevationGain <= 0) {
    return 1;
  }

  return 1 + elevationGain / (distanceKm * 100);
}

export function calculateAdjustedPace(
  paceSecPerKm: number | null,
  distanceKm: number,
  elevationGain: number
) {
  if (!paceSecPerKm || !Number.isFinite(paceSecPerKm)) return null;

  const elevationFactor = calculateElevationFactor(distanceKm, elevationGain);
  return paceSecPerKm / elevationFactor;
}

export function calculateEfficiency(
  distanceKm: number,
  movingTimeSec: number,
  averageHeartrate: number | null,
  elevationGain = 0
) {
  if (!averageHeartrate || averageHeartrate <= 0) return null;
  if (!distanceKm || distanceKm <= 0 || !movingTimeSec || movingTimeSec <= 0) {
    return null;
  }

  const rawSpeedKmh = distanceKm / (movingTimeSec / 3600);
  const elevationFactor = calculateElevationFactor(distanceKm, elevationGain);
  const adjustedSpeedKmh = rawSpeedKmh * elevationFactor;

  return (adjustedSpeedKmh / averageHeartrate) * 1000;
}

export async function getLongRunsFromActivities(
  activities: ActivityLike[]
): Promise<LongRunEntry[]> {
  const longRuns = await Promise.all(
    activities
      .filter((activity) => activity.type === "Run")
      .filter((activity) => isLongRunActivityName(activity.name))
      .map(async (activity) => {
        const location = await resolveActivityLocation(activity);

        const distanceKm = safeNumber(activity.distance) / 1000;
        const movingTimeSec = safeNumber(activity.moving_time);
        const elevationGain = safeNumber(activity.total_elevation_gain);

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
          distanceKm > 0 && movingTimeSec > 0
            ? movingTimeSec / distanceKm
            : null;

        const elevationFactor = calculateElevationFactor(
          distanceKm,
          elevationGain
        );

        const adjustedPaceSecPerKm = calculateAdjustedPace(
          paceSecPerKm,
          distanceKm,
          elevationGain
        );

        return {
          id: activity.id,
          name: activity.name ?? "Longão",
          date: getActivityDate(activity),
          city: location.city,
          state: location.state,
          distanceKm,
          movingTimeSec,
          elevationGain,
          averageHeartrate,
          maxHeartrate,
          paceSecPerKm,
          adjustedPaceSecPerKm,
          elevationFactor,
          efficiency: calculateEfficiency(
            distanceKm,
            movingTimeSec,
            averageHeartrate,
            elevationGain
          ),
        };
      })
  );

  return longRuns.sort((a, b) => parseDateValue(b.date) - parseDateValue(a.date));
}

function average(numbers: number[]) {
  if (numbers.length === 0) return 0;
  return numbers.reduce((acc, value) => acc + value, 0) / numbers.length;
}

function averageNullable(numbers: Array<number | null>) {
  const valid = numbers.filter(
    (value): value is number =>
      typeof value === "number" && Number.isFinite(value)
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
      averageAdjustedPaceSecPerKm: null,
      averageHeartrate: null,
      averageElevationGain: 0,
      averageElevationFactor: 1,
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

  const averageAdjustedPaceSecPerKm = averageNullable(
    longRuns.map((run) => run.adjustedPaceSecPerKm)
  );

  const averageHeartrate = averageNullable(
    longRuns.map((run) => run.averageHeartrate)
  );

  const averageElevationGain = average(longRuns.map((run) => run.elevationGain));

  const averageElevationFactor = average(
    longRuns.map((run) => run.elevationFactor)
  );

  const averageEfficiency = averageNullable(
    longRuns.map((run) => run.efficiency)
  );

  const bestEfficiency = Math.max(...longRuns.map((run) => run.efficiency ?? 0));

  return {
    totalLongRuns: longRuns.length,
    longestRunKm,
    averageDistanceKm,
    averagePaceSecPerKm,
    averageAdjustedPaceSecPerKm,
    averageHeartrate,
    averageElevationGain,
    averageElevationFactor,
    averageEfficiency,
    bestEfficiency: bestEfficiency > 0 ? bestEfficiency : null,
    lastLongRun: longRuns[0] ?? null,
  };
}