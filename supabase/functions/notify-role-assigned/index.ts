import { createClient } from "npm:@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { getFromEmail } from "../_shared/email-config.ts";

/**
 * Envoie un email de felicitations lorsqu'un nouveau role est attribue a un
 * utilisateur. Appelee automatiquement par le trigger SQL trg_user_role_assigned
 * (via pg_net) apres chaque INSERT sur public.user_roles.
 *
 * Anti-abus : la fonction verifie que la ligne user_roles existe reellement
 * avant d'envoyer un email. Aucun JWT requis (appel interne depuis la DB).
 */

function escapeHtml(input: unknown): string {
  if (input === null || input === undefined) return "";
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const ROLE_LABELS: Record<string, string> = {
  admin: "Super Administrateur",
  club_admin: "Administrateur de club",
  coach: "Coach",
  player: "Joueur",
  supporter: "Supporter",
};

Deno.serve(async (req: Request): Promise<Response> => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  const cors = buildCorsHeaders(req);
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), {
      status: s,
      headers: { ...cors, "Content-Type": "application/json" },
    });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!supabaseUrl || !serviceKey) return json({ error: "missing env" }, 500);

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = await req.json().catch(() => ({}));
    const userId = body?.userId as string | undefined;
    const role = body?.role as string | undefined;
    const clubId = (body?.clubId ?? null) as string | null;
    if (!userId || !role) return json({ error: "userId et role requis" }, 400);

    // Anti-abus : la ligne doit reellement exister.
    let q = admin.from("user_roles").select("id").eq("user_id", userId).eq("role", role);
    if (clubId) q = q.eq("club_id", clubId);
    const { data: targetRole } = await q.maybeSingle();
    if (!targetRole) return json({ error: "role inexistant" }, 409);

    const { data: targetProfile } = await admin
      .from("profiles")
      .select("email, first_name")
      .eq("id", userId)
      .maybeSingle();
    const toEmail = (targetProfile as any)?.email as string | undefined;
    const firstName = (targetProfile as any)?.first_name as string | undefined;
    if (!toEmail) return json({ error: "email cible introuvable" }, 404);

    if (!resendApiKey) return json({ notified: false, reason: "RESEND_API_KEY manquante" });
    const resend = new Resend(resendApiKey);

    const { data: club } = clubId
      ? await admin.from("clubs").select("name").eq("id", clubId).maybeSingle()
      : { data: null as { name: string } | null };
    const clubName = (club as any)?.name || "MATCHS360";
    const roleLabel = ROLE_LABELS[role] || role;

    let fromEmail: string;
    try { fromEmail = getFromEmail(); } catch (_e) {
      return json({ error: "invalid sender config" }, 500);
    }

    const appBase = "https://matchs360.fr";
    const greeting = firstName ? `Bravo ${escapeHtml(firstName)},` : "Bravo,";
    const clubLine = clubId
      ? ` au sein de <strong>${escapeHtml(clubName)}</strong>`
      : "";

    const sendResult = await resend.emails.send({
      from: fromEmail,
      to: [toEmail],
      subject: `🎉 Félicitations, nouveau rôle : ${roleLabel}`,
      html: `<!DOCTYPE html>
<html lang="fr">
<body style="font-family: Arial, sans-serif; background:#f6f7fb; margin:0; padding:24px; color:#1f2937;">
  <div style="max-width:560px; margin:0 auto; background:#ffffff; border-radius:12px; padding:32px; box-shadow:0 1px 3px rgba(0,0,0,0.08);">
    <div style="font-size:14px; font-weight:600; color:#3B82F6; letter-spacing:0.08em; text-transform:uppercase;">MATCHS360</div>
    <h1 style="font-size:22px; margin:12px 0 16px;">🎉 Félicitations !</h1>
    <p style="font-size:15px; line-height:1.6; margin:0 0 16px;">
      ${greeting} vous venez d'obtenir le rôle de <strong>${escapeHtml(roleLabel)}</strong>${clubLine}.
    </p>
    <p style="font-size:15px; line-height:1.6; margin:0 0 24px;">
      Bienvenue ! Connectez-vous à votre espace pour découvrir vos nouvelles fonctionnalités.
    </p>
    <a href="${appBase}" style="display:inline-block; background:#3B82F6; color:#ffffff; text-decoration:none; padding:12px 20px; border-radius:8px; font-weight:600;">
      Accéder à mon espace
    </a>
    <p style="font-size:12px; color:#6b7280; margin-top:32px;">
      Si vous n'attendiez pas cet ajout, contactez le responsable de votre club.
    </p>
  </div>
</body>
</html>`,
    });

    if (sendResult.error) {
      console.error("notify-role-assigned send failed", sendResult.error);
      return json({ notified: false, error: sendResult.error.message }, 200);
    }
    return json({ notified: true });
  } catch (e) {
    console.error("notify-role-assigned fatal", e);
    return json({ error: (e as Error)?.message || "unknown" }, 500);
  }
});