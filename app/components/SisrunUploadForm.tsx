"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

export default function SisrunUploadForm() {
  const [file, setFile]     = useState<File | null>(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const router   = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!file) {
      setStatus("Selecione um arquivo .xls ou .xlsx.");
      return;
    }

    try {
      setLoading(true);
      setIsSuccess(false);
      setStatus("Enviando planilha...");

      const formData = new FormData();
      formData.append("file", file);

      const res  = await fetch("/api/sisrun/upload", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) {
        setStatus(data.error || "Falha ao processar a planilha.");
        setIsSuccess(false);
        return;
      }

      const storage = data.storage === "upstash" ? "Redis" : "arquivo local";
      setStatus(`Planilha processada com sucesso. Salvo em ${storage}.`);
      setIsSuccess(true);
      router.refresh();
    } catch {
      setStatus("Erro ao enviar a planilha.");
      setIsSuccess(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-3xl app-card p-6 flex flex-col gap-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: "#e0007a" }}>Upload</p>
        <h2 className="text-xl font-semibold text-gray-900 mt-1">Atualizar SisRUN</h2>
        <p className="mt-1 text-sm text-gray-500">
          Envie a planilha exportada para atualizar o planejamento semanal.
        </p>
      </div>

      <div className="rounded-2xl app-card-soft p-4">
        <p className="text-sm font-medium text-gray-700 mb-3">Arquivo da planilha</p>

        <input
          ref={inputRef}
          type="file"
          accept=".xls,.xlsx"
          className="sr-only"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setStatus("");
            setIsSuccess(false);
          }}
        />

        <div className="flex items-center justify-between gap-3 rounded-xl px-4 py-2.5"
          style={{ background: "rgba(255,255,255,0.7)", border: "1px solid rgba(224,0,122,0.15)" }}>
          <p className="text-sm text-gray-500 truncate min-w-0">
            {file ? file.name : "Nenhum arquivo escolhido"}
          </p>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="rounded-full px-4 py-1.5 text-xs font-semibold flex-shrink-0"
            style={{ background: "rgba(224,0,122,0.10)", color: "#c0006b", border: "1px solid rgba(224,0,122,0.2)" }}
          >
            Escolher arquivo
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={loading}
          className="rounded-full px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60 disabled:cursor-not-allowed"
          style={{ background: loading ? "#c0006b" : "#e0007a" }}
        >
          {loading ? "Processando..." : "Enviar planilha"}
        </button>
        {status && (
          <p className="text-sm" style={{ color: isSuccess ? "#0a7a54" : "#92560a" }}>
            {status}
          </p>
        )}
      </div>
    </form>
  );
}
