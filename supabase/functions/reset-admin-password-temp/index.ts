import { createClient } from "npm:@supabase/supabase-js@2";

// Temporary one-shot function: reset password for asahand/super admin Romain.
// Hardcoded target email + reads new password from TEMP_ADMIN_PASSWORD_ROMAIN secret.
// Delete this function after use.

const TARGET_EMAIL = "romain.steibel@gmail.com";

Deno.serve(async (_req) => {
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const newPwd = Deno.env.get("TEMP_ADMIN_PASSWORD_ROMAIN");
    if (!newPwd) return new Response(JSON.stringify({ error: "missing TEMP_ADMIN_PASSWORD_ROMAIN" }), { status: 500 });

    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

    // Find user by email via paginated listUsers
    let userId: string | null = null;
    for (let page = 1; page <= 50 && !userId; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
      const u = data.users.find(x => (x.email || "").toLowerCase() === TARGET_EMAIL);
      if (u) userId = u.id;
      if (data.users.length < 200) break;
    }
    if (!userId) return new Response(JSON.stringify({ error: "user not found" }), { status: 404 });

    const { error: upErr } = await admin.auth.admin.updateUserById(userId, {
      password: newPwd,
      email_confirm: true,
    });
    if (upErr) return new Response(JSON.stringify({ error: upErr.message }), { status: 500 });

    return new Response(JSON.stringify({ ok: true, userId, email: TARGET_EMAIL }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
});