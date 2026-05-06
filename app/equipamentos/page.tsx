export const dynamic = "force-dynamic";

import Link from "next/link";
import BrandIcon from "../components/BrandIcon";
import { getValidStravaAccessToken } from "../lib/strava-auth";
import { formatBRDate } from "../lib/date-utils";
import { formatEfficiency, formatLongRunPace } from "../lib/strava-long-runs";

type StravaActivity = {
  id: number;
  name: string;
  type: string;
  distance: number;
  moving_time: number;
  total_elevation_gain: number;
  average_heartrate?: number | null;
  gear_id?: string | null;
  start_date: string;
  start_date_local: string;
};

type WorkoutType =
  | "regenerativo"
  | "rodagem"
  | "intervalado"
  | "fartlek"
  | "ritmo"
  | "longao"
  | "prova_curta"
  | "prova_longa";

type ManualGear = {
  name: string;
  km: number;
  maxKm: number;
};

type GearSummary = {
  gearId: string;
  name: string;
  brand: string;
  totalKm: number;
  maxKm: number;
  totalTime: number;
  totalElevation: number;
  activities: number;
  heartRates: number[];
  efficiencies: number[];
  lastUse: string;
};

const STRAVA_AFTER_EPOCH = Math.floor(
  new Date("2024-01-01T00:00:00Z").getTime() / 1000
);

// Vida útil por modelo baseada em reviews especializados (Solereview, RunRepeat, Doctors of Running):
//
// ASICS NovaBlast 3:  treino diário com outsole AHAR, vida útil ~700 km
// ASICS NovaBlast 4:  outsole AHAR+ mais espesso (3.9mm), vida útil ~800 km
// ASICS Superblast 3: outsole ASICSGRIP + AHAR, midsole FF Leap duradouro, ~800 km
// Nike Alphafly 3:    tênis de prova, ZoomX exposto, outsole leve, ~400 km
// Adidas EVO SL:      outsole Continental, Lightstrike Pro durável, ~800 km
// Adidas Adios Pro 4: tênis de prova com rods, outsole Lighttraxion, ~500 km
// Health Hirace:      tênis de academia/recuperação, referência genérica ~500 km
const MANUAL_GEARS: ManualGear[] = [
  { name: "ASICS NovaBlast 3",         km: 134.1, maxKm: 700 },
  { name: "ASICS Novablast 4",         km: 282.5, maxKm: 800 },
  { name: "Nike Alphafly 3",           km: 146.6, maxKm: 400 },
  { name: "Nike Alphafly 3 Rosa",      km: 37.7,  maxKm: 400 },
  { name: "Adidas EVO SL",             km: 174.4, maxKm: 800 },
  { name: "Health Hirace Hiwings Pro", km: 17.1,  maxKm: 500 },
  { name: "Adidas EVO SL Bege",        km: 59.1,  maxKm: 800 },
  { name: "Adidas Adios Pro 4",        km: 38.7,  maxKm: 500 },
  { name: "ASICS Superblast 3",        km: 61.9,  maxKm: 800 },
];

function findManualGearByKm(totalKm: number) {
  const rounded = Number(totalKm.toFixed(1));
  return MANUAL_GEARS.find((gear) => Math.abs(gear.km - rounded) <= 0.3) ?? null;
}

function extractBrand(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes("adidas"))                        return "adidas";
  if (lower.includes("puma"))                          return "puma";
  if (lower.includes("asics"))                         return "asics";
  if (lower.includes("new balance"))                   return "new balance";
  if (lower.includes("fila"))                          return "fila";
  if (lower.includes("361"))                           return "361";
  if (lower.includes("nike"))                          return "nike";
  if (lower.includes("health") || lower.includes("hirace")) return "health";
  if (lower.includes("on "))                           return "on";
  return name.split(" ")[0];
}

async function getActivities(): Promise<StravaActivity[]> {
  const token = await getValidStravaAccessToken();
  if (!token) return [];

  const all: StravaActivity[] = [];
  const perPage = 200;

  for (let page = 1; page <= 20; page++) {
    const url = new URL("https://www.strava.com/api/v3/athlete/activities");
    url.searchParams.set("per_page", String(perPage));
    url.searchParams.set("page", String(page));
    url.searchParams.set("after", String(STRAVA_AFTER_EPOCH));

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });

    if (!res.ok) break;

    const data = (await res.json()) as StravaActivity[];
    if (!Array.isArray(data) || data.length === 0) break;

    all.push(...data);
    if (data.length < perPage) break;
  }

  return all;
}

function calculateEfficiency(
  distanceKm: number,
  movingTimeSec: number,
  averageHeartrate: number | null | undefined,
  elevationGain: number
) {
  if (!distanceKm || !movingTimeSec || !averageHeartrate) return null;
  const rawSpeedKmh = distanceKm / (movingTimeSec / 3600);
  const elevationFactor =
    elevationGain > 0 ? 1 + elevationGain / (distanceKm * 100) : 1;
  return ((rawSpeedKmh * elevationFactor) / averageHeartrate) * 1000;
}

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

function getWearStatus(totalKm: number, maxKm: number) {
  const ratio = totalKm / maxKm;

  if (ratio >= 1)
    return { label: "Muito rodado. Atenção alta",       emoji: "🔴", tone: "bg-red-100 text-red-700",         bar: "bg-red-500",     progress: 100 };
  if (ratio >= 0.75)
    return { label: "Bem rodado. Monitorar desgaste",   emoji: "🟡", tone: "bg-amber-100 text-amber-700",     bar: "bg-amber-500",   progress: Math.min(ratio * 100, 100) };
  if (ratio >= 0.4)
    return { label: "Rodado, mas saudável",             emoji: "🔵", tone: "bg-blue-100 text-blue-700",       bar: "bg-blue-500",    progress: Math.min(ratio * 100, 100) };
  return   { label: "Novo / confortável",               emoji: "🟢", tone: "bg-emerald-100 text-emerald-700", bar: "bg-emerald-500", progress: Math.min(ratio * 100, 100) };
}

// Tênis reservados exclusivamente para provas — não devem aparecer em treinos
const RACE_ONLY_SHOES = ["alphafly", "adios pro"];

function isRaceOnly(name: string) {
  const n = name.toLowerCase();
  return RACE_ONLY_SHOES.some((s) => n.includes(s));
}

function scoreShoeForWorkout(
  name: string,
  totalKm: number,
  maxKm: number,
  workoutType: WorkoutType
) {
  const n = name.toLowerCase();
  const isRace = workoutType === "prova_curta" || workoutType === "prova_longa";

  // Tênis de prova não entram em recomendações de treino
  if (isRaceOnly(name) && !isRace) return -999;

  let score = 0;

  if (workoutType === "prova_curta") {
    // Até 10k: explosivo e rígido
    if (n.includes("alphafly"))  score += 100; // Alphafly 3 — explosivo para curtas
    if (n.includes("adios pro")) score += 75;  // Adios Pro 4 — funciona mas é mais maratona
  }

  if (workoutType === "prova_longa") {
    // Acima de 10k: amortecimento + placa para distância
    if (n.includes("adios pro")) score += 100; // Adios Pro 4 — feito para meia/maratona
    if (n.includes("alphafly"))  score += 80;  // Alphafly 3 — também excelente em meias
  }

  if (workoutType === "intervalado") {
    // EVO SL: Lightstrike Pro responsivo, ótimo para tiros mesmo sem placa
    if (n.includes("evo"))        score += 100; // EVO SL — responsivo e leve para tiros
    if (n.includes("superblast")) score += 60;  // Superblast — aceitável mas não o ideal
    if (n.includes("novablast"))  score += 40;  // Novablast — alternativa mais macia
  }

  if (workoutType === "fartlek") {
    // Fartlek: variações de ritmo — EVO SL é versátil e responsivo
    if (n.includes("evo"))        score += 100; // EVO SL — ideal para variações de pace
    if (n.includes("superblast")) score += 65;  // Superblast — um pouco pesado para fartlek
    if (n.includes("novablast"))  score += 50;  // Novablast — confortável mas menos responsivo
  }

  if (workoutType === "ritmo") {
    // Tempo run: Superblast é o mais indicado pelo amortecimento + velocidade
    if (n.includes("superblast")) score += 100; // Superblast 3 — ideal para tempo run
    if (n.includes("evo"))        score += 75;  // EVO SL — funciona mas melhor em tiros
    if (n.includes("novablast"))  score += 50;  // Novablast — aceitável para ritmos moderados
  }

  if (workoutType === "longao") {
    // Longão: Superblast é o principal — amortecimento e proteção para distância
    if (n.includes("superblast")) score += 100; // Superblast 3 — feito para longões
    if (n.includes("novablast"))  score += 70;  // Novablast — segunda opção confortável
    if (n.includes("evo"))        score += 40;  // EVO SL — não é o ideal para distância longa
  }

  if (workoutType === "rodagem") {
    // Rodagem: volume diário — NovaBlast é o mais versátil e durável
    if (n.includes("novablast"))  score += 100; // NovaBlast 3/4 — ideal para volume
    if (n.includes("evo"))        score += 65;  // EVO SL — pode rodar mas é mais treino rápido
    if (n.includes("superblast")) score += 55;  // Superblast — aceitável para rodagens mais rápidas
  }

  if (workoutType === "regenerativo") {
    // Recuperação: Health Hirace em primeiro, depois NovaBlast
    if (n.includes("health"))     score += 100; // Health Hirace — leve, macio, para recuperação
    if (n.includes("novablast"))  score += 85;  // NovaBlast — confortável e macio
    if (n.includes("superblast")) score += 50;  // Superblast — aceitável mas meio "premium" para isso
  }

  // Penalidade proporcional ao desgaste real de cada modelo
  const ratio = totalKm / maxKm;
  if (ratio >= 1)         score -= 80;
  else if (ratio >= 0.75) score -= 30;
  else if (ratio >= 0.4)  score -= 10;

  return score;
}

function getBestShoeForWorkout(gears: GearSummary[], workoutType: WorkoutType) {
  return [...gears]
    .map((gear) => ({
      ...gear,
      recommendationScore: scoreShoeForWorkout(
        gear.name,
        gear.totalKm,
        gear.maxKm,
        workoutType
      ),
    }))
    .sort((a, b) => b.recommendationScore - a.recommendationScore)[0];
}

function getWorkoutLabel(type: WorkoutType) {
  const labels: Record<WorkoutType, string> = {
    regenerativo: "Regenerativo",
    rodagem:      "Rodagem",
    intervalado:  "Intervalado",
    fartlek:      "Fartlek",
    ritmo:        "Ritmo",
    longao:       "Longão",
    prova_curta:  "Prova Curta (≤ 10k)",
    prova_longa:  "Prova Longa (> 10k)",
  };
  return labels[type];
}

export default async function EquipamentosPage() {
  const activities = await getActivities();

  const runs = activities.filter((a) => a.type === "Run" && a.gear_id);

  const rawGrouped = Object.values(
    runs.reduce<Record<string, GearSummary>>((acc, activity) => {
      const gearId = activity.gear_id as string;
      const distanceKm = activity.distance / 1000;

      if (!acc[gearId]) {
        acc[gearId] = {
          gearId,
          name: gearId,
          brand: "equipamento",
          totalKm: 0,
          maxKm: 600,
          totalTime: 0,
          totalElevation: 0,
          activities: 0,
          heartRates: [],
          efficiencies: [],
          lastUse: activity.start_date_local ?? activity.start_date,
        };
      }

      const item = acc[gearId];

      item.totalKm += distanceKm;
      item.totalTime += activity.moving_time;
      item.totalElevation += activity.total_elevation_gain ?? 0;
      item.activities += 1;

      if (activity.average_heartrate) {
        item.heartRates.push(activity.average_heartrate);
      }

      const efficiency = calculateEfficiency(
        distanceKm,
        activity.moving_time,
        activity.average_heartrate,
        activity.total_elevation_gain ?? 0
      );

      if (efficiency) item.efficiencies.push(efficiency);

      const currentDate = new Date(activity.start_date_local ?? activity.start_date);
      const lastDate = new Date(item.lastUse);
      if (currentDate > lastDate) {
        item.lastUse = activity.start_date_local ?? activity.start_date;
      }

      return acc;
    }, {})
  );

  const grouped = rawGrouped
    .map((gear) => {
      const manualGear = findManualGearByKm(gear.totalKm);
      if (!manualGear) return null;
      return {
        ...gear,
        name: manualGear.name,
        brand: extractBrand(manualGear.name),
        totalKm: manualGear.km,
        maxKm: manualGear.maxKm,
      };
    })
    .filter((gear): gear is GearSummary => gear !== null)
    .sort((a, b) => b.totalKm - a.totalKm);

  const recommendationTypes: WorkoutType[] = [
    "regenerativo",
    "rodagem",
    "longao",
    "fartlek",
    "ritmo",
    "intervalado",
    "prova_curta",
    "prova_longa",
  ];

  return (
    <main className="min-h-screen app-page-bg p-6 md:p-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-brand-600">Strava</p>
            <h1 className="text-3xl font-bold text-gray-900 md:text-4xl">
              Equipamentos
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              Associação automática entre os dados do Strava e o nome do tênis,
              usando a quilometragem total como referência.
            </p>
          </div>

          <Link
            href="/"
            className="app-button rounded-full px-5 py-3 text-sm font-medium"
          >
            Voltar ao dashboard
          </Link>
        </div>

        {grouped.length === 0 ? (
          <section className="app-card p-6">
            <p className="text-sm text-gray-600">
              Nenhum equipamento foi associado pela quilometragem informada.
            </p>
          </section>
        ) : (
          <>
            <section className="app-card mb-8 p-6">
              <h2 className="text-xl font-bold text-gray-900">
                Recomendação automática
              </h2>
              <p className="mt-1 text-sm text-gray-600">
                Sugestão baseada na função do tênis e na quilometragem acumulada.
              </p>

              <div className="mt-5 grid gap-3 md:grid-cols-4">
                {recommendationTypes.map((type) => {
                  const shoe = getBestShoeForWorkout(grouped, type);
                  return (
                    <div key={type} className="app-card-soft p-4">
                      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                        {getWorkoutLabel(type)}
                      </p>
                      {shoe ? (
                        <div className="mt-2 flex items-center gap-3">
                          <BrandIcon brand={shoe.brand} />
                          <div>
                            <p className="font-semibold text-gray-900">{shoe.name}</p>
                            <p className="text-xs text-gray-600">{shoe.totalKm.toFixed(1)} km</p>
                          </div>
                        </div>
                      ) : (
                        <p className="mt-2 text-sm text-gray-600">Sem sugestão disponível.</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="grid gap-4 md:grid-cols-2">
              {grouped.map((gear) => {
                const averagePace =
                  gear.totalKm > 0 ? gear.totalTime / gear.totalKm : null;
                const averageKmPerRun =
                  gear.activities > 0 ? gear.totalKm / gear.activities : 0;
                const averageHr =
                  gear.heartRates.length > 0
                    ? gear.heartRates.reduce((a, b) => a + b, 0) / gear.heartRates.length
                    : null;
                const averageEfficiency =
                  gear.efficiencies.length > 0
                    ? gear.efficiencies.reduce((a, b) => a + b, 0) / gear.efficiencies.length
                    : null;
                const wear = getWearStatus(gear.totalKm, gear.maxKm);

                return (
                  <article key={gear.gearId} className="app-card p-6">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <BrandIcon brand={gear.brand} />
                        <div>
                          <h2 className="text-xl font-bold text-gray-900">{gear.name}</h2>
                        </div>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${wear.tone}`}>
                        {wear.emoji} {wear.label}
                      </span>
                    </div>

                    <div className="mt-5 grid gap-3 md:grid-cols-3">
                      <Metric label="Km total"         value={`${gear.totalKm.toFixed(1)} km`} />
                      <Metric label="Treinos"          value={String(gear.activities)} />
                      <Metric label="Média por corrida" value={`${averageKmPerRun.toFixed(1)} km`} />
                      <Metric label="Tempo"            value={formatDuration(gear.totalTime)} />
                      <Metric label="Pace médio"       value={formatLongRunPace(averagePace)} />
                      <Metric label="FC média"         value={averageHr ? `${averageHr.toFixed(0)} bpm` : "-"} />
                      <Metric label="Eficiência"       value={formatEfficiency(averageEfficiency)} />
                      <Metric label="Elevação"         value={`${gear.totalElevation.toFixed(0)} m`} />
                      <Metric label="Último uso"       value={formatBRDate(gear.lastUse)} />
                    </div>

                    <div className="mt-4">
                      <div className="mb-1 flex justify-between text-xs text-gray-600">
                        <span>Desgaste estimado</span>
                        <span>{gear.totalKm.toFixed(0)} / {gear.maxKm} km</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-white/70">
                        <div
                          className={`h-full rounded-full ${wear.bar}`}
                          style={{ width: `${wear.progress}%` }}
                        />
                      </div>
                    </div>
                  </article>
                );
              })}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/70 p-3 shadow-sm">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 font-semibold text-gray-900">{value}</p>
    </div>
  );
}
