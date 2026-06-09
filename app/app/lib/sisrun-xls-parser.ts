import * as XLSX from "xlsx";

type SisrunDailyRow = {
  date: string;
  plannedWorkouts: number;
  completedWorkouts: number;
  completionPct: number | null;
  plannedDistanceKm: number;
  completedDistanceKm: number;
  minPlannedTime: string | null;
  maxPlannedTime: string | null;
  completedTime: string | null;
  avgPace: string | null;
  avgHeartRate: number | null;
  elevationGain: number | null;
  calories: number | null;
};

type PlannedWorkout = {
  weekday: string;
  dateLabel: string;
  modality: string;
  workoutType: string;
  intensity: string;
  plannedDistanceKm: number | null;
  routeType: string;
  description: string;
  minTime: string | null;
  maxTime: string | null;
  isRace: boolean;
};

type PlannedWeekSummary = {
  athleteName: string;
  weekStart: string;
  weekEnd: string;
  weekLabel: string;
  workouts: PlannedWorkout[];
  totalPlannedKm: number;
  workoutCount: number;
  longRunPlannedKm: number;
  raceCount: number;
  completedKm: number;
  completedWorkouts: number;
  adherencePct: number | null;
};

type SisrunParsedData = {
  athleteName: string;
  uploadedAt: string;
  fileName: string;
  weeks: PlannedWeekSummary[];
  rows: SisrunDailyRow[];
};

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function toNumber(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  const text = String(value).replace(",", ".").replace(/[^\d.-]/g, "");
  const num = Number(text);
  return Number.isFinite(num) ? num : 0;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const text = String(value).replace(",", ".").replace(/[^\d.-]/g, "");
  const num = Number(text);
  return Number.isFinite(num) ? num : null;
}

function toText(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function excelDateToString(value: unknown): string {
  if (typeof value === "number") {
    const date = XLSX.SSF.parse_date_code(value);
    if (!date) return String(value);
    const dd = String(date.d).padStart(2, "0");
    const mm = String(date.m).padStart(2, "0");
    const yyyy = String(date.y);
    return `${dd}/${mm}/${yyyy}`;
  }

  const text = String(value ?? "").trim();
  return text;
}

function parseDate(value: string): Date | null {
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  return new Date(Number(yyyy), Number(mm) - 1, Number(dd));
}

function getWeekStart(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDateBR(date: Date) {
  return date.toLocaleDateString("pt-BR");
}

function weekdayPt(date: Date) {
  const days = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
  return days[date.getDay()];
}

function findColumn(headers: string[], candidates: string[]) {
  for (const candidate of candidates) {
    const exact = headers.find((h) => h === candidate);
    if (exact) return exact;
  }

  for (const candidate of candidates) {
    const partial = headers.find((h) => h.includes(candidate));
    if (partial) return partial;
  }

  return null;
}

export function parseSisrunWorkbook(
  workbook: XLSX.WorkBook,
  fileName: string
): SisrunParsedData {
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error("A planilha não possui abas.");
  }

  const sheet = workbook.Sheets[firstSheetName];
  const rowsRaw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: true,
  });

  if (!rowsRaw.length) {
    throw new Error("A planilha está vazia.");
  }

  const normalizedRows = rowsRaw.map((row) => {
    const out: Record<string, unknown> = {};
    Object.entries(row).forEach(([key, value]) => {
      out[normalizeHeader(key)] = value;
    });
    return out;
  });

  const headers = Object.keys(normalizedRows[0]);

  const dateCol = findColumn(headers, ["data"]);
  const plannedWorkoutsCol = findColumn(headers, ["treinos propostos", "treino proposto"]);
  const completedWorkoutsCol = findColumn(headers, ["treinos feitos", "treino feito"]);
  const completionPctCol = findColumn(headers, [" treinos feitos", "percentual treinos feitos", "treinos feitos %"]);
  const plannedDistanceCol = findColumn(headers, ["distancia proposta", "km proposto"]);
  const completedDistanceCol = findColumn(headers, ["distancia feita", "km feito"]);
  const minPlannedTimeCol = findColumn(headers, ["tempo minimo proposto"]);
  const maxPlannedTimeCol = findColumn(headers, ["tempo maximo proposto"]);
  const completedTimeCol = findColumn(headers, ["tempo feito"]);
  const avgPaceCol = findColumn(headers, ["pace"]);
  const avgHeartRateCol = findColumn(headers, ["fc media", "frequencia cardiaca media"]);
  const elevationCol = findColumn(headers, ["elevacao acumulada", "elevacao"]);
  const caloriesCol = findColumn(headers, ["calorias"]);

  if (!dateCol) {
    throw new Error("Não encontrei a coluna de data na planilha.");
  }

  const cleanedRows: SisrunDailyRow[] = normalizedRows
    .map((row) => {
      const date = excelDateToString(row[dateCol]);

      return {
        date,
        plannedWorkouts: plannedWorkoutsCol ? toNumber(row[plannedWorkoutsCol]) : 0,
        completedWorkouts: completedWorkoutsCol ? toNumber(row[completedWorkoutsCol]) : 0,
        completionPct: completionPctCol ? toNullableNumber(row[completionPctCol]) : null,
        plannedDistanceKm: plannedDistanceCol ? toNumber(row[plannedDistanceCol]) : 0,
        completedDistanceKm: completedDistanceCol ? toNumber(row[completedDistanceCol]) : 0,
        minPlannedTime: minPlannedTimeCol ? toText(row[minPlannedTimeCol]) : null,
        maxPlannedTime: maxPlannedTimeCol ? toText(row[maxPlannedTimeCol]) : null,
        completedTime: completedTimeCol ? toText(row[completedTimeCol]) : null,
        avgPace: avgPaceCol ? toText(row[avgPaceCol]) : null,
        avgHeartRate: avgHeartRateCol ? toNullableNumber(row[avgHeartRateCol]) : null,
        elevationGain: elevationCol ? toNullableNumber(row[elevationCol]) : null,
        calories: caloriesCol ? toNullableNumber(row[caloriesCol]) : null,
      };
    })
    .filter((row) => row.date);

  const weekMap = new Map<string, PlannedWeekSummary>();

  cleanedRows.forEach((row) => {
    const parsed = parseDate(row.date);
    if (!parsed) return;

    const weekStart = getWeekStart(parsed);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);

    const key = weekStart.toISOString();

    if (!weekMap.has(key)) {
      weekMap.set(key, {
        athleteName: "Rafael",
        weekStart: formatDateBR(weekStart),
        weekEnd: formatDateBR(weekEnd),
        weekLabel: `${formatDateBR(weekStart)} até ${formatDateBR(weekEnd)}`,
        workouts: [],
        totalPlannedKm: 0,
        workoutCount: 0,
        longRunPlannedKm: 0,
        raceCount: 0,
        completedKm: 0,
        completedWorkouts: 0,
        adherencePct: null,
      });
    }

    const week = weekMap.get(key)!;

    const workout: PlannedWorkout = {
      weekday: weekdayPt(parsed),
      dateLabel: row.date,
      modality: "Corrida",
      workoutType:
        row.plannedDistanceKm >= 14
          ? "Longo"
          : row.plannedWorkouts > 0
          ? "Treino"
          : "Descanso",
      intensity: "",
      plannedDistanceKm: row.plannedDistanceKm || null,
      routeType: "",
      description:
        row.completedDistanceKm > 0
          ? `Feito: ${row.completedDistanceKm.toFixed(2)} km${
              row.avgPace ? ` • pace ${row.avgPace}` : ""
            }`
          : "Sem treino realizado registrado",
      minTime: row.minPlannedTime,
      maxTime: row.maxPlannedTime,
      isRace: false,
    };

    week.workouts.push(workout);
    week.totalPlannedKm += row.plannedDistanceKm;
    week.completedKm += row.completedDistanceKm;
    week.workoutCount += row.plannedWorkouts;
    week.completedWorkouts += row.completedWorkouts;
    week.longRunPlannedKm = Math.max(week.longRunPlannedKm, row.plannedDistanceKm);
  });

  const weeks = Array.from(weekMap.values())
    .sort((a, b) => {
      const da = parseDate(a.weekStart)?.getTime() ?? 0;
      const db = parseDate(b.weekStart)?.getTime() ?? 0;
      return da - db;
    })
    .map((week) => {
      week.totalPlannedKm = Number(week.totalPlannedKm.toFixed(2));
      week.completedKm = Number(week.completedKm.toFixed(2));
      week.longRunPlannedKm = Number(week.longRunPlannedKm.toFixed(2));
      week.adherencePct =
        week.totalPlannedKm > 0
          ? Number(((week.completedKm / week.totalPlannedKm) * 100).toFixed(1))
          : null;
      return week;
    });

  return {
    athleteName: "Rafael",
    uploadedAt: new Date().toISOString(),
    fileName,
    weeks,
    rows: cleanedRows,
  };
}