import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";

interface ImportTemplateRequest {
  sourceFrameworkId: string;
  targetTeamId?: string;
  targetClubId?: string;
  frameworkName: string;
}

const handler = async (req: Request): Promise<Response> => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  const corsHeaders = buildCorsHeaders(req);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
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

    const body: ImportTemplateRequest = await req.json();
    const { sourceFrameworkId, targetTeamId, targetClubId, frameworkName } = body;

    // Determine if we're importing to a team or a club
    const isClubImport = !!targetClubId && !targetTeamId;
    const targetId = isClubImport ? targetClubId : targetTeamId;
    const targetType = isClubImport ? "club" : "team";

    console.log(`Importing framework ${sourceFrameworkId} to ${targetType} ${targetId}`);

    // ============================================================
    // AUTHORIZATION — verify caller can read source AND write target
    // ============================================================
    const callerId = claimsData.claims.sub as string;

    // 1) Is caller super admin?
    const { data: adminRole } = await supabaseAdmin
      .from("user_roles").select("id").eq("user_id", callerId).eq("role", "admin").maybeSingle();
    const isAdmin = !!adminRole;

    // 2) Resolve source framework's owning club (template) or team
    const { data: srcFw, error: srcFwError } = await supabaseAdmin
      .from("competence_frameworks")
      .select("id, club_id, team_id, is_template")
      .eq("id", sourceFrameworkId)
      .maybeSingle();
    if (srcFwError || !srcFw) throw new Error("Source framework not found");

    const forbidden = (msg: string) =>
      new Response(JSON.stringify({ error: msg }), {
        status: 403, headers: { "Content-Type": "application/json", ...corsHeaders },
      });

    if (!isAdmin) {
      // Caller's club_admin clubs
      const { data: caClubs } = await supabaseAdmin
        .from("user_roles").select("club_id")
        .eq("user_id", callerId).eq("role", "club_admin");
      const myClubIds = (caClubs?.map(r => r.club_id).filter(Boolean) ?? []) as string[];

      // Caller's referent-coach team ids
      const { data: refTeams } = await supabaseAdmin
        .from("team_members").select("team_id")
        .eq("user_id", callerId).eq("member_type", "coach")
        .eq("coach_role", "referent").eq("is_active", true).is("deleted_at", null);
      const myRefTeamIds = (refTeams?.map(r => r.team_id) ?? []) as string[];

      // ---- READ check on source ----
      let srcSourceClubId: string | null = srcFw.club_id;
      if (!srcSourceClubId && srcFw.team_id) {
        const { data: srcTeam } = await supabaseAdmin
          .from("teams").select("club_id").eq("id", srcFw.team_id).maybeSingle();
        srcSourceClubId = srcTeam?.club_id ?? null;
      }
      const canReadSource =
        // Global templates (no club, no team, marked as template) are readable by any authenticated user
        (srcFw.is_template && !srcFw.club_id && !srcFw.team_id) ||
        (srcSourceClubId && myClubIds.includes(srcSourceClubId)) ||
        (srcFw.team_id && myRefTeamIds.includes(srcFw.team_id));
      if (!canReadSource) return forbidden("Source framework outside your scope");

      // ---- WRITE check on target ----
      if (isClubImport) {
        if (!myClubIds.includes(targetClubId!)) return forbidden("Target club outside your scope");
      } else {
        const { data: tgtTeam } = await supabaseAdmin
          .from("teams").select("club_id").eq("id", targetTeamId!).maybeSingle();
        const tgtClubId = tgtTeam?.club_id ?? null;
        const canWriteTarget =
          (tgtClubId && myClubIds.includes(tgtClubId)) ||
          myRefTeamIds.includes(targetTeamId!);
        if (!canWriteTarget) return forbidden("Target team outside your scope");
      }
    }

    // ============================================================
    // ATOMIC IMPORT — single transaction with advisory lock.
    // Prevents concurrent imports from corrupting the same target.
    // Authorization has already been enforced above.
    // ============================================================
    const { data: newFrameworkId, error: rpcError } = await supabaseAdmin.rpc(
      "import_framework_atomic",
      {
        p_source_framework_id: sourceFrameworkId,
        p_target_team_id: isClubImport ? null : targetTeamId,
        p_target_club_id: isClubImport ? targetClubId : null,
        p_framework_name: frameworkName,
      },
    );

    if (rpcError) throw rpcError;

    console.log(`Successfully imported framework to ${targetType} ${targetId}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Référentiel importé avec succès",
        frameworkId: newFrameworkId,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in import-framework function:", error);
    const rawMessage = error instanceof Error ? error.message : "";
    const isSafe =
      rawMessage.startsWith("Forbidden:") ||
      rawMessage.startsWith("forbidden:") ||
      rawMessage.startsWith("PLAN_LIMIT_") ||
      rawMessage === "Unauthorized" ||
      rawMessage === "Missing authorization header" ||
      rawMessage === "Source framework not found" ||
      rawMessage === "Exactly one of target_team_id or target_club_id must be provided" ||
      rawMessage === "framework_name is required" ||
      rawMessage === "source_framework_id is required";
    const safeMessage = isSafe
      ? rawMessage
      : "Une erreur interne est survenue. Réessayez plus tard.";
    return new Response(
      JSON.stringify({ error: safeMessage, code: "INTERNAL_ERROR" }),
      {
        status: isSafe ? 400 : 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

Deno.serve(handler);