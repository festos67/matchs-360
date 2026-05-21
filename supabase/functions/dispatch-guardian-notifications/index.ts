// Phase 4 RGPD — Dispatcher des notifications parentales.
// Lit la file `pending_notifications` (ecrite par les triggers PG),
// compose un email synthetique pour chaque titulaire legal,
// et l'enfile dans la queue pgmq `transactional_emails` deja
// consommee par `process-email-queue` (Resend / Lovable Emails).
// Idempotent : marque sent_at apres mise en file ; conserve l'erreur sinon.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

const EVENT_LABELS: Record<string, string> = {
  evaluation_insert: 'Un nouveau debrief a ete cree pour votre enfant.',
  evaluation_update: 'Un debrief de votre enfant a ete modifie.',
  profile_updated: 'Le profil de votre enfant a ete modifie.',
  team_insert: 'Votre enfant a ete ajoute a une nouvelle equipe.',
  team_update: 'Le statut d\'equipe de votre enfant a change.',
  role_added: 'Un nouveau role a ete attribue a votre enfant.',
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

function maskEmail(v: string): string {
  if (!v.includes('@')) return '***'
  const [l, d] = v.split('@')
  if (l.length <= 2) return `${l[0] ?? '*'}***@${d}`
  return `${l[0]}***${l[l.length - 1]}@${d}`
}

/**
 * BUG-EDGE-002 — Comparaison constant-time (cf F-404 et
 * send-invitation-reminders). NE PAS remplacer par ===.
 */
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
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: 'missing env' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // BUG-EDGE-002 — GARDE-FOU SECRET en TETE, AVANT creation du client
  // service_role et tout envoi d'email. Fail-closed.
  const provided = (req.headers.get('authorization') ?? '')
    .replace(/^Bearer\s+/i, '')
    .trim()
  if (!provided || !timingSafeEqualStr(provided, serviceKey)) {
    return new Response(JSON.stringify({ error: 'forbidden' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const sb = createClient(supabaseUrl, serviceKey)

  // Drain batch borne (idempotent : sent_at IS NULL).
  const { data: rows, error } = await sb
    .from('pending_notifications')
    .select('id, recipient_profile_id, minor_profile_id, event_type, payload, attempts')
    .is('sent_at', null)
    .lt('attempts', 5)
    .order('created_at', { ascending: true })
    .limit(100)

  if (error) {
    console.error('dispatch fetch failed', error.message)
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  let sent = 0, failed = 0
  for (const row of rows ?? []) {
    try {
      // Recupere l'email du parent + prenom du mineur (pas le nom, PII minimale)
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

      const { error: enqErr } = await sb.rpc('enqueue_email', {
        queue_name: 'transactional_emails',
        payload: {
          to: (recipient as any).email,
          subject,
          html,
          purpose: 'transactional',
          idempotency_key: `guardian-notif-${row.id}`,
        } as any,
      })

      if (enqErr) {
        await sb.from('pending_notifications').update({
          attempts: (row.attempts ?? 0) + 1,
          send_error: enqErr.message,
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
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status: 200,
  })
})