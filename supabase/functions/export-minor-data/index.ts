/**
 * Phase 5 RGPD art. 20 — Export portabilite (ZIP structure).
 *
 * Securite : verifie via service_role que le caller est is_legal_guardian_of
 * du sujet OU le sujet lui-meme OU admin. Loggue dans minor_data_access_log
 * (si mineur) et audit_log.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import JSZip from "npm:jszip@3.10.1";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";

const MINOR_BUCKET = "user-photos-minors";
const PUBLIC_BUCKET = "user-photos";

function maskEmail(e: string | null | undefined): string {
  if (!e) return "";
  const [u, d] = e.split("@");
  if (!u || !d) return "***";
  return `${u.slice(0, 2)}***@${d}`;
}

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
    if (!/^[0-9a-f-]{36}$/i.test(subject)) {
      return new Response(JSON.stringify({ error: "invalid_subject" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: u } = await userClient.auth.getUser();
    const userId = u?.user?.id;
    if (!userId) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Authorisation check (service_role bypasses RLS so we check via RPCs)
    let allowed = userId === subject;
    if (!allowed) {
      const { data: isAdmin } = await admin.rpc("is_admin", { _user_id: userId });
      allowed = !!isAdmin;
    }
    if (!allowed) {
      const { data: isGuardian } = await admin.rpc("is_legal_guardian_of", {
        _guardian_id: userId, _minor_id: subject,
      });
      allowed = !!isGuardian;
    }
    if (!allowed) {
      console.warn("[export-minor-data] forbidden subject=%s by=%s", subject, userId);
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Gather data (service_role; we already authorized)
    const [profile, evals, evalScores, evalObjs, teamMembers, playerObjs, consents, accessLog] =
      await Promise.all([
        admin.from("profiles").select("*").eq("id", subject).maybeSingle(),
        admin.from("evaluations").select("*").eq("player_id", subject),
        admin.from("evaluation_scores").select("*, evaluations!inner(player_id)").eq("evaluations.player_id", subject),
        admin.from("evaluation_objectives").select("*, evaluations!inner(player_id)").eq("evaluations.player_id", subject),
        admin.from("team_members").select("*").eq("user_id", subject),
        admin.from("player_objectives").select("*").eq("player_id", subject),
        admin.from("parental_consents").select("*").eq("minor_profile_id", subject),
        admin.from("minor_data_access_log").select("*").eq("minor_profile_id", subject).order("occurred_at", { ascending: false }).limit(500),
      ]);

    const zip = new JSZip();
    const folder = zip.folder("export") ?? zip;

    folder.file("README.txt",
      `Export RGPD (art. 20 — portabilite) genere le ${new Date().toISOString()}\n` +
      `Sujet: ${subject}\n` +
      `Demandeur: ${userId}\n\n` +
      `Contient l'integralite des donnees structurees relatives au sujet,\n` +
      `dans un format ouvert (JSON) reutilisable.\n`);
    folder.file("profile.json", JSON.stringify(profile.data ?? null, null, 2));
    folder.file("evaluations.json", JSON.stringify(evals.data ?? [], null, 2));
    folder.file("evaluation_scores.json", JSON.stringify(evalScores.data ?? [], null, 2));
    folder.file("evaluation_objectives.json", JSON.stringify(evalObjs.data ?? [], null, 2));
    folder.file("teams.json", JSON.stringify(teamMembers.data ?? [], null, 2));
    folder.file("player_objectives.json", JSON.stringify(playerObjs.data ?? [], null, 2));
    folder.file("parental_consents.json", JSON.stringify(consents.data ?? [], null, 2));
    folder.file("access_log.json", JSON.stringify(accessLog.data ?? [], null, 2));

    // Try to add photo
    if (profile.data?.photo_url) {
      const bucket = profile.data.photo_is_minor ? MINOR_BUCKET : PUBLIC_BUCKET;
      try {
        const path = profile.data.photo_is_minor
          ? profile.data.photo_url
          : profile.data.photo_url.split(`/${PUBLIC_BUCKET}/`)[1] ?? null;
        if (path) {
          const { data: file } = await admin.storage.from(bucket).download(path);
          if (file) {
            const ext = path.split(".").pop() || "jpg";
            folder.file(`photo.${ext}`, new Uint8Array(await file.arrayBuffer()));
          }
        }
      } catch (e) {
        console.warn("[export-minor-data] photo download failed", e);
      }
    }

    const blob = await zip.generateAsync({ type: "uint8array" });

    // Upload to a private bucket with short-lived signed URL.
    // Reuse user-photos-minors (private) — namespace under /exports/
    const exportPath = `exports/${subject}/${Date.now()}.zip`;
    await admin.storage.from(MINOR_BUCKET).upload(exportPath, blob, {
      contentType: "application/zip", upsert: true,
    });
    const { data: signed } = await admin.storage.from(MINOR_BUCKET)
      .createSignedUrl(exportPath, 300);

    // Audit + minor access log
    await admin.from("audit_log").insert({
      table_name: "profiles",
      record_id: subject,
      action: "export",
      actor_id: userId,
      after_data: { recipient: maskEmail(u?.user?.email), bytes: blob.length },
    });
    if (profile.data?.birthdate) {
      // best-effort minor log
      await admin.from("minor_data_access_log").insert({
        minor_profile_id: subject,
        actor_id: userId,
        actor_role: "guardian_or_self",
        access_type: "export",
        target: "portability_zip",
      }).then(() => {}, () => {});
    }

    return new Response(JSON.stringify({
      ok: true, download_url: signed?.signedUrl, expires_in_seconds: 300,
    }), {
      status: 200, headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[export-minor-data]", e);
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
};

Deno.serve(handler);