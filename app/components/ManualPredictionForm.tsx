"use client";

import { useRef, useState } from "react";

type Props = { initialValue: string };

function isValidTime(value: string): boolean {
  const trimmed = value.trim();
  // Aceita H:MM:SS ou HH:MM:SS
  const match = trimmed.match(/^(\d{1,2}):([0-5]\d):([0-5]\d)$/);
  if (!match) return false;
  const totalSeconds = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
  // Distância mínima equivalente a ~5km em pace razoável (>= 15 minutos)
  return totalSeconds >= 15 * 60;
}

export default function ManualPredictionForm({ initialValue }: Props) {
  const [value, setValue]   = useState(initialValue);
  const [status, setStatus] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleSave() {
    if (!isValidTime(value)) {
      setStatus("Formato inválido. Use H:MM:SS (ex: 01:59:33).");
      setIsSuccess(false);
      inputRef.current?.focus();
      return;
    }

    try {
      setStatus("Salvando...");
      const res  = await fetch("/api/predictions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stravaMarathonPrediction: value }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus(data.error || "Erro ao salvar.");
        setIsSuccess(false);
        return;
      }
      setStatus("Previsão atualizada com sucesso.");
      setIsSuccess(true);
      window.location.reload();
    } catch {
      setStatus("Erro ao salvar previsão.");
      setIsSuccess(false);
    }
  }

  return (
    <div className="rounded-2xl app-card-soft p-4">
      <p className="text-sm font-medium text-gray-700">Projeção da meia no Strava (manual)</p>
      <p className="text-xs text-gray-500 mt-0.5">Formato H:MM:SS — ex: 01:59:33</p>

      <input
        ref={inputRef}
        value={value}
        onChange={(e) => { setValue(e.target.value); setStatus(""); }}
        placeholder="Ex: 01:59:33"
        className="mt-3 w-full rounded-xl border bg-white px-4 py-3 text-sm text-gray-900"
        style={{ borderColor: "rgba(224,0,122,0.2)" }}
      />

      <button
        onClick={handleSave}
        className="mt-3 rounded-full px-4 py-2 text-sm font-semibold text-white"
        style={{ background: "#e0007a" }}
      >
        Salvar previsão
      </button>

      {status && (
        <p className="mt-2 text-sm" style={{ color: isSuccess ? "#0a7a54" : "#92560a" }}>
          {status}
        </p>
      )}
    </div>
  );
}
