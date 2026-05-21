/**
 * Edge function : record-parental-consent
 *
 * Phase 2 RGPD art. 8 FR — enregistre le consentement parental signe par un
 * titulaire de l'autorite parentale (parent / tuteur legal) pour un mineur.
 *
 * Securite :
 *  - le caller doit etre authentifie ; auth.uid() == guardian_profile_id
 *  - le minor_profile_id doit etre un mineur (< 18 — `is_minor()`)
 *  - le guardian lui-meme ne doit pas etre mineur (anti-usurpation)
 *  - capture signed_ip / signed_user_agent comme preuve (RGPD art. 7)
 *  - idempotent : si un consentement non revoque existe deja, on renvoie ok
 *
 * Audit : insert dans audit_log avec action 'parental_consent_granted'.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";

type Relationship = "mere" | "pere" | "tuteur_legal" | "autre_titulaire";

interface Body {
  minor_profile_id: string;
  relationship: Relationship;
}

const ALLOWED_REL: Relationship[] = [
  "mere",
  "pere",
  "tuteur_legal",
  "autre_titulaire",
];

function clientIp(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for") || "";
  const first = fwd.split(",")[0]?.trim();
  return first || req.headers.get("cf-connecting-ip") || null;
}

const handler = async (req: Request): Promise<Response> => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  const cors = buildCorsHeaders(req);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "AUTH_MISSING" }, 401, cors);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claims?.claims?.sub) {
      return json({ error: "AUTH_INVALID" }, 401, cors);
    }
    const guardianId = claims.claims.sub as string;

    let body: Body;
    try {
      body = await req.json();
    } catch {
      return json({ error: "INVALID_JSON" }, 400, cors);
    }

    if (!body?.minor_profile_id || typeof body.minor_profile_id !== "string") {
      return json({ error: "INPUT_MISSING_MINOR" }, 400, cors);
    }
    if (!ALLOWED_REL.includes(body.relationship)) {
      return json({ error: "INPUT_INVALID_RELATIONSHIP" }, 400, cors);
    }
    if (body.minor_profile_id === guardianId) {
      return json({ error: "SELF_CONSENT_FORBIDDEN" }, 400, cors);
    }

    // Le guardian doit etre majeur (anti-mineur-consent-mineur).
    const { data: guardianIsMinor, error: gErr } = await admin.rpc("is_minor", {
      _user_id: guardianId,
    });
    if (gErr) {
      return json({ error: "GUARDIAN_AGE_CHECK_FAILED" }, 500, cors);
    }
    if (guardianIsMinor === true) {
      return json({ error: "GUARDIAN_MUST_BE_ADULT" }, 403, cors);
    }

    // Le minor_profile_id doit etre mineur.
    const { data: minorIsMinor, error: mErr } = await admin.rpc("is_minor", {
      _user_id: body.minor_profile_id,
    });
    if (mErr) {
      return json({ error: "MINOR_AGE_CHECK_FAILED" }, 500, cors);
    }
    if (minorIsMinor !== true) {
      return json({ error: "NOT_A_MINOR" }, 400, cors);
    }

    // Idempotence : consentement actif deja present ?
    const { data: existing } = await admin
      .from("parental_consents")
      .select("id, signed_at")
      .eq("guardian_profile_id", guardianId)
      .eq("minor_profile_id", body.minor_profile_id)
      .is("revoked_at", null)
      .maybeSingle();

    if (existing) {
      return json(
        { ok: true, consent_id: existing.id, already_active: true },
        200,
        cors,
      );
    }

    const ip = clientIp(req);
    const ua = req.headers.get("user-agent");

    const { data: inserted, error: insErr } = await admin
      .from("parental_consents")
      .insert({
        minor_profile_id: body.minor_profile_id,
        guardian_profile_id: guardianId,
        relationship: body.relationship,
        signed_ip: ip,
        signed_user_agent: ua,
      })
      .select("id")
      .single();

    if (insErr || !inserted) {
      return json(
        { error: "INSERT_FAILED", detail: insErr?.message },
        500,
        cors,
      );
    }

    // Cache : si un supporters_link existe, le marquer comme guardian.
    await admin
      .from("supporters_link")
      .update({
        is_legal_guardian: true,
        relationship: body.relationship,
      })
      .eq("supporter_id", guardianId)
      .eq("player_id", body.minor_profile_id);

    // Phase 6 GO-LIVE — Active explicitement le compte mineur (defense en
    // profondeur ; le trigger activate_minor_on_consent fait la meme chose
    // cote DB, on garde l'appel explicite ici pour tracer dans audit_log).
    await admin
      .from("profiles")
      .update({ is_active: true })
      .eq("id", body.minor_profile_id)
      .eq("is_active", false);

    // Audit (RGPD : preuve)
    await admin.from("audit_log").insert({
      actor_id: guardianId,
      actor_role: "guardian",
      action: "parental_consent_granted",
      table_name: "parental_consents",
      record_id: inserted.id,
      after_data: {
        minor_profile_id: body.minor_profile_id,
        relationship: body.relationship,
      },
      ip_address: ip,
      user_agent: ua,
    });

    return json({ ok: true, consent_id: inserted.id }, 200, cors);
  } catch (e) {
    console.error("record-parental-consent fatal", e);
    return json(
      { error: "INTERNAL_ERROR", detail: (e as Error).message },
      500,
      buildCorsHeaders(req),
    );
  }
};

function json(body: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

Deno.serve(handler);