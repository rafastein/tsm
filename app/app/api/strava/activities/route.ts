import { NextResponse } from "next/server";

export async function GET() {
  const accessToken = process.env.STRAVA_ACCESS_TOKEN;

  if (!accessToken) {
    return NextResponse.json({ error: "No token" }, { status: 400 });
  }

  const response = await fetch(
    "https://www.strava.com/api/v3/athlete/activities",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  const data = await response.json();

  return NextResponse.json(data);
}