// ==============================
// TYPES
// ==============================

export type StravaActivity = {
  id: number | string;
  name: string;
  distance: number; // metros
  moving_time: number;
  elapsed_time?: number;
  start_date: string;
  start_date_local: string;
  location_city?: string | null;
  location_state?: string | null;
  location_country?: string | null;
  timezone?: string | null;
};

// ==============================
// HELPERS
// ==============================

function normalizeText(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function formatKm(meters: number) {
  return (meters / 1000).toFixed(2);
}

function formatTime(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;

  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatPace(distanceMeters: number, seconds: number) {
  const pace = seconds / (distanceMeters / 1000);
  const min = Math.floor(pace / 60);
  const sec = Math.round(pace % 60);
  return `${min}:${String(sec).padStart(2, "0")}/km`;
}

// ==============================
// COUNTRY NORMALIZATION
// ==============================

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

    if (
      normalized.includes("paraguay") ||
      normalized.includes("paraguai")
    ) {
      return "Paraguai";
    }

    if (
      normalized === "japan" ||
      normalized === "japao" ||
      normalized === "japão"
    ) {
      return "Japão";
    }

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

// ==============================
// MAIN FILTER (PROVAS)
// ==============================

export function getRaceLikeActivitiesFromStrava(
  activities: StravaActivity[]
) {
  console.log("STRAVA total atividades desde 2024:", activities.length);

  const races = activities.filter((a) => {
    const name = normalizeText(a.name);

    if (name.includes("corrida matinal")) return false;
    if (name.includes("corrida noturna")) return false;
    if (name.includes("corrida na hora do almoco")) return false;

    return true;
  });

  console.log("STRAVA após filtro:", races.length);

  return races;
}

// ==============================
// GROUP WORLD
// ==============================

export function groupStravaRacesByCountry(
  races: StravaActivity[]
) {
  const grouped: Record<string, any[]> = {};

  races.forEach((r) => {
    const country = cleanCountry(
      r.location_country,
      r.timezone
    );

    if (!grouped[country]) grouped[country] = [];

    grouped[country].push({
      ...r,
      km: formatKm(r.distance),
      time: formatTime(r.moving_time),
      pace: formatPace(r.distance, r.moving_time),
      city:
        r.location_city ||
        r.location_state ||
        "Não identificado",
    });
  });

  return grouped;
}

// ==============================
// STATS
// ==============================

export function getStravaRaceStats(
  grouped: Record<string, any[]>
) {
  const countries = Object.keys(grouped);

  const total = countries.reduce(
    (acc, c) => acc + grouped[c].length,
    0
  );

  const leader =
    countries.sort(
      (a, b) => grouped[b].length - grouped[a].length
    )[0] || "-";

  return {
    total,
    countries: countries.length,
    leader,
  };
}