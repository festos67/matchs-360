import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ImportTemplateRequest {
  sourceFrameworkId: string;
  targetTeamId: string;
  frameworkName: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      throw new Error("Unauthorized");
    }

    const body: ImportTemplateRequest = await req.json();
    const { sourceFrameworkId, targetTeamId, frameworkName } = body;

    console.log(`Importing framework ${sourceFrameworkId} to team ${targetTeamId}`);

    // Check if team already has a framework
    const { data: existingFramework } = await supabaseAdmin
      .from("competence_frameworks")
      .select("id")
      .eq("team_id", targetTeamId)
      .maybeSingle();

    let newFrameworkId: string;

    if (existingFramework) {
      // Delete existing themes and skills (cascade will handle skills)
      await supabaseAdmin
        .from("themes")
        .delete()
        .eq("framework_id", existingFramework.id);
      
      newFrameworkId = existingFramework.id;
      
      // Update framework name
      await supabaseAdmin
        .from("competence_frameworks")
        .update({ name: frameworkName })
        .eq("id", existingFramework.id);
    } else {
      // Create new framework for the team
      const { data: newFramework, error: createError } = await supabaseAdmin
        .from("competence_frameworks")
        .insert({
          team_id: targetTeamId,
          name: frameworkName,
          is_template: false,
        })
        .select()
        .single();

      if (createError) throw createError;
      newFrameworkId = newFramework.id;
    }

    // Get source themes with skills
    const { data: sourceThemes, error: themesError } = await supabaseAdmin
      .from("themes")
      .select("*, skills(*)")
      .eq("framework_id", sourceFrameworkId)
      .order("order_index");

    if (themesError) throw themesError;

    console.log(`Found ${sourceThemes?.length || 0} themes to copy`);

    // Copy themes and skills
    for (const theme of sourceThemes || []) {
      const { data: newTheme, error: themeError } = await supabaseAdmin
        .from("themes")
        .insert({
          framework_id: newFrameworkId,
          name: theme.name,
          color: theme.color,
          order_index: theme.order_index,
        })
        .select()
        .single();

      if (themeError) throw themeError;

      // Copy skills for this theme
      const skillsToInsert = (theme.skills || []).map((skill: any) => ({
        theme_id: newTheme.id,
        name: skill.name,
        definition: skill.definition,
        order_index: skill.order_index,
      }));

      if (skillsToInsert.length > 0) {
        const { error: skillsError } = await supabaseAdmin
          .from("skills")
          .insert(skillsToInsert);

        if (skillsError) throw skillsError;
      }
    }

    console.log(`Successfully imported framework to team ${targetTeamId}`);

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