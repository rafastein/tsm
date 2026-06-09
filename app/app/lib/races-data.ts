export type RaceEntry = {
  id: string;
  name: string;
  date: string; // YYYY-MM-DD
  city: string;
  state?: string;
  country: string;
  distanceKm: number;
  time?: string;
  isOfficialRace: boolean;
  category?: "5k" | "10k" | "15k" | "21k" | "30k" | "42k" | "other";
};

export const races: RaceEntry[] = [
  {
    id: "meia-rio-2025",
    name: "Meia Maratona do Rio",
    date: "2025-06-21",
    city: "Rio de Janeiro",
    state: "RJ",
    country: "Brasil",
    distanceKm: 21.1,
    time: "1:52:05",
    isOfficialRace: true,
    category: "21k",
  },
  {
    id: "meia-monumental-2025",
    name: "Meia Maratona Monumental",
    date: "2025-11-23",
    city: "Brasília",
    state: "DF",
    country: "Brasil",
    distanceKm: 21.1,
    time: "1:59:20",
    isOfficialRace: true,
    category: "21k",
  },
  {
    id: "meia-lisboa-2026",
    name: "Meia de Lisboa",
    date: "2026-03-08",
    city: "Lisboa",
    country: "Portugal",
    distanceKm: 21.1,
    time: "1:38:30",
    isOfficialRace: true,
    category: "21k",
  },
  {
    id: "meia-berlim-2026",
    name: "Generali Berliner Halbmarathon",
    date: "2026-03-29",
    city: "Berlim",
    country: "Alemanha",
    distanceKm: 21.1,
    time: "1:38:09",
    isOfficialRace: true,
    category: "21k",
  },
  {
    id: "meia-sp-2026",
    name: "Meia Maratona Internacional de São Paulo",
    date: "2026-04-12",
    city: "São Paulo",
    state: "SP",
    country: "Brasil",
    distanceKm: 21.1,
    time: "1:49:26",
    isOfficialRace: true,
    category: "21k",
  },
  {
    id: "live-21k-10k-2026",
    name: "LIVE! 21K XP",
    date: "2026-04-19",
    city: "Brasília",
    state: "DF",
    country: "Brasil",
    distanceKm: 10,
    isOfficialRace: true,
    category: "10k",
  },
  {
    id: "100-voce-2026",
    name: "Corrida 100% Você",
    date: "2026-05-01",
    city: "Brasília",
    state: "DF",
    country: "Brasil",
    distanceKm: 10,
    isOfficialRace: true,
    category: "10k",
  },
  {
    id: "meia-lima-2026",
    name: "Meia de Lima",
    date: "2026-05-24",
    city: "Lima",
    country: "Peru",
    distanceKm: 21.1,
    isOfficialRace: true,
    category: "21k",
  },
  {
    id: "meia-rio-2026",
    name: "Meia Maratona do Rio",
    date: "2026-06-06",
    city: "Rio de Janeiro",
    state: "RJ",
    country: "Brasil",
    distanceKm: 21.1,
    isOfficialRace: true,
    category: "21k",
  },
  {
    id: "praia-grande-2026",
    name: "Maratona Internacional de Praia Grande",
    date: "2026-06-21",
    city: "Praia Grande",
    state: "SP",
    country: "Brasil",
    distanceKm: 10,
    isOfficialRace: true,
    category: "10k",
  },
  {
    id: "cats-run-2026",
    name: "Cats Run",
    date: "2026-07-12",
    city: "Brasília",
    state: "DF",
    country: "Brasil",
    distanceKm: 5,
    isOfficialRace: true,
    category: "5k",
  },
  {
    id: "asics-run-challenge-2026",
    name: "Asics Run Challenge",
    date: "2026-07-26",
    city: "Brasília",
    state: "DF",
    country: "Brasil",
    distanceKm: 15,
    isOfficialRace: true,
    category: "15k",
  },
  {
    id: "meia-chapada-2026",
    name: "Meia da Chapada",
    date: "2026-08-01",
    city: "Chapada dos Veadeiros",
    state: "GO",
    country: "Brasil",
    distanceKm: 21.1,
    isOfficialRace: true,
    category: "21k",
  },
  {
    id: "tf-conjunto-2026",
    name: "Track & Field Run Series Conjunto",
    date: "2026-08-16",
    city: "Brasília",
    state: "DF",
    country: "Brasil",
    distanceKm: 15,
    isOfficialRace: true,
    category: "15k",
  },
  {
    id: "quatro-poderes-2026",
    name: "Quatro Poderes Run",
    date: "2026-08-22",
    city: "Brasília",
    state: "DF",
    country: "Brasil",
    distanceKm: 6,
    isOfficialRace: true,
    category: "other",
  },
  {
    id: "run-the-bridge-2026",
    name: "Run The Bridge",
    date: "2026-08-30",
    city: "Brasília",
    state: "DF",
    country: "Brasil",
    distanceKm: 30,
    isOfficialRace: true,
    category: "30k",
  },
  {
    id: "buenos-aires-2026",
    name: "Maratona de Buenos Aires",
    date: "2026-09-20",
    city: "Buenos Aires",
    country: "Argentina",
    distanceKm: 42.2,
    isOfficialRace: true,
    category: "42k",
  },
];

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

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

export function sortRacesDesc(list: RaceEntry[]) {
  return [...list].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}

export function groupByStateBrazil(list: RaceEntry[]) {
  const brazil = list.filter((race) => race.country === "Brasil" && race.state);

  const grouped = brazil.reduce<Record<string, RaceEntry[]>>((acc, race) => {
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
      races: sortRacesDesc(races),
    }))
    .sort((a, b) => b.count - a.count || a.state.localeCompare(b.state));
}

export function groupByCountry(list: RaceEntry[]) {
  const grouped = list.reduce<Record<string, RaceEntry[]>>((acc, race) => {
    const key = race.country;
    if (!acc[key]) acc[key] = [];
    acc[key].push(race);
    return acc;
  }, {});

  return Object.entries(grouped)
    .map(([country, races]) => ({
      country,
      count: races.length,
      races: sortRacesDesc(races),
    }))
    .sort((a, b) => b.count - a.count || a.country.localeCompare(b.country));
}

export function getRaceStats(list: RaceEntry[]) {
  const official = list.filter((race) => race.isOfficialRace);
  const countries = new Set(list.map((race) => race.country));
  const brazilStates = new Set(
    list.filter((race) => race.country === "Brasil" && race.state).map((race) => race.state)
  );

  return {
    totalRaces: list.length,
    officialRaces: official.length,
    countriesCount: countries.size,
    statesCount: brazilStates.size,
  };
}

export function getBrazilStateCounts(list: RaceEntry[]) {
  const grouped = groupByStateBrazil(list);
  const counts: Record<string, number> = {};

  grouped.forEach((item) => {
    counts[normalizeText(item.stateName)] = item.count;
    counts[normalizeText(item.state)] = item.count;
  });

  return counts;
}

export function getCountryCounts(list: RaceEntry[]) {
  const grouped = groupByCountry(list);
  const counts: Record<string, number> = {};

  grouped.forEach((item) => {
    counts[normalizeText(item.country)] = item.count;
  });

  return counts;
}