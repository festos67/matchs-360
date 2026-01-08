import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Client for auth verification (uses user's token)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Admin client (bypasses RLS)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Check if user is admin
    const { data: adminRole } = await supabaseAdmin
      .from("user_roles")
      .select("id")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (!adminRole) {
      return new Response(JSON.stringify({ error: "Forbidden: Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = new URL(req.url);
    const path = url.pathname.split("/").pop();

    // GET - List all users
    if (req.method === "GET") {
      // Get all users from auth.users
      const { data: authUsers, error: usersError } = await supabaseAdmin.auth.admin.listUsers();
      if (usersError) throw usersError;

      // Get all profiles
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("*");

      // Get all user roles with club info
      const { data: userRoles } = await supabaseAdmin
        .from("user_roles")
        .select("*, clubs(name)");

      // Get all team memberships with team/club info
      const { data: teamMembers } = await supabaseAdmin
        .from("team_members")
        .select("*, teams(id, name, club_id, clubs(name))");

      // Get supporter links
      const { data: supporterLinks } = await supabaseAdmin
        .from("supporters_link")
        .select("*, player:profiles!supporters_link_player_id_fkey(id, first_name, last_name, nickname)");

      // Combine data
      const combinedUsers = authUsers.users.map((authUser) => {
        const profile = profiles?.find((p) => p.id === authUser.id);
        const roles = userRoles?.filter((r) => r.user_id === authUser.id) || [];
        const memberships = teamMembers?.filter((m) => m.user_id === authUser.id) || [];
        const supporterLinksList = supporterLinks?.filter((s) => s.supporter_id === authUser.id) || [];

        // Determine status
        let status = "Actif";
        if (profile?.deleted_at) {
          status = "Suspendu";
        } else if (!authUser.email_confirmed_at) {
          status = "Invité";
        }

        return {
          id: authUser.id,
          email: authUser.email,
          first_name: profile?.first_name,
          last_name: profile?.last_name,
          nickname: profile?.nickname,
          photo_url: profile?.photo_url,
          club_id: profile?.club_id,
          created_at: authUser.created_at,
          email_confirmed_at: authUser.email_confirmed_at,
          deleted_at: profile?.deleted_at,
          status,
          roles: roles.map((r) => ({
            id: r.id,
            role: r.role,
            club_id: r.club_id,
            club_name: r.clubs?.name,
          })),
          team_memberships: memberships.map((m) => ({
            id: m.id,
            team_id: m.team_id,
            team_name: m.teams?.name,
            club_name: m.teams?.clubs?.name,
            member_type: m.member_type,
            coach_role: m.coach_role,
            is_active: m.is_active,
          })),
          supporter_links: supporterLinksList.map((s) => ({
            id: s.id,
            player_id: s.player_id,
            player_name: s.player?.nickname || `${s.player?.first_name || ""} ${s.player?.last_name || ""}`.trim(),
          })),
        };
      });

      return new Response(JSON.stringify({ users: combinedUsers }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // POST - Handle various actions
    if (req.method === "POST") {
      const body = await req.json();
      const action = body.action;

      // Force validate email
      if (action === "force-validate") {
        const { userId } = body;
        if (!userId) {
          return new Response(JSON.stringify({ error: "userId required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
          email_confirm: true,
        });

        if (error) throw error;

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Add role
      if (action === "add-role") {
        const { userId, role, clubId, teamId, playerId, coachRole } = body;

        // Insert into user_roles
        const { error: roleError } = await supabaseAdmin
          .from("user_roles")
          .upsert({ user_id: userId, role, club_id: clubId }, { onConflict: "user_id,role" });

        if (roleError) throw roleError;

        // If coach or player, also add to team_members
        if ((role === "coach" || role === "player") && teamId) {
          const memberData: Record<string, unknown> = {
            user_id: userId,
            team_id: teamId,
            member_type: role,
            is_active: true,
          };
          if (role === "coach" && coachRole) {
            memberData.coach_role = coachRole;
          }

          const { error: memberError } = await supabaseAdmin
            .from("team_members")
            .upsert(memberData, { onConflict: "user_id,team_id" });

          if (memberError) throw memberError;
        }

        // If supporter, add to supporters_link
        if (role === "supporter" && playerId) {
          const { error: supporterError } = await supabaseAdmin
            .from("supporters_link")
            .upsert({ supporter_id: userId, player_id: playerId }, { onConflict: "supporter_id,player_id" });

          if (supporterError) throw supporterError;
        }

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Remove role
      if (action === "remove-role") {
        const { roleId, teamMembershipId, supporterLinkId } = body;

        if (roleId) {
          await supabaseAdmin.from("user_roles").delete().eq("id", roleId);
        }
        if (teamMembershipId) {
          await supabaseAdmin.from("team_members").update({ is_active: false, left_at: new Date().toISOString() }).eq("id", teamMembershipId);
        }
        if (supporterLinkId) {
          await supabaseAdmin.from("supporters_link").delete().eq("id", supporterLinkId);
        }

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Update profile
      if (action === "update-profile") {
        const { userId, firstName, lastName, nickname } = body;

        const { error } = await supabaseAdmin
          .from("profiles")
          .update({
            first_name: firstName,
            last_name: lastName,
            nickname,
            updated_at: new Date().toISOString(),
          })
          .eq("id", userId);

        if (error) throw error;

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Soft delete
      if (action === "soft-delete") {
        const { userId } = body;

        // Mark profile as deleted
        await supabaseAdmin
          .from("profiles")
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", userId);

        // Deactivate all team memberships
        await supabaseAdmin
          .from("team_members")
          .update({ is_active: false, left_at: new Date().toISOString() })
          .eq("user_id", userId);

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Restore user
      if (action === "restore") {
        const { userId } = body;

        await supabaseAdmin
          .from("profiles")
          .update({ deleted_at: null })
          .eq("id", userId);

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ error: "Unknown action" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
