import { createClient } from "npm:@supabase/supabase-js@2";
import { Resend } from "npm:resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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

    // Use the origin from the request, falling back to referer
    const origin = req.headers.get("origin") || 
                   (req.headers.get("referer") ? new URL(req.headers.get("referer")!).origin : null);
    
    if (!origin) {
      throw new Error("Could not determine application origin");
    }

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
      console.log("Generated invite link (action_link):", inviteLink);

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
        from: "MATCHS360 <noreply@notify.match360.com>",
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
                Bonjour${firstName ? ` ${firstName}` : ""},<br><br>
                Vous avez été invité(e) à rejoindre <strong>${club?.name || "MATCHS360"}</strong> 
                en tant que <strong>${roleLabels[intendedRole] || intendedRole}</strong>.
              </p>
              
              <a href="${inviteLink}" style="display: block; background-color: #2563eb; color: white; text-decoration: none; padding: 14px 24px; border-radius: 8px; text-align: center; font-weight: 600; margin-bottom: 24px;">
                Accepter l'invitation
              </a>
              
              <p style="color: #71717a; font-size: 12px; line-height: 1.6;">
                Ou copiez ce lien dans votre navigateur :<br>
                <a href="${inviteLink}" style="color: #2563eb; word-break: break-all;">${inviteLink}</a>
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

      console.log("Invitation email sent successfully to:", email, "messageId:", emailResult.data?.id);

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
        from: "MATCHS360 <noreply@notify.match360.com>",
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
                Vous avez été ajouté(e) à <strong>${club?.name || "MATCHS360"}</strong> 
                en tant que <strong>${roleLabels[intendedRole] || intendedRole}</strong>.
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
