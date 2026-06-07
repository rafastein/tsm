import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForToken } from "../../../../lib/strava-auth";

export const dynamic = "force-dynamic";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function GET(req: NextRequest) {
  try {
    const code  = req.nextUrl.searchParams.get("code");
    const error = req.nextUrl.searchParams.get("error");

    if (error) {
      return NextResponse.json(
        { error: "Autorização negada pelo Strava.", details: error },
        { status: 400 }
      );
    }

    if (!code) {
      return NextResponse.json(
        { error: "Code não encontrado na URL de callback." },
        { status: 400 }
      );
    }

    const token        = await exchangeCodeForToken(code);
    const refreshToken = token.refresh_token;

    return new NextResponse(
      `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Strava autorizado</title>
    <style>
      *, *::before, *::after { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #0d0714;
        color: #e5e7eb;
        font-family: Arial, sans-serif;
      }
      main {
        width: min(720px, calc(100vw - 32px));
        padding: 32px;
        border: 1px solid rgba(224, 0, 122, 0.25);
        border-radius: 20px;
        background: rgba(20, 8, 16, 0.9);
      }
      h1 { margin: 0 0 20px; font-size: 24px; font-weight: 600; }
      .status {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        padding: 14px 16px;
        border-radius: 12px;
        font-size: 14px;
        line-height: 1.6;
        background: rgba(34, 197, 94, 0.08);
        border: 1px solid rgba(34, 197, 94, 0.2);
        color: #86efac;
      }
      .dot {
        flex-shrink: 0;
        width: 8px; height: 8px;
        border-radius: 50%;
        margin-top: 5px;
        background: #22c55e;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Strava autorizado ✓</h1>
      <div class="status">
        <span class="dot"></span>
        Token salvo em data/strava-token.json.
        Redirecionando para o dashboard em <span id="count">5</span>s…
      </div>
    </main>
    <script>
      let n = 5;
      const el = document.getElementById("count");
      const t = setInterval(() => { n--; el.textContent = n; if (n <= 0) { clearInterval(t); location.href = "/"; } }, 1000);
    </script>
  </body>
</html>`,
      {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro interno";
    return NextResponse.json(
      { error: "Erro ao autorizar Strava.", details: message },
      { status: 500 }
    );
  }
}
