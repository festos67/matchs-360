/**
 * Phase 5 RGPD art. 17 — Execution effective de l'effacement (cron quotidien).
 *
 * Pour chaque erasure_requests dont status='pending' ET scheduled_for <= now() :
 *  - ANONYMISE le profil par UPDATE (respecte les triggers prevent_hard_delete)
 *  - Vide les commentaires libres d'evaluations (peuvent contenir le nom)
 *  - SUPPRIME REELLEMENT la photo du bucket user-photos-minors
 *  - Revoque les parental_consents
 *  - Supprime les supporters_link
 *  - Conserve minor_data_access_log (UUID seulement, pas de PII)
 *  - status='executed', executed_at=now()
 *  - audit_log action='account_erased'
 *
 * Fail-safe par requete (un echec n'arrete pas le batch). Idempotent.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";

const MINOR_BUCKET = "user-photos-minors";

/**
 * BUG-EDGE-002 — Constant-time secret comparison (cf F-404 et le pattern
 * etabli par send-invitation-reminders). NE PAS utiliser === : leak de
 * timing octet-par-octet sur un secret.
 */
function timingSafeEqualStr(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const abuf = enc.encode(a);
  const bbuf = enc.encode(b);
  const len = Math.max(abuf.byteLength, bbuf.byteLength);
  let diff = abuf.byteLength ^ bbuf.byteLength;
  for (let i = 0; i < len; i++) {
    const av = i < abuf.byteLength ? abuf[i] : 0;
    const bv = i < bbuf.byteLength ? bbuf[i] : 0;
    diff |= av ^ bv;
  }
  return diff === 0;
}

async function eraseOne(admin: any, req: any): Promise<{ ok: boolean; error?: string }> {
  const subject = req.subject_profile_id as string;
  try {
    // 1. Read profile
    const { data: profile } = await admin
      .from("profiles").select("photo_url, photo_is_minor").eq("id", subject).maybeSingle();

    // 2. Anonymize evaluation free-text
    await admin.from("evaluations")
      .update({ notes: "[Contenu effacé sur demande RGPD]" })
      .eq("player_id", subject)
      .not("notes", "is", null);

    const { data: evIds } = await admin
      .from("evaluations").select("id").eq("player_id", subject);
    const ids = (evIds ?? []).map((r: any) => r.id);
    if (ids.length > 0) {
      await admin.from("evaluation_scores")
        .update({ comment: "[Contenu effacé sur demande RGPD]" })
        .in("evaluation_id", ids)
        .not("comment", "is", null);
    }

    // 3. Delete photo physically (only minor bucket — public bucket is shared, safer)
    if (profile?.photo_url && profile.photo_is_minor) {
      try {
        await admin.storage.from(MINOR_BUCKET).remove([profile.photo_url]);
      } catch (e) {
        console.warn("[execute-erasure] photo remove failed", e);
      }
    }

    // 4. Revoke consents
    await admin.from("parental_consents")
      .update({ revoked_at: new Date().toISOString(), revoked_reason: "account_erased" })
      .eq("minor_profile_id", subject)
      .is("revoked_at", null);

    // 5. Remove supporters_link (DELETE OK: no prevent_hard_delete on that table)
    await admin.from("supporters_link")
      .delete().or(`player_id.eq.${subject},supporter_id.eq.${subject}`);

    // 6. Anonymize profile (UPDATE — does not violate prevent_hard_delete_profile)
    await admin.from("profiles").update({
      first_name: "[Effacé]",
      last_name: "[Effacé]",
      nickname: null,
      email: `erased+${subject}@purged.local`,
      birthdate: null,
      photo_url: null,
      photo_is_minor: false,
      image_rights_consent_at: null,
      image_rights_consent_by: null,
      image_rights_consent_ip: null,
      deleted_at: new Date().toISOString(),
    }).eq("id", subject);

    // 7. Mark request executed
    await admin.from("erasure_requests").update({
      status: "executed",
      executed_at: new Date().toISOString(),
    }).eq("id", req.id);

    // 8. Audit
    await admin.from("audit_log").insert({
      table_name: "profiles",
      record_id: subject,
      action: "account_erased",
      actor_id: req.requested_by,
      after_data: { request_id: req.id, executed_at: new Date().toISOString() },
    });

    return { ok: true };
  } catch (e) {
    console.error("[execute-erasure] failed", subject, e);
    return { ok: false, error: String(e) };
  }
}

const handler = async (req: Request): Promise<Response> => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  const cors = buildCorsHeaders(req);

  // BUG-EDGE-002 — GARDE-FOU SECRET en TETE de fonction, AVANT toute
  // operation privilegiee (creation client service_role, lecture des
  // demandes, anonymisation). Fail-closed si le secret serveur manque.
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const provided = (req.headers.get("authorization") ?? "")
    .replace(/^Bearer\s+/i, "")
    .trim();
  if (!serviceKey || !provided || !timingSafeEqualStr(provided, serviceKey)) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    serviceKey,
  );

  const { data: due, error } = await admin
    .from("erasure_requests")
    .select("id, subject_profile_id, requested_by")
    .eq("status", "pending")
    .lte("scheduled_for", new Date().toISOString())
    .limit(100);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  let success = 0, failed = 0;
  for (const r of (due ?? [])) {
    const res = await eraseOne(admin, r);
    if (res.ok) success++; else failed++;
  }

  return new Response(JSON.stringify({ processed: due?.length ?? 0, success, failed }), {
    status: 200, headers: { ...cors, "Content-Type": "application/json" },
  });
};

Deno.serve(handler);