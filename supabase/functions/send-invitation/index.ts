import { createClient } from "npm:@supabase/supabase-js@2";
import { Resend } from "npm:resend@2.0.0";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { getFromEmail } from "../_shared/email-config.ts";

/**
 * SECURITY: HTML entity escape to prevent XSS / phishing injection
 * via user-controlled fields (clubs.name, firstName, role labels) that
 * are interpolated into outbound email HTML. Covers the OWASP minimum set.
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

/**
 * SECURITY (cycle 4 rate-limit): SHA-256 hex digest of the recipient email
 * for non-PII deduplication / forensic logging in invitation_send_log.
 * Uses built-in Web Crypto — no npm dependency.
 */
async function sha256Hex(s: string): Promise<string> {
  const bytes = new TextEncoder().encode(s);
  const buf = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function maskEmail(e: string): string {
  return e.replace(/^(.{2}).*(@.*)$/, "$1***$2");
}

/**
 * SECURITY: whitelist of trusted origins allowed to be used as `redirectTo`
 * in invitation links. Prevents an attacker from forging the Origin header
 * to make the invitation email link to a phishing domain.
 * Extra origins can be added via the ALLOWED_ORIGINS env var (comma-separated).
 */
const FALLBACK_ORIGIN = "https://matchs360.lovable.app";
const STATIC_ALLOWED_ORIGIN_PATTERNS: RegExp[] = [
  /^https:\/\/([a-z0-9-]+\.)*lovable\.app$/i,
  /^https:\/\/([a-z0-9-]+\.)*lovableproject\.com$/i,
  /^https:\/\/([a-z0-9-]+\.)*sandbox\.lovable\.dev$/i,
  /^http:\/\/localhost(:\d+)?$/i,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/i,
];

function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;
  try {
    // Validate it parses as a URL
    new URL(origin);
  } catch {
    return false;
  }
  if (STATIC_ALLOWED_ORIGIN_PATTERNS.some((re) => re.test(origin))) return true;
  const extra = (Deno.env.get("ALLOWED_ORIGINS") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return extra.includes(origin);
}

function getSafeOrigin(req: Request): string {
  const candidate =
    req.headers.get("origin") ||
    (req.headers.get("referer")
      ? (() => {
          try {
            return new URL(req.headers.get("referer")!).origin;
          } catch {
            return null;
          }
        })()
      : null);
  if (candidate && isOriginAllowed(candidate)) return candidate;
  if (candidate) {
    console.warn("Rejected untrusted origin, falling back to canonical URL");
  }
  return FALLBACK_ORIGIN;
}

interface InvitationRequest {
  email: string;
  firstName?: string;
  lastName?: string;
  clubId: string;
  intendedRole: "club_admin" | "coach" | "player" | "supporter";
  teamId?: string;
  coachRole?: "referent" | "assistant";
  playerIds?: string[];
}

type EmailProviderError = {
  message?: string;
  statusCode?: number;
  status?: number;
  name?: string;
};

type InvitationError = Error & {
  statusCode?: number;
  code?: string;
};

const getProviderStatusCode = (providerError: EmailProviderError): number => {
  const rawStatus = providerError.statusCode ?? providerError.status;
  const parsedStatus = typeof rawStatus === "number" ? rawStatus : Number(rawStatus);
  return Number.isFinite(parsedStatus) && parsedStatus > 0 ? parsedStatus : 500;
};

const throwEmailDeliveryError = (providerError: EmailProviderError): never => {
  const statusCode = getProviderStatusCode(providerError);
  const providerMessage = providerError.message || "Erreur inconnue du fournisseur email";

  const error = new Error(providerMessage) as InvitationError;

  if (statusCode === 429) {
    error.message = "Limite d'envoi atteinte (429). Veuillez réessayer plus tard.";
    error.code = "EMAIL_RATE_LIMITED";
    error.statusCode = 429;
    throw error;
  }

  if (statusCode === 403) {
    error.message = "Envoi refusé (403) : domaine expéditeur non autorisé. Configurez un domaine email vérifié pour envoyer à des destinataires externes.";
    error.code = "EMAIL_SENDER_FORBIDDEN";
    error.statusCode = 403;
    throw error;
  }

  error.message = `Erreur d'envoi email (${statusCode}) : ${providerMessage}`;
  error.code = "EMAIL_PROVIDER_ERROR";
  error.statusCode = statusCode;
  throw error;
};

const handler = async (req: Request): Promise<Response> => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  const corsHeaders = buildCorsHeaders(req);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const resend = resendApiKey ? new Resend(resendApiKey) : null;

    // Authenticate the caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      throw new Error("No authorization header");
    }

    const supabaseClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      console.error("Auth error:", claimsError);
      throw new Error("Unauthorized");
    }
    const user = { id: claimsData.claims.sub, email: claimsData.claims.email };

    const body: InvitationRequest = await req.json();
    const { email, firstName, lastName, clubId, intendedRole, teamId, coachRole, playerIds } = body;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      throw new Error("Invalid email address");
    }

    // ============================================================
    // AUTHORIZATION — caller must have rights over the target clubId
    // ============================================================
    if (!clubId) throw new Error("clubId is required");

    const { data: callerAdmin } = await supabaseAdmin
      .from("user_roles").select("id").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    const callerIsAdmin = !!callerAdmin;

    const { data: callerClubAdminRows } = await supabaseAdmin
      .from("user_roles").select("club_id")
      .eq("user_id", user.id).eq("role", "club_admin");
    const callerClubAdminIds = (callerClubAdminRows?.map(r => r.club_id).filter(Boolean) ?? []) as string[];
    const callerIsClubAdminOfTarget = callerClubAdminIds.includes(clubId);

    // Coach (referent) of any team in target club?
    const { data: callerRefTeams } = await supabaseAdmin
      .from("team_members")
      .select("teams!inner(club_id)")
      .eq("user_id", user.id)
      .eq("member_type", "coach")
      .eq("coach_role", "referent")
      .eq("is_active", true)
      .is("deleted_at", null);
    // deno-lint-ignore no-explicit-any
    const callerIsRefCoachOfClub = (callerRefTeams ?? []).some((t: any) => t.teams?.club_id === clubId);

    // Only admin / club_admin / referent coach (of that club) may invite
    if (!callerIsAdmin && !callerIsClubAdminOfTarget && !callerIsRefCoachOfClub) {
      return new Response(JSON.stringify({ error: "Forbidden: you cannot invite into this club" }), {
        status: 403, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Only admin / club_admin may grant club_admin or coach roles
    if ((intendedRole === "club_admin" || intendedRole === "coach") &&
        !callerIsAdmin && !callerIsClubAdminOfTarget) {
      return new Response(JSON.stringify({ error: "Forbidden: only club admins can grant this role" }), {
        status: 403, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // ============================================================
    // RATE-LIMIT applicatif (cycle 4 finding TRIPLE TRIANGULÉ)
    //   - bypass: super admin (callerIsAdmin) — peut batch grands clubs
    //   - bypass: service_role (le client est créé avec serviceRoleKey ci-dessus,
    //     mais on évalue ici le caller authentifié JWT, donc OK : un cron
    //     service_role pur n'a pas de claims.sub utilisateur et serait
    //     stoppé en amont par Unauthorized; rien à faire de plus).
    //   - quota: admin=500/h, club_admin=100/h, coach=30/h, autres=10/h
    //   - fail-CLOSED si la RPC quota échoue (refus 503, jamais bypass)
    //   - log de toute tentative (accepted | rate_limited | error)
    // ============================================================
    const callerEffectiveRole = callerIsAdmin
      ? "admin"
      : callerIsClubAdminOfTarget
      ? "club_admin"
      : callerIsRefCoachOfClub
      ? "coach"
      : "other";
    const recipientEmailHash = await sha256Hex(email.toLowerCase().trim());

    if (!callerIsAdmin) {
      const { data: quota, error: quotaErr } = await supabaseAdmin
        .rpc("get_invitation_quota_remaining", { p_caller: user.id })
        .single();

      if (quotaErr || !quota) {
        try {
          await supabaseAdmin.from("invitation_send_log").insert({
            invited_by: user.id,
            caller_role: callerEffectiveRole,
            club_id: clubId,
            intended_role: intendedRole,
            recipient_email_hash: recipientEmailHash,
            status: "error",
            error_message: ((quotaErr?.message ?? "quota check failed") as string).slice(0, 500),
          });
        } catch (_ignore) { /* never fail the response on log insert */ }
        console.warn("Invitation quota check failed (fail-closed)", {
          caller_id: user.id,
          masked_email: maskEmail(email),
          err: quotaErr?.message,
        });
        return new Response(
          JSON.stringify({ error: "Rate limit check failed" }),
          { status: 503, headers: { "Content-Type": "application/json", ...corsHeaders } },
        );
      }

      // deno-lint-ignore no-explicit-any
      const q = quota as any;
      if (q.used >= q.limit_per_hour) {
        const retryAfterSec = Math.max(
          1,
          Math.ceil((new Date(q.reset_at).getTime() - Date.now()) / 1000),
        );
        try {
          await supabaseAdmin.from("invitation_send_log").insert({
            invited_by: user.id,
            caller_role: callerEffectiveRole,
            club_id: clubId,
            intended_role: intendedRole,
            recipient_email_hash: recipientEmailHash,
            status: "rate_limited",
          });
        } catch (_ignore) { /* never fail the response on log insert */ }
        console.warn("Invitation rate-limited", {
          caller_id: user.id,
          masked_email: maskEmail(email),
          used: q.used,
          limit: q.limit_per_hour,
        });
        return new Response(
          JSON.stringify({
            error: "Rate limit exceeded",
            retry_after_seconds: retryAfterSec,
            quota_used: q.used,
            quota_limit: q.limit_per_hour,
          }),
          {
            status: 429,
            headers: {
              "Content-Type": "application/json",
              "Retry-After": String(retryAfterSec),
              ...corsHeaders,
            },
          },
        );
      }
    }

    // Verify teamId belongs to clubId
    if (teamId) {
      const { data: tgtTeam } = await supabaseAdmin
        .from("teams").select("club_id").eq("id", teamId).maybeSingle();
      if (!tgtTeam || tgtTeam.club_id !== clubId) {
        return new Response(JSON.stringify({ error: "Team does not belong to club" }), {
          status: 403, headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
      // Referent coach can only invite within their own teams
      if (!callerIsAdmin && !callerIsClubAdminOfTarget) {
        // deno-lint-ignore no-explicit-any
        const allowedTeamIds = (callerRefTeams ?? []).map((t: any) => (t as any).team_id ?? null);
        // Re-fetch team_id list explicitly (the join above doesn't expose it)
        const { data: refTeamIds } = await supabaseAdmin
          .from("team_members").select("team_id")
          .eq("user_id", user.id).eq("member_type", "coach")
          .eq("coach_role", "referent").eq("is_active", true).is("deleted_at", null);
        const tids = (refTeamIds?.map(r => r.team_id) ?? []) as string[];
        if (!tids.includes(teamId)) {
          return new Response(JSON.stringify({ error: "Team outside your scope" }), {
            status: 403, headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }
      }
    }

    // playerIds (supporter): every player must belong to caller's club scope
    if (intendedRole === "supporter" && playerIds && playerIds.length > 0) {
      const { data: playerTms } = await supabaseAdmin
        .from("team_members")
        .select("user_id, teams!inner(club_id)")
        .in("user_id", playerIds)
        .eq("member_type", "player").eq("is_active", true).is("deleted_at", null);
      // deno-lint-ignore no-explicit-any
      const allValid = playerIds.every((pid) => (playerTms ?? []).some((m: any) => m.user_id === pid && m.teams?.club_id === clubId));
      if (!allValid) {
        return new Response(JSON.stringify({ error: "One or more players are outside the target club" }), {
          status: 403, headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
    }

    // SECURITY: validate Origin/Referer against whitelist to prevent phishing
    // via forged headers in the generated invitation link.
    const origin = getSafeOrigin(req);

    // Check if user already exists
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = existingUsers.users.find(u => u.email === email.toLowerCase());

    let userId: string;
    let isNewUser = false;

    if (existingUser) {
      const { data: existingRole } = await supabaseAdmin
        .from("user_roles")
        .select("id")
        .eq("user_id", existingUser.id)
        .eq("role", intendedRole)
        .eq("club_id", clubId)
        .maybeSingle();

      if (existingRole) {
        throw new Error("Cet utilisateur a déjà ce rôle dans ce club");
      }

      userId = existingUser.id;
      
      await supabaseAdmin
        .from("profiles")
        .update({ club_id: clubId })
        .eq("id", userId)
        .is("club_id", null);
    } else {
      isNewUser = true;
      
      // Generate invite link for new user
      const redirectTo = `${origin}/invite/accept`;
      console.log("Generating invite link with redirectTo:", redirectTo);
      
      const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.generateLink({
        type: 'invite',
        email: email.toLowerCase(),
        options: {
          data: {
            first_name: firstName,
            last_name: lastName,
          },
          redirectTo,
        },
      });

      if (inviteError) {
        console.error("Generate link error:", inviteError);
        throw new Error(`Erreur lors de la génération du lien: ${inviteError.message}`);
      }

      userId = inviteData.user.id;

      // Build the proper invite link that redirects through Supabase auth
      // The action_link from generateLink goes through /auth/v1/verify which redirects to our app
      const inviteLink = inviteData.properties.action_link;
      // SECURITY: never log the full action_link — it contains the invitation
      // token_hash which can be used to hijack the invitation. Log only metadata.
      console.log("Invite link generated", { userId, hasLink: !!inviteLink });

      // Send invitation email via Resend
      if (!resend) {
        throw Object.assign(new Error("Configuration email manquante : RESEND_API_KEY non configurée"), {
          statusCode: 500,
          code: "EMAIL_PROVIDER_NOT_CONFIGURED",
        });
      }

      const { data: club } = await supabaseAdmin
        .from("clubs")
        .select("name")
        .eq("id", clubId)
        .single();

      const roleLabels: Record<string, string> = {
        club_admin: "Administrateur de club",
        coach: "Coach",
        player: "Joueur",
        supporter: "Supporter",
      };

      const emailResult = await resend.emails.send({
        from: getFromEmail(),
        to: [email.toLowerCase()],
        subject: `Invitation à rejoindre ${club?.name || "MATCHS360"}`,
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f4f5; margin: 0; padding: 40px 20px;">
            <div style="max-width: 480px; margin: 0 auto; background: white; border-radius: 12px; padding: 40px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
              <div style="text-align: center; margin-bottom: 32px;">
                <h1 style="color: #18181b; font-size: 24px; margin: 0;">MATCHS360</h1>
                <p style="color: #71717a; font-size: 14px; margin-top: 8px;">Sports Analytics Platform</p>
              </div>
              
              <h2 style="color: #18181b; font-size: 20px; margin-bottom: 16px;">Vous êtes invité(e) !</h2>
              
              <p style="color: #3f3f46; line-height: 1.6; margin-bottom: 24px;">
                Bonjour${firstName ? ` ${escapeHtml(firstName)}` : ""},<br><br>
                Vous avez été invité(e) à rejoindre <strong>${escapeHtml(club?.name || "MATCHS360")}</strong> 
                en tant que <strong>${escapeHtml(roleLabels[intendedRole] || intendedRole)}</strong>.
              </p>
              
              <a href="${inviteLink}" style="display: block; background-color: #2563eb; color: white; text-decoration: none; padding: 14px 24px; border-radius: 8px; text-align: center; font-weight: 600; margin-bottom: 24px;">
                Accepter l'invitation
              </a>
              
              <p style="color: #71717a; font-size: 12px; line-height: 1.6;">
                Ou copiez ce lien dans votre navigateur :<br>
                <a href="${inviteLink}" style="color: #2563eb; word-break: break-all;">${escapeHtml(inviteLink)}</a>
              </p>
              
              <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 32px 0;">
              
              <p style="color: #a1a1aa; font-size: 12px; text-align: center;">
                Si vous n'attendiez pas cette invitation, vous pouvez ignorer cet email.
              </p>
            </div>
          </body>
          </html>
        `,
      });

      if (emailResult.error) {
        console.error("Email provider error while sending invitation:", emailResult.error);
        throwEmailDeliveryError(emailResult.error as EmailProviderError);
      }

      // SECURITY: avoid logging full email (PII). Mask local part.
      const maskedEmail = email.replace(/^(.{2}).*(@.*)$/, "$1***$2");
      console.log("Invitation email sent", { recipient: maskedEmail, messageId: emailResult.data?.id });

      // Wait for trigger to create profile
      await new Promise(resolve => setTimeout(resolve, 500));

      const { data: existingProfile } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("id", userId)
        .maybeSingle();

      if (existingProfile) {
        await supabaseAdmin
          .from("profiles")
          .update({
            first_name: firstName,
            last_name: lastName,
            club_id: clubId,
          })
          .eq("id", userId);
      } else {
        await supabaseAdmin
          .from("profiles")
          .insert({
            id: userId,
            email: email.toLowerCase(),
            first_name: firstName,
            last_name: lastName,
            club_id: clubId,
          });
      }
    }

    // Add the role
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .insert({
        user_id: userId,
        role: intendedRole,
        club_id: clubId,
      });

    if (roleError) {
      console.error("Role insert error:", roleError);
      throw new Error("Erreur lors de l'attribution du rôle");
    }

    // If coach with teamId, add to team_members
    if (intendedRole === "coach" && teamId) {
      if (coachRole === "referent") {
        const { data: existingReferent } = await supabaseAdmin
          .from("team_members")
          .select("id")
          .eq("team_id", teamId)
          .eq("member_type", "coach")
          .eq("coach_role", "referent")
          .eq("is_active", true)
          .maybeSingle();

        if (existingReferent) {
          throw new Error("Cette équipe a déjà un coach référent");
        }
      }

      await supabaseAdmin
        .from("team_members")
        .insert({
          team_id: teamId,
          user_id: userId,
          member_type: "coach",
          coach_role: coachRole || "assistant",
        });
    }

    // If player, add to team_members
    if (intendedRole === "player" && teamId) {
      const { data: existingTeam } = await supabaseAdmin
        .from("team_members")
        .select("id, team:teams(name)")
        .eq("user_id", userId)
        .eq("member_type", "player")
        .eq("is_active", true)
        .maybeSingle();

      if (existingTeam) {
        throw new Error(`Ce joueur est déjà dans une équipe`);
      }

      await supabaseAdmin
        .from("team_members")
        .insert({
          team_id: teamId,
          user_id: userId,
          member_type: "player",
        });
    }

    // If supporter, create links to players
    if (intendedRole === "supporter" && playerIds && playerIds.length > 0) {
      const links = playerIds.map(playerId => ({
        supporter_id: userId,
        player_id: playerId,
      }));

      await supabaseAdmin
        .from("supporters_link")
        .insert(links);
    }

    // Record the invitation
    await supabaseAdmin
      .from("invitations")
      .insert({
        email: email.toLowerCase(),
        invited_by: user.id,
        club_id: clubId,
        intended_role: intendedRole,
        team_id: teamId,
        coach_role: coachRole,
        status: existingUser ? "accepted" : "pending",
        accepted_at: existingUser ? new Date().toISOString() : null,
      });

    // For existing users, send a notification email
    let notificationEmailSent = false;
    let notificationEmailError: string | null = null;

    if (!isNewUser && resend) {
      const { data: club } = await supabaseAdmin
        .from("clubs")
        .select("name")
        .eq("id", clubId)
        .single();

      const roleLabels: Record<string, string> = {
        club_admin: "Administrateur de club",
        coach: "Coach",
        player: "Joueur",
        supporter: "Supporter",
      };

      const notificationResult = await resend.emails.send({
        from: getFromEmail(),
        to: [email.toLowerCase()],
        subject: `Nouveau rôle ajouté - ${club?.name || "MATCHS360"}`,
        html: `
          <!DOCTYPE html>
          <html>
          <head><meta charset="utf-8"></head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f4f4f5; margin: 0; padding: 40px 20px;">
            <div style="max-width: 480px; margin: 0 auto; background: white; border-radius: 12px; padding: 40px;">
              <h1 style="color: #18181b; font-size: 24px; text-align: center;">MATCHS360</h1>
              <h2 style="color: #18181b; font-size: 18px;">Nouveau rôle attribué</h2>
              <p style="color: #3f3f46; line-height: 1.6;">
                Vous avez été ajouté(e) à <strong>${escapeHtml(club?.name || "MATCHS360")}</strong> 
                en tant que <strong>${escapeHtml(roleLabels[intendedRole] || intendedRole)}</strong>.
              </p>
              <a href="${origin}/dashboard" style="display: inline-block; background-color: #2563eb; color: white; text-decoration: none; padding: 12px 24px; border-radius: 8px; margin-top: 16px;">
                Accéder à mon espace
              </a>
            </div>
          </body>
          </html>
        `,
      });

      if (notificationResult.error) {
        notificationEmailError = notificationResult.error.message || "Erreur inconnue lors de l'envoi de la notification";
        console.error("Failed to send notification email:", notificationResult.error);
      } else {
        notificationEmailSent = true;
      }
    }

    if (!isNewUser && !resend) {
      notificationEmailError = "Configuration email manquante : RESEND_API_KEY non configurée";
      console.warn(notificationEmailError);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: isNewUser 
          ? "Invitation envoyée avec succès"
          : "Rôle ajouté avec succès",
        userId,
        emailSent: !!resend,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in send-invitation function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

Deno.serve(handler);
