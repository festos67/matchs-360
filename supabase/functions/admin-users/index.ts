import { createClient } from "npm:@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { getFromEmail } from "../_shared/email-config.ts";

/**
 * Politique mot de passe — miroir de src/lib/password-policy.ts.
 * (Les edge functions ne peuvent pas importer depuis src/.)
 * Garder ces constantes synchronisées avec USER_MIN_LENGTH/ADMIN_MIN_LENGTH.
 */
const ADMIN_MIN_PASSWORD_LENGTH = 14;
const MAX_PASSWORD_LENGTH = 128;

function validateAdminPasswordSrv(pwd: unknown): string | null {
  if (typeof pwd !== "string") return "Password must be a string";
  if (pwd.length < ADMIN_MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${ADMIN_MIN_PASSWORD_LENGTH} characters`;
  }
  if (pwd.length > MAX_PASSWORD_LENGTH) {
    return `Password must be at most ${MAX_PASSWORD_LENGTH} characters`;
  }
  return null;
}

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

/**
 * SECURITY: validate user-provided photo URL.
 * Only allows HTTPS URLs pointing to the project's Supabase Storage
 * public bucket `user-photos`. Rejects data:, javascript:, http:, and
 * any external origin. Prevents tracking pixels, XSS via SVG, SSRF
 * reconnaissance, and DoS via oversized remote images.
 */
const MAX_PHOTO_URL_LENGTH = 2048;
function isValidPhotoUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (value.length === 0 || value.length > MAX_PHOTO_URL_LENGTH) return false;
  let parsed: URL;
  try { parsed = new URL(value); } catch { return false; }
  if (parsed.protocol !== "https:") return false;

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  let allowedHost = "";
  try { allowedHost = new URL(supabaseUrl).host; } catch { /* noop */ }
  if (!allowedHost || parsed.host !== allowedHost) return false;

  // Must point to the public user-photos bucket.
  if (!parsed.pathname.startsWith("/storage/v1/object/public/user-photos/")) {
    return false;
  }
  return true;
}

function maskEmail(email: string | null | undefined): string {
  if (!email) return "***";
  const [local = "", domain = ""] = email.split("@");
  if (!domain) return "***";
  if (local.length <= 2) return `${local[0] || "*"}***@${domain}`;
  return `${local.slice(0, 2)}***@${domain}`;
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  const corsHeaders = buildCorsHeaders(req);

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
    // SECURITY: l'identité super-admin est désormais résolue via
    // public.user_roles (role='admin'), plus aucun email codé en dur.
    const forbidden = (msg = "Forbidden: outside your club scope") =>
      new Response(JSON.stringify({ error: msg }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    // Returns true if a target user belongs (via profile, role or active team membership) to one of the caller's clubs.
    const userInClubAdminScope = async (targetUserId: string): Promise<boolean> => {
      if (isAdmin) return true;
      if (!targetUserId || clubAdminClubIds.length === 0) return false;

      // Never allow operating on a Super Admin (role='admin' in user_roles
      // is the unique source of truth — no email comparison anymore).
      const { data: targetAdminRole } = await supabaseAdmin
        .from("user_roles")
        .select("id")
        .eq("user_id", targetUserId)
        .eq("role", "admin")
        .maybeSingle();
      if (targetAdminRole) return false;

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

    // GET/POST(list) - List users
    if (
      req.method === "GET" ||
      (req.method === "POST" && ((await req.clone().json().catch(() => ({}))).action === "list"))
    ) {
      const listBody = await req.json().catch(() => ({}));
      const page = Math.max(1, Number.parseInt(String(listBody?.page ?? "1"), 10) || 1);
      const pageSize = Math.min(100, Math.max(1, Number.parseInt(String(listBody?.pageSize ?? "50"), 10) || 50));
      const search = typeof listBody?.search === "string" ? listBody.search.trim().slice(0, 100) : null;
      const roleFilter = typeof listBody?.roleFilter === "string" ? listBody.roleFilter : null;
      const clubFilter = typeof listBody?.clubFilter === "string" && listBody.clubFilter !== "all" ? listBody.clubFilter : null;
      const coachFilter = typeof listBody?.coachFilter === "string" && listBody.coachFilter !== "all" ? listBody.coachFilter : null;
      const playerFilter = typeof listBody?.playerFilter === "string" && listBody.playerFilter !== "all" ? listBody.playerFilter : null;

      const { data: scopedIds, error: scopedIdsError } = await supabaseAdmin.rpc("admin_list_users_paginated", {
        p_caller: user.id,
        p_is_admin: isAdmin,
        p_page: page,
        p_size: pageSize,
        p_search: search,
        p_role_filter: roleFilter && roleFilter !== "all" ? roleFilter : null,
        p_club_filter: clubFilter,
        p_coach_filter: coachFilter,
        p_player_filter: playerFilter,
      });

      if (scopedIdsError) throw scopedIdsError;

      const userIds = (scopedIds || []).map((row: { out_user_id: string }) => row.out_user_id).filter(Boolean);
      const total = Number((scopedIds || [])[0]?.out_total_count || 0);

      if (userIds.length === 0) {
        return new Response(JSON.stringify({
          users: [],
          pagination: {
            page,
            pageSize,
            total,
            hasMore: page * pageSize < total,
          },
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const authUsers = await Promise.all(
        userIds.map(async (targetUserId: string) => {
          const { data, error } = await supabaseAdmin.auth.admin.getUserById(targetUserId);
          if (error) throw error;
          return data.user;
        }),
      );

      const [{ data: profiles }, { data: userRoles }, { data: teamMembers }, { data: supporterLinks }] = await Promise.all([
        supabaseAdmin.from("profiles").select("*").in("id", userIds),
        supabaseAdmin.from("user_roles").select("*, clubs(name)").in("user_id", userIds),
        supabaseAdmin.from("team_members").select("*, teams(id, name, club_id, clubs(name))").in("user_id", userIds),
        supabaseAdmin.from("supporters_link").select("*, player:profiles!supporters_link_player_id_fkey(id, first_name, last_name, nickname)").in("supporter_id", userIds),
      ]);

      const profileById = new Map((profiles || []).map((profile) => [profile.id, profile]));
      const rolesByUserId = new Map<string, typeof userRoles>();
      const membershipsByUserId = new Map<string, typeof teamMembers>();
      const supporterLinksByUserId = new Map<string, typeof supporterLinks>();

      for (const role of userRoles || []) {
        const current = rolesByUserId.get(role.user_id) || [];
        current.push(role);
        rolesByUserId.set(role.user_id, current);
      }

      for (const membership of teamMembers || []) {
        const current = membershipsByUserId.get(membership.user_id) || [];
        current.push(membership);
        membershipsByUserId.set(membership.user_id, current);
      }

      for (const supporterLink of supporterLinks || []) {
        const current = supporterLinksByUserId.get(supporterLink.supporter_id) || [];
        current.push(supporterLink);
        supporterLinksByUserId.set(supporterLink.supporter_id, current);
      }

      const usersById = new Map(authUsers.map((authUser) => {
        const profile = profileById.get(authUser.id);
        const roles = rolesByUserId.get(authUser.id) || [];
        const memberships = membershipsByUserId.get(authUser.id) || [];
        const supporterLinksList = supporterLinksByUserId.get(authUser.id) || [];

        let status = "Actif";
        if (profile?.deleted_at) {
          status = "Suspendu";
        } else if (!authUser.email_confirmed_at) {
          status = "Invité";
        }

        return [authUser.id, {
          id: authUser.id,
          email: authUser.email,
          last_sign_in_at: authUser.last_sign_in_at,
          banned_until: authUser.banned_until,
          first_name: profile?.first_name,
          last_name: profile?.last_name,
          nickname: profile?.nickname,
          photo_url: profile?.photo_url,
          club_id: profile?.club_id,
          created_at: authUser.created_at,
          email_confirmed_at: authUser.email_confirmed_at,
          deleted_at: profile?.deleted_at,
          status,
          profile: profile || null,
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
        }];
      }));

      const orderedUsers = userIds.map((id: string) => usersById.get(id)).filter(Boolean);

      console.log("Admin users page fetched", {
        caller: user.id,
        page,
        pageSize,
        total,
        search: search ? "provided" : null,
        sample_email: orderedUsers[0] ? maskEmail(orderedUsers[0].email) : null,
      });

      return new Response(JSON.stringify({ users: orderedUsers, pagination: {
        page,
        pageSize,
        total,
        hasMore: page * pageSize < total,
      } }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // POST - Handle various actions
    if (req.method === "POST") {
      const body = await req.json();
      const action = body.action;

      // Restrict certain actions to super admin only
      const adminOnlyActions = ["promote-admin"];
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

        // C5-4: prevent self-grant (defense in depth, aligns with
        // remove-role and promote-admin handlers)
        if (userId === user.id) {
          return forbidden("You cannot grant a role to yourself");
        }

        // Block privilege escalation: only super admin may grant 'admin'
        if (role === "admin") return forbidden("Only Super Admin can grant admin role");

        // C5-4: club_admin grant requires super admin OR existing
        // club_admin of the SAME club (explicit, not just generic scope)
        if (role === "club_admin") {
          if (!clubId) {
            return forbidden("club_admin grant requires clubId");
          }
          const isCallerClubAdminOfClub = clubAdminClubIds.includes(clubId);
          if (!isAdmin && !isCallerClubAdminOfClub) {
            return forbidden(
              "Only super admin or existing club admin of the same club can grant club_admin",
            );
          }
        }

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

          // C5-4: explicit audit entry for traceability of role grants
          // performed via this endpoint. Distinct from the generic
          // fn_audit_trigger INSERT row by the `via` marker in after_data.
          await supabaseAdmin.from("audit_log").insert({
            actor_id: user.id,
            actor_role: "authenticated",
            action: "INSERT",
            table_name: "user_roles",
            record_id: userId,
            before_data: null,
            after_data: {
              granted_role: role,
              target_user_id: userId,
              club_id: clubId ?? null,
              team_id: teamId ?? null,
              coach_role: coachRole ?? null,
              via: "admin-users.add-role",
            },
          });
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
          if (photoUrl === null || photoUrl === "") {
            updateData.photo_url = null;
          } else if (isValidPhotoUrl(photoUrl)) {
            updateData.photo_url = photoUrl;
          } else {
            return new Response(
              JSON.stringify({ error: "Invalid photoUrl: must be HTTPS URL on Supabase user-photos bucket" }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
            );
          }
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

        // Admin reset: enforce ADMIN_MIN_PASSWORD_LENGTH (CNIL/OWASP for privileged actions)
        {
          const pwdErr = validateAdminPasswordSrv(newPassword);
          if (pwdErr) {
            return new Response(JSON.stringify({ error: pwdErr }), {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
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
              from: getFromEmail(),
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
                      Vous avez été invité(e) à rejoindre <strong>${escapeHtml(clubName)}</strong>${rolesText ? ` en tant que <strong>${escapeHtml(rolesText)}</strong>` : ""}.
                      <br><br>
                      Ceci est un rappel de votre invitation en attente.
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

        // CRITICAL: only an existing Super Admin (role='admin' in user_roles)
        // can promote another user to admin. Identity is resolved via RBAC,
        // never via a hardcoded email.
        if (!isAdmin) {
          return new Response(JSON.stringify({ error: "Action non autorisée. Seul un Super Administrateur peut effectuer cette action." }), {
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
