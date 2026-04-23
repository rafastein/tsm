type Race = {
  id: number | string;
  name: string;
  distanceKm: number;
  movingTime?: number;
  elapsed_time?: number;
  start_date?: string;
  start_date_local?: string;
  city?: string;
  state?: string;
  country?: string;
};

export async function getRaceLikeActivitiesFromStrava(): Promise<Race[]> {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/strava/activities`, {
      cache: "no-store",
    });

    const data = await res.json();

    return data.map((a: any) => ({
      id: a.id,
      name: a.name,
      distanceKm: a.distance / 1000,
      movingTime: a.moving_time,
      elapsed_time: a.elapsed_time,
      start_date: a.start_date,
      start_date_local: a.start_date_local,
      city: a.city,
      state: a.state,
      country: a.country,
    }));
  } catch (e) {
    console.error("Erro ao buscar atividades:", e);
    return [];
  }
}

export function getStravaRaceStats(races: Race[]) {
  const countries = new Set(races.map((r) => r.country).filter(Boolean));

  return {
    totalRaces: races.length,
    countriesCount: countries.size,
  };
}

export function groupStravaRacesByCountry(races: Race[]) {
  const map = new Map<string, Race[]>();

  races.forEach((race) => {
    const country = race.country || "Desconhecido";

    if (!map.has(country)) {
      map.set(country, []);
    }

    map.get(country)!.push(race);
  });

  return Array.from(map.entries()).map(([country, races]) => ({
    country,
    count: races.length,
    races,
  }));
}

export function groupStravaRacesByStateBrazil(races: Race[]) {
  const map = new Map<string, Race[]>();

  races.forEach((race) => {
    if (!race.state) return;

    const state = race.state;

    if (!map.has(state)) {
      map.set(state, []);
    }

    map.get(state)!.push(race);
  });

  return Array.from(map.entries()).map(([state, races]) => ({
    state,
    count: races.length,
    races,
  }));
}

export function getCountryCountsFromStrava(races: Race[]) {
  const counts: Record<string, number> = {};

  races.forEach((race) => {
    const country = race.country || "Unknown";

    counts[country] = (counts[country] || 0) + 1;
  });

  return counts;
}

export function getBrazilStateCountsFromStrava(races: Race[]) {
  const counts: Record<string, number> = {};

  races.forEach((race) => {
    if (!race.state) return;

    counts[race.state] = (counts[race.state] || 0) + 1;
  });

  return counts;
}