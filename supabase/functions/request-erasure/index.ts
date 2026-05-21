/**
 * Phase 5 RGPD art. 17 — Demande d'effacement (avec delai de grace 7j).
 *
 * Securite : INSERT via le client authentifie (RLS verifie
 * is_legal_guardian_of OU self). Pas de service_role ici → la regle est
 * appliquee par Postgres, on ne peut pas la contourner.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";

const handler = async (req: Request): Promise<Response> => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  const cors = buildCorsHeaders(req);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const subject = String(body?.subject_profile_id ?? "");
    const reason = body?.reason ? String(body.reason).slice(0, 500) : null;
    if (!/^[0-9a-f-]{36}$/i.test(subject)) {
      return new Response(JSON.stringify({ error: "invalid_subject" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // RLS appliquee : INSERT autorise seulement si self OU is_legal_guardian_of
    const { data, error } = await supabase
      .from("erasure_requests")
      .insert({ subject_profile_id: subject, requested_by: userId, reason })
      .select("id, scheduled_for")
      .single();

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 403, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Audit (best-effort)
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    await admin.from("audit_log").insert({
      table_name: "erasure_requests",
      record_id: data.id,
      action: "erasure_requested",
      actor_id: userId,
      after_data: { subject_profile_id: subject, scheduled_for: data.scheduled_for },
    });

    return new Response(JSON.stringify({ ok: true, request_id: data.id, scheduled_for: data.scheduled_for }), {
      status: 200, headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[request-erasure]", e);
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
};

Deno.serve(handler);