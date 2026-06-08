"use client";

import { useEffect, useMemo, useRef } from "react";
import type { ChartDataset } from "chart.js";

export type WeekEntry = {
  label: string;
  planned: number;
  actual: number;
};

type Props = {
  weeks: WeekEntry[];
  title?: string;
  subtitle?: string;
};

function getAdherence(week: WeekEntry) {
  if (week.planned <= 0) return 0;
  return (week.actual / week.planned) * 100;
}

function getWeekMessage(week: WeekEntry) {
  if (week.planned <= 0) return "Sem volume planejado para esta semana.";
  const diff = week.actual - week.planned;
  if (diff >= 0) return `Meta semanal cumprida. Excedente de ${diff.toFixed(1)} km.`;
  return `Faltam ${Math.abs(diff).toFixed(1)} km para cumprir o planejado.`;
}

function parseBrDatePart(value: string, fallbackYear: number) {
  const [day, month, year] = value.trim().split("/").map(Number);
  if (!day || !month) return null;
  return new Date(year || fallbackYear, month - 1, day, 12, 0, 0, 0);
}

function isCurrentWeekLabel(label: string) {
  const now = new Date();
  const normalized = label.replace(/\s/g, "").replace(/[–—]/g, "-");
  const [startRaw, endRaw] = normalized.split("-");
  if (!startRaw || !endRaw) return false;
  const start = parseBrDatePart(startRaw, now.getFullYear());
  const end   = parseBrDatePart(endRaw,   now.getFullYear());
  if (!start || !end) return false;
  if (end.getTime() < start.getTime()) end.setFullYear(end.getFullYear() + 1);
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return now >= start && now <= end;
}

export default function WeeklyPlanVsActualChart({
  weeks,
  title   = "Volume semanal — planejado vs. executado",
  subtitle = "SisRUN x Strava por semana",
}: Props) {
  const chartRef      = useRef<HTMLCanvasElement>(null);
  const chartInstance = useRef<unknown>(null);

  const decorated = useMemo(() =>
    weeks.map((week, i) => ({
      ...week,
      adherence:   getAdherence(week),
      isCurrent:   i === 0 || isCurrentWeekLabel(week.label),
      message:     getWeekMessage(week),
    })),
    [weeks],
  );

  const totalPlanned  = weeks.reduce((s, w) => s + w.planned, 0);
  const totalActual   = weeks.reduce((s, w) => s + w.actual,  0);
  const avgAdherence  = totalPlanned > 0 ? (totalActual / totalPlanned) * 100 : 0;
  const validWeeks    = weeks.filter((w) => w.planned > 0);
  const weeksOnTarget = validWeeks.filter((w) => w.actual / w.planned >= 0.9).length;
  const bestWeekKm    = weeks.length ? Math.max(...weeks.map((w) => w.actual)) : 0;
  const avgWeekKm     = weeks.length ? totalActual / weeks.length : 0;

  useEffect(() => {
    let cancelled = false;

    async function render() {
      if (!chartRef.current || weeks.length === 0) return;
      const { Chart, registerables } = await import("chart.js");
      Chart.register(...registerables);
      if (cancelled || !chartRef.current) return;
      if (chartInstance.current) { (chartInstance.current as { destroy: () => void }).destroy(); chartInstance.current = null; }

      const gridColor = "rgba(224,0,122,0.07)";
      const tickColor = "rgba(58,10,34,0.45)";

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const datasets: ChartDataset<any, any>[] = [
        {
          type: "bar" as const, label: "Planejado (SisRUN)",
          data: weeks.map((w) => w.planned),
          backgroundColor: "rgba(224,0,122,0.12)", borderColor: "rgba(224,0,122,0.25)",
          borderWidth: 1, borderRadius: 4, order: 2,
        },
        {
          type: "bar" as const, label: "Executado (Strava)",
          data: weeks.map((w) => w.actual),
          backgroundColor: weeks.map((w) => {
            const r = w.planned > 0 ? w.actual / w.planned : 1;
            if (r >= 0.9) return "#e0007a";
            if (r >= 0.7) return "#f97316";
            return "#f87171";
          }),
          borderRadius: 4, order: 1,
        },
        {
          type: "line" as const, label: "Aderência %",
          data: weeks.map((w) => w.planned > 0 ? Math.min((w.actual / w.planned) * 100, 130) : null),
          borderColor: "#8b5cf6", backgroundColor: "transparent",
          pointRadius: 3, pointBackgroundColor: "#8b5cf6",
          tension: 0.4, spanGaps: true, yAxisID: "yPct", order: 0,
        },
      ];

      chartInstance.current = new Chart(chartRef.current, {
        type: "bar",
        data: { labels: weeks.map((w) => w.label), datasets },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: (ctx) => {
              if (ctx.dataset.label === "Aderência %") return `Aderência: ${(ctx.raw as number | null)?.toFixed(0) ?? "-"}%`;
              return `${ctx.dataset.label}: ${(ctx.raw as number).toFixed(1)} km`;
            }}},
          },
          scales: {
            x: { ticks: { color: tickColor, font: { size: 8 }, maxRotation: 35, autoSkip: false }, grid: { color: gridColor } },
            y: { ticks: { color: tickColor, font: { size: 8 }, callback: (v: unknown) => `${v} km` }, grid: { color: gridColor } },
            yPct: { position: "right" as const, min: 0, max: 130, ticks: { color: "#8b5cf6", font: { size: 8 }, callback: (v: unknown) => `${v}%` }, grid: { display: false } },
          },
        },
      });
    }

    render();
    return () => { cancelled = true; };
  }, [weeks]);

  useEffect(() => {
    return () => { if (chartInstance.current) (chartInstance.current as { destroy: () => void }).destroy(); };
  }, []);

  // Cor do badge de aderência
  const adherenceBadgeStyle = avgAdherence >= 90
    ? { bg: "rgba(16,185,129,0.10)", color: "#0a7a54", border: "rgba(16,185,129,0.25)" }
    : avgAdherence >= 70
    ? { bg: "rgba(245,166,35,0.10)", color: "#92560a", border: "rgba(245,166,35,0.25)" }
    : { bg: "rgba(239,68,68,0.10)",  color: "#c0392b", border: "rgba(239,68,68,0.20)" };

  return (
    <div className="app-card" style={{ padding: "1.25rem 1.5rem" }}>
      {/* Header */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: "0.75rem", marginBottom: "1rem" }}>
        <div>
          <p style={{ fontSize: 11, fontWeight: 500, color: "#8a1452", opacity: 0.55, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Planejado × executado
          </p>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: "#3d0a22", marginTop: 6 }}>{title}</h2>
          <p style={{ fontSize: 12, color: "#8a1452", opacity: 0.6, marginTop: 4 }}>{subtitle}</p>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          <span style={{ padding: "3px 10px", borderRadius: 999, fontSize: 10, fontWeight: 600, background: "rgba(224,0,122,0.10)", color: "#c0006b", border: "1px solid rgba(224,0,122,0.2)" }}>
            {totalActual.toFixed(0)} km feitos
          </span>
          <span style={{ padding: "3px 10px", borderRadius: 999, fontSize: 10, fontWeight: 600, background: "rgba(0,0,0,0.04)", color: "#5a1a35", border: "1px solid rgba(0,0,0,0.08)" }}>
            {totalPlanned.toFixed(0)} km planejados
          </span>
          <span style={{ padding: "3px 10px", borderRadius: 999, fontSize: 10, fontWeight: 600, background: adherenceBadgeStyle.bg, color: adherenceBadgeStyle.color, border: `1px solid ${adherenceBadgeStyle.border}` }}>
            {avgAdherence.toFixed(0)}% aderência
          </span>
        </div>
      </div>

      {/* Gráfico */}
      <div style={{ position: "relative", height: 220, borderRadius: 12, border: "1px solid rgba(224,0,122,0.08)", background: "rgba(255,255,255,0.5)", padding: 8 }}>
        <canvas ref={chartRef} role="img" aria-label="Volume semanal planejado vs executado" />
      </div>

      {/* Lista de semanas */}
      <div style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: 8 }}>
        {decorated.map((week) => {
          const adherence = Math.min(week.adherence, 100);
          const barColor  = week.adherence >= 90 ? "#e0007a" : week.adherence >= 70 ? "#f97316" : "#f87171";
          return (
            <div
              key={week.label}
              className="app-card-soft"
              style={{ padding: "0.85rem 1rem", border: week.isCurrent ? "1.5px solid rgba(224,0,122,0.35)" : undefined }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#3d0a22" }}>{week.label}</span>
                    {week.isCurrent && (
                      <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 999, background: "rgba(224,0,122,0.12)", color: "#c0006b" }}>
                        Semana atual
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: 11, color: "#8a1452", opacity: 0.6, marginTop: 2 }}>Progresso real</p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: "#3d0a22" }}>{week.actual.toFixed(1)} / {week.planned.toFixed(1)} km</p>
                  <p style={{ fontSize: 11, color: "#8a1452", opacity: 0.6 }}>{week.adherence.toFixed(0)}% aderência</p>
                </div>
              </div>
              <div style={{ height: 5, borderRadius: 99, background: "rgba(224,0,122,0.10)", overflow: "hidden", marginBottom: 6 }}>
                <div style={{ height: "100%", width: `${adherence}%`, borderRadius: 99, background: barColor }} />
              </div>
              <p style={{ fontSize: 11, color: "#5a1a35", opacity: 0.7 }}>{week.message}</p>
            </div>
          );
        })}
      </div>

      {/* Legenda */}
      <div style={{ marginTop: "0.75rem", display: "flex", flexWrap: "wrap", gap: "0.5rem 1rem", fontSize: 10, color: "#8a1452", opacity: 0.5 }}>
        <span>● <span style={{ color: "#e0007a", opacity: 1 }}>Rosa</span> = ≥90%</span>
        <span>● <span style={{ color: "#f97316", opacity: 1 }}>Laranja</span> = 70–89%</span>
        <span>● <span style={{ color: "#f87171", opacity: 1 }}>Vermelho</span> = &lt;70%</span>
        <span>— <span style={{ color: "#8b5cf6", opacity: 1 }}>Roxo</span> = aderência %</span>
      </div>

      {/* Sumário */}
      {weeks.length > 0 && (
        <div className="app-card-soft" style={{ marginTop: "0.75rem", padding: "0.75rem 1rem" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, textAlign: "center" }}>
            {[
              { label: "Semanas no alvo", value: `${weeksOnTarget}/${validWeeks.length}` },
              { label: "Melhor semana",   value: `${bestWeekKm.toFixed(1)} km` },
              { label: "Média semanal",   value: `${avgWeekKm.toFixed(1)} km` },
            ].map((item) => (
              <div key={item.label}>
                <p style={{ fontSize: 10, color: "#8a1452", opacity: 0.55 }}>{item.label}</p>
                <p style={{ fontSize: 13, fontWeight: 600, color: "#3d0a22", marginTop: 3 }}>{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
