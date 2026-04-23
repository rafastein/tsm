"use client";

import { useEffect, useState } from "react";
import { geoMercator, geoPath } from "d3-geo";

type Props = {
  counts: Record<string, number>;
};

export default function WorldRaceMap({ counts }: Props) {
  const [geoData, setGeoData] = useState<any>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/maps/world.geojson");

        if (!res.ok) throw new Error("Erro ao carregar geojson");

        const data = await res.json();
        setGeoData(data);
      } catch (err) {
        console.error("Erro mapa mundo:", err);
      }
    }

    load();
  }, []);

  // 🔹 normaliza texto
  function normalize(text: string) {
    return text
      ?.normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  // 🔹 mapeia nomes do GeoJSON → nomes do sistema
  function mapCountryName(name: string) {
    const n = normalize(name);

    const map: Record<string, string> = {
      "united states": "estados unidos",
      "united states of america": "estados unidos",
      "usa": "estados unidos",

      "germany": "alemanha",
      "deutschland": "alemanha",

      "brazil": "brasil",

      "netherlands": "paises baixos",
      "holland": "paises baixos",

      "portugal": "portugal",

      "paraguay": "paraguai",
      "republic of paraguay": "paraguai",
      

      "spain": "espanha",
      "france": "franca",
      "italy": "italia",
      "argentina": "argentina",
      "peru": "peru",
      "japan": "japao",
    };

    return map[n] || n;
  }

  // 🔹 define cor baseada na quantidade
  function getFillColor(name: string) {
    const mapped = mapCountryName(name);

    const count =
      counts[mapped] ||
      counts[normalize(name)] ||
      0;

    if (count === 0) return "#E5E7EB";
    if (count === 1) return "#FED7AA";
    if (count === 2) return "#FB923C";
    if (count === 3) return "#EA580C";

    return "#C2410C";
  }

  if (!geoData) {
    return (
      <div className="rounded-3xl bg-white p-6 shadow-sm">
        <p className="text-sm text-gray-500">Carregando mapa...</p>
      </div>
    );
  }

  // 🔥 projeção automática (resolve escala/posição)
  const projection = geoMercator().fitSize([1000, 800], geoData);
  const pathGenerator = geoPath().projection(projection);

  return (
    <div className="rounded-3xl bg-white p-4 shadow-sm">
      <svg viewBox="0 0 1000 540" className="w-full h-auto">
        {geoData.features.map((feature: any, i: number) => {
          const name =
            feature.properties.name ||
            feature.properties.ADMIN;

          return (
            <path
              key={i}
              d={pathGenerator(feature) || ""}
              fill={getFillColor(name)}
              stroke="#ffffff"
              strokeWidth={0.5}
            />
          );
        })}
      </svg>
    </div>
  );
}