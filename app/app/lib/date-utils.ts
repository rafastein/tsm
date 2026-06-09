const BR_TIME_ZONE = "America/Sao_Paulo";

export function getActivityDate(activity: {
  start_date?: string | null;
  start_date_local?: string | null;
}) {
  return activity.start_date_local ?? activity.start_date ?? "";
}

export function formatBRDate(dateString?: string | null) {
  if (!dateString) return "-";

  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: BR_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(dateString));
}

export function getBRDateKey(dateString?: string | null) {
  if (!dateString) return "";

  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: BR_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(dateString));
}

export function getBRDate(dateString?: string | null) {
  const key = getBRDateKey(dateString);
  if (!key) return null;

  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}