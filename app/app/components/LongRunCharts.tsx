"use client";

import { useEffect, useRef, useState } from "react";
import type { TooltipItem } from "chart.js";

export type LongRunChartEntry = {
  id: number | string;
  date: string;
  distanceKm: number;
  paceSecPerKm: number | null;
  averageHeartrate: number | null;
  maxHeartrate: number | null;
  efficiency: number | null;
};

type Props = { longRuns: LongRunChartEntry[] };
type ChartMode = "pace" | "heartrate" | "efficiency";

function formatShortDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  } catch {
    return dateStr.slice(0, 10);
  }
}

export function formatPace(secPerKm: number | null): string {
  if (!secPerKm || !Number.isFinite(secPerKm)) return "-";
  const min = Math.floor(secPerKm / 60);
  const sec = Math.round(secPerKm % 60);
  return `${min}:${String(sec === 60 ? 0 : sec).padStart(2, "0")}`;
}

const TABS: { key: ChartMode; label: string }[] = [
  { key: "pace",        label: "Ritmo" },
  { key: "heartrate",   label: "Freq. cardíaca" },
  { key: "efficiency",  label: "Eficiência" },
];

export default function LongRunCharts({ longRuns }: Props) {
  const chartRef      = useRef<HTMLCanvasElement>(null);
  const chartInstance = useRef<unknown>(null);
  const [mode, setMode] = useState<ChartMode>("pace");

  const sorted = [...longRuns].reverse();
  const labels = sorted.map((r) => formatShortDate(r.date));

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const { Chart, registerables } = await import("chart.js");
      Chart.register(...registerables);
      if (cancelled || !chartRef.current) return;

      if (chartInstance.current) {
        (chartInstance.current as { destroy: () => void }).destroy();
        chartInstance.current = null;
      }

      const gridColor = "rgba(224,0,122,0.08)";
      const tickColor = "rgba(58,10,34,0.45)";

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let datasets: any[] = [];
      let scales: Record<string, unknown> = {};

      if (mode === "pace") {
        datasets = [{
          label: "Ritmo (min/km)",
          data: sorted.map((r) => r.paceSecPerKm ? r.paceSecPerKm / 60 : null),
          borderColor: "#e0007a",
          backgroundColor: "rgba(224,0,122,0.08)",
          fill: true, tension: 0.4, pointRadius: 5,
          pointBackgroundColor: "#e0007a",
          pointBorderColor: "#fff", pointBorderWidth: 1.5,
          spanGaps: true,
        }];
        scales = {
          x: { ticks: { color: tickColor, font: { size: 10 }, maxRotation: 45 }, grid: { color: gridColor } },
          y: {
            reverse: true, min: 4.5, max: 7.5,
            ticks: { color: tickColor, font: { size: 10 },
              callback: (v: unknown) => { const val = typeof v === "number" ? v : 0; const m = Math.floor(val); const s = Math.round((val - m) * 60); return `${m}:${String(s).padStart(2, "0")}`; }
            },
            grid: { color: gridColor },
          },
        };
      } else if (mode === "heartrate") {
        datasets = [
          { label: "FC média",   data: sorted.map((r) => r.averageHeartrate), borderColor: "#e0007a", backgroundColor: "rgba(224,0,122,0.08)", fill: true, tension: 0.4, pointRadius: 4, spanGaps: true },
          { label: "FC máxima",  data: sorted.map((r) => r.maxHeartrate), borderColor: "#f97316", backgroundColor: "transparent", borderDash: [4,3], tension: 0.4, pointRadius: 2, spanGaps: true },
        ];
        scales = {
          x: { ticks: { color: tickColor, font: { size: 10 }, maxRotation: 45 }, grid: { color: gridColor } },
          y: { min: 130, max: 195, ticks: { color: tickColor, font: { size: 10 }, callback: (v: unknown) => `${v} bpm` }, grid: { color: gridColor } },
        };
      } else {
        datasets = [{
          label: "Eficiência",
          data: sorted.map((r) => r.efficiency),
          borderColor: "#10b981", backgroundColor: "rgba(16,185,129,0.08)",
          fill: true, tension: 0.4, pointRadius: 5,
          pointBackgroundColor: sorted.map((r) => r.efficiency && r.efficiency > 15 ? "#10b981" : "#d86aa8"),
          spanGaps: true,
        }];
        scales = {
          x: { ticks: { color: tickColor, font: { size: 10 }, maxRotation: 45 }, grid: { color: gridColor } },
          y: { ticks: { color: tickColor, font: { size: 10 }, callback: (v: unknown) => typeof v === "number" ? v.toFixed(1) : v }, grid: { color: gridColor } },
        };
      }

      chartInstance.current = new Chart(chartRef.current, {
        type: "line",
        data: { labels, datasets },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: datasets.length > 1 },
            tooltip: {
              callbacks: {
                label: (ctx: TooltipItem<"line">) => {
                  if (mode === "pace") { const val = ctx.raw as number | null; if (!val) return "-"; const m = Math.floor(val); const s = Math.round((val - m) * 60); return `Ritmo: ${m}:${String(s).padStart(2, "0")} min/km`; }
                  if (mode === "heartrate") return `${ctx.dataset.label}: ${ctx.raw} bpm`;
                  return `Eficiência: ${(ctx.raw as number | null)?.toFixed(3) ?? "-"}`;
                },
                afterLabel: (ctx: TooltipItem<"line">) => `${sorted[ctx.dataIndex].distanceKm.toFixed(1)} km`,
              },
            },
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          scales: scales as any,
        },
      });
    }

    init();
    return () => { cancelled = true; };
  }, [mode, sorted, labels]);

  useEffect(() => {
    return () => { if (chartInstance.current) (chartInstance.current as { destroy: () => void }).destroy(); };
  }, []);

  return (
    <div className="app-card" style={{ padding: "1.5rem 1.75rem" }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem", marginBottom: "1.25rem" }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: "#3d0a22" }}>Evolução dos longões</h2>
          <p style={{ fontSize: 12, color: "#8a1452", opacity: 0.6, marginTop: 4 }}>
            {sorted.length} longões — do mais antigo ao mais recente
          </p>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setMode(tab.key)}
              style={{
                padding: "6px 14px", borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: "pointer", border: "1.5px solid",
                background: mode === tab.key ? "rgba(224,0,122,0.12)" : "transparent",
                borderColor: mode === tab.key ? "rgba(224,0,122,0.35)" : "rgba(224,0,122,0.15)",
                color: mode === tab.key ? "#c0006b" : "#8a1452",
                opacity: mode === tab.key ? 1 : 0.65,
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ position: "relative", height: 300 }}>
        <canvas ref={chartRef} role="img" aria-label={`Gráfico de ${mode} nos longões`} />
      </div>

      <div style={{ marginTop: "0.75rem", display: "flex", flexWrap: "wrap", gap: "0.75rem", fontSize: 11, color: "#8a1452", opacity: 0.55 }}>
        {mode === "pace" && <span>● Ritmo médio — menor = mais rápido</span>}
        {mode === "heartrate" && <><span style={{ color: "#e0007a" }}>● FC média</span><span style={{ color: "#f97316" }}>● FC máxima</span></>}
        {mode === "efficiency" && <span>● Eficiência = velocidade ajustada / FC — maior é melhor</span>}
      </div>
    </div>
  );
}
