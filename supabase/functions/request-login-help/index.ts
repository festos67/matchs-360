// SEC-AUTH-004 : déplace côté serveur la création des notifications d'aide
// à la connexion. Le client (Auth.tsx) ne lit plus user_roles ni n'insère
// dans notifications. Réponse générique (anti-énumération, cohérent F-302).
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Rate-limit in-memory (best-effort, fail-closed). Une instance edge mémorise
// jusqu'à 5 demandes / 10 min / IP. Suffisant pour bloquer le scripting basique.
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 5;
const ipHits = new Map<string, number[]>();

function rateLimit(ip: string): boolean {
  try {
    const now = Date.now();
    const arr = (ipHits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
    if (arr.length >= RATE_MAX) {
      ipHits.set(ip, arr);
      return false;
    }
    arr.push(now);
    ipHits.set(ip, arr);
    return true;
  } catch {
    // fail-closed
    return false;
  }
}

function escape(input: string): string {
  return input
    .replace(/[\r\n\t]/g, " ")
    .replace(/[<>"']/g, "")
    .slice(0, 254);
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  const cors = buildCorsHeaders(req);
  const genericOk = () =>
    new Response(JSON.stringify({ ok: true }), {
      headers: { ...cors, "Content-Type": "application/json" },
      status: 200,
    });

  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      req.headers.get("cf-connecting-ip") ||
      "unknown";
    if (!rateLimit(ip)) {
      // Réponse générique : ne pas révéler le rate-limit non plus.
      return genericOk();
    }

    let body: { email?: unknown } = {};
    try {
      body = await req.json();
    } catch {
      return genericOk();
    }

    const rawEmail = typeof body.email === "string" ? body.email.trim() : "";
    const email = rawEmail.toLowerCase();
    const emailDisplay = email && EMAIL_REGEX.test(email)
      ? escape(email)
      : "email non renseigné";

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) {
      console.error("request-login-help: missing service credentials");
      return genericOk();
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    const { data: adminRoles, error: rolesErr } = await admin
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");

    if (rolesErr) {
      console.error("request-login-help: roles lookup failed", rolesErr);
      return genericOk();
    }

    if (adminRoles && adminRoles.length > 0) {
      const rows = adminRoles.map((r: { user_id: string }) => ({
        user_id: r.user_id,
        title: "Demande d'aide à la connexion",
        message: `Un utilisateur (${emailDisplay}) rencontre un problème de connexion et demande de l'aide.`,
        type: "help_request",
      }));
      const { error: insErr } = await admin.from("notifications").insert(rows);
      if (insErr) {
        console.error("request-login-help: insert failed", insErr);
      }
    }

    return genericOk();
  } catch (e) {
    console.error("request-login-help: unexpected error", e);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...buildCorsHeaders(req), "Content-Type": "application/json" },
      status: 200,
    });
  }
});