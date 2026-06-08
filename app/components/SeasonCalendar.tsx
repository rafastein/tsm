import { getRaceLikeActivitiesFromStrava } from "../lib/strava-races";
import type { RaceLikeEntry } from "../lib/strava-races";

// Prova objetivo — sempre aparece independente do Strava
const GOAL_RACE = {
  name:       "Meia de Buenos Aires",
  date:       "23/08",
  isoDate:    "2026-08-23",
  location:   "Buenos Aires",
  distanceKm: 21.1,
};

function formatRaceDate(isoDate: string): string {
  const d = new Date(isoDate + "T12:00:00");
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthLabel(isoDate: string): string {
  const months = ["JAN","FEV","MAR","ABR","MAI","JUN","JUL","AGO","SET","OUT","NOV","DEZ"];
  return months[new Date(isoDate + "T12:00:00").getMonth()];
}

function isSemester1(isoDate: string): boolean {
  return new Date(isoDate + "T12:00:00").getMonth() < 6;
}

type EventItem = {
  key:       string;
  name:      string;
  dateStr:   string;  // DD/MM
  isoDate:   string;
  month:     string;
  semester:  1 | 2;
  status:    "completed" | "next" | "goal";
  distanceKm?: number;
  time?:     string;
};

function cleanName(raw: string): string {
  return raw.replace(/^\s*prova[:\s-]*/i, "").replace(/\*{3}\s*$/, "").trim() || raw;
}

export default async function SeasonCalendar() {
  // Busca provas do Strava (nome começa com "Prova" ou termina com ***)
  let stravaRaces: RaceLikeEntry[] = [];
  try {
    stravaRaces = await getRaceLikeActivitiesFromStrava();
  } catch {
    // silencioso — exibe apenas o objetivo se falhar
  }

  const now = Date.now();

  // Montar eventos a partir das provas do Strava
  const stravaEvents: EventItem[] = stravaRaces
    .filter((r) => r.date) // só com data válida
    .map((r) => ({
      key:       r.id,
      name:      cleanName(r.name),
      dateStr:   formatRaceDate(r.date),
      isoDate:   r.date,
      month:     getMonthLabel(r.date),
      semester:  (isSemester1(r.date) ? 1 : 2) as 1 | 2,
      status:    "completed" as const,
      distanceKm: r.distanceKm,
      time:      r.time,
    }))
    .sort((a, b) => a.isoDate.localeCompare(b.isoDate));

  // Adicionar objetivo fixo se ainda não foi corrido
  const goalTs  = new Date(GOAL_RACE.isoDate + "T12:00:00").getTime();
  const goalDone = stravaEvents.some((e) => e.isoDate === GOAL_RACE.isoDate);
  const goalEvent: EventItem = {
    key:       "goal-buenos-aires",
    name:      GOAL_RACE.name,
    dateStr:   GOAL_RACE.date,
    isoDate:   GOAL_RACE.isoDate,
    month:     getMonthLabel(GOAL_RACE.isoDate),
    semester:  2,
    status:    goalDone ? "completed" : "goal",
    distanceKm: GOAL_RACE.distanceKm,
  };

  if (!goalDone) stravaEvents.push(goalEvent);

  const allEvents = stravaEvents.sort((a, b) => a.isoDate.localeCompare(b.isoDate));
  const s1 = allEvents.filter((e) => e.semester === 1);
  const s2 = allEvents.filter((e) => e.semester === 2);

  if (allEvents.length === 0) return null;

  return (
    <div className="app-card" style={{ padding: "1.25rem 1.5rem", marginBottom: "1.5rem" }}>
      <p style={{ fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.06em", color: "#8a1452", opacity: 0.55, marginBottom: "1.25rem" }}>
        Calendário da temporada 2026
      </p>

      {s1.length > 0 && <Timeline events={s1} label="1º semestre" />}
      {s1.length > 0 && s2.length > 0 && (
        <div style={{ height: 1, background: "rgba(224,0,122,0.08)", margin: "1rem 0" }} />
      )}
      {s2.length > 0 && <Timeline events={s2} label="2º semestre" />}
    </div>
  );
}

function Timeline({ events, label }: { events: EventItem[]; label: string }) {
  return (
    <div style={{ marginBottom: "0.5rem" }}>
      <p style={{ fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(58,10,34,0.35)", marginBottom: "0.75rem" }}>
        {label}
      </p>

      <div style={{ position: "relative", display: "flex", alignItems: "flex-start", overflowX: "auto", paddingBottom: "0.5rem" }}>
        {/* linha */}
        <div style={{ position: "absolute", left: 0, right: 0, top: "calc(1.5rem + 4px)", height: 1, background: "rgba(224,0,122,0.12)", pointerEvents: "none" }} />

        {events.map((race) => {
          const isGoal      = race.status === "goal";
          const isCompleted = race.status === "completed";

          return (
            <div key={race.key} style={{ flex: "1 1 0", minWidth: "7.5rem", display: "flex", flexDirection: "column", alignItems: "center" }}>
              {/* mês */}
              <span style={{ height: "1.5rem", fontSize: "0.65rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", color: "#c0006b", opacity: isGoal ? 1 : 0.55, lineHeight: "1.5rem" }}>
                {race.month}
              </span>

              {/* nó */}
              <div style={{
                width: isGoal ? 12 : 9,
                height: isGoal ? 12 : 9,
                borderRadius: "50%",
                marginBottom: "0.65rem",
                flexShrink: 0,
                position: "relative",
                zIndex: 1,
                ...(isCompleted ? { background: "#10b981", boxShadow: "0 0 0 2px rgba(16,185,129,0.2), 0 0 8px rgba(16,185,129,0.3)" } : {}),
                ...(isGoal     ? { background: "#e0007a", boxShadow: "0 0 10px rgba(224,0,122,0.5)" } : {}),
                ...(!isCompleted && !isGoal ? { background: "transparent", border: "1.5px solid rgba(224,0,122,0.4)" } : {}),
              }} />

              {/* label */}
              <div style={{ textAlign: "center", padding: "0 0.2rem", width: "100%" }}>
                <p style={{
                  fontSize: "0.65rem", fontWeight: 600, lineHeight: 1.25, marginBottom: "0.2rem",
                  display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
                  color: isCompleted ? "rgba(16,185,129,0.85)" : isGoal ? "#e0007a" : "rgba(58,10,34,0.55)",
                }}>
                  {race.name}
                </p>
                <p style={{ fontSize: "0.62rem", color: "rgba(58,10,34,0.4)", fontFamily: "var(--font-geist-mono, monospace)" }}>
                  {race.dateStr}
                </p>
                {race.distanceKm && (
                  <p style={{ fontSize: "0.58rem", color: "rgba(58,10,34,0.3)", marginTop: 1 }}>
                    {race.distanceKm.toFixed(1)} km
                  </p>
                )}
                {isCompleted && race.time && (
                  <span style={{ display: "inline-block", marginTop: "0.25rem", fontSize: "0.58rem", fontWeight: 700, color: "#0a7a54", background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 999, padding: "0.1rem 0.4rem" }}>
                    {race.time}
                  </span>
                )}
                {isGoal && (
                  <span style={{ display: "inline-block", marginTop: "0.25rem", fontSize: "0.55rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "#c0006b", background: "rgba(224,0,122,0.10)", border: "1px solid rgba(224,0,122,0.22)", borderRadius: 999, padding: "0.12rem 0.4rem" }}>
                    OBJETIVO
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
