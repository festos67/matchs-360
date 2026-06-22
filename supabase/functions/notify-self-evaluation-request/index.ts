import { createClient } from "npm:@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { buildCorsHeaders, handleCorsPreflight, isAllowedOrigin } from "../_shared/cors.ts";
import { getFromEmail } from "../_shared/email-config.ts";

/**
 * Notifie un JOUEUR qu'un coach/responsable lui demande un auto-débrief.
 * Anti-abus : on ne notifie que si l'APPELANT a créé une demande 'pending'
 * (requested_by = lui) pour ce joueur. Notification in-app + email (best-effort).
 */
function escapeHtml(input: unknown): string {
  if (input === null || input === undefined) return "";
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const handler = async (req: Request): Promise<Response> => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  const cors = buildCorsHeaders(req);
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!supabaseUrl || !serviceKey) return json({ error: "missing env" }, 500);

    const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

    const tokenStr = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!tokenStr) return json({ error: "unauthorized" }, 401);
    const { data: callerData, error: callerErr } = await admin.auth.getUser(tokenStr);
    const caller = callerData?.user;
    if (callerErr || !caller) return json({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const playerId = body?.playerId as string | undefined;
    if (!playerId) return json({ error: "playerId requis" }, 400);

    // Anti-abus : l'appelant doit avoir créé une demande pending pour ce joueur
    const { data: reqRow } = await admin
      .from("self_evaluation_requests").select("id")
      .eq("player_id", playerId).eq("requested_by", caller.id).eq("status", "pending")
      .maybeSingle();
    if (!reqRow) return json({ error: "no pending request by caller" }, 403);

    const { data: player } = await admin
      .from("profiles").select("email, first_name, last_name, nickname").eq("id", playerId).maybeSingle();
    const p = player as any;
    const playerName = (p?.nickname || [p?.first_name, p?.last_name].filter(Boolean).join(" ") || "Joueur");

    const reqOrigin = req.headers.get("origin");
    const appBase = reqOrigin && isAllowedOrigin(reqOrigin) ? reqOrigin : "https://matchs360.fr";
    const link = "/player/self-evaluation";

    // 1) Notification in-app (best-effort)
    let notified = false;
    try {
      const { error: notifErr } = await admin.from("notifications").insert({
        user_id: playerId,
        title: "Auto-débrief demandé",
        message: "Votre coach vous invite à réaliser un auto-débrief.",
        type: "info",
        link,
      });
      notified = !notifErr;
      if (notifErr) console.error("notify-self-eval notification insert failed", notifErr);
    } catch (e) { console.error("notify-self-eval notification exception", e); }

    // 2) Email (best-effort)
    let sent = false;
    const toEmail = p?.email as string | undefined;
    if (resendApiKey && toEmail) {
      let fromEmail: string;
      try { fromEmail = getFromEmail(); } catch (_e) { return json({ notified, sent: false, reason: "invalid sender config" }); }
      const resend = new Resend(resendApiKey);
      const emailLink = `${appBase}${link}`;
      const { error: sendErr } = await resend.emails.send({
        from: fromEmail,
        to: [toEmail],
        subject: "Auto-débrief demandé — MATCHS360",
        html: `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#f6f7fb;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px;">
    <div style="font-size:13px;color:#3B82F6;font-weight:700;letter-spacing:0.04em;">MATCHS360</div>
    <h1 style="font-size:20px;color:#0f172a;margin:12px 0;">Auto-débrief demandé</h1>
    <p style="color:#334155;line-height:1.55;">Bonjour ${escapeHtml(playerName)}, votre coach vous invite à réaliser un auto-débrief de vos compétences sur MATCHS360.</p>
    <p style="margin:24px 0;">
      <a href="${emailLink}" style="display:inline-block;background:#3B82F6;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:600;">Faire mon auto-débrief</a>
    </p>
    <p style="color:#64748b;font-size:13px;">Connectez-vous à votre espace joueur pour accéder à l'auto-débrief.</p>
  </div>
</body></html>`,
      });
      sent = !sendErr;
      if (sendErr) console.error("notify-self-eval send failed", sendErr);
    }

    return json({ notified, sent });
  } catch (e) {
    console.error("notify-self-evaluation-request fatal", e);
    return json({ error: (e as Error)?.message || "unknown" }, 500);
  }
};

Deno.serve(handler);