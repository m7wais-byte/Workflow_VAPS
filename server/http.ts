/** Shared HTTP helpers for the API routes: JSON replies, cookies, same-origin checks and configuration. */
export const noStore = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };

export function reply(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return Response.json(body, { status, headers: { ...noStore, ...extra } });
}

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export const fail = (status: number, message: string) => new HttpError(status, message);

/** Turns thrown errors into replies; unexpected errors are never echoed to the client. */
export async function handle(work: () => Promise<Response>): Promise<Response> {
  try { return await work(); }
  catch (error) {
    if (error instanceof HttpError) return reply({ error: error.message }, error.status);
    console.error("API error", error instanceof Error ? error.name : "unknown");
    return reply({ error: "The server could not complete this request. Nothing was changed; please retry." }, 503);
  }
}

export type AuthConfig = { sessionMaxHours: number; sessionIdleMinutes: number; allowedOrigins: string[] };
const num = (value: unknown, fallback: number, min: number, max: number) => { const n = Number(value); return Number.isFinite(n) && n >= min && n <= max ? n : fallback; };
export function authConfig(env: Record<string, unknown>): AuthConfig {
  return {
    sessionMaxHours: num(env.AUTH_SESSION_MAX_HOURS, 12, 1, 72),
    sessionIdleMinutes: num(env.AUTH_SESSION_IDLE_MINUTES, 120, 5, 24 * 60),
    allowedOrigins: String(env.APP_ORIGIN || "").split(",").map((s) => s.trim().replace(/\/$/, "")).filter(Boolean),
  };
}

export const SESSION_COOKIE = "__Host-vaps_session";
const DEV_COOKIE = "vaps_session";
const isLocal = (url: URL) => ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
/** `__Host-` cookies need HTTPS (browsers also accept them on http://localhost). Plain-HTTP non-local hosts get no Secure flag. */
export const cookieName = (request: Request) => { const url = new URL(request.url); return url.protocol === "https:" || isLocal(url) ? SESSION_COOKIE : DEV_COOKIE; };

export function readCookie(request: Request, name: string): string {
  for (const part of (request.headers.get("Cookie") || "").split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return "";
}

export function sessionCookie(request: Request, token: string, maxAgeSeconds: number): string {
  const name = cookieName(request);
  const secure = name === SESSION_COOKIE ? "; Secure" : "";
  return `${name}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}${secure}`;
}
export const clearSessionCookie = (request: Request) => sessionCookie(request, "", 0);

/**
 * Cross-site request protection for state-changing requests: the session cookie is SameSite=Strict, and in addition the
 * request must come from this site's own origin (Origin header, or Sec-Fetch-Site for browsers that omit Origin) and
 * carry a JSON or form-data body type, which a cross-site form cannot combine with the custom header below.
 */
export function assertSameOrigin(request: Request, config: AuthConfig) {
  const url = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host");
  const allowed = new Set([url.origin, ...config.allowedOrigins, ...(forwardedHost ? [`${url.protocol}//${forwardedHost}`, `https://${forwardedHost}`] : [])]);
  const origin = request.headers.get("Origin");
  if (origin ? !allowed.has(origin) : request.headers.get("Sec-Fetch-Site") !== "same-origin") throw fail(403, "This request did not come from the VAPS workspace.");
  if (request.headers.get("X-VAPS-Request") !== "1") throw fail(403, "This request did not come from the VAPS workspace.");
}

/** Reads a JSON body with a size limit. */
export async function readJson<T = Record<string, unknown>>(request: Request, limit = 2_000_000): Promise<T> {
  if (!(request.headers.get("Content-Type") || "").startsWith("application/json")) throw fail(415, "Send the request as JSON.");
  const text = await request.text();
  if (text.length > limit) throw fail(413, "This request is too large.");
  try { return JSON.parse(text) as T; } catch { throw fail(400, "The request could not be read."); }
}

export const clientAddress = (request: Request) => request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For")?.split(",")[0].trim() || "unknown";
