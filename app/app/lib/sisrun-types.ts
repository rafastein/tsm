export type PlannedWorkout = {
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

export type PlannedWeekSummary = {
  athleteName: string;
  weekStart: string;
  weekEnd: string;
  weekLabel: string;
  workouts: PlannedWorkout[];
  totalPlannedKm: number;
  workoutCount: number;
  longRunPlannedKm: number;
  raceCount: number;
};

export type SisrunParsedData = {
  athleteName: string;
  uploadedAt: string;
  fileName: string;
  weeks: PlannedWeekSummary[];
};