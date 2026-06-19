/**
 * Phase 5 RGPD art. 17 — Execution effective de l'effacement (cron quotidien).
 * Pour chaque erasure_requests pending ET scheduled_for <= now :
 *  - ANONYMISE le profil (UPDATE, respecte prevent_hard_delete)
 *  - Vide les commentaires libres d'evaluations
 *  - SUPPRIME la photo (bucket mineur prive ET bucket public) [B8]
 *  - Revoque parental_consents, supprime supporters_link
 *  - Purge guardian_designations + pending_notifications du sujet [B7]
 *  - status='executed' via claim atomique [B9], audit_log
 * Fail-safe par requete. Anonymisations idempotentes.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";

const MINOR_BUCKET = "user-photos-minors";
const PUBLIC_BUCKET = "user-photos";

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

// B8 — supprime physiquement la photo en extrayant le chemin relatif au bucket
// depuis l'URL stockee, en tentant le bucket prive (mineur) ET le bucket public
// (cas birthdate NULL classant a tort un mineur en non-mineur -> photo publique).
async function deletePhotoEverywhere(admin: any, photoUrl: string | null | undefined): Promise<void> {
  if (!photoUrl) return;
  for (const bucket of [MINOR_BUCKET, PUBLIC_BUCKET]) {
    const marker = `/${bucket}/`;
    const idx = photoUrl.indexOf(marker);
    if (idx === -1) continue;
    const path = photoUrl.slice(idx + marker.length).split("?")[0];
    if (!path) continue;
    try {
      await admin.storage.from(bucket).remove([path]);
    } catch (e) {
      console.warn(`[execute-erasure] photo remove failed (${bucket})`, e);
    }
  }
}

async function eraseOne(admin: any, req: any): Promise<{ ok: boolean; error?: string }> {
  const subject = req.subject_profile_id as string;
  try {
    const { data: profile } = await admin
      .from("profiles").select("photo_url, photo_is_minor").eq("id", subject).maybeSingle();

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

    // B8 : suppression physique de la photo (bucket prive + public)
    await deletePhotoEverywhere(admin, profile?.photo_url);

    await admin.from("parental_consents")
      .update({ revoked_at: new Date().toISOString(), revoked_reason: "account_erased" })
      .eq("minor_profile_id", subject)
      .is("revoked_at", null);

    await admin.from("supporters_link")
      .delete().or(`player_id.eq.${subject},supporter_id.eq.${subject}`);

    // B7 : purge PII residuelle liee au sujet (email tuteur + notifications)
    await admin.from("guardian_designations").delete().eq("minor_profile_id", subject);
    await admin.from("pending_notifications").delete()
      .or(`minor_profile_id.eq.${subject},recipient_profile_id.eq.${subject}`);

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

    // B9 : claim atomique -> une seule execution marque executed + audit.
    const { data: claimed } = await admin.from("erasure_requests").update({
      status: "executed",
      executed_at: new Date().toISOString(),
    }).eq("id", req.id).eq("status", "pending").select("id");

    if (!claimed || claimed.length === 0) {
      return { ok: true };
    }

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

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  if (!serviceKey || !supabaseUrl) {
    return new Response(JSON.stringify({ error: "missing env" }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(supabaseUrl, serviceKey);

  const provided = (req.headers.get("authorization") ?? "")
    .replace(/^Bearer\s+/i, "")
    .trim();
  const { data: cronSecret } = await admin.rpc("get_cron_secret");
  if (!provided || !cronSecret || !timingSafeEqualStr(provided, cronSecret)) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

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
