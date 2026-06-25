import { createClient } from "npm:@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { getFromEmail } from "../_shared/email-config.ts";

/**
 * change-legal-guardian
 * Remplace le représentant légal désigné d'un joueur mineur.
 *  - Annule les désignations pending existantes
 *  - Crée une nouvelle désignation pending
 *  - Suspend le compte du mineur (is_active=false) tant que le nouveau
 *    titulaire n'a pas donné son consentement
 *  - Envoie un email de consentement au nouveau représentant légal
 *
 * Auth : admin, club_admin du club du joueur, ou coach assigné au joueur.
 * Body : { playerId, guardianEmail, guardianFirstName, guardianLastName, guardianRelationship }
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

const ALLOWED_REL = ["mere", "pere", "tuteur_legal", "autre_titulaire"] as const;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
    const guardianEmailRaw = typeof body?.guardianEmail === "string" ? body.guardianEmail : "";
    const guardianRelationship = typeof body?.guardianRelationship === "string" ? body.guardianRelationship : "";
    const guardianFirstName = typeof body?.guardianFirstName === "string" ? body.guardianFirstName.trim() : "";
    const guardianLastName = typeof body?.guardianLastName === "string" ? body.guardianLastName.trim() : "";

    if (!playerId) return jsonResp({ error: "playerId requis." }, 400);
    if (!EMAIL_RE.test(guardianEmailRaw)) return jsonResp({ error: "Email du représentant légal invalide." }, 400);
    if (!(ALLOWED_REL as readonly string[]).includes(guardianRelationship)) {
      return jsonResp({ error: "Lien avec l'enfant invalide." }, 400);
    }
    if (!guardianFirstName || !guardianLastName) {
      return jsonResp({ error: "Prénom et nom du représentant légal requis." }, 400);
    }

    const guardianEmailNorm = guardianEmailRaw.toLowerCase().trim();

    // 1. Récupère le profil du joueur
    const { data: child, error: childErr } = await supabaseAdmin
      .from("profiles")
      .select("id, first_name, last_name, club_id, birthdate, email")
      .eq("id", playerId)
      .maybeSingle();
    if (childErr || !child) return jsonResp({ error: "Joueur introuvable." }, 404);

    // Garde : ne s'applique qu'à un mineur < 15 ans (RGPD art. 8)
    if (!child.birthdate) {
      return jsonResp({ error: "Date de naissance du joueur inconnue." }, 400);
    }
    const birth = new Date(String(child.birthdate));
    const threshold = new Date();
    threshold.setFullYear(threshold.getFullYear() - 15);
    if (birth <= threshold) {
      return jsonResp(
        { error: "Ce joueur n'est pas concerné par le consentement parental (15 ans ou plus)." },
        400,
      );
    }

    // Le nouveau guardian ne peut pas être le mineur lui-même
    if (guardianEmailNorm === (child.email ?? "").toLowerCase().trim()) {
      return jsonResp({ error: "Le représentant légal ne peut pas être le joueur lui-même." }, 400);
    }

    // 2. Permissions caller
    const { data: callerRoles } = await supabaseAdmin
      .from("user_roles")
      .select("role, club_id")
      .eq("user_id", callerId);
    const roles = callerRoles ?? [];
    const isAdmin = roles.some((r) => r.role === "admin");
    const isClubAdmin = roles.some((r) => r.role === "club_admin" && r.club_id === child.club_id);

    let isCoachOfPlayer = false;
    if (!isAdmin && !isClubAdmin) {
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

    // 3. Annule toutes les désignations pending existantes
    const { error: cancelErr } = await supabaseAdmin
      .from("guardian_designations")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("minor_profile_id", playerId)
      .eq("status", "pending");
    if (cancelErr) {
      console.error("cancel existing designations failed", cancelErr);
      return jsonResp({ error: "Impossible d'annuler la désignation existante." }, 500);
    }

    // 4. Insère la nouvelle désignation pending
    const { data: newDesig, error: insErr } = await supabaseAdmin
      .from("guardian_designations")
      .insert({
        minor_profile_id: playerId,
        guardian_email: guardianEmailNorm,
        guardian_first_name: guardianFirstName,
        guardian_last_name: guardianLastName,
        relationship: guardianRelationship,
        created_by: callerId,
      })
      .select("id")
      .single();
    if (insErr || !newDesig) {
      console.error("new designation insert failed", insErr);
      return jsonResp({ error: "Impossible d'enregistrer le nouveau représentant légal." }, 500);
    }

    // 5. Suspend le compte du mineur (nouveau consentement requis)
    await supabaseAdmin
      .from("profiles")
      .update({ is_active: false })
      .eq("id", playerId);

    // 6. Audit
    await supabaseAdmin.from("audit_log").insert({
      actor_id: callerId,
      actor_role: isAdmin ? "admin" : isClubAdmin ? "club_admin" : "coach",
      action: "legal_guardian_changed",
      table_name: "guardian_designations",
      record_id: newDesig.id,
      after_data: {
        minor_profile_id: playerId,
        guardian_email_masked: maskEmail(guardianEmailNorm),
        relationship: guardianRelationship,
      },
      ip_address: req.headers.get("x-forwarded-for") ?? null,
      user_agent: req.headers.get("user-agent") ?? null,
    });

    // 7. Email de consentement au nouveau guardian (même flux que send-invitation)
    const origin = getSafeOrigin(req);
    const guardianRedirect = `${origin}/guardian/consent?minor=${encodeURIComponent(playerId)}`;

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
      console.error("change-guardian generateLink failed", {
        masked: maskEmail(guardianEmailNorm),
        err: gLinkErr?.message,
      });
      return jsonResp(
        { ok: true, emailSent: false, warning: "Le représentant légal a été remplacé mais l'email n'a pas pu être envoyé." },
        200,
      );
    }

    if (!resendApiKey) {
      return jsonResp(
        { ok: true, emailSent: false, warning: "Service email non configuré — email non envoyé." },
        200,
      );
    }

    const resend = new Resend(resendApiKey);
    const { data: club } = await supabaseAdmin
      .from("clubs")
      .select("name")
      .eq("id", child.club_id)
      .maybeSingle();
    const childName = [child.first_name, child.last_name].filter(Boolean).join(" ") || "votre enfant";
    const guardianDisplayName = [guardianFirstName, guardianLastName].filter(Boolean).join(" ");
    const greeting = guardianDisplayName
      ? `Bonjour ${escapeHtml(guardianDisplayName)},`
      : "Bonjour,";
    const guardianLink = gLink.properties.action_link;

    const result = await resend.emails.send({
      from: getFromEmail(),
      to: [guardianEmailNorm],
      subject: `Consentement parental requis — ${escapeHtml(club?.name || "MATCHS360")}`,
      html: `
        <!DOCTYPE html>
        <html><head><meta charset="utf-8"></head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background:#f4f4f5; margin:0; padding:40px 20px;">
          <div style="max-width:480px; margin:0 auto; background:white; border-radius:12px; padding:40px;">
            <h1 style="color:#18181b; font-size:24px; text-align:center; margin:0 0 8px;">MATCHS360</h1>
            <h2 style="color:#18181b; font-size:18px; margin-top:24px;">Consentement parental requis</h2>
            <p style="color:#3f3f46; line-height:1.6;">
              ${greeting}<br><br>
              Vous avez été désigné(e) comme représentant légal de
              <strong>${escapeHtml(childName)}</strong> au club
              <strong>${escapeHtml(club?.name || "MATCHS360")}</strong>. En tant que titulaire
              de l'autorité parentale, votre consentement est nécessaire (RGPD art. 8) pour
              activer son compte.
            </p>
            <a href="${guardianLink}" style="display:block; background:#2563eb; color:white; text-decoration:none; padding:14px 24px; border-radius:8px; text-align:center; font-weight:600; margin:24px 0;">
              Donner mon consentement
            </a>
            <p style="color:#71717a; font-size:12px;">
              Si vous n'êtes pas à l'origine de cette désignation, ignorez simplement cet email.
            </p>
          </div>
        </body></html>
      `,
    });

    if (result.error) {
      console.error("change-guardian email failed", {
        masked: maskEmail(guardianEmailNorm),
        err: result.error,
      });
      return jsonResp({
        ok: true,
        emailSent: false,
        warning: "Le représentant légal a été remplacé mais l'email n'a pas pu être envoyé.",
      });
    }

    return jsonResp({
      ok: true,
      emailSent: true,
      sentTo: maskEmail(guardianEmailNorm),
    });
  } catch (err) {
    console.error("change-legal-guardian error", (err as Error)?.message);
    return jsonResp({ error: "Erreur interne." }, 500);
  }
};

Deno.serve(handler);