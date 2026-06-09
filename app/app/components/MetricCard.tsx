type MetricCardProps = {
  label: string;
  value: string;
  caption?: string;
  accent?: boolean;
  className?: string;
};

export default function MetricCard({
  label,
  value,
  caption,
  accent = false,
  className = "",
}: MetricCardProps) {
  return (
    <div
      className={`app-card ${className}`.trim()}
      style={{
        padding: "1rem 1.25rem",
        borderColor: accent ? "rgba(224,0,122,0.45)" : undefined,
        background: accent
          ? "linear-gradient(135deg, rgba(224,0,122,0.10), rgba(224,0,122,0.04))"
          : undefined,
      }}
    >
      <p style={{ fontSize: 11, fontWeight: 500, color: "#8a1452", opacity: 0.6, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
        {label}
      </p>
      <p style={{ fontSize: 26, fontWeight: 700, color: accent ? "#c0006b" : "#3d0a22", lineHeight: 1.1 }}>
        {value}
      </p>
      {caption && (
        <p style={{ fontSize: 12, color: "#8a1452", opacity: 0.55, marginTop: 4 }}>
          {caption}
        </p>
      )}
    </div>
  );
}
