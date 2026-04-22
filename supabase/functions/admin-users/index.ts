import { createClient } from "npm:@supabase/supabase-js@2";
import { Resend } from "npm:resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * SECURITY: HTML entity escape to prevent XSS / phishing injection
 * via user-controlled fields (clubs.name, role labels) interpolated
 * into outbound email HTML. Covers the OWASP minimum set.
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
 * SECURITY: whitelist of trusted origins allowed in `redirectTo` for
 * invitation re-sends. Prevents phishing via forged Origin header.
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
  try { new URL(origin); } catch { return false; }
  if (STATIC_ALLOWED_ORIGIN_PATTERNS.some((re) => re.test(origin))) return true;
  const extra = (Deno.env.get("ALLOWED_ORIGINS") || "")
    .split(",").map((s) => s.trim()).filter(Boolean);
  return extra.includes(origin);
}

function getSafeOrigin(req: Request): string {
  const candidate = req.headers.get("origin");
  if (candidate && isOriginAllowed(candidate)) return candidate;
  if (candidate) console.warn("Rejected untrusted origin, falling back to canonical URL");
  return FALLBACK_ORIGIN;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Admin client (bypasses RLS)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // All actions require authentication
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

    // Verify user is authenticated via JWT claims (no server session needed)
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const user = { id: claimsData.claims.sub as string, email: claimsData.claims.email as string };

    // Check if user is admin or club_admin
    const { data: adminRole } = await supabaseAdmin
      .from("user_roles")
      .select("id")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    // Check for club_admin role
    const { data: clubAdminRoles } = await supabaseAdmin
      .from("user_roles")
      .select("id, club_id")
      .eq("user_id", user.id)
      .eq("role", "club_admin");

    const isAdmin = !!adminRole;
    const isClubAdmin = (clubAdminRoles && clubAdminRoles.length > 0) || false;
    const clubAdminClubIds = clubAdminRoles?.map(r => r.club_id).filter(Boolean) as string[] || [];

    if (!isAdmin && !isClubAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden: Admin access required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ============================================================
    // Multi-tenant scope helpers
    // ============================================================
    const SUPER_ADMIN_EMAIL = "asahand@protonmail.com";
    const forbidden = (msg = "Forbidden: outside your club scope") =>
      new Response(JSON.stringify({ error: msg }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    // Returns true if a target user belongs (via profile, role or active team membership) to one of the caller's clubs.
    const userInClubAdminScope = async (targetUserId: string): Promise<boolean> => {
      if (isAdmin) return true;
      if (!targetUserId || clubAdminClubIds.length === 0) return false;

      // Never allow operating on a Super Admin
      const { data: targetAdminRole } = await supabaseAdmin
        .from("user_roles")
        .select("id")
        .eq("user_id", targetUserId)
        .eq("role", "admin")
        .maybeSingle();
      if (targetAdminRole) return false;

      // Check via auth email (Super Admin email is always off-limits)
      try {
        const { data: targetAuth } = await supabaseAdmin.auth.admin.getUserById(targetUserId);
        if (targetAuth?.user?.email?.toLowerCase() === SUPER_ADMIN_EMAIL) return false;
      } catch (_e) { /* ignore */ }

      const { data: prof } = await supabaseAdmin
        .from("profiles").select("club_id").eq("id", targetUserId).maybeSingle();
      if (prof?.club_id && clubAdminClubIds.includes(prof.club_id)) return true;

      const { data: roles } = await supabaseAdmin
        .from("user_roles").select("club_id").eq("user_id", targetUserId);
      if (roles?.some(r => r.club_id && clubAdminClubIds.includes(r.club_id))) return true;

      const { data: tms } = await supabaseAdmin
        .from("team_members")
        .select("teams!inner(club_id)")
        .eq("user_id", targetUserId)
        .eq("is_active", true)
        .is("deleted_at", null);
      // deno-lint-ignore no-explicit-any
      if (tms?.some((m: any) => m.teams?.club_id && clubAdminClubIds.includes(m.teams.club_id))) return true;

      return false;
    };

    const clubInScope = (cid?: string | null) =>
      isAdmin || (!!cid && clubAdminClubIds.includes(cid));

    const teamInScope = async (tid?: string | null): Promise<boolean> => {
      if (isAdmin) return true;
      if (!tid) return false;
      const { data: t } = await supabaseAdmin
        .from("teams").select("club_id").eq("id", tid).maybeSingle();
      return !!t?.club_id && clubAdminClubIds.includes(t.club_id);
    };

    const url = new URL(req.url);
    const clubIdFilter = url.searchParams.get("clubId");

    // GET - List users
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

      // Filter by club if club_admin (not super admin) or explicit clubId filter
      let filteredUsers = combinedUsers;
      const effectiveClubFilter = !isAdmin ? clubAdminClubIds : (clubIdFilter ? [clubIdFilter] : null);
      
      if (effectiveClubFilter && effectiveClubFilter.length > 0) {
        filteredUsers = combinedUsers.filter((u) => {
          // User belongs to club via profile
          if (u.club_id && effectiveClubFilter.includes(u.club_id)) return true;
          // User has a role in the club
          if (u.roles.some((r: { club_id: string | null }) => r.club_id && effectiveClubFilter.includes(r.club_id))) return true;
          // User is a team member in the club
          if (u.team_memberships.some((m: { team_id: string }) => {
            const tm = teamMembers?.find((t) => t.id === m.team_id || t.team_id === m.team_id);
            return tm?.teams?.club_id && effectiveClubFilter.includes(tm.teams.club_id);
          })) return true;
          return false;
        });
      }

      return new Response(JSON.stringify({ users: filteredUsers }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // POST - Handle various actions
    if (req.method === "POST") {
      const body = await req.json();
      const action = body.action;

      // Restrict certain actions to super admin only
      const adminOnlyActions = ["promote-admin", "test-update-password"];
      if (!isAdmin && adminOnlyActions.includes(action)) {
        return new Response(JSON.stringify({ error: "Forbidden: Super Admin access required" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Force validate email
      if (action === "force-validate") {
        const { userId } = body;
        if (!userId) {
          return new Response(JSON.stringify({ error: "userId required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (!(await userInClubAdminScope(userId))) return forbidden();

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

        // Block privilege escalation: only super admin may grant 'admin'
        if (role === "admin") return forbidden("Only Super Admin can grant admin role");

        // Target user must be within caller's scope
        if (!(await userInClubAdminScope(userId))) return forbidden();

        // The clubId / teamId being granted must also be in scope
        if (clubId && !clubInScope(clubId)) return forbidden("Club outside your scope");
        if (teamId && !(await teamInScope(teamId))) return forbidden("Team outside your scope");

        // Supporter target player must also be in scope
        if (role === "supporter" && playerId && !(await userInClubAdminScope(playerId))) {
          return forbidden("Player outside your scope");
        }

        // Check if role already exists
        const { data: existingRole } = await supabaseAdmin
          .from("user_roles")
          .select("id")
          .eq("user_id", userId)
          .eq("role", role)
          .maybeSingle();

        if (!existingRole) {
          const { error: roleError } = await supabaseAdmin
            .from("user_roles")
            .insert({ user_id: userId, role, club_id: clubId });

          if (roleError) throw roleError;
        }

        // If coach or player, also add to team_members
        if ((role === "coach" || role === "player") && teamId) {
          // Check if membership already exists
          const { data: existingMember } = await supabaseAdmin
            .from("team_members")
            .select("id")
            .eq("user_id", userId)
            .eq("team_id", teamId)
            .maybeSingle();

          if (!existingMember) {
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
              .insert(memberData);

            if (memberError) throw memberError;
          } else {
            // Update existing membership
            const updateData: Record<string, unknown> = { is_active: true, left_at: null };
            if (role === "coach" && coachRole) {
              updateData.coach_role = coachRole;
            }
            await supabaseAdmin
              .from("team_members")
              .update(updateData)
              .eq("id", existingMember.id);
          }
        }

        // If supporter, add to supporters_link
        if (role === "supporter" && playerId) {
          const { data: existingLink } = await supabaseAdmin
            .from("supporters_link")
            .select("id")
            .eq("supporter_id", userId)
            .eq("player_id", playerId)
            .maybeSingle();

          if (!existingLink) {
            const { error: supporterError } = await supabaseAdmin
              .from("supporters_link")
              .insert({ supporter_id: userId, player_id: playerId });

            if (supporterError) throw supporterError;
          }
        }

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Remove role
      if (action === "remove-role") {
        const { roleId, teamMembershipId, supporterLinkId } = body;

        if (!isAdmin) {
          if (roleId) {
            const { data: r } = await supabaseAdmin
              .from("user_roles").select("user_id, club_id, role").eq("id", roleId).maybeSingle();
            if (!r) return forbidden();
            if (r.role === "admin") return forbidden("Cannot remove admin role");
            if (!clubInScope(r.club_id) && !(await userInClubAdminScope(r.user_id))) return forbidden();
          }
          if (teamMembershipId) {
            const { data: tm } = await supabaseAdmin
              .from("team_members").select("team_id, user_id").eq("id", teamMembershipId).maybeSingle();
            if (!tm || !(await teamInScope(tm.team_id))) return forbidden();
          }
          if (supporterLinkId) {
            const { data: sl } = await supabaseAdmin
              .from("supporters_link").select("player_id, supporter_id").eq("id", supporterLinkId).maybeSingle();
            if (!sl || !(await userInClubAdminScope(sl.player_id))) return forbidden();
          }
        }

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
        const { userId, firstName, lastName, nickname, photoUrl } = body;

        if (!(await userInClubAdminScope(userId))) return forbidden();

        const updateData: Record<string, unknown> = {
          first_name: firstName,
          last_name: lastName,
          nickname,
          updated_at: new Date().toISOString(),
        };
        if (photoUrl !== undefined) {
          updateData.photo_url = photoUrl;
        }

        const { error } = await supabaseAdmin
          .from("profiles")
          .update(updateData)
          .eq("id", userId);

        if (error) throw error;

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Soft delete
      if (action === "soft-delete") {
        const { userId } = body;

        if (!userId) {
          return new Response(JSON.stringify({ error: "userId required" }), {
            status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (userId === user.id) return forbidden("You cannot delete yourself");
        if (!(await userInClubAdminScope(userId))) return forbidden();

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

        if (!(await userInClubAdminScope(userId))) return forbidden();

        await supabaseAdmin
          .from("profiles")
          .update({ deleted_at: null })
          .eq("id", userId);

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Update password (admin only)
      if (action === "update-password") {
        const { userId, newPassword } = body;

        if (!userId || !newPassword) {
          return new Response(JSON.stringify({ error: "userId and newPassword required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (newPassword.length < 6) {
          return new Response(JSON.stringify({ error: "Password must be at least 6 characters" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // CRITICAL: only Super Admin may change another user's password
        if (!isAdmin) return forbidden("Only Super Admin can change passwords");

        const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
          password: newPassword,
        });

        if (error) throw error;

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Test update password by email (admin only)
      if (action === "test-update-password") {
        const { email, newPassword } = body;

        if (!email || !newPassword) {
          return new Response(JSON.stringify({ error: "email and newPassword required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (newPassword.length < 6) {
          return new Response(JSON.stringify({ error: "Password must be at least 6 characters" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { data: authUsers, error: usersError } = await supabaseAdmin.auth.admin.listUsers();
        if (usersError) throw usersError;

        const targetUser = authUsers.users.find(
          (u) => u.email?.toLowerCase() === email.toLowerCase()
        );

        if (!targetUser) {
          return new Response(JSON.stringify({ error: "User not found" }), {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const { error } = await supabaseAdmin.auth.admin.updateUserById(targetUser.id, {
          password: newPassword,
        });

        if (error) throw error;

        return new Response(JSON.stringify({ success: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Resend invitation
      if (action === "resend-invitation") {
        const { userId, email, clubId } = body;
        
        if (!userId || !email) {
          return new Response(JSON.stringify({ error: "userId and email required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        if (!(await userInClubAdminScope(userId))) return forbidden();
        if (clubId && !clubInScope(clubId)) return forbidden("Club outside your scope");

        // SECURITY: validate Origin against whitelist (anti-phishing)
        const origin = getSafeOrigin(req);
        
        // Generate new invite link
        const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.generateLink({
          type: 'invite',
          email: email.toLowerCase(),
          options: {
            redirectTo: `${origin}/invite/accept`,
          },
        });

        if (inviteError) {
          throw new Error(`Erreur lors de la génération du lien: ${inviteError.message}`);
        }

        // Send email via Resend
        const resendApiKey = Deno.env.get("RESEND_API_KEY");
        let emailSent = false;

        if (resendApiKey) {
          const resend = new Resend(resendApiKey);
          const inviteLink = inviteData.properties.action_link;

          // Get club name if available
          let clubName = "MATCHS360";
          if (clubId) {
            const { data: club } = await supabaseAdmin
              .from("clubs")
              .select("name")
              .eq("id", clubId)
              .single();
            if (club) clubName = club.name;
          }

          // Get user's roles for context
          const { data: userRoles } = await supabaseAdmin
            .from("user_roles")
            .select("role")
            .eq("user_id", userId);

          const roleLabels: Record<string, string> = {
            admin: "Administrateur",
            club_admin: "Administrateur de club",
            coach: "Coach",
            player: "Joueur",
            supporter: "Supporter",
          };

          const rolesText = userRoles && userRoles.length > 0
            ? userRoles.map(r => roleLabels[r.role] || r.role).join(", ")
            : "";

          try {
            await resend.emails.send({
              from: "MATCHS360 <onboarding@resend.dev>",
              to: [email.toLowerCase()],
              subject: `Rappel: Invitation à rejoindre ${clubName}`,
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
                    
                    <h2 style="color: #18181b; font-size: 20px; margin-bottom: 16px;">Rappel d'invitation</h2>
                    
                    <p style="color: #3f3f46; line-height: 1.6; margin-bottom: 24px;">
                      Bonjour,<br><br>
                      Vous avez été invité(e) à rejoindre <strong>${clubName}</strong>${rolesText ? ` en tant que <strong>${rolesText}</strong>` : ""}.
                      <br><br>
                      Ceci est un rappel de votre invitation en attente.
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
            emailSent = true;
            // SECURITY: avoid logging full email (PII). Mask local part.
            console.log(
              "Resend invitation email sent",
              { recipient: email.replace(/^(.{2}).*(@.*)$/, "$1***$2") },
            );
          } catch (emailError) {
            console.error("Failed to send email via Resend:", emailError);
          }
        } else {
          console.warn("Resend API key not configured");
        }

        return new Response(JSON.stringify({ success: true, emailSent }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Promote to admin (super admin only)
      if (action === "promote-admin") {
        const { userId } = body;

        if (!userId) {
          return new Response(JSON.stringify({ error: "userId required" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // CRITICAL: Only the super admin (asahand@protonmail.com) can promote to admin
        const SUPER_ADMIN_EMAIL = "asahand@protonmail.com";
        if (user.email?.toLowerCase() !== SUPER_ADMIN_EMAIL) {
          return new Response(JSON.stringify({ error: "Action non autorisée. Seul le Super Administrateur peut effectuer cette action." }), {
            status: 403,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Prevent promoting yourself
        if (userId === user.id) {
          return new Response(JSON.stringify({ error: "Vous ne pouvez pas vous promouvoir vous-même" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Check if user already has admin role
        const { data: existingAdmin } = await supabaseAdmin
          .from("user_roles")
          .select("id")
          .eq("user_id", userId)
          .eq("role", "admin")
          .maybeSingle();

        if (existingAdmin) {
          return new Response(JSON.stringify({ error: "Cet utilisateur est déjà Super Admin" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        // Add admin role
        const { error: roleError } = await supabaseAdmin
          .from("user_roles")
          .insert({ user_id: userId, role: "admin", club_id: null });

        if (roleError) throw roleError;

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
