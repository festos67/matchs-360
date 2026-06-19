// Phase 4 RGPD — Dispatcher des notifications parentales.
// Lit la file `pending_notifications` (ecrite par les triggers PG), compose
// un email synthetique pour chaque titulaire legal et l'ENVOIE directement
// via Resend (plus de file pgmq / process-email-queue : 1 seul saut).
// Idempotent : marque sent_at apres envoi reussi ; sinon incremente attempts
// et conserve l'erreur (retente au prochain cron tant que attempts < 5).
import { createClient } from 'npm:@supabase/supabase-js@2'
import { Resend } from 'https://esm.sh/resend@2.0.0'
import { buildCorsHeaders, handleCorsPreflight } from '../_shared/cors.ts'
import { getFromEmail } from '../_shared/email-config.ts'

const EVENT_LABELS: Record<string, string> = {
  evaluation_insert: 'Un nouveau debrief a ete cree pour votre enfant.',
  evaluation_update: 'Un debrief de votre enfant a ete modifie.',
  profile_updated: 'Le profil de votre enfant a ete modifie.',
  team_insert: 'Votre enfant a ete ajoute a une nouvelle equipe.',
  team_update: 'Le statut d\'equipe de votre enfant a change.',
  role_added: 'Un nouveau role a ete attribue a votre enfant.',
}

function escapeHtml(input: unknown): string {
  if (input === null || input === undefined) return ''
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function maskEmail(v: string): string {
  if (!v.includes('@')) return '***'
  const [l, d] = v.split('@')
  if (l.length <= 2) return `${l[0] ?? '*'}***@${d}`
  return `${l[0]}***${l[l.length - 1]}@${d}`
}

/** Comparaison constant-time (cf F-404). NE PAS remplacer par ===. */
function timingSafeEqualStr(a: string, b: string): boolean {
  const enc = new TextEncoder()
  const abuf = enc.encode(a)
  const bbuf = enc.encode(b)
  const len = Math.max(abuf.byteLength, bbuf.byteLength)
  let diff = abuf.byteLength ^ bbuf.byteLength
  for (let i = 0; i < len; i++) {
    const av = i < abuf.byteLength ? abuf[i] : 0
    const bv = i < bbuf.byteLength ? bbuf[i] : 0
    diff |= av ^ bv
  }
  return diff === 0
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req)
  if (preflight) return preflight
  const cors = buildCorsHeaders(req)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const resendApiKey = Deno.env.get('RESEND_API_KEY')
  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: 'missing env' }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
  }

  const sb = createClient(supabaseUrl, serviceKey)

  // AUTH — secret partage cron->edge (Vault + RPC get_cron_secret), compare en
  // temps constant, AVANT tout envoi. Fail-closed.
  const provided = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  const { data: cronSecret } = await sb.rpc('get_cron_secret')
  if (!provided || !cronSecret || !timingSafeEqualStr(provided, cronSecret)) {
    return new Response(JSON.stringify({ error: 'forbidden' }), {
      status: 403,
      headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }

  if (!resendApiKey) {
    return new Response(JSON.stringify({ error: 'RESEND_API_KEY not configured' }), {
      status: 503, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
  let fromEmail: string
  try {
    fromEmail = getFromEmail()
  } catch (_e) {
    return new Response(JSON.stringify({ error: 'invalid sender config' }), {
      status: 500, headers: { ...cors, 'Content-Type': 'application/json' },
    })
  }
  const resend = new Resend(resendApiKey)

  // Drain batch borne (idempotent : sent_at IS NULL, attempts < 5).
  const { data: rows, error } = await sb
    .from('pending_notifications')
    .select('id, recipient_profile_id, minor_profile_id, event_type, payload, attempts')
    .is('sent_at', null)
    .lt('attempts', 5)
    .order('created_at', { ascending: true })
    .limit(100)

  if (error) {
    console.error('dispatch fetch failed', error.message)
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } })
  }

  let sent = 0, failed = 0
  for (const row of rows ?? []) {
    try {
      const [{ data: recipient }, { data: minor }] = await Promise.all([
        sb.from('profiles').select('email, first_name').eq('id', row.recipient_profile_id).maybeSingle(),
        row.minor_profile_id
          ? sb.from('profiles').select('first_name').eq('id', row.minor_profile_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ])
      if (!recipient?.email) {
        await sb.from('pending_notifications').update({
          attempts: (row.attempts ?? 0) + 1,
          send_error: 'recipient email missing',
        }).eq('id', row.id)
        failed++
        continue
      }

      const childName = (minor as any)?.first_name ?? 'votre enfant'
      const label = EVENT_LABELS[row.event_type] ?? `Activite sur le compte de ${childName}.`
      const subject = `[MATCHS360] ${label}`
      const html = `<!doctype html><html><body style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
<h2 style="color:#3B82F6">Notification parentale</h2>
<p>Bonjour ${escapeHtml((recipient as any).first_name ?? '')},</p>
<p>${escapeHtml(label)}</p>
<p style="background:#f1f5f9;padding:12px;border-radius:6px;font-size:14px">
  <strong>Enfant :</strong> ${escapeHtml(childName)}<br/>
  <strong>Evenement :</strong> ${escapeHtml(row.event_type)}<br/>
  <strong>Date :</strong> ${new Date().toLocaleString('fr-FR')}
</p>
<p style="font-size:13px;color:#64748b">Vous recevez cet email en tant que titulaire legal declare.
Pour gerer ou revoquer votre consentement, connectez-vous a MATCHS360 puis ouvrez "Mes consentements".</p>
</body></html>`

      const { error: sendErr } = await resend.emails.send({
        from: fromEmail,
        to: [(recipient as any).email],
        subject,
        html,
      })

      if (sendErr) {
        await sb.from('pending_notifications').update({
          attempts: (row.attempts ?? 0) + 1,
          send_error: (sendErr as any)?.message ?? String(sendErr),
        }).eq('id', row.id)
        failed++
        continue
      }

      await sb.from('pending_notifications').update({ sent_at: new Date().toISOString(), send_error: null })
        .eq('id', row.id)
      sent++
      console.log(`dispatched guardian notif id=${row.id} to=${maskEmail((recipient as any).email)} event=${row.event_type}`)
    } catch (e) {
      failed++
      const msg = e instanceof Error ? e.message : String(e)
      await sb.from('pending_notifications').update({
        attempts: (row.attempts ?? 0) + 1,
        send_error: msg,
      }).eq('id', row.id)
      console.error('dispatch row failed', row.id, msg)
    }
  }

  return new Response(JSON.stringify({ processed: rows?.length ?? 0, sent, failed }), {
    headers: { ...cors, 'Content-Type': 'application/json' },
    status: 200,
  })
})