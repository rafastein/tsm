import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

const filePath = path.join(process.cwd(), "data", "manual-predictions.json");

async function readPredictions() {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return JSON.parse(content);
  } catch {
    return {
      stravaMarathonPrediction: "01:59:33",
    };
  }
}

function isValidTime(value: string) {
  return /^\d{2}:\d{2}:\d{2}$/.test(value);
}

export async function GET() {
  const data = await readPredictions();
  return NextResponse.json(data);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const stravaMarathonPrediction =
      typeof body.stravaMarathonPrediction === "string"
        ? body.stravaMarathonPrediction.trim()
        : "";

    if (!isValidTime(stravaMarathonPrediction)) {
      return NextResponse.json(
        { error: "A previsão deve estar no formato HH:MM:SS." },
        { status: 400 }
      );
    }

    const data = {
      stravaMarathonPrediction,
    };

    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Erro ao salvar previsão manual:", error);
    return NextResponse.json(
      { error: "Falha ao salvar previsão." },
      { status: 500 }
    );
  }
}