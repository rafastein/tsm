import { formatBRDate, getActivityDate } from "../lib/date-utils";

type Activity = {
  id: number;
  name?: string;
  type?: string;
  distance?: number | null;
  moving_time?: number | null;
  elapsed_time?: number | null;
  total_elevation_gain?: number | null;
  start_date?: string | null;
  start_date_local?: string | null;
  average_speed?: number | null;
};

type Props = {
  activities: Activity[];
};

function formatDistance(distance?: number | null) {
  const meters = typeof distance === "number" ? distance : 0;
  return `${(meters / 1000).toFixed(2)} km`;
}

function formatDuration(seconds?: number | null) {
  const total = Math.max(0, Math.round(typeof seconds === "number" ? seconds : 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;

  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatDate(date?: string | null) {
  return formatBRDate(date);
}

function formatPace(distance?: number | null, movingTime?: number | null) {
  const meters = typeof distance === "number" ? distance : 0;
  const seconds = typeof movingTime === "number" ? movingTime : 0;

  if (meters <= 0 || seconds <= 0) return "-";

  const paceSeconds = seconds / (meters / 1000);
  const min = Math.floor(paceSeconds / 60);
  const sec = Math.round(paceSeconds % 60);

  if (sec === 60) {
    return `${min + 1}:00/km`;
  }

  return `${min}:${String(sec).padStart(2, "0")}/km`;
}

export default function ActivitiesPanel({ activities }: Props) {
  const recentActivities = [...activities]
    .sort((a, b) => {
      const da = new Date(getActivityDate(a)).getTime();
      const db = new Date(getActivityDate(b)).getTime();
      return db - da;
    })
    .slice(0, 12);

  return (
    <section className="rounded-3xl app-card p-6">
      <div className="mb-4">
        <h2 className="text-2xl font-bold text-gray-900">Atividades recentes</h2>
        <p className="mt-1 text-sm text-gray-500">
          Últimos treinos puxados do Strava.
        </p>
      </div>

      {recentActivities.length === 0 ? (
        <p className="text-sm text-gray-500">Nenhuma atividade encontrada.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {recentActivities.map((activity) => {
            const date = getActivityDate(activity);

            return (
              <div
                key={activity.id}
                className="rounded-2xl app-card-soft p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-gray-900">
                      {activity.name ?? "Atividade"}
                    </p>
                    <p className="mt-1 text-sm text-gray-500">
                      {activity.type ?? "Sem tipo"} • {formatDate(date)}
                    </p>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-xl bg-white/80 p-3 shadow-sm">
                    <p className="text-gray-500">Distância</p>
                    <p className="mt-1 font-semibold text-gray-900">
                      {formatDistance(activity.distance)}
                    </p>
                  </div>

                  <div className="rounded-xl bg-white/80 p-3 shadow-sm">
                    <p className="text-gray-500">Tempo</p>
                    <p className="mt-1 font-semibold text-gray-900">
                      {formatDuration(activity.moving_time ?? activity.elapsed_time)}
                    </p>
                  </div>

                  <div className="rounded-xl bg-white/80 p-3 shadow-sm">
                    <p className="text-gray-500">Pace</p>
                    <p className="mt-1 font-semibold text-gray-900">
                      {formatPace(activity.distance, activity.moving_time)}
                    </p>
                  </div>

                  <div className="rounded-xl bg-white/80 p-3 shadow-sm">
                    <p className="text-gray-500">Elevação</p>
                    <p className="mt-1 font-semibold text-gray-900">
                      {Math.round(activity.total_elevation_gain ?? 0)} m
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}