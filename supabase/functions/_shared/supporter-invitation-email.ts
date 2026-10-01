/**
 * E-mail « Invitation à devenir supporter » : la personne choisie comme
 * supporter d'un joueur doit donner son accord (bouton « Répondre à
 * l'invitation ») avant d'avoir accès aux débriefs. Tant qu'elle n'a pas
 * répondu, le lien supporters_link reste « pending » (aucun accès).
 *
 * Utilisé par send-invitation, admin-users et notify-supporter-invitation.
 * Un seul envoi par lien (invite_email_sent_at) : pas de doublon si plusieurs
 * chemins se recouvrent.
 */
import { getFromEmail } from "./email-config.ts";
import { sendEmail } from "./send-email.ts";

function escapeHtml(input: unknown): string {
  if (input === null || input === undefined) return "";
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// deno-lint-ignore no-explicit-any
type AdminClient = any;
// deno-lint-ignore no-explicit-any
type ResendClient = any;

const fullName = (p: { first_name?: string | null; last_name?: string | null } | null | undefined) =>
  [p?.first_name, p?.last_name].filter(Boolean).join(" ").trim();

/**
 * Envoie l'e-mail pour chaque lien en attente qui ne l'a pas encore reçu.
 * Renvoie le nombre d'e-mails envoyés ; n'échoue jamais (best effort).
 */
export async function sendSupporterInvitationEmails(
  admin: AdminClient,
  resend: ResendClient | null,
  linkIds: string[],
  origin: string,
): Promise<number> {
  if (!resend || linkIds.length === 0) return 0;
  let sent = 0;
  for (const linkId of linkIds) {
    try {
      const { data: link } = await admin
        .from("supporters_link")
        .select("id, supporter_id, player_id, invited_by, status, invite_email_sent_at")
        .eq("id", linkId)
        .maybeSingle();
      if (!link || link.status !== "pending" || link.invite_email_sent_at) continue;

      const ids = [link.supporter_id, link.player_id, link.invited_by].filter(Boolean);
      const { data: people } = await admin
        .from("profiles")
        .select("id, first_name, last_name, email")
        .in("id", ids);
      // deno-lint-ignore no-explicit-any
      const byId = new Map((people ?? []).map((p: any) => [p.id, p]));
      // deno-lint-ignore no-explicit-any
      const supporter = byId.get(link.supporter_id) as any;
      // deno-lint-ignore no-explicit-any
      const player = byId.get(link.player_id) as any;
      // deno-lint-ignore no-explicit-any
      const inviter = link.invited_by ? (byId.get(link.invited_by) as any) : null;
      if (!supporter?.email) continue;

      const { data: membership } = await admin
        .from("team_members")
        .select("teams(name, clubs(name))")
        .eq("user_id", link.player_id)
        .eq("member_type", "player")
        .eq("is_active", true)
        .is("deleted_at", null)
        .limit(1)
        .maybeSingle();
      // deno-lint-ignore no-explicit-any
      const team = (membership as any)?.teams;
      const clubName: string = team?.clubs?.name || "MATCHS360";

      const playerName = fullName(player) || "un joueur";
      const inviterName = fullName(inviter) || `Le club ${clubName}`;
      const link_url = `${origin}/supporter/invitations`;
      const greeting = supporter.first_name ? `Bonjour ${escapeHtml(supporter.first_name)},` : "Bonjour,";

      const result = await sendEmail(resend, {
        from: getFromEmail(),
        to: [String(supporter.email).toLowerCase()],
        subject: `Invitation à suivre ${playerName} — ${clubName}`,
        html: `
          <!DOCTYPE html>
          <html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background:#f4f4f5; margin:0; padding:40px 20px;">
            <div style="max-width:480px; margin:0 auto; background:white; border-radius:12px; padding:40px;">
              <h1 style="color:#18181b; font-size:24px; text-align:center; margin:0 0 8px;">MATCHS360</h1>
              <h2 style="color:#18181b; font-size:18px; margin-top:24px;">Invitation à devenir supporter</h2>
              <p style="color:#3f3f46; line-height:1.6;">
                ${greeting}<br><br>
                <strong>${escapeHtml(inviterName)}</strong> vous propose de devenir supporter de
                <strong>${escapeHtml(playerName)}</strong> au sein de <strong>${escapeHtml(clubName)}</strong>.
                <br><br>
                En tant que supporter, vous pourrez consulter ses débriefs et donner votre avis
                lorsque son coach vous le demande. Rien ne se passe tant que vous n'avez pas
                donné votre accord.
              </p>
              <a href="${link_url}" style="display:block; background:#2563eb; color:white; text-decoration:none; padding:14px 24px; border-radius:8px; text-align:center; font-weight:600; margin:24px 0;">
                Répondre à l'invitation
              </a>
              <p style="color:#71717a; font-size:12px; line-height:1.6;">
                Après connexion à votre compte, vous pourrez accepter ou refuser.
                Si vous ne connaissez pas ce joueur, refusez simplement l'invitation.
              </p>
            </div>
          </body></html>
        `,
      });
      if (result.error) {
        console.error("supporter invitation email failed", { linkId, err: result.error });
        continue;
      }
      await admin
        .from("supporters_link")
        .update({ invite_email_sent_at: new Date().toISOString() })
        .eq("id", linkId);
      sent += 1;
    } catch (e) {
      console.error("supporter invitation email error", { linkId, err: (e as Error)?.message });
    }
  }
  return sent;
}
