"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Legend,
  type ChartConfiguration,
} from "chart.js";

Chart.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Legend,
);

type LongRunPoint = {
  date: string;
  km: number;
  paceSeconds: number;
  efficiency: number | null;
  fc: number | null;
};

type RacePoint = {
  date: string;
  name: string;
  distanceKm: number;
  paceSeconds: number;
};

type Props = {
  longRuns: LongRunPoint[];
  weeksToRace: number;
  races?: RacePoint[];
};

const DIST_HM = 21.0975;
// Pace mínimo projetável: 4:00/km = 240s/km (teto fisiológico para meia)
const PACE_FLOOR_SEC = 240;

const GOALS = [
  { label: "Sub 1h45", totalSec: 1 * 3600 + 45 * 60 },
  { label: "Sub 1h50", totalSec: 1 * 3600 + 50 * 60 },
  { label: "Sub 2h",   totalSec: 2 * 3600 },
  { label: "Sub 2h10", totalSec: 2 * 3600 + 10 * 60 },
];

function linReg(xs: number[], ys: number[]) {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  const slope = den ? num / den : 0;
  return { slope, intercept: my - slope * mx };
}

function secToStr(s: number) {
  if (!Number.isFinite(s)) return "--:--";
  const abs = Math.abs(s);
  const m = Math.floor(abs / 60), sec = Math.round(abs % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function signedSecToStr(s: number) {
  if (!Number.isFinite(s)) return "--:--";
  const sign = s > 0 ? "+" : s < 0 ? "-" : "";
  return `${sign}${secToStr(s)}`;
}

function totalTimeStr(s: number) {
  if (!Number.isFinite(s)) return "--";
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.round(s % 60);
  return `${h}h ${m.toString().padStart(2, "0")}min ${sec.toString().padStart(2, "0")}s`;
}

function formatDateLabel(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function formatDeltaLabel(seconds: number, ok: boolean) {
  const normalized = secToStr(seconds).replace(":", "min ");
  return ok ? `${normalized}s de sobra` : `faltam ~${normalized}s`;
}

export default function HalfMarathonProjection({ longRuns, weeksToRace, races = [] }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef  = useRef<Chart | null>(null);

  const [nLongRuns,    setNLongRuns]    = useState(5);
  const [pacingFactor, setPacingFactor] = useState(1.04);

  const data = useMemo(() => {
    if (!longRuns || longRuns.length === 0) return null;

    const t0   = new Date(longRuns[0].date).getTime();
    const days = longRuns.map((r) => (new Date(r.date).getTime() - t0) / 86400000);
    const today     = (Date.now() - t0) / 86400000;
    const futureDays = today + weeksToRace * 7;

    const paceReg = linReg(days, longRuns.map((r) => r.paceSeconds));

    const effData = longRuns.filter((r) => r.efficiency !== null);
    const effReg  = effData.length >= 2
      ? linReg(
          effData.map((r) => (new Date(r.date).getTime() - t0) / 86400000),
          effData.map((r) => r.efficiency as number),
        )
      : null;

    const projPaceRaw       = paceReg.slope * futureDays + paceReg.intercept;
    const projPaceRegression = Math.max(projPaceRaw, PACE_FLOOR_SEC);
    const projEff            = effReg ? effReg.slope * futureDays + effReg.intercept : null;

    // Pace médio dos últimos N longões (mesmo algoritmo do strava)
    const lastN    = longRuns.slice(-nLongRuns);
    const avgPaceLastN = lastN.reduce((acc, r) => acc + r.paceSeconds, 0) / lastN.length;
    const projPace = Math.max(avgPaceLastN, PACE_FLOOR_SEC);

    const racePace   = projPace * pacingFactor;
    const totalSec   = racePace * DIST_HM;
    const pacePerMonth = paceReg.slope * 30;
    const effPerMonth  = effReg ? effReg.slope * 30 : null;

    const biggestLongRun = longRuns.reduce((a, b) => (a.km >= b.km ? a : b));
    const runsWithFc     = longRuns.filter((r) => r.fc);
    const avgFc          = runsWithFc.length > 0
      ? Math.round(runsWithFc.reduce((a, b) => a + (b.fc ?? 0), 0) / runsWithFc.length)
      : null;

    return {
      t0, effData, projPace, projEff, racePace, totalSec,
      pacePerMonth, effPerMonth, biggestLongRun, avgFc,
    };
  }, [longRuns, weeksToRace, pacingFactor, nLongRuns]);

  useEffect(() => {
    if (!canvasRef.current || !longRuns || longRuns.length === 0 || !data) return;
    if (chartRef.current) chartRef.current.destroy();

    const labels = longRuns.map((r) => formatDateLabel(r.date));

    // Plotar provas próximas no eixo dos longões (mesmo que o strava)
    const raceDataOnAxis:  Array<number | null> = longRuns.map(() => null);
    const raceLabelsOnAxis: Array<string | null> = longRuns.map(() => null);
    races.forEach((race) => {
      const raceTime = new Date(race.date).getTime();
      let nearest = 0, minDiff = Infinity;
      longRuns.forEach((r, idx) => {
        const diff = Math.abs(new Date(r.date).getTime() - raceTime);
        if (diff < minDiff) { minDiff = diff; nearest = idx; }
      });
      if (minDiff < 45 * 86400000) {
        raceDataOnAxis[nearest]  = race.paceSeconds;
        raceLabelsOnAxis[nearest] = race.name;
      }
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const datasets: any[] = [
      {
        label: "Pace",
        data: longRuns.map((r) => r.paceSeconds),
        borderColor: "#e0007a",
        backgroundColor: "rgba(224,0,122,0.08)",
        tension: 0.35,
        yAxisID: "yPace",
        pointRadius: 3,
        pointHoverRadius: 5,
      },
    ];

    if (data.effData.length >= 2) {
      datasets.push({
        label: "Eficiência",
        data: longRuns.map((r) => r.efficiency ?? null),
        borderColor: "#10b981",
        backgroundColor: "rgba(16,185,129,0.08)",
        tension: 0.35,
        yAxisID: "yEff",
        pointRadius: 3,
        pointHoverRadius: 5,
      });
    }

    if (races.length > 0) {
      datasets.push({
        label: "Provas",
        data: raceDataOnAxis,
        borderColor: "transparent",
        backgroundColor: "transparent",
        pointRadius: raceDataOnAxis.map((v) => (v !== null ? 6 : 0)),
        pointHoverRadius: raceDataOnAxis.map((v) => (v !== null ? 8 : 0)),
        pointBackgroundColor: "#8b5cf6",
        pointBorderColor: "#fff",
        pointBorderWidth: 2,
        pointStyle: "rectRot",
        yAxisID: "yPace",
        tension: 0,
        spanGaps: false,
      });
    }

    const config: ChartConfiguration = {
      type: "line",
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: {
            labels: {
              color: "rgba(58,10,34,0.5)",
              font: { size: 10 },
              boxWidth: 10,
              padding: 12,
            },
          },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                if (ctx.dataset.label === "Provas") {
                  const s = ctx.raw as number | null;
                  if (!s) return "";
                  return ` ${raceLabelsOnAxis[ctx.dataIndex] ?? "Prova"}: ${secToStr(s)}/km`;
                }
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                if ((ctx.dataset as any).yAxisID === "yPace") {
                  return ` Pace: ${secToStr(ctx.raw as number)}/km`;
                }
                return ` Eficiência: ${(ctx.raw as number).toFixed(2)}`;
              },
            },
          },
        },
        scales: {
          x: {
            ticks: { color: "rgba(58,10,34,0.4)", font: { size: 10 }, maxRotation: 45 },
            grid:  { color: "rgba(224,0,122,0.07)" },
          },
          yPace: {
            type: "linear", position: "left", reverse: true,
            ticks: {
              color: "#e0007a", font: { size: 10 },
              callback: (v) => secToStr(Number(v)),
            },
            grid: { color: "rgba(224,0,122,0.07)" },
          },
          ...(data.effData.length >= 2 ? {
            yEff: {
              type: "linear" as const, position: "right" as const,
              ticks: { color: "#10b981", font: { size: 10 } },
              grid: { drawOnChartArea: false },
            },
          } : {}),
        },
      },
    };

    chartRef.current = new Chart(canvasRef.current, config);
    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null; } };
  }, [longRuns, races, data]);

  useEffect(() => {
    return () => { if (chartRef.current) { chartRef.current.destroy(); } };
  }, []);

  if (!longRuns || longRuns.length === 0 || !data) return null;

  return (
    <div className="rounded-3xl app-card" style={{ padding: "1.2rem", marginBottom: "1rem" }}>

      {/* Header */}
      <div style={{ marginBottom: "1rem" }}>
        <p style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em", color: "#e0007a" }}>
          Calculadora de projeção
        </p>
        <h2 style={{ fontSize: 20, fontWeight: 750, color: "#3d0a22", marginTop: 8 }}>
          Projeção para Buenos Aires
        </h2>
        <p style={{ fontSize: 12, color: "#8a1452", opacity: 0.6, marginTop: 6, maxWidth: 620 }}>
          Regressão linear sobre os longões para estimar o tempo em Buenos Aires.
        </p>
      </div>

      {/* Métricas */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: "1rem" }}>
        <MetricCard label="Maior longão"     value={`${data.biggestLongRun.km.toFixed(1)} km`} helper={formatDateLabel(data.biggestLongRun.date)} />
        <MetricCard label="FC média"          value={data.avgFc ? `${data.avgFc} bpm` : "--"}  helper="longões com FC" />
        <MetricCard label="Tendência de pace" value={`${signedSecToStr(data.pacePerMonth)}/km`} helper={data.pacePerMonth <= 0 ? "melhorando/mês" : "mais lento/mês"} />
        {data.effPerMonth !== null
          ? <MetricCard label="Eficiência/mês" value={`${data.effPerMonth > 0 ? "+" : ""}${data.effPerMonth.toFixed(2)}`} helper={data.effPerMonth > 0 ? "crescendo" : "estabilizando"} />
          : <MetricCard label="Eficiência/mês" value="--" helper="sem série" />
        }
      </div>

      {/* Gráfico */}
      <div style={{ position: "relative", height: 220, borderRadius: 12, border: "1px solid rgba(224,0,122,0.08)", padding: 8, marginBottom: "1rem" }}>
        <canvas ref={canvasRef} role="img" aria-label="Gráfico de evolução dos longões" />
      </div>

      {/* Controles */}
      <div style={{ background: "rgba(224,0,122,0.04)", borderRadius: 16, padding: "1rem", marginBottom: "1rem" }}>
        <p style={{ margin: "0 0 0.75rem", color: "#8a1452", opacity: 0.6, fontSize: 12 }}>
          <strong style={{ color: "#3d0a22", opacity: 1 }}>{weeksToRace} semanas</strong> até Buenos Aires
        </p>
        <SliderRow
          label="Longões para média"
          valueLabel={`últimos ${nLongRuns}`}
          min={1}
          max={Math.min(10, longRuns.length)}
          step={1}
          value={nLongRuns}
          onChange={setNLongRuns}
        />
        <SliderRow
          label="Fator treino → prova"
          valueLabel={`+${Math.round((pacingFactor - 1) * 100)}%`}
          min={1.00}
          max={1.10}
          step={0.01}
          value={pacingFactor}
          onChange={setPacingFactor}
        />
        <p style={{ margin: 0, fontSize: 11, color: "#8a1452", opacity: 0.5, lineHeight: 1.45 }}>
          +3–5% é o delta típico entre pace de longão e pace de prova na meia maratona.
        </p>
      </div>

      {/* Resultado principal */}
      <div style={{
        borderRadius: 20, padding: "1.25rem 1rem", textAlign: "center",
        background: "linear-gradient(135deg, rgba(224,0,122,0.12), rgba(192,0,107,0.08))",
        border: "1.5px solid rgba(224,0,122,0.28)", marginBottom: 20,
      }}>
        <p style={{ margin: 0, color: "#e0007a", fontSize: 10, fontWeight: 800, letterSpacing: 2, textTransform: "uppercase" }}>
          Tempo projetado na meia maratona
        </p>
        <h3 style={{ color: "#3d0a22", fontSize: 32, lineHeight: 1, fontWeight: 850, marginTop: 10, marginBottom: 8 }}>
          {totalTimeStr(data.totalSec)}
        </h3>
        <p style={{ color: "#8a1452", fontSize: 12, lineHeight: 1.45, margin: 0 }}>
          Pace no treino: {secToStr(data.projPace)}/km → em prova: {secToStr(data.racePace)}/km
          {data.projEff !== null && (
            <span style={{ opacity: 0.7 }}> · eficiência projetada: {data.projEff.toFixed(1)}</span>
          )}
        </p>
      </div>

      {/* Grid de metas */}
      <p style={{ textAlign: "center", color: "#8a1452", opacity: 0.5, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 12 }}>
        Pace necessário para cada meta
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
        {GOALS.map((goal) => {
          const needPace = goal.totalSec / DIST_HM;
          const ok       = data.totalSec <= goal.totalSec;
          const diffSec  = Math.abs(data.totalSec - goal.totalSec);
          return (
            <div
              key={goal.label}
              style={{
                borderRadius: 14, padding: "0.85rem 1rem", textAlign: "center",
                background: ok ? "rgba(16,185,129,0.10)" : "rgba(224,0,122,0.04)",
                border: ok ? "1px solid rgba(16,185,129,0.28)" : "1px solid rgba(224,0,122,0.12)",
              }}
            >
              <p style={{ fontSize: 11, color: "#8a1452", opacity: 0.6, margin: 0 }}>{goal.label}</p>
              <p style={{ fontSize: 16, fontWeight: 700, color: "#3d0a22", margin: "4px 0 2px" }}>
                {secToStr(needPace)}/km
              </p>
              <span style={{ fontSize: 11, color: ok ? "#0a7a54" : "#c0006b" }}>
                {formatDeltaLabel(diffSec, ok)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MetricCard({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <div style={{ background: "rgba(224,0,122,0.04)", border: "1px solid rgba(224,0,122,0.10)", borderRadius: 12, padding: "0.75rem", display: "flex", flexDirection: "column", gap: 4 }}>
      <p style={{ margin: 0, color: "#8a1452", opacity: 0.55, fontSize: 11, lineHeight: 1.2 }}>{label}</p>
      <strong style={{ color: "#3d0a22", fontSize: 16, lineHeight: 1.1 }}>{value}</strong>
      <span style={{ color: "#8a1452", opacity: 0.4, fontSize: 11, lineHeight: 1.2 }}>{helper}</span>
    </div>
  );
}

function SliderRow({ label, valueLabel, min, max, step, value, onChange }: {
  label: string; valueLabel: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
      <span style={{ minWidth: 140, fontSize: 12, color: "#5a1a35" }}>{label}</span>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ flex: 1, accentColor: "#e0007a" }}
      />
      <strong style={{ minWidth: 52, textAlign: "right", fontSize: 12, color: "#3d0a22" }}>{valueLabel}</strong>
    </div>
  );
}
