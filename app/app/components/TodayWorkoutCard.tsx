import type { SisrunRow } from "../lib/sisrun-utils";

type TodayWorkoutStatus = "Sem treino" | "Descanso" | "Pendente" | "Concluído ✓" | "Parcial";

type TodayWorkoutCardProps = {
  todaySisrunRow: SisrunRow | null;
  todayStravaKm: number;
};

export function getTodayWorkoutStatus(
  todaySisrunRow: SisrunRow | null,
  todayStravaKm: number,
): TodayWorkoutStatus {
  if (!todaySisrunRow) return "Sem treino";
  if (todaySisrunRow.plannedDistanceKm === 0) return "Descanso";
  if (todayStravaKm <= 0) return "Pendente";
  if (todayStravaKm >= todaySisrunRow.plannedDistanceKm) return "Concluído ✓";
  return "Parcial";
}

const STATUS_STYLES: Record<TodayWorkoutStatus, { bg: string; color: string; border: string }> = {
  "Concluído ✓": { bg: "rgba(16,185,129,0.10)", color: "#0a7a54", border: "rgba(16,185,129,0.25)" },
  "Descanso":    { bg: "rgba(224,0,122,0.07)",  color: "#8a1452",  border: "rgba(224,0,122,0.18)" },
  "Parcial":     { bg: "rgba(245,166,35,0.10)", color: "#92560a",  border: "rgba(245,166,35,0.25)" },
  "Pendente":    { bg: "rgba(245,166,35,0.10)", color: "#92560a",  border: "rgba(245,166,35,0.25)" },
  "Sem treino":  { bg: "rgba(0,0,0,0.04)",      color: "#8a1452",  border: "rgba(0,0,0,0.08)" },
};

export default function TodayWorkoutCard({ todaySisrunRow, todayStravaKm }: TodayWorkoutCardProps) {
  const status = getTodayWorkoutStatus(todaySisrunRow, todayStravaKm);
  const s = STATUS_STYLES[status];

  return (
    <div className="app-card" style={{ padding: "1.25rem 1.5rem" }}>
      <p style={{ fontSize: 11, fontWeight: 500, color: "#8a1452", opacity: 0.55, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.75rem" }}>
        Hoje
      </p>

      {todaySisrunRow ? (
        <>
          <p style={{ fontSize: 13, color: "#5a1a35", marginBottom: 4 }}>
            Planejado:{" "}
            <strong>{todaySisrunRow.plannedDistanceKm.toFixed(1)} km</strong>
          </p>
          <p style={{ fontSize: 13, color: "#5a1a35", marginBottom: 12 }}>
            Strava:{" "}
            <strong>{todayStravaKm.toFixed(1)} km</strong>
          </p>
        </>
      ) : (
        <p style={{ fontSize: 13, color: "#8a1452", opacity: 0.5, marginBottom: 12 }}>
          Nenhum treino previsto.
        </p>
      )}

      <span
        style={{
          display: "inline-block",
          padding: "4px 12px",
          borderRadius: 6,
          fontSize: 12,
          fontWeight: 600,
          background: s.bg,
          color: s.color,
          border: `1px solid ${s.border}`,
        }}
      >
        {status}
      </span>
    </div>
  );
}
