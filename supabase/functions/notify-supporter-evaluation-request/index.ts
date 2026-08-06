import { createClient } from "npm:@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { buildCorsHeaders, handleCorsPreflight, isAllowedOrigin } from "../_shared/cors.ts";
import { getFromEmail } from "../_shared/email-config.ts";

/**
 * Notifie par email les SUPPORTERS invites a evaluer un joueur. Couvre les
 * chemins RequestSupporterEvaluationModal (batch) et la relance
 * (SupporterRequestsPanel) qui creent des supporter_evaluation_requests sans
 * envoyer d'email. Auth applicative : on n'envoie qu'aux supporters pour
 * lesquels l'APPELANT a bien cree une demande 'pending' (requested_by = lui) —
 * ce qui implique qu'il etait autorise (RLS de creation) + anti-abus.
 */

function escapeHtml(input: unknown): string {
  if (input === null || input === undefined) return "";
  return String(input)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
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
    const supporterIds = Array.isArray(body?.supporterIds) ? (body.supporterIds as string[]) : [];
    if (!playerId || supporterIds.length === 0) return json({ error: "playerId et supporterIds requis" }, 400);

    if (!resendApiKey) return json({ sent: 0, reason: "RESEND_API_KEY manquante" });
    const resend = new Resend(resendApiKey);
    let fromEmail: string;
    try { fromEmail = getFromEmail(); } catch (_e) { return json({ error: "invalid sender config" }, 500); }

    const { data: player } = await admin
      .from("profiles").select("first_name, last_name, nickname").eq("id", playerId).maybeSingle();
    const p = player as any;
    const playerName = (p?.nickname || [p?.first_name, p?.last_name].filter(Boolean).join(" ") || "un joueur");

    const reqOrigin = req.headers.get("origin");
    const appBase = reqOrigin && isAllowedOrigin(reqOrigin) ? reqOrigin : "https://matchs360.fr";
    const link = `${appBase}/supporter/dashboard`;

    let sent = 0, skipped = 0;
    for (const supporterId of supporterIds) {
      // Anti-abus : l'appelant doit avoir cree une demande pending pour ce supporter
      const { data: reqRow } = await admin
        .from("supporter_evaluation_requests").select("id")
        .eq("player_id", playerId).eq("supporter_id", supporterId)
        .eq("requested_by", caller.id).eq("status", "pending")
        .maybeSingle();
      if (!reqRow) { skipped++; continue; }

      const { data: sup } = await admin
        .from("profiles").select("email, first_name").eq("id", supporterId).maybeSingle();
      const toEmail = (sup as any)?.email as string | undefined;
      if (!toEmail) { skipped++; continue; }

      const { error: sendErr } = await resend.emails.send({
        from: fromEmail,
        to: [toEmail],
        subject: `Évaluation demandée — ${playerName}`,
        html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f4f4f5;margin:0;padding:40px 20px;">
<div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:40px;">
<h1 style="color:#18181b;font-size:24px;text-align:center;margin:0 0 8px;">MATCHS360</h1>
<h2 style="color:#18181b;font-size:18px;">Évaluation demandée</h2>
<p style="color:#3f3f46;line-height:1.6;">Vous avez été invité(e) à donner votre évaluation de <strong>${escapeHtml(playerName)}</strong> sur MATCHS360.</p>
<a href="${link}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;margin-top:16px;">Faire l'évaluation</a>
<p style="color:#a1a1aa;font-size:12px;margin-top:24px;">Connectez-vous a votre espace supporter pour acceder a la demande.</p>
</div></body></html>`,
      });
      if (sendErr) { console.error("notify-supporter-eval send failed", sendErr); skipped++; continue; }
      sent++;
    }

    return json({ sent, skipped });
  } catch (e) {
    console.error("notify-supporter-evaluation-request fatal", e);
    return json({ error: (e as Error)?.message || "unknown" }, 500);
  }
};

Deno.serve(handler);
