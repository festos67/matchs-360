import { createClient } from "npm:@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { buildCorsHeaders, handleCorsPreflight, isAllowedOrigin } from "../_shared/cors.ts";
import { getFromEmail } from "../_shared/email-config.ts";

/**
 * Notifie par email un utilisateur EXISTANT qu'un role/rattachement vient de lui
 * etre attribue. Couvre les chemins d'assignation directe (AddRoleSection,
 * useCreateCoach) qui ne passent pas par send-invitation. Auth applicative :
 * l'appelant doit etre admin global OU club_admin du club, et la cible doit
 * REELLEMENT avoir le role (anti-abus / anti-spam).
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
  club_admin: "Administrateur de club",
  coach: "Coach",
  player: "Joueur",
  supporter: "Supporter",
};

const handler = async (req: Request): Promise<Response> => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  const cors = buildCorsHeaders(req);
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!supabaseUrl || !serviceKey) return json({ error: "missing env" }, 500);

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const tokenStr = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!tokenStr) return json({ error: "unauthorized" }, 401);
    const { data: callerData, error: callerErr } = await admin.auth.getUser(tokenStr);
    const caller = callerData?.user;
    if (callerErr || !caller) return json({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const userId = body?.userId as string | undefined;
    const role = body?.role as string | undefined;
    const clubId = (body?.clubId ?? null) as string | null;
    if (!userId || !role) return json({ error: "userId et role requis" }, 400);

    const { data: callerRoles } = await admin
      .from("user_roles").select("role, club_id").eq("user_id", caller.id);
    const isAdmin = (callerRoles ?? []).some((r: any) => r.role === "admin");
    const isClubAdmin = (callerRoles ?? []).some(
      (r: any) => r.role === "club_admin" && (!clubId || r.club_id === clubId),
    );
    if (!isAdmin && !isClubAdmin) return json({ error: "forbidden" }, 403);

    let q = admin.from("user_roles").select("id").eq("user_id", userId).eq("role", role);
    if (clubId) q = q.eq("club_id", clubId);
    const { data: targetRole } = await q.maybeSingle();
    if (!targetRole) return json({ error: "role non assigne a cet utilisateur" }, 409);

    const { data: targetProfile } = await admin
      .from("profiles").select("email").eq("id", userId).maybeSingle();
    const toEmail = (targetProfile as any)?.email as string | undefined;
    if (!toEmail) return json({ error: "email cible introuvable" }, 404);

    if (!resendApiKey) return json({ notified: false, reason: "RESEND_API_KEY manquante" });
    const resend = new Resend(resendApiKey);

    const { data: club } = clubId
      ? await admin.from("clubs").select("name").eq("id", clubId).maybeSingle()
      : { data: null as { name: string } | null };
    const clubName = (club as any)?.name || "MATCHS360";
    const roleLabel = ROLE_LABELS[role] || role;

    const reqOrigin = req.headers.get("origin");
    const appBase = reqOrigin && isAllowedOrigin(reqOrigin) ? reqOrigin : "https://matchs360.fr";

    let fromEmail: string;
    try { fromEmail = getFromEmail(); } catch (_e) { return json({ error: "invalid sender config" }, 500); }

    const sendResult = await resend.emails.send({
      from: fromEmail,
      to: [toEmail],
      subject: `Nouveau rôle ajouté - ${clubName}`,
      html: `<!DOCTYPE html>
<html lang="fr">
<body style="font-family: Arial, sans-serif; background:#f6f7fb; margin:0; padding:24px; color:#1f2937;">
  <div style="max-width:560px; margin:0 auto; background:#ffffff; border-radius:12px; padding:32px; box-shadow:0 1px 3px rgba(0,0,0,0.08);">
    <div style="font-size:14px; font-weight:600; color:#3B82F6; letter-spacing:0.08em; text-transform:uppercase;">MATCHS360</div>
    <h1 style="font-size:22px; margin:12px 0 16px;">Nouveau rôle attribué</h1>
    <p style="font-size:15px; line-height:1.6; margin:0 0 16px;">
      Vous avez été ajouté(e) à <strong>${escapeHtml(clubName)}</strong> en tant que <strong>${escapeHtml(roleLabel)}</strong>.
    </p>
    <p style="font-size:15px; line-height:1.6; margin:0 0 24px;">
      Connectez-vous à votre espace pour découvrir vos nouvelles fonctionnalités.
    </p>
    <a href="${escapeHtml(appBase)}" style="display:inline-block; background:#3B82F6; color:#ffffff; text-decoration:none; padding:12px 20px; border-radius:8px; font-weight:600;">
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
      console.error("notify-role-added send failed", sendResult.error);
      return json({ notified: false, error: sendResult.error.message }, 200);
    }
    return json({ notified: true });
  } catch (e) {
    console.error("notify-role-added fatal", e);
    return json({ error: (e as Error)?.message || "unknown" }, 500);
  }
};

Deno.serve(handler);