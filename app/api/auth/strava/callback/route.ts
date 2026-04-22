import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const code = req.nextUrl.searchParams.get("code");

    if (!code) {
      return NextResponse.json({ error: "Code não encontrado" }, { status: 400 });
    }

    const clientId = process.env.STRAVA_CLIENT_ID;
    const clientSecret = process.env.STRAVA_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return NextResponse.json(
        { error: "Variáveis de ambiente não configuradas" },
        { status: 500 }
      );
    }

    const response = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: "Erro ao trocar token", details: data },
        { status: 500 }
      );
    }

    // 👇 Aqui você pode salvar o refresh_token se quiser
    console.log("REFRESH TOKEN:", data.refresh_token);

    return NextResponse.json({
      message: "Autorizado com sucesso!",
      refresh_token: data.refresh_token,
    });

  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}