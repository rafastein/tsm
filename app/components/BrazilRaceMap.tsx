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
const BRAZIL_MAP_CENTER = [-53.4, -16.2] as [number, number];

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
  return data && data.type === "FeatureCollection" && Array.isArray(data.features);
}

function isTopology(data: any) {
  return data && data.type === "Topology" && data.objects;
}

export default function BrazilRaceMap({ counts }: Props) {
  const [geographyData, setGeographyData] = useState<any>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const hasHighlights = useMemo(
    () => Object.values(counts).some((value) => value > 0),
    [counts]
  );

  useEffect(() => {
    let active = true;

    async function loadGeography() {
      try {
        setLoadError(null);

        const res = await fetch(geoUrl, { cache: "no-store" });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();

        if (isFeatureCollection(data)) {
          if (active) setGeographyData(data);
          return;
        }

        if (isTopology(data)) {
          const objectKey = Object.keys(data.objects)[0];
          if (!objectKey) {
            throw new Error("TopoJSON sem objetos.");
          }

          const converted = feature(data, data.objects[objectKey]);
          if (active) setGeographyData(converted);
          return;
        }

        throw new Error("Formato geográfico não suportado.");
      } catch (error: any) {
        console.error("Erro ao carregar mapa do Brasil:", error);
        if (active) {
          setGeographyData(null);
          setLoadError("Não foi possível carregar os dados do mapa.");
        }
      }
    }

    loadGeography();

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="rounded-3xl bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold text-gray-900">Mapa do Brasil</h2>
      <p className="mt-1 text-sm text-gray-500">
        Visualização geográfica das corridas identificadas por estado.
      </p>

      <div className="mt-4 overflow-hidden rounded-2xl border border-gray-200 bg-[linear-gradient(180deg,#fff,#f8fafc)] p-1">
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
                center: BRAZIL_MAP_CENTER,
              }}
              width={540}
              height={540}
              style={{ width: "100%", height: "auto", display: "block" }}
            >
              <Geographies geography={geographyData}>
                {({ geographies }) =>
                  geographies.map((geo, index) => {
                    const { sigla, nome, rawSigla, rawNome } = getStateKeys(geo);
                    const count = counts[sigla] ?? counts[nome] ?? 0;
                    const isHighlighted = count > 0;

                    return (
                      <Geography
                        key={`${rawSigla || rawNome || "estado"}-${index}`}
                        geography={geo}
                        fill={getFill(count)}
                        stroke="#f8fafc"
                        strokeWidth={0.8}
                        style={{
                          default: {
                            outline: "none",
                            transition: "all 0.2s ease",
                            filter: isHighlighted
                              ? "drop-shadow(0 4px 8px rgba(0,0,0,0.10))"
                              : "none",
                          },
                          hover: {
                            outline: "none",
                            fill: isHighlighted ? "#f97316" : "#d1d5db",
                          },
                          pressed: {
                            outline: "none",
                          },
                        }}
                      >
                        <title>{`${rawNome || rawSigla}: ${count} corrida(s)`}</title>
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
          O mapa carregou, mas nenhum estado recebeu destaque ainda.
        </p>
      )}
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="inline-block h-3 w-3 rounded-sm border border-gray-200"
        style={{ backgroundColor: color }}
      />
      <span>{label}</span>
    </div>
  );
}