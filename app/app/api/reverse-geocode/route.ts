import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function pickCity(address: Record<string, string | undefined>) {
  return (
    address.city ||
    address.town ||
    address.village ||
    address.municipality ||
    address.county ||
    null
  );
}

export async function GET(req: NextRequest) {
  const lat = req.nextUrl.searchParams.get("lat");
  const lon = req.nextUrl.searchParams.get("lon");

  if (!lat || !lon) {
    return NextResponse.json(
      { error: "Missing lat/lon" },
      { status: 400 }
    );
  }

  try {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("lat", lat);
    url.searchParams.set("lon", lon);
    url.searchParams.set("zoom", "10");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("accept-language", "pt-BR");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        "User-Agent": "meu-site-strava/1.0",
        "Accept": "application/json",
      },
      cache: "no-store",
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn("Reverse geocode falhou:", res.status, text);

      return NextResponse.json(
        {
          city: null,
          state: null,
          country: null,
          error: `Reverse geocode failed: ${res.status}`,
        },
        { status: 200 }
      );
    }

    const data = await res.json();
    const address = data?.address ?? {};

    return NextResponse.json(
      {
        city: pickCity(address),
        state: address.state ?? null,
        country: address.country ?? null,
      },
      { status: 200 }
    );
  } catch (error) {
    console.warn("Erro no reverse geocode:", error);

    return NextResponse.json(
      {
        city: null,
        state: null,
        country: null,
        error: "Internal reverse geocode error",
      },
      { status: 200 }
    );
  }
}