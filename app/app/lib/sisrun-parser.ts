import { PlannedWorkout, PlannedWeekSummary, SisrunParsedData } from "./sisrun-types";

function normalizeSpaces(text: string) {
  return text
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractAthleteName(text: string) {
  const match = text.match(/^([^\n]+)\nSemana[:\s]/m);
  return match ? match[1].trim() : "Atleta";
}

function parseDistance(text: string): number | null {
  const match = text.match(/(\d+(?:\.\d+)?)\s*Km/i);
  if (!match) return null;
  return Number(match[1]);
}

function parseMinTime(text: string): string | null {
  const match = text.match(/Tempo M[ií]nimo[:\s]*([0-9:]+)/i);
  return match ? match[1] : null;
}

function parseMaxTime(text: string): string | null {
  const match = text.match(/Tempo M[aá]ximo[:\s]*([0-9:]+)/i);
  return match ? match[1] : null;
}

function parseRouteType(text: string): string {
  const match = text.match(/(Plano|Ligeira inclinação|Muita inclinação)/i);
  return match ? match[1] : "";
}

function parseWorkoutType(text: string): string {
  const types = ["Regenerativo", "Intervalado", "Fartlek", "Longo", "Prova"];

  for (const type of types) {
    if (new RegExp(type, "i").test(text)) return type;
  }

  if (/PROVA\/OBJETIVO/i.test(text)) return "Prova";

  return "";
}

function parseModality(text: string): string {
  const match = text.match(/\b(Corrida|Bike|Ciclismo|Musculação|Natação)\b/i);
  return match ? match[1] : "";
}

function parseDescription(text: string): string {
  const match = text.match(
    /Descrição[:\s]*([\s\S]*?)(?=Tempo M[ií]nimo[:\s]*|Tempo M[aá]ximo[:\s]*|Legendas|$)/i
  );

  return match ? match[1].replace(/\n+/g, " ").trim() : "";
}

function splitWeeks(text: string) {
  const weekRegex =
    /Semana[:\s]*([\d]{2}\/[\d]{2}\/[\d]{4})[\s\S]*?(?:at|até)[\s]*([\d]{2}\/[\d]{2}\/[\d]{4})([\s\S]*?)(?=Semana[:]|$)/gi;

  const result: Array<{
    athleteName: string;
    weekStart: string;
    weekEnd: string;
    body: string;
  }> = [];

  let match: RegExpExecArray | null;

  while ((match = weekRegex.exec(text)) !== null) {
    result.push({
      athleteName: "Atleta",
      weekStart: match[1],
      weekEnd: match[2],
      body: match[3].trim(),
    });
  }

  return result;
}

function splitDayBlocks(weekBody: string) {
  const dayRegex =
    /(Seg|Ter|Qua|Qui|Sex|Sáb|Sab|Dom)\s*(\d{2}\/\d{2})([\s\S]*?)(?=(Seg|Ter|Qua|Qui|Sex|Sáb|Sab|Dom)\s*\d{2}\/\d{2}|Legendas|$)/g;

  const blocks: Array<{
    weekday: string;
    dateLabel: string;
    content: string;
  }> = [];

  let match: RegExpExecArray | null;
  while ((match = dayRegex.exec(weekBody)) !== null) {
    blocks.push({
      weekday: match[1],
      dateLabel: match[2],
      content: match[3].trim(),
    });
  }

  return blocks;
}

function parseWorkoutFromBlock(
  weekday: string,
  dateLabel: string,
  content: string
): PlannedWorkout | null {
  if (/Nenhum treino liberado neste dia/i.test(content)) {
    return null;
  }

  const workoutType = parseWorkoutType(content);
  const plannedDistanceKm = parseDistance(content);
  const routeType = parseRouteType(content);
  const modality = parseModality(content);
  const description = parseDescription(content);
  const minTime = parseMinTime(content);
  const maxTime = parseMaxTime(content);

  const intensityMatch = content.match(
    /Intensidade([\s\S]*?)(?=Tempo M[ií]nimo[:\s]*|Tempo M[aá]ximo[:\s]*|Descrição[:\s]*|$)/i
  );

  const intensity = intensityMatch
    ? intensityMatch[1].replace(/\n+/g, " ").trim()
    : "";

  return {
    weekday,
    dateLabel,
    modality,
    workoutType,
    intensity,
    plannedDistanceKm,
    routeType,
    description,
    minTime,
    maxTime,
    isRace: /PROVA\/OBJETIVO|Prova/i.test(content) || workoutType === "Prova",
  };
}

export function parseSisrunPdfText(rawText: string, fileName: string): SisrunParsedData {
  const text = normalizeSpaces(rawText);
  const athleteName = extractAthleteName(text);

  const weeks = splitWeeks(text).map((week) => {
    const dayBlocks = splitDayBlocks(week.body);

    const workouts = dayBlocks
      .map((block) => parseWorkoutFromBlock(block.weekday, block.dateLabel, block.content))
      .filter((item): item is PlannedWorkout => Boolean(item));

    const totalPlannedKm = workouts.reduce(
      (sum, workout) => sum + (workout.plannedDistanceKm ?? 0),
      0
    );

    const longRunPlannedKm = workouts
      .filter((w) => /Longo/i.test(w.workoutType))
      .reduce((max, w) => Math.max(max, w.plannedDistanceKm ?? 0), 0);

    const raceCount = workouts.filter((w) => w.isRace).length;

    const summary: PlannedWeekSummary = {
      athleteName: athleteName || week.athleteName,
      weekStart: week.weekStart,
      weekEnd: week.weekEnd,
      weekLabel: `${week.weekStart} até ${week.weekEnd}`,
      workouts,
      totalPlannedKm: Number(totalPlannedKm.toFixed(3)),
      workoutCount: workouts.length,
      longRunPlannedKm,
      raceCount,
    };

    return summary;
  });

  return {
    athleteName,
    uploadedAt: new Date().toISOString(),
    fileName,
    weeks,
  };
}