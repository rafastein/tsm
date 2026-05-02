"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SisrunUploadForm() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!file) {
      setStatus("Selecione um arquivo .xls ou .xlsx.");
      return;
    }

    try {
      setLoading(true);
      setStatus("Enviando planilha...");

      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/sisrun/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus(data.error || "Falha ao processar a planilha.");
        return;
      }

      setStatus("Planilha processada com sucesso.");
      router.refresh();
    } catch {
      setStatus("Erro ao enviar a planilha.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-3xl app-card p-6">
      <h2 className="text-xl font-semibold text-gray-900">Atualizar SisRUN</h2>
      <p className="mt-1 text-sm text-gray-500">
        Envie a planilha exportada para atualizar o planejamento.
      </p>

      <div className="mt-5">
        <label className="block text-sm font-medium text-gray-700">
          Arquivo da planilha
        </label>

        <input
          type="file"
          accept=".xls,.xlsx"
          onChange={(e) => {
            const selected = e.target.files?.[0] ?? null;
            setFile(selected);
            setStatus("");
          }}
          className="mt-2 block w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-700"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="mt-5 rounded-full bg-[#e0007a] px-5 py-3 text-sm font-medium text-white hover:bg-[#bf0068] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Processando..." : "Enviar planilha"}
      </button>

      {status && (
        <p className="mt-4 text-sm text-gray-600">
          {status}
        </p>
      )}
    </form>
  );
}