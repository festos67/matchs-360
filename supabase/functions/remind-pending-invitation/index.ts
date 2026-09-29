import { createClient } from "npm:@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { getFromEmail } from "../_shared/email-config.ts";
import { sendEmail } from "../_shared/send-email.ts";
import { isTechnicalAddress } from "../_shared/technical-identity.ts";

/**
 * remind-pending-invitation
 * Relance UNIQUE, depuis la fiche joueur, d'une invitation restée sans suite :
 *  - target "player"   : le joueur ne s'est jamais connecté → nouveau lien
 *    d'invitation ;
 *  - target "guardian" : le représentant légal n'a pas encore consenti →
 *    rappel avec le lien de consentement.
 *
 * Une seule relance par joueur et par destinataire (table
 * invitation_reminders) pour ne pas polluer les boîtes : ensuite, la fiche
 * invite à contacter la personne directement.
 *
 * Body JSON: { playerId: string, target: "player" | "guardian" }
 * Auth: JWT requis — coach du joueur, responsable de son club, administrateur.
 */

function escapeHtml(input: unknown): string {
  if (input === null || input === undefined) return "";
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/\//g, "&#x2F;");
}

function maskEmail(e: string): string {
  return e.replace(/^(.{2}).*(@.*)$/, "$1***$2");
}

const FALLBACK_ORIGIN = "https://matchs360.lovable.app";
const ALLOWED_ORIGIN_PATTERNS: RegExp[] = [
  /^https:\/\/([a-z0-9-]+\.)*lovable\.app$/i,
  /^https:\/\/([a-z0-9-]+\.)*lovableproject\.com$/i,
  /^https:\/\/([a-z0-9-]+\.)*sandbox\.lovable\.dev$/i,
  /^https:\/\/(www\.)?matchs360\.fr$/i,
  /^http:\/\/localhost(:\d+)?$/i,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/i,
];

function getSafeOrigin(req: Request): string {
  const origin = req.headers.get("origin");
  if (origin && ALLOWED_ORIGIN_PATTERNS.some((re) => re.test(origin))) return origin;
  return FALLBACK_ORIGIN;
}

function emailLayout(title: string, body: string, link: string, button: string): string {
  return `
    <!DOCTYPE html>
    <html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background:#f4f4f5; margin:0; padding:40px 20px;">
      <div style="max-width:480px; margin:0 auto; background:white; border-radius:12px; padding:40px;">
        <h1 style="color:#18181b; font-size:24px; text-align:center; margin:0 0 8px;">MATCHS360</h1>
        <h2 style="color:#18181b; font-size:18px; margin-top:24px;">${title}</h2>
        <p style="color:#3f3f46; line-height:1.6;">${body}</p>
        <a href="${link}" style="display:block; background:#2563eb; color:white; text-decoration:none; padding:14px 24px; border-radius:8px; text-align:center; font-weight:600; margin:24px 0;">
          ${button}
        </a>
        <p style="color:#71717a; font-size:12px; line-height:1.6;">
          Ou copiez ce lien dans votre navigateur :<br>
          <a href="${link}" style="color:#2563eb; word-break:break-all;">${escapeHtml(link)}</a>
        </p>
        <p style="color:#a1a1aa; font-size:12px; text-align:center; margin-top:32px;">
          Si vous n'attendiez pas ce message, vous pouvez l'ignorer.
        </p>
      </div>
    </body></html>
  `;
}

const handler = async (req: Request): Promise<Response> => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  const corsHeaders = buildCorsHeaders(req);

  const jsonResp = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResp({ error: "Authentification manquante." }, 401);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: callerData, error: callerErr } = await supabaseAdmin.auth.getUser(token);
    if (callerErr || !callerData?.user?.id) {
      return jsonResp({ error: "Session invalide." }, 401);
    }
    const callerId = callerData.user.id;

    const body = await req.json().catch(() => ({}));
    const playerId = typeof body?.playerId === "string" ? body.playerId : null;
    const target = body?.target === "player" || body?.target === "guardian" ? body.target : null;
    if (!playerId || !target) {
      return jsonResp({ error: "playerId et target requis." }, 400);
    }

    // Droits : administrateur, coach du joueur, responsable de son club
    // (délégation en cours comprise : is_club_admin_of_player s'appuie sur
    // is_club_admin).
    const [adminRes, coachRes, clubAdminRes] = await Promise.all([
      supabaseAdmin.rpc("is_admin", { _user_id: callerId }),
      supabaseAdmin.rpc("is_coach_of_player", { _coach_id: callerId, _player_id: playerId }),
      supabaseAdmin.rpc("is_club_admin_of_player", { _user_id: callerId, _player_id: playerId }),
    ]);
    if (!adminRes.data && !coachRes.data && !clubAdminRes.data) {
      return jsonResp({ error: "Action non autorisée." }, 403);
    }

    const { data: child } = await supabaseAdmin
      .from("profiles")
      .select("id, first_name, last_name, club_id, deleted_at")
      .eq("id", playerId)
      .maybeSingle();
    if (!child || child.deleted_at) {
      return jsonResp({ error: "Joueur introuvable." }, 404);
    }

    const { data: existing } = await supabaseAdmin
      .from("invitation_reminders")
      .select("sent_at")
      .eq("player_id", playerId)
      .eq("target", target)
      .maybeSingle();
    if (existing) {
      return jsonResp(
        {
          error: "Une relance a déjà été envoyée. Contactez directement la personne.",
          code: "ALREADY_REMINDED",
          sentAt: existing.sent_at,
        },
        409,
      );
    }

    const { data: club } = await supabaseAdmin
      .from("clubs")
      .select("name")
      .eq("id", child.club_id)
      .maybeSingle();
    const clubName = club?.name || "MATCHS360";
    const childName = [child.first_name, child.last_name].filter(Boolean).join(" ") || "votre enfant";
    const origin = getSafeOrigin(req);

    let recipient: string;
    let link: string;
    let subject: string;
    let html: string;

    if (target === "guardian") {
      const { data: designations } = await supabaseAdmin
        .from("guardian_designations")
        .select("guardian_email")
        .eq("minor_profile_id", playerId)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(1);
      if (!designations || designations.length === 0) {
        return jsonResp({ error: "Aucun consentement en attente pour ce joueur." }, 404);
      }
      recipient = designations[0].guardian_email.toLowerCase().trim();

      const { data: existingGuardian } = await supabaseAdmin
        .rpc("admin_get_user_by_email", { p_email: recipient })
        .maybeSingle();
      const { data: gLink, error: gLinkErr } = await supabaseAdmin.auth.admin.generateLink({
        type: existingGuardian ? "magiclink" : "invite",
        email: recipient,
        options: { redirectTo: `${origin}/guardian/consent?minor=${encodeURIComponent(playerId)}` },
      });
      if (gLinkErr || !gLink?.properties?.action_link) {
        console.error("remind guardian generateLink failed", { masked: maskEmail(recipient), err: gLinkErr?.message });
        return jsonResp({ error: "Impossible de générer le lien de consentement." }, 502);
      }
      link = gLink.properties.action_link;
      subject = `Rappel — Consentement parental requis — ${clubName}`;
      html = emailLayout(
        "Rappel — Consentement parental requis",
        `Bonjour,<br><br>
         Nous n'avons pas encore reçu votre consentement pour l'inscription de
         <strong>${escapeHtml(childName)}</strong> au club <strong>${escapeHtml(clubName)}</strong>.
         En tant que titulaire de l'autorité parentale, votre accord est nécessaire
         (RGPD art. 8) pour activer son compte.`,
        link,
        "Donner mon consentement",
      );
    } else {
      const { data: authUser, error: authErr } = await supabaseAdmin.auth.admin.getUserById(playerId);
      const email = authUser?.user?.email?.toLowerCase() ?? "";
      if (authErr || !email) {
        return jsonResp({ error: "Utilisateur introuvable." }, 404);
      }
      if (isTechnicalAddress(email)) {
        return jsonResp(
          { error: "Ce joueur n'a pas d'adresse e-mail : il se connecte avec son identifiant." },
          400,
        );
      }
      if (authUser.user.last_sign_in_at) {
        return jsonResp({ error: "Ce joueur s'est déjà connecté." }, 409);
      }
      // Invitation d'un mineur de moins de 15 ans : le consentement parental
      // doit être donné avant (send-invitation applique la même règle).
      const { data: consentPending } = await supabaseAdmin
        .from("guardian_designations")
        .select("id")
        .eq("minor_profile_id", playerId)
        .eq("status", "pending")
        .limit(1);
      if (consentPending && consentPending.length > 0) {
        return jsonResp(
          { error: "Le consentement du représentant légal est en attente : relancez-le d'abord." },
          409,
        );
      }
      recipient = email;
      const { data: invite, error: inviteErr } = await supabaseAdmin.auth.admin.generateLink({
        type: authUser.user.email_confirmed_at ? "magiclink" : "invite",
        email: recipient,
        options: { redirectTo: `${origin}/invite/accept` },
      });
      if (inviteErr || !invite?.properties?.action_link) {
        console.error("remind player generateLink failed", { masked: maskEmail(recipient), err: inviteErr?.message });
        return jsonResp({ error: "Impossible de générer le lien d'invitation." }, 502);
      }
      link = invite.properties.action_link;
      subject = `Rappel : invitation à rejoindre ${clubName}`;
      html = emailLayout(
        "Rappel d'invitation",
        `Bonjour,<br><br>
         Vous avez été invité(e) à rejoindre <strong>${escapeHtml(clubName)}</strong> en tant que
         <strong>joueur</strong>. Votre invitation est toujours en attente : cliquez ci-dessous
         pour créer votre accès.`,
        link,
        "Accepter l'invitation",
      );
    }

    if (!resendApiKey) {
      return jsonResp({ error: "Service e-mail non configuré." }, 503);
    }

    // Réservation de la relance AVANT l'envoi : deux clics simultanés ne
    // partent pas deux fois (clé primaire joueur + destinataire).
    const { error: claimErr } = await supabaseAdmin
      .from("invitation_reminders")
      .insert({ player_id: playerId, target, sent_by: callerId });
    if (claimErr) {
      return jsonResp(
        { error: "Une relance a déjà été envoyée. Contactez directement la personne.", code: "ALREADY_REMINDED" },
        409,
      );
    }

    const resend = new Resend(resendApiKey);
    const result = await sendEmail(resend, { from: getFromEmail(), to: [recipient], subject, html });
    if (result.error) {
      // Envoi échoué : la relance n'a pas eu lieu, on la rend à nouveau possible.
      await supabaseAdmin.from("invitation_reminders").delete().eq("player_id", playerId).eq("target", target);
      console.error("remind email failed", { masked: maskEmail(recipient), err: result.error });
      return jsonResp({ error: "L'envoi de l'e-mail a échoué." }, 502);
    }

    await supabaseAdmin.from("audit_log").insert({
      actor_id: callerId,
      action: "invitation_reminder_sent",
      table_name: "invitation_reminders",
      record_id: playerId,
      after_data: { target },
    });

    return jsonResp({ ok: true, sentTo: maskEmail(recipient) });
  } catch (err) {
    console.error("remind-pending-invitation error", (err as Error)?.message);
    return jsonResp({ error: "Erreur interne." }, 500);
  }
};

Deno.serve(handler);
