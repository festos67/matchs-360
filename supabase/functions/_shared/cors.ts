/**
 * SECURITY: Shared CORS helper for edge functions.
 *
 * Replaces wildcard `Access-Control-Allow-Origin: *` with strict origin
 * echo restricted to a vetted whitelist. Adds `Vary: Origin` so caches
 * never serve a response with the wrong ACAO. Returns NO `ACAO` header
 * when the origin is not allowed — the browser will block the response,
 * which is exactly what we want for unknown origins (defense in depth
 * against leaked-JWT replay from arbitrary attacker domains).
 */

const STATIC_ALLOWED_ORIGIN_PATTERNS: RegExp[] = [
  /^https:\/\/([a-z0-9-]+\.)*lovable\.app$/i,
  /^https:\/\/([a-z0-9-]+\.)*lovableproject\.com$/i,
  /^https:\/\/([a-z0-9-]+\.)*sandbox\.lovable\.dev$/i,
  /^http:\/\/localhost(:\d+)?$/i,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/i,
];

const DEFAULT_ALLOW_HEADERS =
  "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version";

const DEFAULT_ALLOW_METHODS = "POST, OPTIONS";

export function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  try { new URL(origin); } catch { return false; }
  if (STATIC_ALLOWED_ORIGIN_PATTERNS.some((re) => re.test(origin))) return true;
  const extra = (Deno.env.get("ALLOWED_ORIGINS") || "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  return extra.includes(origin);
}

export function buildCorsHeaders(
  req: Request,
  opts: { allowMethods?: string; allowHeaders?: string } = {},
): Record<string, string> {
  const origin = req.headers.get("origin");
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": opts.allowHeaders ?? DEFAULT_ALLOW_HEADERS,
    "Access-Control-Allow-Methods": opts.allowMethods ?? DEFAULT_ALLOW_METHODS,
    "Access-Control-Max-Age": "600",
    "Vary": "Origin",
  };
  if (origin && isAllowedOrigin(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  // If origin is not allowed, ACAO is absent → browser blocks the response.
  return headers;
}

export function handleCorsPreflight(req: Request): Response | null {
  if (req.method !== "OPTIONS") return null;
  return new Response(null, { status: 204, headers: buildCorsHeaders(req) });
}