"use client";

import { siAdidas, siPuma, siNewbalance } from "simple-icons/icons";

type Props = {
  brand?: string;
  className?: string;
};

function normalize(text?: string) {
  return String(text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export default function BrandIcon({ brand, className = "h-6 w-6" }: Props) {
  const b = normalize(brand);

  const simpleIcons: Record<string, any> = {
    adidas: siAdidas,
    puma: siPuma,
    "new balance": siNewbalance,
    newbalance: siNewbalance,
  };

  const icon = simpleIcons[b];

  if (icon) {
    return (
      <svg viewBox="0 0 24 24" className={className} fill={`#${icon.hex}`}>
        <path d={icon.path} />
      </svg>
    );
  }

  const manualIcons: Record<string, string> = {
    asics: "/brands/asics.svg",
    fila: "/brands/fila.svg",
    "361": "/brands/361.svg",
  };

  const manual = manualIcons[b];

  if (manual) {
    return <img src={manual} className={className} alt={brand ?? "Marca"} />;
  }

  return (
    <div
      className={`${className} flex items-center justify-center rounded bg-[#e0007a]/10 text-xs font-bold text-gray-700`}
    >
      {brand?.slice(0, 2).toUpperCase()}
    </div>
  );
}