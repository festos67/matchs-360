import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface InvitationRequest {
  email: string;
  firstName?: string;
  lastName?: string;
  clubId: string;
  intendedRole: "club_admin" | "coach" | "player" | "supporter";
  teamId?: string;
  coachRole?: "referent" | "assistant";
  playerIds?: string[]; // For supporters
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Get the authenticated user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header");
    }

    const supabaseClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      throw new Error("Unauthorized");
    }

    const body: InvitationRequest = await req.json();
    const { email, firstName, lastName, clubId, intendedRole, teamId, coachRole, playerIds } = body;

    // Validate email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      throw new Error("Invalid email address");
    }

    // Check if user already exists
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = existingUsers.users.find(u => u.email === email.toLowerCase());

    let userId: string;

    if (existingUser) {
      // User exists - check if already has this role in this club
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
      
      // Update profile with club_id if not set
      await supabaseAdmin
        .from("profiles")
        .update({ club_id: clubId })
        .eq("id", userId)
        .is("club_id", null);
    } else {
      // Create new user with invitation
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        data: {
          first_name: firstName,
          last_name: lastName,
        },
        redirectTo: `${req.headers.get("origin")}/auth`,
      });

      if (createError) {
        throw new Error(`Erreur lors de l'invitation: ${createError.message}`);
      }

      userId = newUser.user.id;

      // Wait a moment for the trigger to create the profile
      await new Promise(resolve => setTimeout(resolve, 500));

      // Update profile with additional info
      await supabaseAdmin
        .from("profiles")
        .update({
          first_name: firstName,
          last_name: lastName,
          club_id: clubId,
        })
        .eq("id", userId);
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

    // If coach, add to team_members
    if (intendedRole === "coach" && teamId) {
      // Check if already a referent coach exists
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
      // Check if player is already in another team
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

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: existingUser 
          ? "Rôle ajouté avec succès"
          : "Invitation envoyée avec succès",
        userId,
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

serve(handler);