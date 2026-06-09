"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ComposableMap,
  Geographies,
  Geography,
} from "@vnedyalk0v/react19-simple-maps";
import { feature } from "topojson-client";

type Props = {
  counts: Record<string, number>;
};

const geoUrl = "/maps/brazil-states.geojson";
const MAP_CENTER = [-53.4, -16.2] as any;

function normalizeText(value: string) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function getFill(count: number) {
  if (count >= 8) return "#9a3412";
  if (count >= 4) return "#ea580c";
  if (count >= 2) return "#fb923c";
  if (count >= 1) return "#fed7aa";
  return "#e5e7eb";
}

function getStateKeys(geo: any) {
  const rawSigla = String(
    geo?.properties?.sigla ??
      geo?.properties?.SIGLA ??
      geo?.properties?.uf ??
      geo?.properties?.UF ??
      ""
  ).trim();

  const rawNome = String(
    geo?.properties?.name ??
      geo?.properties?.NAME ??
      geo?.properties?.nome ??
      geo?.properties?.NOME ??
      geo?.properties?.estado ??
      ""
  ).trim();

  return {
    sigla: normalizeText(rawSigla),
    nome: normalizeText(rawNome),
    rawSigla,
    rawNome,
  };
}

function isFeatureCollection(data: any) {
  return data?.type === "FeatureCollection" && Array.isArray(data.features);
}

function isTopology(data: any) {
  return data?.type === "Topology" && data.objects;
}

export default function BrazilRaceMap({ counts }: Props) {
  const [geographyData, setGeographyData] = useState<any>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const hasHighlights = useMemo(
    () => Object.values(counts).some((v) => v > 0),
    [counts]
  );

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        setLoadError(null);

        const res = await fetch(geoUrl, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();

        if (isFeatureCollection(data)) {
          if (active) setGeographyData(data);
          return;
        }

        if (isTopology(data)) {
          const key = Object.keys(data.objects)[0];
          if (!key) throw new Error("TopoJSON inválido");

          const converted = feature(data, data.objects[key]);
          if (active) setGeographyData(converted);
          return;
        }

        throw new Error("Formato não suportado");
      } catch (err) {
        console.error("Erro mapa Brasil:", err);
        if (active) {
          setGeographyData(null);
          setLoadError("Não foi possível carregar o mapa.");
        }
      }
    }

    load();

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="rounded-3xl app-card p-6">
      <h2 className="text-xl font-semibold text-gray-900">Mapa do Brasil</h2>

      <p className="mt-1 text-sm text-gray-500">
        Visualização das corridas por estado.
      </p>

      <div className="mt-4 overflow-hidden rounded-2xl border border-pink-200/60 bg-[linear-gradient(180deg,#fff,#f8fafc)] p-1">
        <div className="w-full rounded-xl bg-white">
          {loadError ? (
            <div className="flex h-[540px] items-center justify-center text-sm text-gray-500">
              {loadError}
            </div>
          ) : !geographyData ? (
            <div className="flex h-[540px] items-center justify-center text-sm text-gray-400">
              Carregando mapa...
            </div>
          ) : (
            <ComposableMap
              projection="geoMercator"
              projectionConfig={{
                scale: 700,
                center: MAP_CENTER,
              }}
              width={540}
              height={540}
              style={{ width: "100%", height: "auto" }}
            >
              <Geographies geography={geographyData}>
                {({ geographies }) =>
                  geographies.map((geo: any, index: number) => {
                    const { sigla, nome, rawSigla, rawNome } =
                      getStateKeys(geo);

                    const count = counts[sigla] ?? counts[nome] ?? 0;
                    const highlight = count > 0;

                    return (
                      <Geography
                        key={`${rawSigla || rawNome || "uf"}-${index}`}
                        geography={geo}
                        fill={getFill(count)}
                        stroke="#f8fafc"
                        strokeWidth={0.8}
                        style={{
                          default: {
                            outline: "none",
                            transition: "all .2s",
                            filter: highlight
                              ? "drop-shadow(0 4px 8px rgba(0,0,0,0.1))"
                              : "none",
                          },
                          hover: {
                            outline: "none",
                            fill: highlight ? "#f97316" : "#d1d5db",
                          },
                          pressed: {
                            outline: "none",
                          },
                        }}
                      >
                        <title>
                          {`${rawNome || rawSigla}: ${count} corrida(s)`}
                        </title>
                      </Geography>
                    );
                  })
                }
              </Geographies>
            </ComposableMap>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-3 text-xs text-gray-600">
        <Legend color="#e5e7eb" label="0" />
        <Legend color="#fed7aa" label="1" />
        <Legend color="#fb923c" label="2-3" />
        <Legend color="#ea580c" label="4-7" />
        <Legend color="#9a3412" label="8+" />
      </div>

      {!loadError && !hasHighlights && (
        <p className="mt-3 text-sm text-gray-500">
          Nenhum estado com corridas ainda.
        </p>
      )}
    </div>
  );
}

function Legend({
  color,
  label,
}: {
  color: string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="h-3 w-3 rounded-sm border border-pink-200/60"
        style={{ backgroundColor: color }}
      />
      <span>{label}</span>
    </div>
  );
}