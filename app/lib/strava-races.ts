import fs from "fs";
import path from "path";
import { getValidStravaAccessToken } from "./strava-auth";

export type StravaRaceActivity = {
  id: number;
  name: string;
  type: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  total_elevation_gain: number;
  start_date: string;
  start_date_local: string;
  timezone?: string;
  start_latlng?: [number, number] | null;
  location_city?: string | null;
  location_state?: string | null;
  location_country?: string | null;
};

export type RaceLikeEntry = {
  id: string;
  source: "strava";
  stravaId: number;
  name: string;
  date: string;
  city: string;
  state?: string;
  country: string;
  distanceKm: number;
  time: string;
  elevationGain: number;
  isOfficialRace: boolean;
};

type ReverseGeocodeResult = {
  city: string | null;
  state: string | null;
  country: string | null;
  status?: "ok" | "rate_limited";
  cachedAt?: number;
};

export const STATE_NAME_BY_UF: Record<string, string> = {
  AC: "Acre",
  AL: "Alagoas",
  AP: "Amapá",
  AM: "Amazonas",
  BA: "Bahia",
  CE: "Ceará",
  DF: "Distrito Federal",
  ES: "Espírito Santo",
  GO: "Goiás",
  MA: "Maranhão",
  MT: "Mato Grosso",
  MS: "Mato Grosso do Sul",
  MG: "Minas Gerais",
  PA: "Pará",
  PB: "Paraíba",
  PR: "Paraná",
  PE: "Pernambuco",
  PI: "Piauí",
  RJ: "Rio de Janeiro",
  RN: "Rio Grande do Norte",
  RS: "Rio Grande do Sul",
  RO: "Rondônia",
  RR: "Roraima",
  SC: "Santa Catarina",
  SP: "São Paulo",
  SE: "Sergipe",
  TO: "Tocantins",
};

const cachePath = path.join(process.cwd(), "app/data/geocode-cache.json");
const isProduction = process.env.NODE_ENV === "production";
const memoryCache: Record<string, ReverseGeocodeResult | null> = {};

const STRAVA_AFTER_EPOCH = Math.floor(
  new Date("2024-01-01T00:00:00Z").getTime() / 1000
);

const STRAVA_PER_PAGE = 200;
const STRAVA_MAX_PAGES = 20;
const GEOCODE_RATE_LIMIT_TTL_MS = 1000 * 60 * 30;

function normalizeText(value: string) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "")
    .replace(/[^a-zA-Z0-9\s/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function formatDuration(seconds: number) {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;

  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  return `${m}:${String(s).padStart(2, "0")}`;
}

function cleanState(value?: string | null) {
  if (!value) return undefined;

  const trimmed = value.trim();
  const upper = trimmed.toUpperCase();

  if (STATE_NAME_BY_UF[upper]) return upper;

  const aliases: Record<string, string> = {
    "distrito federal": "DF",
    goias: "GO",
    "rio de janeiro": "RJ",
    "sao paulo": "SP",
    parana: "PR",
    "minas gerais": "MG",
    "espirito santo": "ES",
    "mato grosso": "MT",
    "mato grosso do sul": "MS",
    bahia: "BA",
    sergipe: "SE",
    alagoas: "AL",
    pernambuco: "PE",
    paraiba: "PB",
    "rio grande do norte": "RN",
    ceara: "CE",
    piaui: "PI",
    maranhao: "MA",
    para: "PA",
    amapa: "AP",
    amazonas: "AM",
    roraima: "RR",
    rondonia: "RO",
    acre: "AC",
    tocantins: "TO",
    "santa catarina": "SC",
    "rio grande do sul": "RS",
  };

  const normalized = normalizeText(trimmed);
  if (aliases[normalized]) return aliases[normalized];

  const found = Object.entries(STATE_NAME_BY_UF).find(
    ([, fullName]) => normalizeText(fullName) === normalized
  );

  return found?.[0];
}

function cleanCountry(value?: string | null, timezone?: string | null) {
  if (value?.trim()) {
    const normalized = normalizeText(value);

    if (normalized === "brasil" || normalized === "brazil") return "Brasil";
    if (
      normalized === "alemanha" ||
      normalized === "germany" ||
      normalized === "deutschland"
    ) {
      return "Alemanha";
    }
    if (normalized === "portugal") return "Portugal";
    if (normalized === "peru") return "Peru";
    if (normalized === "argentina") return "Argentina";
    if (normalized === "paraguay" || normalized === "paraguai") return "Paraguai";
    if (normalized === "japan" || normalized === "japao") return "Japão";
    if (
      normalized === "united states" ||
      normalized === "united states of america" ||
      normalized === "estados unidos" ||
      normalized === "eua" ||
      normalized === "usa"
    ) {
      return "Estados Unidos";
    }
    if (
      normalized === "paises baixos" ||
      normalized === "netherlands" ||
      normalized === "holanda"
    ) {
      return "Países Baixos";
    }
    if (normalized === "france" || normalized === "franca") return "França";
    if (normalized === "spain" || normalized === "espanha") return "Espanha";
    if (normalized === "italy" || normalized === "italia") return "Itália";
    if (
      normalized === "united kingdom" ||
      normalized === "reino unido" ||
      normalized === "uk"
    ) {
      return "Reino Unido";
    }

    return value.trim();
  }

  const tz = normalizeText(timezone ?? "");

  if (tz.includes("america/sao_paulo")) return "Brasil";
  if (tz.includes("america/lima")) return "Peru";
  if (tz.includes("europe/lisbon")) return "Portugal";
  if (tz.includes("europe/berlin")) return "Alemanha";
  if (tz.includes("america/argentina")) return "Argentina";
  if (tz.includes("america/asuncion")) return "Paraguai";
  if (tz.includes("europe/amsterdam")) return "Países Baixos";
  if (tz.includes("asia/tokyo")) return "Japão";
  if (tz.includes("america/new_york")) return "Estados Unidos";

  return "Não identificado";
}

function cleanCity(value?: string | null) {
  if (!value?.trim()) return "Não identificado";
  return value.trim();
}

export function isRaceLikeActivity(activity: StravaRaceActivity) {
  if (activity.type !== "Run") return false;

  const name = activity.name?.trim();
  if (!name) return false;

  return /^prova\b/i.test(name);
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
  if (isProduction) {
    return memoryCache;
  }

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

    if (cached.status !== "rate_limited") {
      return cached;
    }
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
        "User-Agent": "strava-race-map/1.0",
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

function cleanDisplayedRaceName(name: string) {
  return name.replace(/^prova\b[:\s-]*/i, "").trim();
}

async function fetchAllStravaActivitiesSince2024(
  token: string
): Promise<StravaRaceActivity[]> {
  const allActivities: StravaRaceActivity[] = [];

  for (let page = 1; page <= STRAVA_MAX_PAGES; page++) {
    const url = new URL("https://www.strava.com/api/v3/athlete/activities");
    url.searchParams.set("per_page", String(STRAVA_PER_PAGE));
    url.searchParams.set("page", String(page));
    url.searchParams.set("after", String(STRAVA_AFTER_EPOCH));

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });

    if (!res.ok) break;

    const pageActivities = (await res.json()) as StravaRaceActivity[];

    if (!Array.isArray(pageActivities) || pageActivities.length === 0) break;

    allActivities.push(...pageActivities);

    if (pageActivities.length < STRAVA_PER_PAGE) break;
  }

  return allActivities;
}

export async function getRaceLikeActivitiesFromStrava(): Promise<RaceLikeEntry[]> {
  const token = await getValidStravaAccessToken();
  if (!token) return [];

  const activities = await fetchAllStravaActivitiesSince2024(token);
  const filtered = activities.filter(isRaceLikeActivity);

  const enriched = await Promise.all(
    filtered.map(async (activity) => {
      let geo: ReverseGeocodeResult | null = null;

      const stravaCity = cleanCity(activity.location_city);
      const stravaState = cleanState(activity.location_state);
      const stravaCountry = cleanCountry(
        activity.location_country,
        activity.timezone
      );

      const needsGeocode =
        !stravaState ||
        stravaCountry === "Não identificado" ||
        stravaCity === "Não identificado";

      if (needsGeocode && activity.start_latlng) {
        const [lat, lon] = activity.start_latlng;
        geo = await getOrFetchGeocode(lat, lon);
      }

      const city = cleanCity(activity.location_city ?? geo?.city);

      const state =
        cleanState(activity.location_state) ??
        cleanState(geo?.state) ??
        undefined;

      const country = cleanCountry(
        activity.location_country ?? geo?.country,
        activity.timezone
      );

      return {
        id: `strava-${activity.id}`,
        source: "strava" as const,
        stravaId: activity.id,
        name: cleanDisplayedRaceName(activity.name),
        date: activity.start_date_local,
        city,
        state,
        country,
        distanceKm: Number((activity.distance / 1000).toFixed(2)),
        time: formatDuration(activity.moving_time),
        elevationGain: Math.round(activity.total_elevation_gain || 0),
        isOfficialRace: true,
      };
    })
  );

  return enriched.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}

export function groupStravaRacesByStateBrazil(list: RaceLikeEntry[]) {
  const brazil = list.filter(
    (race) => normalizeText(race.country) === "brasil" && race.state
  );

  const grouped = brazil.reduce<Record<string, RaceLikeEntry[]>>((acc, race) => {
    const key = race.state as string;
    if (!acc[key]) acc[key] = [];
    acc[key].push(race);
    return acc;
  }, {});

  return Object.entries(grouped)
    .map(([state, races]) => ({
      state,
      stateName: STATE_NAME_BY_UF[state] ?? state,
      count: races.length,
      races,
    }))
    .sort((a, b) => b.count - a.count || a.state.localeCompare(b.state));
}

export function groupStravaRacesByCountry(list: RaceLikeEntry[]) {
  const grouped = list.reduce<Record<string, RaceLikeEntry[]>>((acc, race) => {
    const key = race.country;
    if (!acc[key]) acc[key] = [];
    acc[key].push(race);
    return acc;
  }, {});

  return Object.entries(grouped)
    .map(([country, races]) => ({
      country,
      count: races.length,
      races,
    }))
    .sort((a, b) => b.count - a.count || a.country.localeCompare(b.country));
}

export function getStravaRaceStats(list: RaceLikeEntry[]) {
  const countries = new Set(list.map((race) => race.country));
  const brazilStates = new Set(
    list
      .filter((race) => normalizeText(race.country) === "brasil" && race.state)
      .map((race) => race.state)
  );

  return {
    totalRaces: list.length,
    countriesCount: countries.size,
    statesCount: brazilStates.size,
  };
}

export function getBrazilStateCountsFromStrava(list: RaceLikeEntry[]) {
  const grouped = groupStravaRacesByStateBrazil(list);
  const counts: Record<string, number> = {};

  grouped.forEach((item) => {
    counts[normalizeText(item.stateName)] = item.count;
    counts[normalizeText(item.state)] = item.count;
  });

  return counts;
}

export function getCountryCountsFromStrava(list: RaceLikeEntry[]) {
  const grouped = groupStravaRacesByCountry(list);
  const counts: Record<string, number> = {};

  grouped.forEach((item) => {
    counts[normalizeText(item.country)] = item.count;
  });

  return counts;
}