export const dynamic = "force-dynamic";

import Link from "next/link";
import { formatBRDate } from "../lib/date-utils";
import BrazilRaceMap from "../components/BrazilRaceMap";
import {
  getRaceLikeActivitiesFromStrava,
  groupStravaRacesByStateBrazil,
  getStravaRaceStats,
  getBrazilStateCountsFromStrava,
  formatRacePace,
  formatRaceEfficiency,
} from "../lib/strava-races";

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

function getPaceSeconds(race: Race) {
  const totalSeconds = parseTimeToSeconds(race.time);

  if (!Number.isFinite(totalSeconds) || !race.distanceKm) {
    return Number.POSITIVE_INFINITY;
  }

  return totalSeconds / race.distanceKm;
}

function formatPaceFromRace(race: Race) {
  if (race.paceSecPerKm) return formatRacePace(race.paceSecPerKm);

  const paceSeconds = getPaceSeconds(race);

  if (!Number.isFinite(paceSeconds)) return "-";

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

function isFiveK(race: Race) {
  return race.distanceKm >= 4.5 && race.distanceKm < 7.5;
}

function isTenK(race: Race) {
  return race.distanceKm >= 9 && race.distanceKm < 15;
}

function isHalfMarathon(race: Race) {
  return race.distanceKm >= 20 && race.distanceKm < 25;
}

function getTopRaces(races: Race[], filterFn: (race: Race) => boolean) {
  return races
    .filter(filterFn)
    .map((race) => ({
      ...race,
      paceSeconds: getPaceSeconds(race),
    }))
    .filter((race) => Number.isFinite(race.paceSeconds))
    .sort((a, b) => {
      if (a.paceSeconds !== b.paceSeconds) {
        return a.paceSeconds - b.paceSeconds;
      }

      return parseTimeToSeconds(a.time) - parseTimeToSeconds(b.time);
    })
    .slice(0, 3);
}

function getMedalMeta(index: number) {
  if (index === 0) {
    return {
      label: "🥇 Ouro",
      className: "border border-amber-200 bg-amber-100 text-amber-800",
    };
  }

  if (index === 1) {
    return {
      label: "🥈 Prata",
      className: "border border-slate-200 bg-slate-100 text-slate-700",
    };
  }

  return {
    label: "🥉 Bronze",
    className: "border border-orange-200 bg-orange-100 text-orange-800",
  };
}

export default async function CorridasBrasilPage() {
  const allRaces = await getRaceLikeActivitiesFromStrava();

  const races = allRaces.filter((race) => race.country === "Brasil");

  const grouped = groupStravaRacesByStateBrazil(races);
  const stats = getStravaRaceStats(races);
  const counts = getBrazilStateCountsFromStrava(races);

  const topHalf = getTopRaces(races, isHalfMarathon);
  const top10k = getTopRaces(races, isTenK);
  const top5k = getTopRaces(races, isFiveK);

  return (
    <main className="min-h-screen bg-gray-100 p-6 md:p-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-orange-600">Corridas</p>
            <h1 className="text-3xl font-bold text-gray-900 md:text-4xl">
              Corridas pelo Brasil
            </h1>
            <p className="mt-2 text-sm text-gray-500">
              Corridas puxadas do Strava e identificadas como provas no Brasil.
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
          <InfoCard title="Corridas no Brasil" value={String(stats.totalRaces)} />
          <InfoCard
            title="Estados com corridas"
            value={String(stats.statesCount)}
          />
          <InfoCard
            title="Estado líder"
            value={grouped[0]?.stateName ?? grouped[0]?.state ?? "-"}
          />
          <InfoCard
            title="Eficiência média"
            value={formatRaceEfficiency(stats.averageEfficiency)}
          />
        </section>

        <section className="mb-8 rounded-3xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-gray-900">
            Top 3 por distância
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Ranking automático das melhores provas no Brasil por pace médio,
            separado em meias, 10k e 5k.
          </p>

          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <TopDistanceCard title="Top 3 Meias" races={topHalf} />
            <TopDistanceCard title="Top 3 10k" races={top10k} />
            <TopDistanceCard title="Top 3 5k" races={top5k} />
          </div>
        </section>

        <section className="mb-8">
          <BrazilRaceMap counts={counts} />
        </section>

        <section className="rounded-3xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-gray-900">
            Ranking por estado
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Lista detalhada das corridas identificadas como eventos/provas no
            Brasil.
          </p>

          {grouped.length === 0 ? (
            <p className="mt-5 text-sm text-gray-500">
              Nenhuma corrida foi identificada com a regra atual.
            </p>
          ) : (
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {grouped.map((item) => (
                <div
                  key={item.state}
                  className="rounded-2xl border border-gray-200 bg-gray-50 p-4"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-lg font-semibold text-gray-900">
                      {item.stateName}
                    </p>
                    <span className="rounded-full bg-orange-100 px-3 py-1 text-sm font-semibold text-orange-700">
                      {item.count} {item.count === 1 ? "corrida" : "corridas"}
                    </span>
                  </div>

                  <div className="mt-3 space-y-2">
                    {item.races.map((race, index) => {
                      const previous = item.races[index + 1];

                      return (
                        <div
                          key={race.id}
                          className="rounded-xl bg-white p-3 text-sm text-gray-700"
                        >
                          <p className="font-medium text-gray-900">
                            {race.name}
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
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function TopDistanceCard({
  title,
  races,
}: {
  title: string;
  races: Array<Race & { paceSeconds: number }>;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
      <h3 className="text-base font-semibold text-gray-900">{title}</h3>

      {races.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500">
          Nenhuma prova encontrada nessa categoria.
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          {races.map((race, index) => {
            const medal = getMedalMeta(index);
            const isTopOne = index === 0;

            return (
              <div
                key={race.id}
                className="rounded-xl bg-white p-3 text-sm text-gray-700"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium text-gray-900">{race.name}</p>

                  <span
                    className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${medal.className}`}
                  >
                    {medal.label}
                  </span>
                </div>

                <p className="mt-1 text-gray-500">
                  {race.city || "Não identificado"}
                  {race.state ? `, ${race.state}` : ""} •{" "}
                  {formatBRDate(race.date)}
                </p>

                <p className="mt-1 text-gray-500">
                  {race.distanceKm.toFixed(2)} km • {race.time} •{" "}
                  <span className={isTopOne ? "font-bold text-gray-900" : ""}>
                    {formatPaceFromRace(race)}
                  </span>
                </p>

                <p className="mt-1 text-gray-500">
                  Eficiência {formatRaceEfficiency(race.efficiency ?? null)}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
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