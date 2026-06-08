"use client";

import type { CSSProperties } from "react";

type SeasonRaceStatus = "completed" | "next" | "goal" | "simulation";

type SeasonRaceDef = {
  number: string;
  name: string;
  /** DD/MM */
  date: string;
  location: string;
  distanceKm: number;
  fixedStatus?: SeasonRaceStatus;
  featured: boolean;
  badge?: string;
};

type SeasonMonth = { label: string; races: SeasonRaceDef[] };

// Provas da temporada TSM 2026
const ALL_RACES: SeasonMonth[] = [
  {
    label: "MAR",
    races: [
      { number: "01", name: "Meia de Brasília",   date: "22/03", location: "Brasília",        distanceKm: 21.1, featured: true },
    ],
  },
  {
    label: "MAI",
    races: [
      { number: "02", name: "Meia de Lima",        date: "24/05", location: "Lima, Peru",      distanceKm: 21.1, featured: true },
    ],
  },
  {
    label: "JUN",
    races: [
      { number: "03", name: "Meia do Rio",         date: "07/06", location: "Rio de Janeiro",  distanceKm: 21.1, featured: true },
    ],
  },
  {
    label: "AGO",
    races: [
      { number: "04", name: "Meia de Buenos Aires",date: "23/08", location: "Buenos Aires",    distanceKm: 21.1, fixedStatus: "goal",       featured: true },
    ],
  },
];

const S1_MONTHS = new Set(["JAN", "FEV", "MAR", "ABR", "MAI", "JUN"]);

type ResolvedEvent = {
  number: string;
  name: string;
  date: string;
  location: string;
  month: string;
  semester: 1 | 2;
  status: SeasonRaceStatus;
  isPR?: boolean;
  badge?: string;
};

function parseRaceDate(ddmm: string) {
  const [day, month] = ddmm.split("/").map(Number);
  return new Date(2026, month - 1, day).getTime();
}

function resolveEvents(): ResolvedEvent[] {
  const now = Date.now();
  const result: ResolvedEvent[] = [];

  for (const m of ALL_RACES) {
    for (const race of m.races) {
      if (race.fixedStatus) {
        result.push({
          number: race.number, name: race.name, date: race.date,
          location: race.location, month: m.label,
          semester: S1_MONTHS.has(m.label) ? 1 : 2,
          status: race.fixedStatus, badge: race.badge,
        });
        continue;
      }

      const raceTs = parseRaceDate(race.date);
      const isPast = raceTs < now - 86_400_000;

      result.push({
        number: race.number, name: race.name, date: race.date,
        location: race.location, month: m.label,
        semester: S1_MONTHS.has(m.label) ? 1 : 2,
        status: isPast ? "completed" : "next", badge: race.badge,
      });
    }
  }

  return result;
}

function Timeline({ events, label }: { events: ResolvedEvent[]; label: string }) {
  const months = [...new Set(events.map((e) => e.month))];

  return (
    <div style={{ marginBottom: "1.25rem" }}>
      <p style={{ fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(58,10,34,0.35)", marginBottom: "0.6rem" }}>
        {label}
      </p>

      <div style={{ position: "relative", display: "flex", alignItems: "flex-start", overflowX: "auto", paddingBottom: "0.25rem" }}>
        {/* Linha de tempo */}
        <div style={{ position: "absolute", left: 0, right: 0, top: "calc(1.5rem + 2px)", height: 1, background: "rgba(224,0,122,0.12)", pointerEvents: "none" }} />

        {events.map((race, idx) => {
          const isGoal       = race.status === "goal";
          const isCompleted  = race.status === "completed";
          const isSimulation = race.status === "simulation";
          const isNext       = race.status === "next";

          const nodeStyle: CSSProperties = {
            width: isGoal ? 12 : 9,
            height: isGoal ? 12 : 9,
            borderRadius: "50%",
            flexShrink: 0,
            position: "relative",
            zIndex: 1,
            marginBottom: "0.65rem",
            ...(isCompleted  ? { background: "#10b981", boxShadow: "0 0 0 2px rgba(16,185,129,0.2), 0 0 8px rgba(16,185,129,0.35)" } : {}),
            ...(isGoal       ? { background: "#e0007a", boxShadow: "0 0 10px rgba(224,0,122,0.5)" } : {}),
            ...(isNext       ? { background: "transparent", border: "1.5px solid rgba(224,0,122,0.5)" } : {}),
            ...(isSimulation ? { background: "rgba(224,0,122,0.15)", border: "1.5px solid rgba(224,0,122,0.5)" } : {}),
          };

          const nameColor = isCompleted ? "rgba(16,185,129,0.8)" : isGoal ? "#e0007a" : "rgba(58,10,34,0.55)";

          return (
            <div key={race.number} style={{ flex: "1 1 0", minWidth: "7rem", display: "flex", flexDirection: "column", alignItems: "center", position: "relative" }}>
              {/* Mês */}
              <span style={{ height: "1.5rem", fontSize: "0.65rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "#c0006b", opacity: 0.6, lineHeight: "1.5rem" }}>
                {race.month}
              </span>

              <div style={nodeStyle} />

              <div style={{ textAlign: "center", padding: "0 0.15rem", width: "100%" }}>
                <p style={{ fontSize: "0.65rem", fontWeight: 600, color: nameColor, lineHeight: 1.25, marginBottom: "0.2rem", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", height: "1.6rem" }}>
                  {race.name}
                </p>
                <p style={{ fontSize: "0.62rem", color: "rgba(58,10,34,0.4)", fontFamily: "var(--font-geist-mono, monospace)" }}>
                  {race.date}
                </p>
                {isGoal && (
                  <span style={{ display: "inline-block", marginTop: "0.25rem", fontSize: "0.55rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#c0006b", background: "rgba(224,0,122,0.10)", border: "1px solid rgba(224,0,122,0.22)", borderRadius: 999, padding: "0.12rem 0.4rem" }}>
                    OBJETIVO
                  </span>
                )}
                {isCompleted && (
                  <span style={{ display: "inline-block", marginTop: "0.25rem", fontSize: "0.55rem", fontWeight: 700, color: "#0a7a54", background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 999, padding: "0.12rem 0.4rem" }}>
                    ✓ Concluída
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function SeasonCalendar() {
  const events = resolveEvents();
  const s1 = events.filter((e) => e.semester === 1);
  const s2 = events.filter((e) => e.semester === 2);

  return (
    <div className="app-card" style={{ padding: "1.25rem 1.5rem", marginBottom: "1.5rem" }}>
      <p style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em", color: "#8a1452", opacity: 0.55, marginBottom: "1rem" }}>
        Calendário da temporada 2026
      </p>

      <Timeline events={s1} label="1º semestre" />
      {s2.length > 0 && (
        <>
          <div style={{ height: 1, background: "rgba(224,0,122,0.08)", margin: "1rem 0" }} />
          <Timeline events={s2} label="2º semestre" />
        </>
      )}
    </div>
  );
}
