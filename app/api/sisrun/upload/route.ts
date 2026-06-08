import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { parseSisrunWorkbook } from "@/app/lib/sisrun-xls-parser";

const SISRUN_KEY = "sisrun:latest";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "Arquivo não enviado." }, { status: 400 });
    }

    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith(".xls") && !lowerName.endsWith(".xlsx")) {
      return NextResponse.json({ error: "Envie um arquivo .xls ou .xlsx" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const parsedData = parseSisrunWorkbook(workbook, file.name);
    const json = JSON.stringify(parsedData);

    const redisUrl   = process.env.KV_REST_API_URL   ?? process.env.UPSTASH_REDIS_REST_URL;
    const redisToken = process.env.KV_REST_API_TOKEN  ?? process.env.UPSTASH_REDIS_REST_TOKEN;
    const isVercel   = !!(redisUrl && redisToken);

    if (isVercel) {
      const { Redis } = await import("@upstash/redis");
      const redis = new Redis({ url: redisUrl!, token: redisToken! });
      await redis.set(SISRUN_KEY, json);
    } else {
      const fs   = await import("fs/promises");
      const path = await import("path");
      const dir  = path.join(process.cwd(), "data");
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, "sisrun-latest.json"), json, "utf-8");
    }

    return NextResponse.json({
      success: true,
      storage: isVercel ? "upstash" : "file",
      fileName: parsedData.fileName,
      athleteName: parsedData.athleteName,
      weeks: parsedData.weeks.length,
      rows: parsedData.rows.length,
    });
  } catch (error) {
    console.error("Erro ao processar planilha do SisRUN:", error);
    const message = error instanceof Error ? error.message : "Falha ao processar a planilha do SisRUN.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
