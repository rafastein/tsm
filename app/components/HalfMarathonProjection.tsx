"use client";

import { useEffect, useRef, useState } from "react";
import {
  Chart,
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Legend,
  Filler,
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
  Filler
);

type LongRunPoint = {
  date: string;
  km: number;
  paceSeconds: number;
  efficiency: number | null;
  fc: number | null;
};

type Props = {
  longRuns: LongRunPoint[];
};

const DIST_HM = 21.097;

const GOALS = [
  { label: "Sub 1h45", totalSec: 1 * 3600 + 45 * 60 },
  { label: "Sub 1h50", totalSec: 1 * 3600 + 50 * 60 },
  { label: "Sub 2h", totalSec: 2 * 3600 },
  { label: "Sub 2h10", totalSec: 2 * 3600 + 10 * 60 },
];

function linReg(xs: number[], ys: number[]) {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0,
    den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  const slope = den ? num / den : 0;
  return { slope, intercept: my - slope * mx };
}

function secToStr(s: number) {
  const m = Math.floor(s / 60),
    sec = Math.round(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function totalTimeStr(s: number) {
  const h = Math.floor(s / 3600),
    m = Math.floor((s % 3600) / 60),
    sec = Math.round(s % 60);
  return `${h}h ${m.toString().padStart(2, "0")}min ${sec.toString().padStart(2, "0")}s`;
}

function formatDateLabel(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

export default function HalfMarathonProjection({ longRuns }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<unknown>(null);

  const [weeks, setWeeks] = useState(10);
  const [pacingFactor, setPacingFactor] = useState(1.04);

  const t0 = longRuns.length
    ? new Date(longRuns[0].date).getTime()
    : Date.now();
  const days = longRuns.map(
    (l) => (new Date(l.date).getTime() - t0) / 86400000
  );
  const today = (Date.now() - t0) / 86400000;

  const paceReg = linReg(
    days,
    longRuns.map((l) => l.paceSeconds)
  );
  const effData = longRuns.filter((l) => l.efficiency !== null);
  const effReg =
    effData.length >= 2
      ? linReg(
          effData.map((l) => (new Date(l.date).getTime() - t0) / 86400000),
          effData.map((l) => l.efficiency as number)
        )
      : null;

  const futureDays = today + weeks * 7;
  const projPace = paceReg.slope * futureDays + paceReg.intercept;
  const projEff = effReg
    ? effReg.slope * futureDays + effReg.intercept
    : null;
  const racePace = projPace * pacingFactor;
  const totalSec = racePace * DIST_HM;

  const pacePerMonth = paceReg.slope * 30;
  const effPerMonth = effReg ? effReg.slope * 30 : null;

  useEffect(() => {
    if (!canvasRef.current || longRuns.length === 0) return;

    if (chartRef.current) {
      (chartRef.current as Chart).destroy();
    }

    const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const textColor = isDark ? "#c2c0b6" : "#5f5e5a";
    const gridColor = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.06)";
    const labels = longRuns.map((l) => formatDateLabel(l.date));

    const config: ChartConfiguration = {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Pace (s/km)",
            data: longRuns.map((l) => l.paceSeconds),
            borderColor: "#e0007a",
            backgroundColor: "rgba(224,0,122,0.08)",
            tension: 0.35,
            yAxisID: "yPace",
            pointRadius: 4,
            pointHoverRadius: 6,
          },
          ...(effData.length >= 2
            ? [
                {
                  label: "Eficiência",
                  data: longRuns.map((l) => l.efficiency ?? null),
                  borderColor: "#1D9E75",
                  backgroundColor: "rgba(29,158,117,0.08)",
                  tension: 0.35,
                  yAxisID: "yEff",
                  pointRadius: 4,
                  pointHoverRadius: 6,
                },
              ]
            : []),
        ],
      },
      options: {
        responsive: true,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: {
            labels: { color: textColor, font: { size: 12 }, boxWidth: 12, padding: 12 },
          },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                if (ctx.dataset.yAxisID === "yPace") {
                  const s = ctx.raw as number;
                  return ` Pace: ${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}/km`;
                }
                return ` Eficiência: ${(ctx.raw as number).toFixed(2)}`;
              },
            },
          },
        },
        scales: {
          x: {
            ticks: { color: textColor, font: { size: 11 } },
            grid: { color: gridColor },
          },
          yPace: {
            type: "linear",
            position: "left",
            reverse: true,
            ticks: {
              color: "#e0007a",
              font: { size: 11 },
              callback: (v) => {
                const n = v as number;
                const m = Math.floor(n / 60), s = n % 60;
                return `${m}:${s.toString().padStart(2, "0")}`;
              },
            },
            grid: { color: gridColor },
          },
          ...(effData.length >= 2
            ? {
                yEff: {
                  type: "linear" as const,
                  position: "right" as const,
                  ticks: { color: "#1D9E75", font: { size: 11 } },
                  grid: { drawOnChartArea: false },
                },
              }
            : {}),
        },
      },
    };

    chartRef.current = new Chart(canvasRef.current, config);

    return () => {
      if (chartRef.current) {
        (chartRef.current as Chart).destroy();
        chartRef.current = null;
      }
    };
  }, [longRuns, effData.length]);

  if (longRuns.length === 0) return null;

  return (
    <div className="rounded-3xl app-card p-6">
      <h3 className="text-xl font-semibold text-gray-900">
        Calculadora de projeção — meia maratona
      </h3>
      <p className="mt-1 text-sm text-gray-500">
        Regressão linear sobre os longões para estimar o tempo em Buenos Aires.
      </p>

      {/* Gráfico */}
      <div className="mt-5">
        <canvas ref={canvasRef} height={180} />
      </div>

      {/* Cards de tendência */}
      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="rounded-2xl app-card-soft p-4">
          <p className="text-xs text-gray-500">Melhora de pace/mês</p>
          <p className="mt-1 text-lg font-bold text-gray-900">
            {pacePerMonth < 0 ? "−" : "+"}
            {Math.abs(pacePerMonth).toFixed(1)}s/km
          </p>
          <p className="text-xs text-gray-400">
            {pacePerMonth < 0 ? "melhorando" : "piora no período"}
          </p>
        </div>

        {effPerMonth !== null && (
          <div className="rounded-2xl app-card-soft p-4">
            <p className="text-xs text-gray-500">Eficiência/mês</p>
            <p className="mt-1 text-lg font-bold text-gray-900">
              {effPerMonth > 0 ? "+" : ""}
              {effPerMonth.toFixed(2)}
            </p>
            <p className="text-xs text-gray-400">
              {effPerMonth > 0 ? "crescendo" : "estabilizando"}
            </p>
          </div>
        )}

        <div className="rounded-2xl app-card-soft p-4">
          <p className="text-xs text-gray-500">Maior longão</p>
          <p className="mt-1 text-lg font-bold text-gray-900">
            {Math.max(...longRuns.map((l) => l.km)).toFixed(1)} km
          </p>
          <p className="text-xs text-gray-400">
            {formatDateLabel(
              longRuns.reduce((a, b) => (a.km >= b.km ? a : b)).date
            )}
          </p>
        </div>

        <div className="rounded-2xl app-card-soft p-4">
          <p className="text-xs text-gray-500">FC média longões</p>
          <p className="mt-1 text-lg font-bold text-gray-900">
            {longRuns.filter((l) => l.fc).length > 0
              ? Math.round(
                  longRuns
                    .filter((l) => l.fc)
                    .reduce((a, b) => a + (b.fc ?? 0), 0) /
                    longRuns.filter((l) => l.fc).length
                ) + " bpm"
              : "—"}
          </p>
          <p className="text-xs text-gray-400">média de {longRuns.length} longões</p>
        </div>
      </div>

      {/* Sliders */}
      <div className="mt-5 space-y-3">
        <div className="flex items-center gap-3">
          <label className="min-w-[130px] text-sm text-gray-500">
            Semanas até a prova
          </label>
          <input
            type="range"
            min={1}
            max={24}
            step={1}
            value={weeks}
            onChange={(e) => setWeeks(Number(e.target.value))}
            className="flex-1"
          />
          <span className="min-w-[52px] text-right text-sm font-medium text-gray-900">
            {weeks} sem
          </span>
        </div>
        <div className="flex items-center gap-3">
          <label className="min-w-[130px] text-sm text-gray-500">
            Fator de pacing
          </label>
          <input
            type="range"
            min={1.0}
            max={1.1}
            step={0.01}
            value={pacingFactor}
            onChange={(e) => setPacingFactor(Number(e.target.value))}
            className="flex-1"
          />
          <span className="min-w-[52px] text-right text-sm font-medium text-gray-900">
            +{Math.round((pacingFactor - 1) * 100)}%
          </span>
        </div>
        <p className="ml-[130px] text-xs text-gray-400">
          +3–5% é o delta típico entre pace de longão e pace de prova na meia
          maratona
        </p>
      </div>

      {/* Resultado */}
      <div className="mt-5 rounded-2xl border-2 border-pink-300 bg-[#e0007a]/10 p-5">
        <p className="text-sm font-medium text-[#b00060]">
          Tempo projetado na meia maratona
        </p>
        <p className="mt-1 text-4xl font-bold tracking-tight text-[#8a1452]">
          {totalTimeStr(totalSec)}
        </p>
        <p className="mt-2 text-sm text-[#b00060]">
          Pace no treino: {secToStr(projPace)}/km → em prova:{" "}
          {secToStr(racePace)}/km
          {projEff !== null && (
            <span className="ml-2 opacity-70">
              · eficiência projetada: {projEff.toFixed(1)}
            </span>
          )}
        </p>

        {/* Badges de metas */}
        <div className="mt-3 flex flex-wrap gap-2">
          {GOALS.map((g) => {
            const ok = totalSec <= g.totalSec;
            const diffSec = Math.abs(totalSec - g.totalSec);
            const diffStr = secToStr(diffSec).replace(":", "min ") + "s";
            return (
              <span
                key={g.label}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  ok
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-red-100 text-red-700"
                }`}
                title={ok ? `${diffStr} de sobra` : `faltam ~${diffStr}`}
              >
                {ok ? `${g.label} ✓` : `${g.label} —`}
                <span className="ml-1 opacity-70">
                  {ok ? `(+${diffStr})` : `(−${diffStr})`}
                </span>
              </span>
            );
          })}
        </div>
      </div>

      {/* Metas de referência */}
      <div className="mt-5">
        <p className="mb-3 text-sm font-medium text-gray-500">
          Pace necessário para cada meta
        </p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {GOALS.map((g) => {
            const needPace = g.totalSec / DIST_HM;
            const ok = totalSec <= g.totalSec;
            const diffSec = Math.abs(totalSec - g.totalSec);
            return (
              <div
                key={g.label}
                className={`rounded-2xl p-3 ${
                  ok ? "bg-emerald-50" : "bg-white/55"
                }`}
              >
                <p className="text-xs text-gray-500">{g.label}</p>
                <p className="mt-1 text-base font-bold text-gray-900">
                  {secToStr(needPace)}/km
                </p>
                <p
                  className={`mt-1 text-xs ${
                    ok ? "text-emerald-600" : "text-red-500"
                  }`}
                >
                  {ok
                    ? `${secToStr(diffSec).replace(":", "min ")}s de sobra`
                    : `faltam ~${secToStr(diffSec).replace(":", "min ")}s`}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
