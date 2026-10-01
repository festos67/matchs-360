import { createClient } from "npm:@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { sendSupporterInvitationEmails } from "../_shared/supporter-invitation-email.ts";

/**
 * notify-supporter-invitation
 * Envoie la demande d'accord (« Répondre à l'invitation ») pour un lien
 * supporter créé depuis le navigateur (ajout du rôle supporter à un
 * utilisateur existant). Les autres chemins (send-invitation, admin-users)
 * envoient l'e-mail eux-mêmes.
 *
 * Body JSON : { linkId: string }
 * Auth : JWT requis ; seul l'auteur de l'invitation (supporters_link.invited_by,
 * renseigné par la base à la création) peut déclencher l'envoi, une seule fois.
 */

const FALLBACK_ORIGIN = "https://matchs360.fr";
const ALLOWED_ORIGIN_PATTERNS: RegExp[] = [
  /^https:\/\/([a-z0-9-]+\.)*lovable\.app$/i,
  /^https:\/\/([a-z0-9-]+\.)*lovableproject\.com$/i,
  /^https:\/\/(www\.)?matchs360\.fr$/i,
  /^http:\/\/localhost(:\d+)?$/i,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/i,
];

function getSafeOrigin(req: Request): string {
  const origin = req.headers.get("origin");
  if (origin && ALLOWED_ORIGIN_PATTERNS.some((re) => re.test(origin))) return origin;
  return FALLBACK_ORIGIN;
}

Deno.serve(async (req: Request): Promise<Response> => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  const cors = buildCorsHeaders(req);
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Authentification manquante." }, 401);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: caller, error: callerErr } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
    if (callerErr || !caller?.user?.id) return json({ error: "Session invalide." }, 401);

    const body = await req.json().catch(() => ({}));
    const linkId = typeof body?.linkId === "string" ? body.linkId : null;
    if (!linkId) return json({ error: "linkId requis." }, 400);

    const { data: link } = await admin
      .from("supporters_link")
      .select("id, invited_by, status")
      .eq("id", linkId)
      .maybeSingle();
    if (!link || link.invited_by !== caller.user.id) return json({ error: "Action non autorisée." }, 403);
    if (link.status !== "pending") return json({ ok: true, sent: 0 });

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) return json({ error: "Service e-mail non configuré." }, 503);
    const sent = await sendSupporterInvitationEmails(admin, new Resend(resendKey), [linkId], getSafeOrigin(req));
    return json({ ok: true, sent });
  } catch (err) {
    console.error("notify-supporter-invitation error", (err as Error)?.message);
    return json({ error: "Erreur interne." }, 500);
  }
});
