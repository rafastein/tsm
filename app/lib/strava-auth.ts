import fs from "fs/promises";
import path from "path";

type StoredStravaToken = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  token_type?: string;
  athlete?: {
    id: number;
    firstname?: string;
    lastname?: string;
  };
};

const TOKEN_FILE   = path.join(process.cwd(), "data", "strava-token.json");
const REDIS_KEY    = "strava:tsm:token";
const isProduction = process.env.NODE_ENV === "production";

let memoryToken: StoredStravaToken | null = null;

async function getRedis() {
  const url   = process.env.KV_REST_API_URL   ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN  ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { Redis } = await import("@upstash/redis");
  return new Redis({ url, token });
}

function getClientId()     { const v = process.env.STRAVA_CLIENT_ID;     if (!v) throw new Error("STRAVA_CLIENT_ID não encontrado.");     return v; }
function getClientSecret() { const v = process.env.STRAVA_CLIENT_SECRET; if (!v) throw new Error("STRAVA_CLIENT_SECRET não encontrado."); return v; }
function getEnvRefreshToken() { return process.env.STRAVA_REFRESH_TOKEN ?? null; }
function getBaseUrl() { return process.env.STRAVA_REDIRECT_URI || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"; }
function isTokenExpiringSoon(expiresAt: number, bufferSeconds = 1800) { return expiresAt - Math.floor(Date.now() / 1000) <= bufferSeconds; }

export async function readStoredStravaToken(): Promise<StoredStravaToken | null> {
  if (memoryToken) return memoryToken;

  // Try Redis first (production)
  if (isProduction) {
    try {
      const redis = await getRedis();
      if (redis) {
        const raw = await redis.get<string>(REDIS_KEY);
        if (raw) {
          const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
          memoryToken = parsed as StoredStravaToken;
          return memoryToken;
        }
      }
    } catch (e) { console.warn("Redis read error:", e); }
    return null;
  }

  // Dev: read from file
  try {
    const content = await fs.readFile(TOKEN_FILE, "utf-8");
    const parsed  = JSON.parse(content) as StoredStravaToken;
    memoryToken   = parsed;
    return parsed;
  } catch { return null; }
}

export async function writeStoredStravaToken(token: StoredStravaToken) {
  memoryToken = token;

  if (isProduction) {
    // Save to Redis with 90 day TTL
    try {
      const redis = await getRedis();
      if (redis) await redis.set(REDIS_KEY, JSON.stringify(token), { ex: 90 * 24 * 3600 });
    } catch (e) { console.warn("Redis write error:", e); }
    return;
  }

  // Dev: write to file
  await fs.mkdir(path.dirname(TOKEN_FILE), { recursive: true });
  await fs.writeFile(TOKEN_FILE, JSON.stringify(token, null, 2), "utf-8");
}

export async function exchangeCodeForToken(code: string) {
  const body = new URLSearchParams({ client_id: getClientId(), client_secret: getClientSecret(), code, grant_type: "authorization_code" });
  const res  = await fetch("https://www.strava.com/oauth/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body, cache: "no-store" });
  if (!res.ok) throw new Error(`Falha ao trocar code por token: ${res.status} ${await res.text()}`);
  const data = await res.json() as StoredStravaToken;
  await writeStoredStravaToken(data);
  return data;
}

export async function refreshStravaToken(refreshToken: string) {
  const body = new URLSearchParams({ client_id: getClientId(), client_secret: getClientSecret(), grant_type: "refresh_token", refresh_token: refreshToken });
  const res  = await fetch("https://www.strava.com/oauth/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body, cache: "no-store" });
  if (!res.ok) throw new Error(`Falha ao renovar token: ${res.status} ${await res.text()}`);
  const data = await res.json() as StoredStravaToken;
  await writeStoredStravaToken(data);
  return data;
}

export async function getValidStravaAccessToken(): Promise<string | null> {
  const stored          = await readStoredStravaToken();
  const envRefreshToken = getEnvRefreshToken();

  if (stored?.access_token && stored?.refresh_token) {
    if (isTokenExpiringSoon(stored.expires_at)) {
      const refreshed = await refreshStravaToken(stored.refresh_token);
      return refreshed.access_token;
    }
    return stored.access_token;
  }

  if (envRefreshToken) {
    const refreshed = await refreshStravaToken(envRefreshToken);
    return refreshed.access_token;
  }

  return null;
}

export async function getStravaAuthorizeUrl() {
  const params = new URLSearchParams({
    client_id:       getClientId(),
    response_type:   "code",
    redirect_uri:    `${getBaseUrl()}/api/auth/strava/callback`,
    approval_prompt: "force",
    scope:           "read,activity:read_all",
  });
  return `https://www.strava.com/oauth/authorize?${params.toString()}`;
}
