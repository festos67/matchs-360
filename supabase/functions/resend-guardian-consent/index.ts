import { createClient } from "npm:@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { getFromEmail } from "../_shared/email-config.ts";

/**
 * resend-guardian-consent
 * Permet à un coach (référent/assistant) du joueur, à un responsable club
 * du club du joueur ou à un admin de renvoyer l'email de consentement
 * parental au représentant légal déjà désigné pour un joueur mineur.
 *
 * Body JSON: { playerId: string }
 * Auth: JWT requis.
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
    if (!playerId) {
      return jsonResp({ error: "playerId requis." }, 400);
    }

    // 1. Récupère le profil du joueur (besoin club_id + nom)
    const { data: child, error: childErr } = await supabaseAdmin
      .from("profiles")
      .select("id, first_name, last_name, club_id")
      .eq("id", playerId)
      .maybeSingle();
    if (childErr || !child) {
      return jsonResp({ error: "Joueur introuvable." }, 404);
    }

    // 2. Vérifie les droits du caller : admin, club_admin du club, ou coach du joueur.
    const { data: callerRoles } = await supabaseAdmin
      .from("user_roles")
      .select("role, club_id")
      .eq("user_id", callerId);

    const roles = callerRoles ?? [];
    const isAdmin = roles.some((r) => r.role === "admin");
    const isClubAdmin = roles.some((r) => r.role === "club_admin" && r.club_id === child.club_id);

    let isCoachOfPlayer = false;
    if (!isAdmin && !isClubAdmin) {
      // Coach assigné à une équipe contenant ce joueur
      const { data: playerTeams } = await supabaseAdmin
        .from("team_members")
        .select("team_id")
        .eq("user_id", playerId)
        .eq("member_type", "player")
        .eq("is_active", true)
        .is("deleted_at", null);
      const teamIds = (playerTeams ?? []).map((t) => t.team_id);
      if (teamIds.length > 0) {
        const { data: coachMatch } = await supabaseAdmin
          .from("team_members")
          .select("id")
          .eq("user_id", callerId)
          .eq("member_type", "coach")
          .eq("is_active", true)
          .is("deleted_at", null)
          .in("team_id", teamIds)
          .limit(1);
        isCoachOfPlayer = (coachMatch?.length ?? 0) > 0;
      }
    }

    if (!isAdmin && !isClubAdmin && !isCoachOfPlayer) {
      return jsonResp({ error: "Action non autorisée." }, 403);
    }

    // 3. Récupère la désignation guardian active
    const { data: designations, error: desigErr } = await supabaseAdmin
      .from("guardian_designations")
      .select("guardian_email, guardian_first_name, guardian_last_name, status")
      .eq("minor_profile_id", playerId)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1);
    if (desigErr || !designations || designations.length === 0) {
      return jsonResp(
        { error: "Aucun représentant légal désigné pour ce joueur." },
        404,
      );
    }
    const desig = designations[0];
    // 4. Récupère le club pour personnaliser l'email
    const { data: club } = await supabaseAdmin
      .from("clubs")
      .select("name")
      .eq("id", child.club_id)
      .maybeSingle();

    // 5. Génère un magic link vers le flux de consentement
    const origin = getSafeOrigin(req);
    const guardianRedirect = `${origin}/guardian/consent?minor=${encodeURIComponent(playerId)}`;
    const guardianEmailNorm = desig.guardian_email.toLowerCase().trim();

    const { data: existingGuardian } = await supabaseAdmin
      .rpc("admin_get_user_by_email", { p_email: guardianEmailNorm })
      .maybeSingle();

    const linkType: "invite" | "magiclink" = existingGuardian ? "magiclink" : "invite";
    const { data: gLink, error: gLinkErr } = await supabaseAdmin.auth.admin.generateLink({
      type: linkType,
      email: guardianEmailNorm,
      options: { redirectTo: guardianRedirect },
    });
    if (gLinkErr || !gLink?.properties?.action_link) {
      console.error("resend guardian generateLink failed", {
        masked: maskEmail(guardianEmailNorm),
        err: gLinkErr?.message,
      });
      return jsonResp({ error: "Impossible de générer le lien de consentement." }, 502);
    }

    if (!resendApiKey) {
      return jsonResp({ error: "Service email non configuré." }, 503);
    }
    const resend = new Resend(resendApiKey);

    const childName = [child.first_name, child.last_name].filter(Boolean).join(" ") || "votre enfant";
    const guardianDisplayName = [desig.guardian_first_name, desig.guardian_last_name]
      .map((p) => p?.trim())
      .filter(Boolean)
      .join(" ");
    const greeting = guardianDisplayName
      ? `Bonjour ${escapeHtml(guardianDisplayName)},`
      : "Bonjour,";
    const guardianLink = gLink.properties.action_link;

    const result = await resend.emails.send({
      from: getFromEmail(),
      to: [guardianEmailNorm],
      subject: `Rappel — Consentement parental requis — ${escapeHtml(club?.name || "MATCHS360")}`,
      html: `
        <!DOCTYPE html>
        <html><head><meta charset="utf-8"></head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background:#f4f4f5; margin:0; padding:40px 20px;">
          <div style="max-width:480px; margin:0 auto; background:white; border-radius:12px; padding:40px;">
            <h1 style="color:#18181b; font-size:24px; text-align:center; margin:0 0 8px;">MATCHS360</h1>
            <h2 style="color:#18181b; font-size:18px; margin-top:24px;">Rappel — Consentement parental requis</h2>
            <p style="color:#3f3f46; line-height:1.6;">
              ${greeting}<br><br>
              Nous n'avons pas encore reçu votre consentement pour l'inscription de
              <strong>${escapeHtml(childName)}</strong> au club
              <strong>${escapeHtml(club?.name || "MATCHS360")}</strong>.
              En tant que titulaire de l'autorité parentale, votre accord est nécessaire
              (RGPD art. 8) pour activer son compte.
            </p>
            <a href="${guardianLink}" style="display:block; background:#2563eb; color:white; text-decoration:none; padding:14px 24px; border-radius:8px; text-align:center; font-weight:600; margin:24px 0;">
              Donner mon consentement
            </a>
            <p style="color:#71717a; font-size:12px;">
              Si vous n'êtes pas à l'origine de cette inscription, ignorez simplement cet email.
            </p>
          </div>
        </body></html>
      `,
    });

    if (result.error) {
      console.error("resend guardian email failed", {
        masked: maskEmail(guardianEmailNorm),
        err: result.error,
      });
      return jsonResp({ error: "L'envoi de l'email a échoué." }, 502);
    }

    console.log("guardian consent email re-sent", {
      recipient: maskEmail(guardianEmailNorm),
      messageId: result.data?.id,
      by: callerId,
    });

    return jsonResp({ ok: true, sentTo: maskEmail(guardianEmailNorm) });
  } catch (err) {
    console.error("resend-guardian-consent error", (err as Error)?.message);
    return jsonResp({ error: "Erreur interne." }, 500);
  }
};

Deno.serve(handler);