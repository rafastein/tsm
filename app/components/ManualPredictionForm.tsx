"use client";

import { useState } from "react";

type Props = {
  initialValue: string;
};

export default function ManualPredictionForm({ initialValue }: Props) {
  const [value, setValue] = useState(initialValue);
  const [status, setStatus] = useState("");

  async function handleSave() {
    try {
      setStatus("Salvando...");

      const res = await fetch("/api/predictions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          stravaMarathonPrediction: value,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus(data.error || "Erro ao salvar.");
        return;
      }

      setStatus("Previsão atualizada com sucesso.");
      window.location.reload();
    } catch {
      setStatus("Erro ao salvar previsão.");
    }
  }

  return (
    <div className="rounded-2xl app-card-soft p-4">
      <p className="text-sm text-gray-500">Projeção da meia no Strava (manual)</p>

      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Ex: 01:59:33"
        className="mt-3 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900"
      />

      <button
        onClick={handleSave}
        className="mt-3 rounded-full bg-[#e0007a] px-4 py-2 text-sm font-medium text-white hover:bg-[#bf0068]"
      >
        Salvar previsão
      </button>

      {status && <p className="mt-2 text-sm text-gray-600">{status}</p>}
    </div>
  );
}