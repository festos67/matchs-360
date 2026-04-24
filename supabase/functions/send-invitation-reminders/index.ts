import { createClient } from "npm:@supabase/supabase-js@2";
import { Resend } from "npm:resend@2.0.0";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { getFromEmail } from "../_shared/email-config.ts";

/**
 * Cron-triggered function that sends J-3 and J-1 reminders for
 * pending invitations. Regenerates a fresh Supabase invite link to
 * avoid serving an expired Supabase OTP token (default TTL 24h).
 *
 * Authorization: must be called with the project SERVICE_ROLE key
 * (verified via the Authorization header) — typically via pg_cron.
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

/**
 * Constant-time string comparison to neutralize timing-attack oracles
 * on secret comparisons (F-404). Avoids early-exit on first byte
 * difference and length-based short-circuits.
 */
function timingSafeEqualStr(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const abuf = enc.encode(a);
  const bbuf = enc.encode(b);
  // Always run the loop on a fixed-length window to avoid leaking
  // the secret length when inputs differ in size.
  const len = Math.max(abuf.byteLength, bbuf.byteLength);
  let diff = abuf.byteLength ^ bbuf.byteLength;
  for (let i = 0; i < len; i++) {
    const av = i < abuf.byteLength ? abuf[i] : 0;
    const bv = i < bbuf.byteLength ? bbuf[i] : 0;
    diff |= av ^ bv;
  }
  return diff === 0;
}

const FALLBACK_ORIGIN = "https://matchs360.lovable.app";

const ROLE_LABELS: Record<string, string> = {
  club_admin: "Administrateur de club",
  coach: "Coach",
  player: "Joueur",
  supporter: "Supporter",
};

interface InvitationRow {
  id: string;
  email: string;
  club_id: string | null;
  intended_role: string;
  expires_at: string;
  status: string;
  reminder_j3_sent_at: string | null;
  reminder_j1_sent_at: string | null;
}

const handler = async (req: Request): Promise<Response> => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  const corsHeaders = buildCorsHeaders(req);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    // Authorization: only allow service-role callers (pg_cron / admin).
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token || !timingSafeEqualStr(token, serviceRoleKey)) {
      return new Response(
        JSON.stringify({ error: "forbidden" }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    if (!resendApiKey) {
      return new Response(
        JSON.stringify({ error: "RESEND_API_KEY not configured" }),
        { status: 503, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const resend = new Resend(resendApiKey);

    const now = Date.now();
    // Window definitions:
    //   J-3 reminder: expires_at within (24h*2, 24h*3] from now
    //   J-1 reminder: expires_at within (0, 24h] from now
    const in1d = new Date(now + 24 * 3600 * 1000).toISOString();
    const in2d = new Date(now + 2 * 24 * 3600 * 1000).toISOString();
    const in3d = new Date(now + 3 * 24 * 3600 * 1000).toISOString();
    const nowIso = new Date(now).toISOString();

    // Fetch candidates: any pending invitation expiring within the next 3 days.
    const { data: candidates, error: fetchErr } = await supabaseAdmin
      .from("invitations")
      .select("id, email, club_id, intended_role, expires_at, status, reminder_j3_sent_at, reminder_j1_sent_at")
      .eq("status", "pending")
      .gt("expires_at", nowIso)
      .lte("expires_at", in3d);

    if (fetchErr) {
      console.error("Fetch invitations error", fetchErr);
      return new Response(
        JSON.stringify({ error: fetchErr.message }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    const rows = (candidates ?? []) as InvitationRow[];

    let j3Sent = 0;
    let j1Sent = 0;
    const errors: Array<{ id: string; error: string }> = [];

    for (const inv of rows) {
      const expiresMs = new Date(inv.expires_at).getTime();
      const remainingMs = expiresMs - now;
      let kind: "j3" | "j1" | null = null;
      if (remainingMs <= 24 * 3600 * 1000 && !inv.reminder_j1_sent_at) {
        kind = "j1";
      } else if (
        remainingMs > 2 * 24 * 3600 * 1000 &&
        remainingMs <= 3 * 24 * 3600 * 1000 &&
        !inv.reminder_j3_sent_at
      ) {
        kind = "j3";
      }
      if (!kind) continue;

      try {
        // Regenerate a fresh invite link (Supabase token TTL is short, ~24h).
        const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
          type: "invite",
          email: inv.email,
          options: { redirectTo: `${FALLBACK_ORIGIN}/invite/accept` },
        });
        if (linkErr || !linkData?.properties?.action_link) {
          errors.push({ id: inv.id, error: linkErr?.message || "no action_link" });
          continue;
        }
        const inviteLink = linkData.properties.action_link;

        const { data: club } = inv.club_id
          ? await supabaseAdmin.from("clubs").select("name").eq("id", inv.club_id).maybeSingle()
          : { data: null as { name: string } | null };

        const clubName = club?.name || "MATCHS360";
        const roleLabel = ROLE_LABELS[inv.intended_role] || inv.intended_role;
        const subject =
          kind === "j1"
            ? `Dernier rappel — Invitation à rejoindre ${clubName} (expire demain)`
            : `Rappel — Invitation à rejoindre ${clubName}`;
        const intro =
          kind === "j1"
            ? "Votre invitation expire dans moins de 24 heures."
            : "Votre invitation expire dans 3 jours.";

        const sendResult = await resend.emails.send({
          from: getFromEmail(),
          to: [inv.email],
          subject,
          html: `
            <!DOCTYPE html>
            <html>
              <head><meta charset="utf-8"></head>
              <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background:#f4f4f5; margin:0; padding:40px 20px;">
                <div style="max-width:480px; margin:0 auto; background:#fff; border-radius:12px; padding:40px; box-shadow:0 4px 6px rgba(0,0,0,.1);">
                  <div style="text-align:center; margin-bottom:24px;">
                    <h1 style="color:#18181b; font-size:24px; margin:0;">MATCHS360</h1>
                  </div>
                  <h2 style="color:#18181b; font-size:18px; margin-bottom:12px;">${escapeHtml(intro)}</h2>
                  <p style="color:#3f3f46; line-height:1.6; margin-bottom:24px;">
                    Vous êtes invité(e) à rejoindre <strong>${escapeHtml(clubName)}</strong>
                    en tant que <strong>${escapeHtml(roleLabel)}</strong>.
                  </p>
                  <a href="${inviteLink}" style="display:block; background:#2563eb; color:#fff; text-decoration:none; padding:14px 24px; border-radius:8px; text-align:center; font-weight:600; margin-bottom:24px;">
                    Accepter l'invitation
                  </a>
                  <p style="color:#71717a; font-size:12px; line-height:1.6;">
                    Ou copiez ce lien dans votre navigateur :<br>
                    <a href="${inviteLink}" style="color:#2563eb; word-break:break-all;">${escapeHtml(inviteLink)}</a>
                  </p>
                  <hr style="border:none; border-top:1px solid #e4e4e7; margin:32px 0;">
                  <p style="color:#a1a1aa; font-size:12px; text-align:center;">
                    Si vous n'attendiez pas cette invitation, ignorez cet email.
                  </p>
                </div>
              </body>
            </html>
          `,
        });

        if (sendResult.error) {
          errors.push({ id: inv.id, error: sendResult.error.message || "send failed" });
          continue;
        }

        const stamp = new Date().toISOString();
        const update: Record<string, string> = kind === "j1"
          ? { reminder_j1_sent_at: stamp }
          : { reminder_j3_sent_at: stamp };
        await supabaseAdmin.from("invitations").update(update).eq("id", inv.id);

        if (kind === "j1") j1Sent++;
        else j3Sent++;
      } catch (e) {
        errors.push({ id: inv.id, error: (e as Error)?.message || "unknown" });
      }
    }

    return new Response(
      JSON.stringify({
        scanned: rows.length,
        j3_sent: j3Sent,
        j1_sent: j1Sent,
        errors,
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  } catch (error) {
    console.error("send-invitation-reminders fatal", error);
    return new Response(
      JSON.stringify({ error: (error as Error)?.message || "unknown" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  }
};

Deno.serve(handler);