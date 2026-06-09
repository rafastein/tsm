type WeeklyGoalAlert = {
  title: string;
  text: string;
  ok?: boolean;
};

type WeeklyGoalCardProps = {
  currentKm: number;
  plannedKm: number;
  progressPct: number;
  alerts?: WeeklyGoalAlert[];
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  className?: string;
};

function isDangerAlert(alert: WeeklyGoalAlert) {
  const t = alert.title.toLowerCase();
  return alert.ok === false || t.includes("abaixo") || t.includes("não");
}

export default function WeeklyGoalCard({
  currentKm,
  plannedKm,
  progressPct,
  alerts = [],
  eyebrow = "Semana atual",
  title = "Meta semanal",
  subtitle = "SisRUN x execução real no Strava.",
  className = "",
}: WeeklyGoalCardProps) {
  const safeProgress = Number.isFinite(progressPct)
    ? Math.max(0, Math.min(progressPct, 100))
    : 0;
  const remainingKm = Math.max(plannedKm - currentKm, 0);
  const exceeded = currentKm >= plannedKm && plannedKm > 0;

  return (
    <div className={`app-card ${className}`.trim()} style={{ padding: "1.25rem 1.5rem" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: "1rem" }}>
        <div>
          <p style={{ fontSize: 11, fontWeight: 500, color: "#8a1452", opacity: 0.55, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            {eyebrow}
          </p>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: "#3d0a22", marginTop: 8 }}>
            {title}
          </h2>
          <p style={{ fontSize: 12, color: "#8a1452", opacity: 0.6, marginTop: 4 }}>
            {subtitle}
          </p>
        </div>
        <p style={{ fontSize: 22, fontWeight: 700, color: "#c0006b", fontFamily: "var(--font-geist-mono, monospace)", flexShrink: 0 }}>
          {currentKm.toFixed(1)}{" "}
          <span style={{ fontSize: 14, fontWeight: 400, color: "#8a1452", opacity: 0.6 }}>
            / {plannedKm.toFixed(1)} km
          </span>
        </p>
      </div>

      {/* Barra de progresso */}
      <div style={{ height: 8, borderRadius: 99, background: "rgba(224,0,122,0.10)", overflow: "hidden", marginBottom: 8 }}>
        <div
          style={{
            height: "100%",
            width: `${safeProgress}%`,
            borderRadius: 99,
            background: exceeded
              ? "linear-gradient(90deg, #10b981, #059669)"
              : "linear-gradient(90deg, #e0007a, #c0006b)",
            transition: "width 0.6s ease",
          }}
        />
      </div>
      <p style={{ fontSize: 12, color: "#8a1452", opacity: 0.6 }}>
        {exceeded
          ? `Meta cumprida! Excedente de ${(currentKm - plannedKm).toFixed(1)} km.`
          : `Faltam ${remainingKm.toFixed(1)} km para cumprir o planejado.`}
      </p>

      {alerts.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8, marginTop: "1rem" }}>
          {alerts.map((alert) => {
            const danger = isDangerAlert(alert);
            return (
              <div
                key={alert.title}
                className="app-card-soft"
                style={{
                  padding: "0.85rem 1rem",
                  borderColor: danger ? "rgba(239,68,68,0.2)" : "rgba(245,166,35,0.2)",
                }}
              >
                <p style={{ fontWeight: 700, fontSize: 13, color: danger ? "#c0392b" : "#92560a" }}>
                  {alert.title}
                </p>
                <p style={{ fontSize: 12, color: "#5a1a35", opacity: 0.75, marginTop: 4, lineHeight: 1.5 }}>
                  {alert.text}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
