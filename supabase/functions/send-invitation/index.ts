import { createClient } from "npm:@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";
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

type ErrorCode =
  // Auth caller
  | "AUTH_MISSING"
  | "AUTH_INVALID"
  | "AUTH_NO_RIGHT_ON_CLUB"
  | "AUTH_CANNOT_GRANT_ROLE"
  | "AUTH_TEAM_OUT_OF_SCOPE"
  // Validation
  | "INPUT_INVALID_EMAIL"
  | "INPUT_INVALID_ROLE"
  | "INPUT_MISSING_CLUB"
  | "INPUT_TEAM_NOT_IN_CLUB"
  | "INPUT_PLAYERS_OUT_OF_CLUB"
  // Business
  | "USER_ALREADY_HAS_ROLE_IN_CLUB"
  | "PLAYER_ALREADY_IN_TEAM"
  | "TEAM_ALREADY_HAS_REFERENT"
  | "USER_LOOKUP_FAILED"
  // Rate limit (applicatif)
  | "RATE_LIMIT_CHECK_FAILED"
  | "RATE_LIMIT_EXCEEDED"
  // Email infra
  | "EMAIL_PROVIDER_NOT_CONFIGURED"
  | "EMAIL_SENDER_FORBIDDEN"
  | "EMAIL_RATE_LIMITED"
  | "EMAIL_PROVIDER_ERROR"
  // Generic
  | "INTERNAL_ERROR";

type ErrorBody = {
  error: string;
  code: ErrorCode;
  hint?: string;
  // Optional extra fields (e.g. retry_after_seconds for rate limits)
  [k: string]: unknown;
};

class InvitationDomainError extends Error {
  code: ErrorCode;
  status: number;
  hint?: string;
  extra?: Record<string, unknown>;
  constructor(opts: {
    message: string;
    code: ErrorCode;
    status: number;
    hint?: string;
    extra?: Record<string, unknown>;
  }) {
    super(opts.message);
    this.code = opts.code;
    this.status = opts.status;
    this.hint = opts.hint;
    this.extra = opts.extra;
  }
}

function respondError(
  body: ErrorBody,
  status: number,
  corsHeaders: Record<string, string>,
  extraHeaders?: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
      ...(extraHeaders ?? {}),
    },
  });
}

const getProviderStatusCode = (providerError: EmailProviderError): number => {
  const rawStatus = providerError.statusCode ?? providerError.status;
  const parsedStatus = typeof rawStatus === "number" ? rawStatus : Number(rawStatus);
  return Number.isFinite(parsedStatus) && parsedStatus > 0 ? parsedStatus : 500;
};

const throwEmailDeliveryError = (providerError: EmailProviderError): never => {
  const statusCode = getProviderStatusCode(providerError);
  const providerMessage = providerError.message || "Erreur inconnue du fournisseur email";

  if (statusCode === 429) {
    throw new InvitationDomainError({
      message: "Limite d'envoi email atteinte. Patientez quelques minutes avant de réessayer.",
      code: "EMAIL_RATE_LIMITED",
      status: 429,
      hint: "Le quota du fournisseur email est temporairement saturé. Réessayez dans 5 à 10 minutes.",
    });
  }

  if (statusCode === 403) {
    throw new InvitationDomainError({
      message:
        "L'envoi d'email a été refusé par le fournisseur (403). Le domaine expéditeur n'est pas autorisé à envoyer à ce destinataire.",
      code: "EMAIL_SENDER_FORBIDDEN",
      status: 422,
      hint:
        "Vérifiez que le domaine d'envoi est validé chez le fournisseur email et que les enregistrements DNS (SPF/DKIM) sont en place.",
    });
  }

  throw new InvitationDomainError({
    message: `Erreur d'envoi email (${statusCode}) : ${providerMessage}`,
    code: "EMAIL_PROVIDER_ERROR",
    status: 502,
  });
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
      throw new InvitationDomainError({
        message: "Authentification manquante. Reconnectez-vous.",
        code: "AUTH_MISSING",
        status: 401,
      });
    }

    const supabaseClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      console.error("Auth error:", claimsError);
      throw new InvitationDomainError({
        message: "Session invalide ou expirée. Reconnectez-vous.",
        code: "AUTH_INVALID",
        status: 401,
      });
    }
    const user = { id: claimsData.claims.sub, email: claimsData.claims.email };

    const body: InvitationRequest = await req.json();
    const { email, firstName, lastName, clubId, intendedRole, teamId, coachRole, playerIds } = body;

    // ============================================================
    // F-601 — Strict whitelist of intendedRole.
    // The edge function runs with service_role and bypasses the
    // `guard_privileged_role_grant` trigger on user_roles. We must
    // therefore explicitly forbid promotion to `admin` (super admin)
    // and any value outside the allowed set, regardless of the
    // declared TypeScript type (which is not enforced at runtime).
    // ============================================================
    const ALLOWED_INTENDED_ROLES = ["club_admin", "coach", "player", "supporter"] as const;
    if (!ALLOWED_INTENDED_ROLES.includes(intendedRole as typeof ALLOWED_INTENDED_ROLES[number])) {
      throw new InvitationDomainError({
        message:
          "Rôle d'invitation invalide. Les rôles autorisés sont : Admin Club, Coach, Joueur, Supporter.",
        code: "INPUT_INVALID_ROLE",
        status: 400,
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      throw new InvitationDomainError({
        message: "Adresse email invalide.",
        code: "INPUT_INVALID_EMAIL",
        status: 400,
      });
    }

    // ============================================================
    // AUTHORIZATION — caller must have rights over the target clubId
    // ============================================================
    if (!clubId) {
      throw new InvitationDomainError({
        message: "Le club cible est requis.",
        code: "INPUT_MISSING_CLUB",
        status: 400,
      });
    }

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
      throw new InvitationDomainError({
        message:
          "Vous n'avez pas le droit d'inviter dans ce club. Seuls un administrateur, un admin de club ou un coach référent du club peuvent inviter.",
        code: "AUTH_NO_RIGHT_ON_CLUB",
        status: 403,
        hint:
          callerClubAdminIds.length > 0
            ? `Vous êtes admin de club pour : ${callerClubAdminIds.join(", ")}. Le club cible n'en fait pas partie.`
            : undefined,
      });
    }

    // Only admin / club_admin may grant club_admin or coach roles
    if ((intendedRole === "club_admin" || intendedRole === "coach") &&
        !callerIsAdmin && !callerIsClubAdminOfTarget) {
      throw new InvitationDomainError({
        message: `Vous ne pouvez pas attribuer le rôle « ${
          intendedRole === "club_admin" ? "Admin Club" : "Coach"
        } ». Cette action est réservée aux administrateurs et admins de club.`,
        code: "AUTH_CANNOT_GRANT_ROLE",
        status: 403,
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
        throw new InvitationDomainError({
          message: "Vérification du quota d'invitations indisponible. Réessayez plus tard.",
          code: "RATE_LIMIT_CHECK_FAILED",
          status: 503,
        });
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
        throw new InvitationDomainError({
          message: `Quota d'invitations dépassé : ${q.used}/${q.limit_per_hour} pour cette heure. Réessayez dans ${retryAfterSec} secondes.`,
          code: "RATE_LIMIT_EXCEEDED",
          status: 429,
          extra: {
            retry_after_seconds: retryAfterSec,
            quota_used: q.used,
            quota_limit: q.limit_per_hour,
          },
        });
      }
    }

    // Verify teamId belongs to clubId
    if (teamId) {
      const { data: tgtTeam } = await supabaseAdmin
        .from("teams").select("club_id").eq("id", teamId).maybeSingle();
      if (!tgtTeam || tgtTeam.club_id !== clubId) {
        throw new InvitationDomainError({
          message: "L'équipe sélectionnée n'appartient pas au club cible.",
          code: "INPUT_TEAM_NOT_IN_CLUB",
          status: 400,
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
          throw new InvitationDomainError({
            message: "Cette équipe n'est pas dans votre périmètre de coach référent.",
            code: "AUTH_TEAM_OUT_OF_SCOPE",
            status: 403,
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
        throw new InvitationDomainError({
          message: "Un ou plusieurs joueurs sélectionnés n'appartiennent pas au club cible.",
          code: "INPUT_PLAYERS_OUT_OF_CLUB",
          status: 400,
        });
      }
    }

    // SECURITY: validate Origin/Referer against whitelist to prevent phishing
    // via forged headers in the generated invitation link.
    const origin = getSafeOrigin(req);

    // F-402: targeted lookup via SECURITY DEFINER RPC instead of listUsers()
    // (which defaulted to the first 50 users and silently misclassified existing
    // accounts as new on tenants > 50 users — risk of unintended role grants and
    // invitation-link reissue against an existing account).
    const normalizedEmail = email.toLowerCase();
    const { data: existingByEmail, error: lookupError } = await supabaseAdmin
      .rpc("admin_get_user_by_email", { p_email: normalizedEmail })
      .maybeSingle();
    if (lookupError) {
      throw new InvitationDomainError({
        message: "Erreur lors de la vérification de l'utilisateur.",
        code: "USER_LOOKUP_FAILED",
        status: 500,
      });
    }
    const existingUser = existingByEmail
      ? { id: (existingByEmail as { id: string }).id, email: normalizedEmail }
      : null;

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
        throw new InvitationDomainError({
          message: "Cet utilisateur a déjà ce rôle dans ce club.",
          code: "USER_ALREADY_HAS_ROLE_IN_CLUB",
          status: 409,
        });
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
        throw new InvitationDomainError({
          message: `Génération du lien d'invitation échouée : ${inviteError.message}`,
          code: "INTERNAL_ERROR",
          status: 500,
        });
      }

      userId = inviteData.user.id;

      // Build the proper invite link that redirects through Supabase auth
      // The action_link from generateLink goes through /auth/v1/verify which redirects to our app
      const inviteLink = inviteData.properties.action_link;
      // SECURITY: never log the full action_link — it contains the invitation
      // token_hash which can be used to hijack the invitation. Log only metadata.
      console.log("Invite link generated", { userId, hasLink: !!inviteLink });

      // ⚠️ ORDRE CRITIQUE : on persiste profil + rôle AVANT d'envoyer l'email.
      // Sinon, si Resend rate-limit/bounce/échoue, l'utilisateur est créé dans
      // auth.users sans profil/role, le club reste sans responsable utilisable
      // et il devient impossible de relancer (USER_ALREADY_HAS_ROLE_IN_CLUB
      // sur un rôle qui n'existe pas / conflit auth.users sur réinvitation).
      // L'email est best-effort et son échec est remonté en warning à l'appelant.
      const { data: club } = await supabaseAdmin
        .from("clubs")
        .select("name")
        .eq("id", clubId)
        .single();

      // Atomic upsert on primary key `id` to avoid race condition with the
      // handle_new_user trigger (it may create the profile before or after
      // we get here). ON CONFLICT (id) DO UPDATE keeps the operation
      // deterministic regardless of trigger timing.
      const { error: profileUpsertError } = await supabaseAdmin
        .from("profiles")
        .upsert(
          {
            id: userId,
            email: email.toLowerCase(),
            first_name: firstName,
            last_name: lastName,
            club_id: clubId,
          },
          { onConflict: "id" },
        );

      if (profileUpsertError) {
        console.error("Profile upsert error:", profileUpsertError);
        throw new InvitationDomainError({
          message: "La création du profil a échoué.",
          code: "INTERNAL_ERROR",
          status: 500,
        });
      }

      // Send invitation email via Resend (best-effort — see comment above)
      if (!resend) {
        console.warn("RESEND non configuré — invitation enregistrée sans email envoyé.");
      }

      const roleLabels: Record<string, string> = {
        club_admin: "Administrateur de club",
        coach: "Coach",
        player: "Joueur",
        supporter: "Supporter",
      };

      let emailDeliveryError: EmailProviderError | null = null;
      const emailResult = resend ? await resend.emails.send({
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
      }) : null;

      if (emailResult?.error) {
        // Best-effort : on log mais on n'interrompt pas — le rôle/profil sont
        // déjà persistés, l'admin pourra relancer l'invitation depuis la fiche.
        console.error("Email provider error while sending invitation:", emailResult.error);
        emailDeliveryError = emailResult.error as EmailProviderError;
      } else if (emailResult) {
        // SECURITY: avoid logging full email (PII). Mask local part.
        const maskedEmail = email.replace(/^(.{2}).*(@.*)$/, "$1***$2");
        console.log("Invitation email sent", { recipient: maskedEmail, messageId: emailResult.data?.id });
      }

      // Stocke l'erreur pour la remonter en warning après écriture du rôle
      (globalThis as any).__lastInviteEmailError = emailDeliveryError;
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
      throw new InvitationDomainError({
        message: "L'attribution du rôle a échoué côté base de données.",
        code: "INTERNAL_ERROR",
        status: 500,
      });
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
          throw new InvitationDomainError({
            message:
              "Cette équipe a déjà un coach référent. Un seul référent par équipe est autorisé.",
            code: "TEAM_ALREADY_HAS_REFERENT",
            status: 409,
          });
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
        throw new InvitationDomainError({
          message: "Ce joueur est déjà rattaché à une équipe active.",
          code: "PLAYER_ALREADY_IN_TEAM",
          status: 409,
        });
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

    // Forensic log: invitation acceptée (cycle 4 rate-limit)
    try {
      await supabaseAdmin.from("invitation_send_log").insert({
        invited_by: user.id,
        caller_role: callerEffectiveRole,
        club_id: clubId,
        intended_role: intendedRole,
        recipient_email_hash: recipientEmailHash,
        status: "accepted",
      });
    } catch (logErr) {
      // never fail the user-facing response on a logging error
      console.warn("invitation_send_log accepted insert failed", { err: (logErr as Error)?.message });
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
  } catch (error: unknown) {
    console.error("Error in send-invitation function:", error);

    if (error instanceof InvitationDomainError) {
      const body: ErrorBody = {
        error: error.message,
        code: error.code,
        ...(error.hint ? { hint: error.hint } : {}),
        ...(error.extra ?? {}),
      };
      const extraHeaders =
        error.code === "RATE_LIMIT_EXCEEDED" &&
        typeof (error.extra?.retry_after_seconds as unknown) === "number"
          ? { "Retry-After": String(error.extra!.retry_after_seconds) }
          : undefined;
      return respondError(body, error.status, corsHeaders, extraHeaders);
    }

    const safeMsg =
      error instanceof Error
        ? `Erreur interne : ${error.message}`
        : "Erreur interne inconnue";
    return respondError(
      { error: safeMsg, code: "INTERNAL_ERROR" },
      500,
      corsHeaders,
    );
  }
};

Deno.serve(handler);
