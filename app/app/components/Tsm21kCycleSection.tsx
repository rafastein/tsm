import type { CSSProperties } from "react";

export type TsmRaceGoal = {
  key: "rio" | "buenos-aires";
  name: string;
  shortName: string;
  date: Date;
  city: string;
  targetPaceSecondsPerKm: number;
  targetWeeklyKm: number;
  targetLongRunKm: number;
  role: string;
};

type Tsm21kCycleSectionProps = {
  races: TsmRaceGoal[];
  currentWeekKm: number;
  plannedWeekKm: number;
  currentWeekLongestRunKm: number;
  longestRunKm: number;
  longRuns16Plus: number;
  longRuns18Plus: number;
  weeklyAdherencePct: number;
};

type PhaseKey = "base" | "build" | "specific" | "polishing";

type Phase = {
  key: PhaseKey;
  label: string;
  shortLabel: string;
  startWeek: number;
  endWeek: number;
  description: string;
  focus: string[];
  recommendedWeeklyVolume: string;
  volumeNote: string;
};

export type TsmCycleInfo = {
  targetRace: TsmRaceGoal;
  daysToRace: number;
  weeksToRace: number;
  phase: Phase;
  phaseIndex: number;
  phaseDateRanges: Record<PhaseKey, string>;
  progress: number;
};

const PHASES: Phase[] = [
  {
    key: "base",
    label: "Base 21K",
    shortLabel: "Base",
    startWeek: 18,
    endWeek: 13,
    description:
      "Consolidar consistência, fortalecer a estrutura e manter o volume sob controle antes do bloco mais específico.",
    focus: ["regularidade semanal", "rodagem leve", "força e mobilidade"],
    recommendedWeeklyVolume: "24–32 km",
    volumeNote: "base segura para sustentar evolução",
  },
  {
    key: "build",
    label: "Construção",
    shortLabel: "Construção",
    startWeek: 12,
    endWeek: 7,
    description:
      "Aumentar volume, manter longões consistentes e introduzir ritmos moderados sem transformar todo treino em prova.",
    focus: ["volume progressivo", "longões 13–16 km", "ritmos controlados"],
    recommendedWeeklyVolume: "30–38 km",
    volumeNote: "faixa de construção para meia maratona",
  },
  {
    key: "specific",
    label: "Específico 21K",
    shortLabel: "Específico",
    startWeek: 6,
    endWeek: 3,
    description:
      "Aproximar o treino da meia: longões de 16–18 km, blocos em ritmo-alvo e teste de hidratação/gel.",
    focus: ["longão 16–18 km", "ritmo de meia", "estratégia de prova"],
    recommendedWeeklyVolume: "34–42 km",
    volumeNote: "bloco central para chegar forte",
  },
  {
    key: "polishing",
    label: "Polimento",
    shortLabel: "Polimento",
    startWeek: 2,
    endWeek: 0,
    description:
      "Reduzir volume, preservar ritmo e chegar descansada, confiante e afiada para a largada.",
    focus: ["redução de carga", "sono e recuperação", "leveza nas pernas"],
    recommendedWeeklyVolume: "20–30 km",
    volumeNote: "redução progressiva para absorver o ciclo",
  },
];

const PHASE_INDEX: Record<PhaseKey, number> = {
  base: 0,
  build: 1,
  specific: 2,
  polishing: 3,
};

function normalizeDate(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0);
}

function addDays(date: Date, days: number) {
  const next = normalizeDate(date);
  next.setDate(next.getDate() + days);
  return next;
}

function subtractWeeks(date: Date, weeks: number) {
  return addDays(date, -weeks * 7);
}

function daysUntil(date: Date) {
  return Math.max(0, Math.ceil((date.getTime() - Date.now()) / 86_400_000));
}

function getPhaseKey(weeksToRace: number): PhaseKey {
  if (weeksToRace <= 2) return "polishing";
  if (weeksToRace <= 6) return "specific";
  if (weeksToRace <= 12) return "build";
  return "base";
}

function getPhaseStartDate(raceDate: Date, phase: Phase) {
  return subtractWeeks(raceDate, phase.startWeek);
}

function getPhaseEndDate(raceDate: Date, phase: Phase) {
  if (phase.endWeek <= 0) return normalizeDate(raceDate);
  return addDays(subtractWeeks(raceDate, phase.endWeek - 1), -1);
}

function formatDateRangePart(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  }).format(date);
}

function formatDateRange(startDate: Date, endDate: Date) {
  return `${formatDateRangePart(startDate)}–${formatDateRangePart(endDate)}`;
}

function formatKm(value: number) {
  if (!Number.isFinite(value)) return "0 km";
  return `${value.toFixed(1).replace(".", ",")} km`;
}

function formatPct(value: number) {
  if (!Number.isFinite(value)) return "0%";
  return `${Math.round(value)}%`;
}

function formatPace(secondsPerKm: number) {
  const minutes = Math.floor(secondsPerKm / 60);
  const seconds = Math.round(secondsPerKm % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}/km`;
}

function getTargetRace(races: TsmRaceGoal[]) {
  const ordered = [...races].sort((a, b) => a.date.getTime() - b.date.getTime());
  return ordered.find((race) => race.date.getTime() >= Date.now()) ?? ordered[ordered.length - 1];
}

export function getTsm21kCycleInfo(races: TsmRaceGoal[]): TsmCycleInfo {
  const targetRace = getTargetRace(races);
  const remainingDays = daysUntil(targetRace.date);
  const weeksToRace = Math.max(0, Math.ceil(remainingDays / 7));
  const phaseKey = getPhaseKey(weeksToRace);
  const phase = PHASES.find((item) => item.key === phaseKey) ?? PHASES[0];

  const phaseDateRanges = PHASES.reduce(
    (acc, item) => {
      acc[item.key] = formatDateRange(
        getPhaseStartDate(targetRace.date, item),
        getPhaseEndDate(targetRace.date, item),
      );
      return acc;
    },
    {} as Record<PhaseKey, string>,
  );

  const progress = Math.max(0, Math.min(100, ((18 - weeksToRace) / 18) * 100));

  return {
    targetRace,
    daysToRace: remainingDays,
    weeksToRace,
    phase,
    phaseIndex: PHASE_INDEX[phase.key],
    phaseDateRanges,
    progress,
  };
}

function getStatusTone(
  phaseKey: PhaseKey,
  weeklyAdherencePct: number,
  currentWeekLongestRunKm: number,
  longRuns16Plus: number,
  longRuns18Plus: number,
) {
  if (phaseKey === "polishing") return "polishing";

  if (phaseKey === "specific") {
    if (currentWeekLongestRunKm >= 16 && weeklyAdherencePct >= 80) return "on-track";
    if (weeklyAdherencePct < 65) return "attention";
    return "building";
  }

  if (phaseKey === "build") {
    if (currentWeekLongestRunKm >= 13 && weeklyAdherencePct >= 80) return "on-track";
    if (weeklyAdherencePct < 65) return "attention";
    return "building";
  }

  if (longRuns16Plus > 0 || longRuns18Plus > 0 || weeklyAdherencePct >= 85) {
    return "on-track";
  }

  return "building";
}

function getStatusLabel(tone: string) {
  if (tone === "on-track") return "No caminho";
  if (tone === "attention") return "Ponto de atenção";
  if (tone === "polishing") return "Hora de absorver";
  return "Em construção";
}

function getNextMilestone(phaseKey: PhaseKey, targetRace: TsmRaceGoal) {
  if (phaseKey === "base") {
    return "Manter consistência semanal e preparar o corpo para subir os longões sem pressa.";
  }

  if (phaseKey === "build") {
    return "Estabilizar longões entre 13 km e 16 km e manter a semana dentro da faixa recomendada.";
  }

  if (phaseKey === "specific") {
    return `Chegar ao longão de ${targetRace.targetLongRunKm} km e testar ritmo, hidratação e gel.`;
  }

  return "Reduzir volume, manter estímulos curtos e chegar leve para a largada.";
}

export default function Tsm21kCycleSection({
  races,
  currentWeekKm,
  plannedWeekKm,
  currentWeekLongestRunKm,
  longestRunKm,
  longRuns16Plus,
  longRuns18Plus,
  weeklyAdherencePct,
}: Tsm21kCycleSectionProps) {
  const cycle = getTsm21kCycleInfo(races);
  const targetRace = cycle.targetRace;
  const currentPhase = cycle.phase;
  const currentIndex = cycle.phaseIndex;
  const statusTone = getStatusTone(
    currentPhase.key,
    weeklyAdherencePct,
    currentWeekLongestRunKm,
    longRuns16Plus,
    longRuns18Plus,
  );

  const adherenceLabel =
    plannedWeekKm > 0
      ? `${formatPct(weeklyAdherencePct)} da semana planejada`
      : "sem SisRUN carregado";

  return (
    <section
      className="tsm-card tsm-cycle-card"
      style={{ "--cycle-progress": `${cycle.progress}%` } as CSSProperties}
    >
      <div className="tsm-cycle-card__header">
        <div>
          <p className="tsm-eyebrow">Projeto TSM · ciclo 21K</p>
          <h2>Fase atual: {currentPhase.label}</h2>
          <p>
            Próxima meta: <strong>{targetRace.shortName}</strong> em{" "}
            {cycle.weeksToRace} semanas / {cycle.daysToRace} dias. {currentPhase.description}
          </p>
        </div>

        <div className={`tsm-status-pill tsm-status-pill--${statusTone}`}>
          {getStatusLabel(statusTone)}
        </div>
      </div>

      <div className="tsm-cycle-timeline" aria-label="Linha do tempo do ciclo de meia maratona">
        <div className="tsm-cycle-timeline__track">
          <div className="tsm-cycle-timeline__progress" />
        </div>

        <div className="tsm-cycle-timeline__steps">
          {PHASES.map((phase, index) => {
            const isPast = index < currentIndex;
            const isCurrent = index === currentIndex;

            return (
              <div
                key={phase.key}
                className={[
                  "tsm-cycle-step",
                  isPast ? "tsm-cycle-step--past" : "",
                  isCurrent ? "tsm-cycle-step--current" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <div className="tsm-cycle-step__dot">
                  {isCurrent && <span className="tsm-cycle-step__pulse" />}
                </div>

                <div>
                  <strong>{phase.shortLabel}</strong>
                  <span>{cycle.phaseDateRanges[phase.key]}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="tsm-cycle-grid">
        <div className="tsm-cycle-insights">
          <div className="tsm-cycle-focus">
            <p className="tsm-eyebrow">Prioridade da fase</p>
            <ul>
              {currentPhase.focus.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          <div className="tsm-cycle-volume">
            <p className="tsm-eyebrow">Volume médio recomendado</p>
            <strong>{currentPhase.recommendedWeeklyVolume}</strong>
            <span>por semana</span>
            <small>{currentPhase.volumeNote}</small>
          </div>
        </div>

        <div className="tsm-cycle-metrics">
          <div>
            <span>Semana atual</span>
            <strong>{formatKm(currentWeekKm)}</strong>
            <small>{adherenceLabel}</small>
          </div>

          <div>
            <span>Maior longão da semana</span>
            <strong>{formatKm(currentWeekLongestRunKm)}</strong>
            <small>maior histórico: {formatKm(longestRunKm)}</small>
          </div>

          <div>
            <span>Longões 16 km+</span>
            <strong>{longRuns16Plus}</strong>
            <small>{longRuns18Plus} acima de 18 km</small>
          </div>

          <div>
            <span>Ritmo-alvo da meta</span>
            <strong>{formatPace(targetRace.targetPaceSecondsPerKm)}</strong>
            <small>{targetRace.shortName}</small>
          </div>
        </div>
      </div>

      <div className="tsm-cycle-next">
        <span>Próximo marco</span>
        <strong>{getNextMilestone(currentPhase.key, targetRace)}</strong>
      </div>
    </section>
  );
}
