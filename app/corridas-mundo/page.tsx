export const dynamic = "force-dynamic";

import Link from "next/link";
import { formatBRDate } from "../lib/date-utils";
import WorldRaceMap from "../components/WorldRaceMap";
import {
  getRaceLikeActivitiesFromStrava,
  groupStravaRacesByCountry,
  getStravaRaceStats,
  getCountryCountsFromStrava,
  formatRacePace,
  formatRaceEfficiency,
} from "../lib/strava-races";

const HALF_MARATHON_KM = 21;

type Race = {
  id: number | string;
  name: string;
  city?: string;
  state?: string;
  country?: string;
  date: string;
  distanceKm: number;
  time: string;
  paceSecPerKm?: number | null;
  elevationGain?: number;
  averageHeartrate?: number | null;
  efficiency?: number | null;
};

function normalizeText(value: string) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function normalizeCountryDisplay(country: string) {
  const normalized = normalizeText(country);

  if (normalized.includes("paraguay") || normalized.includes("paraguai")) {
    return "Paraguai";
  }

  if (normalized === "deutschland" || normalized === "germany") {
    return "Alemanha";
  }

  if (normalized === "brazil") return "Brasil";
  if (normalized === "japan") return "Japão";

  if (
    normalized === "united states" ||
    normalized === "united states of america"
  ) {
    return "Estados Unidos";
  }

  if (normalized === "netherlands" || normalized === "holanda") {
    return "Países Baixos";
  }

  return country;
}

function getCountryCode(country: string) {
  const normalized = normalizeText(country);

  if (normalized === "brasil" || normalized === "brazil") return "br";

  if (
    normalized === "alemanha" ||
    normalized === "germany" ||
    normalized === "deutschland"
  ) {
    return "de";
  }

  if (normalized === "portugal") return "pt";
  if (normalized === "peru") return "pe";
  if (normalized === "argentina") return "ar";

  if (normalized.includes("paraguay") || normalized.includes("paraguai")) {
    return "py";
  }

  if (
    normalized === "japao" ||
    normalized === "japão" ||
    normalized === "japan"
  ) {
    return "jp";
  }

  if (
    normalized === "estados unidos" ||
    normalized === "united states" ||
    normalized === "united states of america" ||
    normalized === "eua" ||
    normalized === "usa"
  ) {
    return "us";
  }

  if (
    normalized === "paises baixos" ||
    normalized === "países baixos" ||
    normalized === "netherlands" ||
    normalized === "holanda"
  ) {
    return "nl";
  }

  if (
    normalized === "franca" ||
    normalized === "frança" ||
    normalized === "france"
  ) {
    return "fr";
  }

  if (normalized === "espanha" || normalized === "spain") return "es";

  if (
    normalized === "italia" ||
    normalized === "itália" ||
    normalized === "italy"
  ) {
    return "it";
  }

  if (
    normalized === "reino unido" ||
    normalized === "united kingdom" ||
    normalized === "uk"
  ) {
    return "gb";
  }

  if (normalized === "chile") return "cl";
  if (normalized === "mexico" || normalized === "méxico") return "mx";
  if (normalized === "canada" || normalized === "canadá") return "ca";
  if (normalized === "australia" || normalized === "austrália") return "au";
  if (normalized === "irlanda" || normalized === "ireland") return "ie";

  if (
    normalized === "suica" ||
    normalized === "suíça" ||
    normalized === "switzerland"
  ) {
    return "ch";
  }

  if (normalized === "austria" || normalized === "áustria") return "at";

  if (
    normalized === "belgica" ||
    normalized === "bélgica" ||
    normalized === "belgium"
  ) {
    return "be";
  }

  if (normalized === "dinamarca" || normalized === "denmark") return "dk";

  if (
    normalized === "suecia" ||
    normalized === "suécia" ||
    normalized === "sweden"
  ) {
    return "se";
  }

  if (normalized === "noruega" || normalized === "norway") return "no";

  if (
    normalized === "finlandia" ||
    normalized === "finlândia" ||
    normalized === "finland"
  ) {
    return "fi";
  }

  if (
    normalized === "polonia" ||
    normalized === "polônia" ||
    normalized === "poland"
  ) {
    return "pl";
  }

  if (
    normalized === "tchequia" ||
    normalized === "tchéquia" ||
    normalized === "republica tcheca" ||
    normalized === "república tcheca" ||
    normalized === "czechia"
  ) {
    return "cz";
  }

  if (normalized === "hungria" || normalized === "hungary") return "hu";

  if (
    normalized === "grecia" ||
    normalized === "grécia" ||
    normalized === "greece"
  ) {
    return "gr";
  }

  if (normalized === "turquia" || normalized === "turkey") return "tr";

  if (
    normalized === "africa do sul" ||
    normalized === "áfrica do sul" ||
    normalized === "south africa"
  ) {
    return "za";
  }

  if (
    normalized === "emirados arabes unidos" ||
    normalized === "emirados árabes unidos" ||
    normalized === "united arab emirates"
  ) {
    return "ae";
  }

  if (
    normalized === "nova zelandia" ||
    normalized === "nova zelândia" ||
    normalized === "new zealand"
  ) {
    return "nz";
  }

  return "";
}

function CountryFlag({ country }: { country: string }) {
  const code = getCountryCode(country);

  if (!code) {
    return (
      <span className="flex h-5 w-7 items-center justify-center rounded-sm bg-gray-200 text-[10px] font-bold text-gray-500">
        ?
      </span>
    );
  }

  return (
    <img
      src={`https://flagcdn.com/w40/${code}.png`}
      alt={`Bandeira de ${normalizeCountryDisplay(country)}`}
      className="h-5 w-7 rounded-[2px] object-cover shadow-sm"
      loading="lazy"
    />
  );
}

function parseTimeToSeconds(time: string) {
  const parts = time.split(":").map(Number);

  if (parts.some(Number.isNaN)) return Number.POSITIVE_INFINITY;

  if (parts.length === 3) {
    const [hours, minutes, seconds] = parts;
    return hours * 3600 + minutes * 60 + seconds;
  }

  if (parts.length === 2) {
    const [minutes, seconds] = parts;
    return minutes * 60 + seconds;
  }

  return Number.POSITIVE_INFINITY;
}

function formatPaceFromRace(race: Race) {
  if (race.paceSecPerKm) return formatRacePace(race.paceSecPerKm);

  const totalSeconds = parseTimeToSeconds(race.time);

  if (!Number.isFinite(totalSeconds) || !race.distanceKm) return "-";

  const paceSeconds = totalSeconds / race.distanceKm;
  const min = Math.floor(paceSeconds / 60);
  const sec = Math.round(paceSeconds % 60);

  if (sec === 60) return `${min + 1}:00/km`;

  return `${min}:${String(sec).padStart(2, "0")}/km`;
}

function getTrend(current?: number | null, previous?: number | null) {
  if (!current || !previous) return "➖";
  const diff = current - previous;
  if (Math.abs(diff) < 1) return "➖";
  return diff > 0 ? "📈" : "📉";
}

function getTopRaceMedals(
  races: Array<{ id: number | string; time: string; distanceKm: number }>
) {
  const ranked = [...races]
    .map((race) => {
      const totalSeconds = parseTimeToSeconds(race.time);
      const paceSeconds = totalSeconds / race.distanceKm;

      return {
        id: race.id,
        paceSeconds,
      };
    })
    .filter((race) => Number.isFinite(race.paceSeconds))
    .sort((a, b) => a.paceSeconds - b.paceSeconds)
    .slice(0, 3);

  const medals = ["🥇", "🥈", "🥉"];
  const medalMap = new Map<number | string, string>();

  ranked.forEach((race, index) => {
    medalMap.set(race.id, medals[index]);
  });

  return medalMap;
}

export default async function CorridasMundoPage() {
  const allRaces = await getRaceLikeActivitiesFromStrava();
  const races = allRaces.filter((race) => race.distanceKm >= HALF_MARATHON_KM);

  const grouped = groupStravaRacesByCountry(races);
  const stats = getStravaRaceStats(races);
  const counts = getCountryCountsFromStrava(races);
  const topRaceMedals = getTopRaceMedals(races);

  return (
    <main className="min-h-screen bg-gray-100 p-6 md:p-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-orange-600">Corridas</p>
            <h1 className="text-3xl font-bold text-gray-900 md:text-4xl">
              Corridas pelo mundo
            </h1>
            <p className="mt-2 text-sm text-gray-500">
              Corridas puxadas do Strava com distância mínima de 21 km.
            </p>
          </div>

          <Link
            href="/"
            className="rounded-full bg-white px-5 py-3 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          >
            Voltar ao dashboard
          </Link>
        </div>

        <section className="mb-8 grid gap-4 md:grid-cols-4">
          <InfoCard title="Corridas 21k+" value={String(stats.totalRaces)} />
          <InfoCard
            title="Países com corridas"
            value={String(stats.countriesCount)}
          />
          <InfoCard
            title="País líder"
            value={grouped[0] ? normalizeCountryDisplay(grouped[0].country) : "-"}
          />
          <InfoCard
            title="Eficiência média"
            value={formatRaceEfficiency(stats.averageEfficiency)}
          />
        </section>

        <section className="mb-8">
          <WorldRaceMap counts={counts} />
        </section>

        <section className="rounded-3xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-gray-900">
            Ranking por país
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Lista detalhada das corridas identificadas como eventos/provas com
            distância mínima de 21 km. As medalhas destacam os 3 melhores paces
            médios da página.
          </p>

          {grouped.length === 0 ? (
            <p className="mt-5 text-sm text-gray-500">
              Nenhuma corrida acima de 21 km foi identificada com a regra atual.
            </p>
          ) : (
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {grouped.map((item) => {
                const displayCountry = normalizeCountryDisplay(item.country);

                return (
                  <div
                    key={item.country}
                    className="rounded-2xl border border-gray-200 bg-gray-50 p-4"
                  >
                    <div className="flex items-center justify-between">
                      <p className="flex items-center gap-2 text-lg font-semibold text-gray-900">
                        <CountryFlag country={item.country} />
                        <span>{displayCountry}</span>
                      </p>

                      <span className="rounded-full bg-orange-100 px-3 py-1 text-sm font-semibold text-orange-700">
                        {item.count} {item.count === 1 ? "corrida" : "corridas"}
                      </span>
                    </div>

                    <div className="mt-3 space-y-2">
                      {item.races.map((race: Race, index) => {
                        const medal = topRaceMedals.get(race.id);
                        const previous = item.races[index + 1];

                        return (
                          <div
                            key={race.id}
                            className="rounded-xl bg-white p-3 text-sm text-gray-700"
                          >
                            <p className="flex items-center gap-2 font-medium text-gray-900">
                              {medal ? (
                                <span
                                  className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-gray-100 text-sm"
                                  title="Top 3 melhores paces"
                                >
                                  {medal}
                                </span>
                              ) : null}
                              <span>{race.name}</span>
                            </p>

                            <p className="text-gray-500">
                              {race.city || "Não identificado"}
                              {race.state ? `, ${race.state}` : ""} •{" "}
                              {formatBRDate(race.date)} •{" "}
                              {race.distanceKm.toFixed(2)} km • {race.time} •{" "}
                              {formatPaceFromRace(race)}
                            </p>

                            <p className="mt-1 text-gray-500">
                              FC{" "}
                              {race.averageHeartrate
                                ? `${race.averageHeartrate.toFixed(0)} bpm`
                                : "-"}{" "}
                              • Alt {race.elevationGain ?? 0} m • Eficiência{" "}
                              {formatRaceEfficiency(race.efficiency ?? null)} •{" "}
                              {getTrend(race.efficiency, previous?.efficiency)}
                            </p>
                          </div>
                        );
                      })}
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
    <div className="rounded-3xl bg-white p-6 shadow-sm">
      <p className="text-sm text-gray-500">{title}</p>
      <h2 className="mt-2 text-2xl font-bold text-gray-900">{value}</h2>
    </div>
  );
}