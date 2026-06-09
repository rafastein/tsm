"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Race = {
  name: string;
  date: string;
  location: string;
  distanceKm: number;
  objective: string;
  targetPaceSecPerKm: number | null;
  href?: string;
};

function formatPace(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}/km`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

type Props = { races: Race[] };

export default function NextRaceCard({ races }: Props) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const upcoming = races
    .filter((r) => new Date(r.date).getTime() > now)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  if (upcoming.length === 0) return null;

  const next = upcoming[0];
  const days = daysUntil(next.date);

  return (
    <div className="app-card" style={{ padding: "1.25rem 1.5rem" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: "1rem" }}>
        <div>
          <p style={{ fontSize: 11, fontWeight: 500, color: "#8a1452", opacity: 0.55, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
            Próxima prova
          </p>
          <h3 style={{ fontSize: 17, fontWeight: 700, color: "#3d0a22", marginBottom: 2 }}>{next.name}</h3>
          <p style={{ fontSize: 12, color: "#8a1452", opacity: 0.6 }}>{formatDate(next.date)} · {next.location}</p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
          <span style={{
            display: "inline-block", padding: "4px 12px", borderRadius: 999,
            background: "linear-gradient(135deg, #e0007a, #c0006b)", color: "#fff",
            fontSize: 14, fontWeight: 700,
          }}>
            {days}d
          </span>
          <span style={{ fontSize: 11, color: "#8a1452", opacity: 0.5, fontFamily: "var(--font-geist-mono, monospace)" }}>
            {next.distanceKm} km
          </span>
        </div>
      </div>

      {/* Detalhes */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div className="app-card-soft" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 14px" }}>
          <span style={{ fontSize: 11, color: "#8a1452", opacity: 0.6 }}>Objetivo</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#3d0a22" }}>{next.objective}</span>
        </div>
        {next.targetPaceSecPerKm && (
          <div className="app-card-soft" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 14px" }}>
            <span style={{ fontSize: 11, color: "#8a1452", opacity: 0.6 }}>Pace-alvo</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#c0006b", fontFamily: "var(--font-geist-mono, monospace)" }}>
              {formatPace(next.targetPaceSecPerKm)}
            </span>
          </div>
        )}
      </div>

      {/* Em seguida */}
      {upcoming.length > 1 && (
        <div style={{ marginTop: "1rem", borderTop: "1px solid rgba(224,0,122,0.12)", paddingTop: "1rem" }}>
          <p style={{ fontSize: 11, color: "#8a1452", opacity: 0.55, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>
            Em seguida
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {upcoming.slice(1, 3).map((r) => (
              <div key={r.date} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12 }}>
                <span style={{ color: "#5a1a35" }}>{r.name}</span>
                <span style={{ fontFamily: "var(--font-geist-mono, monospace)", fontSize: 11, color: "#8a1452", opacity: 0.5 }}>
                  {formatDate(r.date)} · {daysUntil(r.date)}d
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CTA */}
      {next.href && (
        <Link
          href={next.href}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            marginTop: "1rem", padding: "10px 0", borderRadius: 999,
            background: "rgba(224,0,122,0.10)", border: "1.5px solid rgba(224,0,122,0.25)",
            color: "#c0006b", fontSize: 13, fontWeight: 600, textDecoration: "none",
            transition: "background 0.15s",
          }}
        >
          Ver painel completo →
        </Link>
      )}
    </div>
  );
}
