import { createClient } from "npm:@supabase/supabase-js@2";

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
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // ID du super admin à conserver
    const superAdminId = "e5728b9e-de5f-4c11-89cf-4e389eae664c";

    // Récupérer tous les utilisateurs
    const { data: users, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (listError) {
      throw listError;
    }

    const deletedUsers: string[] = [];
    const errors: string[] = [];

    // Supprimer tous les utilisateurs sauf le super admin
    for (const user of users.users) {
      if (user.id !== superAdminId) {
        const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id);
        if (deleteError) {
          errors.push(`Failed to delete ${user.email}: ${deleteError.message}`);
        } else {
          deletedUsers.push(user.email || user.id);
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        deleted: deletedUsers,
        errors: errors,
        kept: "asahand@protonmail.com",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
