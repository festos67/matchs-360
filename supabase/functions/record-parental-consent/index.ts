/**
 * Edge function : record-parental-consent
 *
 * Phase 2 RGPD art. 8 FR — enregistre le consentement parental signe par un
 * titulaire de l'autorite parentale (parent / tuteur legal) pour un mineur.
 *
 * Securite :
 *  - le caller doit etre authentifie ; auth.uid() == guardian_profile_id
 *  - le minor_profile_id doit etre un mineur (< 18 — `is_minor()`)
 *  - le guardian lui-meme ne doit pas etre mineur (anti-usurpation)
 *  - capture signed_ip / signed_user_agent comme preuve (RGPD art. 7)
 *  - idempotent : si un consentement non revoque existe deja, on renvoie ok
 *
 * Le formulaire recueille desormais :
 *  - l'identite DECLAREE PAR LE PARENT (nom / prenom), ecrite sur son propre
 *    profil : elle vaut signature, contrairement au nom saisi par le club
 *  - le socle obligatoire (traitement des donnees)
 *  - deux consentements OPTIONNELS et independants, refusables sans
 *    consequence sur l'inscription : photographie (art. 9 C. civ.) et
 *    auto-evaluation
 *
 * Audit : insert dans audit_log avec action 'parental_consent_granted'.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { getFromEmail } from "../_shared/email-config.ts";

type Relationship = "mere" | "pere" | "tuteur_legal" | "autre_titulaire";

interface Body {
  minor_profile_id: string;
  relationship: Relationship;
  guardian_first_name?: string;
  guardian_last_name?: string;
  consent_photo?: boolean;
  consent_self_eval?: boolean;
}

const ALLOWED_REL: Relationship[] = [
  "mere",
  "pere",
  "tuteur_legal",
  "autre_titulaire",
];

const REL_LABELS: Record<Relationship, string> = {
  mere: "Mère",
  pere: "Père",
  tuteur_legal: "Tuteur légal",
  autre_titulaire: "Autre titulaire de l'autorité parentale",
};

/** Qualite telle qu'elle se lit dans l'attestation : « agissant en qualite de … ». */
const REL_QUALITY: Record<Relationship, string> = {
  mere: "mère",
  pere: "père",
  tuteur_legal: "tuteur légal",
  autre_titulaire: "titulaire de l'autorité parentale",
};

const FALLBACK_ORIGIN = Deno.env.get("PUBLIC_SITE_URL") ?? "https://matchs360.fr";

const ALLOWED_ORIGIN_PATTERNS: RegExp[] = [
  /^https:\/\/([a-z0-9-]+\.)*lovable\.app$/i,
  /^https:\/\/([a-z0-9-]+\.)*lovableproject\.com$/i,
  /^https:\/\/([a-z0-9-]+\.)*sandbox\.lovable\.dev$/i,
  /^https:\/\/(www\.)?matchs360\.fr$/i,
  /^http:\/\/localhost(:\d+)?$/i,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/i,
];

function getSafeOrigin(req: Request): string {
  const origin = req.headers.get("origin");
  if (origin && ALLOWED_ORIGIN_PATTERNS.some((re) => re.test(origin))) return origin;
  return FALLBACK_ORIGIN;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function clientIp(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for") || "";
  const first = fwd.split(",")[0]?.trim();
  return first || req.headers.get("cf-connecting-ip") || null;
}

/** Ligne « Accordé / Refusé » du tableau recapitulatif de l'attestation. */
function decisionRow(label: string, granted: boolean): string {
  const color = granted ? "#15803d" : "#b91c1c";
  const text = granted ? "Accordé" : "Refusé";
  return `<tr>
    <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;">${escapeHtml(label)}</td>
    <td style="padding:8px 0;border-bottom:1px solid #e5e7eb;text-align:right;color:${color};font-weight:bold;">${text}</td>
  </tr>`;
}

const handler = async (req: Request): Promise<Response> => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  const cors = buildCorsHeaders(req);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "AUTH_MISSING" }, 401, cors);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claims?.claims?.sub) {
      return json({ error: "AUTH_INVALID" }, 401, cors);
    }
    const guardianId = claims.claims.sub as string;
    const guardianEmailRaw =
      (claims.claims.email as string | undefined) ?? null;
    const guardianEmail = guardianEmailRaw ? guardianEmailRaw.toLowerCase().trim() : null;
    if (!guardianEmail) {
      return json({ error: "GUARDIAN_EMAIL_MISSING" }, 401, cors);
    }

    let body: Body;
    try {
      body = await req.json();
    } catch {
      return json({ error: "INVALID_JSON" }, 400, cors);
    }

    if (!body?.minor_profile_id || typeof body.minor_profile_id !== "string") {
      return json({ error: "INPUT_MISSING_MINOR" }, 400, cors);
    }
    if (!ALLOWED_REL.includes(body.relationship)) {
      return json({ error: "INPUT_INVALID_RELATIONSHIP" }, 400, cors);
    }
    if (body.minor_profile_id === guardianId) {
      return json({ error: "SELF_CONSENT_FORBIDDEN" }, 400, cors);
    }

    // Identite declaree par le representant legal lui-meme. C'est elle qui
    // porte la valeur probante de l'attestation : le nom saisi par le club a
    // l'inscription n'engage que le club.
    const guardianFirstName = (body.guardian_first_name ?? "").trim().slice(0, 50);
    const guardianLastName = (body.guardian_last_name ?? "").trim().slice(0, 50);
    if (!guardianFirstName || !guardianLastName) {
      return json({ error: "INPUT_MISSING_GUARDIAN_IDENTITY" }, 400, cors);
    }

    // Cases optionnelles : refusables sans consequence sur l'inscription.
    // Un booleen absent vaut REFUS (jamais de consentement par defaut).
    const consentPhoto = body.consent_photo === true;
    const consentSelfEval = body.consent_self_eval === true;

    // Le guardian doit etre majeur (anti-mineur-consent-mineur).
    // BUG-EDGE-003 fix : la signature SQL est is_minor(_profile_id uuid).
    const { data: guardianIsMinor, error: gErr } = await admin.rpc("is_minor", {
      _profile_id: guardianId,
    });
    if (gErr) {
      return json({ error: "GUARDIAN_AGE_CHECK_FAILED" }, 500, cors);
    }
    if (guardianIsMinor === true) {
      return json({ error: "GUARDIAN_MUST_BE_ADULT" }, 403, cors);
    }

    // NB-01 fix — Gate aligne sur le SEUIL DONNEES (RGPD art. 8 FR = 15 ans),
    // pas sur le seuil image (18 ans). Les 15-17 consentent EUX-MEMES au
    // traitement de leurs donnees ; le consentement parental n'est requis
    // que pour les < 15. Coherence avec govern_minor_activation et
    // send-invitation (BUG-AGE-002/003) qui utilisent deja 15.
    // BUG-EDGE-003 : conserver le parametre _profile_id.
    const { data: needsParental, error: mErr } = await admin.rpc(
      "requires_parental_consent",
      { _profile_id: body.minor_profile_id },
    );
    if (mErr) {
      console.error("requires_parental_consent check failed", mErr);
      return json({ error: "MINOR_AGE_CHECK_FAILED" }, 500, cors);
    }
    if (needsParental !== true) {
      // Couvre 15-17 (auto-consentement RGPD art. 8 FR) ET 18+.
      return json({ error: "PARENTAL_CONSENT_NOT_REQUIRED" }, 400, cors);
    }

    // ================================================================
    // BUG-EDGE-001 fix — PREUVE DE FILIATION serveur.
    // Le caller ne peut consentir QUE pour un mineur pour lequel une
    // designation 'pending' a ete posee (par send-invitation lors de la
    // creation du mineur) et qui matche l'email authentifie du caller.
    // Sans designation : 403 ; aucun INSERT.
    // ================================================================
    const { data: designation, error: desigErr } = await admin
      .from("guardian_designations")
      .select("id, relationship, expires_at")
      .eq("minor_profile_id", body.minor_profile_id)
      .eq("guardian_email", guardianEmail)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (desigErr) {
      console.error("guardian_designations lookup failed", desigErr);
      return json({ error: "DESIGNATION_LOOKUP_FAILED" }, 500, cors);
    }
    if (!designation) {
      // Pas de designation valable : refus net, aucun cote de doute.
      return json(
        { error: "NO_GUARDIAN_DESIGNATION" },
        403,
        cors,
      );
    }

    // Idempotence : consentement actif deja present ?
    const { data: existing } = await admin
      .from("parental_consents")
      .select("id, signed_at")
      .eq("guardian_profile_id", guardianId)
      .eq("minor_profile_id", body.minor_profile_id)
      .is("revoked_at", null)
      .maybeSingle();

    if (existing) {
      // Idempotence : on s'assure neanmoins que la designation est marquee
      // consumed pour fermer l'anti-rejeu si elle ne l'etait pas encore.
      await admin
        .from("guardian_designations")
        .update({
          status: "consumed",
          consumed_by: guardianId,
          consumed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", designation.id)
        .eq("status", "pending");
      return json(
        { ok: true, consent_id: existing.id, already_active: true },
        200,
        cors,
      );
    }

    const ip = clientIp(req);
    const ua = req.headers.get("user-agent");
    const signedAt = new Date().toISOString();

    const { data: inserted, error: insErr } = await admin
      .from("parental_consents")
      .insert({
        minor_profile_id: body.minor_profile_id,
        guardian_profile_id: guardianId,
        relationship: body.relationship,
        signed_ip: ip,
        signed_user_agent: ua,
        // Le socle reste implicite (il conditionne l'existence meme de la
        // ligne) ; on trace en plus la decision sur chaque case optionnelle.
        consent_scope: {
          data_processing: true,
          evaluations: true,
          communications: true,
          photo: consentPhoto,
          self_evaluation: consentSelfEval,
        },
      })
      .select("id")
      .single();

    if (insErr || !inserted) {
      console.error("parental_consents insert failed", insErr);
      // Pas de fuite du message SQL brut au client.
      return json({ error: "INSERT_FAILED" }, 500, cors);
    }

    // Identite du signataire : ecrite sur SON profil (elle etait jusqu'ici
    // absente — les representants legaux avaient first_name / last_name NULL)
    // et repercutee sur la designation pour l'affichage cote club.
    await admin
      .from("profiles")
      .update({ first_name: guardianFirstName, last_name: guardianLastName })
      .eq("id", guardianId);

    await admin
      .from("guardian_designations")
      .update({
        guardian_first_name: guardianFirstName,
        guardian_last_name: guardianLastName,
      })
      .eq("id", designation.id);

    // ================================================================
    // Consentements optionnels — appliques sur le profil de l'enfant.
    // Photographie : `image_rights_consent_at` est deja la clef de voute du
    // masquage (photo-resolver / usePhotoUrl n'affichent RIEN sans elle).
    // Auto-evaluation : `self_eval_consent_at` est verifiee par le trigger
    // trg_enforce_self_eval_consent cote base.
    // Un refus laisse les colonnes a NULL : rien n'est autorise par defaut.
    // ================================================================
    const minorConsentPatch: Record<string, string | null> = {};
    if (consentPhoto) {
      minorConsentPatch.image_rights_consent_at = signedAt;
      minorConsentPatch.image_rights_consent_by = guardianId;
    }
    if (consentSelfEval) {
      minorConsentPatch.self_eval_consent_at = signedAt;
      minorConsentPatch.self_eval_consent_by = guardianId;
    }
    if (Object.keys(minorConsentPatch).length > 0) {
      const { error: patchErr } = await admin
        .from("profiles")
        .update(minorConsentPatch)
        .eq("id", body.minor_profile_id);
      if (patchErr) console.error("optional consents patch failed", patchErr);
    }

    // Anti-rejeu : marquer la designation consommee.
    await admin
      .from("guardian_designations")
      .update({
        status: "consumed",
        consumed_by: guardianId,
        consumed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", designation.id)
      .eq("status", "pending");

    // ================================================================
    // Acces du representant legal a l'espace de son enfant.
    //
    // C'etait un UPDATE sur une ligne jamais creee : zero ligne affectee,
    // aucune erreur remontee, et le parent se retrouvait sans lien ni role —
    // donc avec le menu par defaut, sans aucun acces aux donnees de l'enfant.
    // Constate en production sur les trois parents ayant consenti.
    //
    // Le role attribue est `supporter` : l'enum app_role n'a pas de valeur
    // dediee au representant legal, et c'est ce role que les policies du
    // parcours joueur reconnaissent deja (is_supporter_of_player). La qualite
    // de titulaire de l'autorite parentale est portee par is_legal_guardian,
    // qui distingue le parent d'un simple supporter.
    // ================================================================
    const { error: linkErr } = await admin
      .from("supporters_link")
      .upsert(
        {
          supporter_id: guardianId,
          player_id: body.minor_profile_id,
          is_legal_guardian: true,
          relationship: body.relationship,
        },
        { onConflict: "supporter_id,player_id" },
      );
    if (linkErr) console.error("supporters_link upsert failed", linkErr);

    // Le role est rattache au club de l'enfant, comme tous les roles
    // supporter existants.
    const { data: minorClub } = await admin
      .from("profiles")
      .select("club_id")
      .eq("id", body.minor_profile_id)
      .maybeSingle();

    if (minorClub?.club_id) {
      const { error: roleErr } = await admin
        .from("user_roles")
        .upsert(
          {
            user_id: guardianId,
            role: "supporter",
            club_id: minorClub.club_id,
          },
          { onConflict: "user_id,role,club_id", ignoreDuplicates: true },
        );
      if (roleErr) console.error("guardian role upsert failed", roleErr);
    }

    // Phase 6 GO-LIVE — Active explicitement le compte mineur (defense en
    // profondeur ; le trigger activate_minor_on_consent fait la meme chose
    // cote DB, on garde l'appel explicite ici pour tracer dans audit_log).
    await admin
      .from("profiles")
      .update({ is_active: true })
      .eq("id", body.minor_profile_id)
      .eq("is_active", false);

    // Audit (RGPD : preuve)
    await admin.from("audit_log").insert({
      actor_id: guardianId,
      actor_role: "guardian",
      action: "parental_consent_granted",
      table_name: "parental_consents",
      record_id: inserted.id,
      after_data: {
        minor_profile_id: body.minor_profile_id,
        relationship: body.relationship,
        designation_id: designation.id,
        guardian_declared_name: `${guardianFirstName} ${guardianLastName}`,
        consent_photo: consentPhoto,
        consent_self_eval: consentSelfEval,
      },
      ip_address: ip,
      user_agent: ua,
    });

    // ================================================================
    // Attestation : envoyee au representant legal, et notifiee au coach
    // referent de l'enfant (email + notification in-app).
    // Best-effort integral : un echec d'envoi ne doit JAMAIS invalider le
    // consentement deja enregistre en base.
    // ================================================================
    try {
      const { data: minor } = await admin
        .from("profiles")
        .select("first_name, last_name, club_id")
        .eq("id", body.minor_profile_id)
        .maybeSingle();
      const childName =
        [minor?.first_name, minor?.last_name].filter(Boolean).join(" ") ||
        "votre enfant";

      let clubName = "MATCHS360";
      if (minor?.club_id) {
        const { data: club } = await admin
          .from("clubs")
          .select("name")
          .eq("id", minor.club_id)
          .maybeSingle();
        if (club?.name) clubName = club.name;
      }

      const signedAtLabel = new Intl.DateTimeFormat("fr-FR", {
        dateStyle: "long",
        timeStyle: "short",
        timeZone: "Europe/Paris",
      }).format(new Date(signedAt));

      const relLabel = REL_LABELS[body.relationship];
      const relQuality = REL_QUALITY[body.relationship];
      const guardianDisplayName = `${guardianFirstName} ${guardianLastName}`;
      const origin = getSafeOrigin(req);
      const attestationUrl = `${origin}/consent/${inserted.id}/attestation`;

      const decisionsTable = `
        <table style="width:100%;font-size:14px;color:#374151;border-collapse:collapse;margin:16px 0;">
          ${decisionRow("Traitement des données (socle)", true)}
          ${decisionRow("Photographie (art. 9 C. civ.)", consentPhoto)}
          ${decisionRow("Auto-évaluation", consentSelfEval)}
        </table>`;

      const resendApiKey = Deno.env.get("RESEND_API_KEY");
      const resend = resendApiKey ? new Resend(resendApiKey) : null;
      if (!resend) {
        console.warn("RESEND_API_KEY absente — attestation non envoyée");
      }

      // ---- 1. Attestation au representant legal -------------------
      if (resend) {
        const { error: mailErr } = await resend.emails.send({
          from: getFromEmail(),
          to: [guardianEmail],
          subject: `Attestation de consentement parental — ${clubName}`,
          html: `
<div style="background:#f4f4f5;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;">
    <h1 style="margin:0 0 8px;font-size:20px;color:#3B82F6;">MATCHS360</h1>
    <h2 style="margin:0 0 4px;font-size:17px;color:#111827;">Attestation de consentement parental</h2>
    <p style="margin:0 0 16px;font-size:13px;color:#6b7280;">Délivrée le ${escapeHtml(signedAtLabel)} (heure de Paris)</p>
    <p style="font-size:14px;color:#374151;line-height:1.6;">
      <strong>${escapeHtml(guardianDisplayName)}</strong>, agissant en qualité de
      <strong>${escapeHtml(relQuality)}</strong>, a attesté être titulaire de l'autorité
      parentale sur <strong>${escapeHtml(childName)}</strong> et a consenti au traitement
      de ses données pour le suivi sportif et éducatif au sein du club
      <strong>${escapeHtml(clubName)}</strong>.
    </p>
    ${decisionsTable}
    <p style="font-size:14px;color:#374151;line-height:1.6;">
      Le compte de ${escapeHtml(childName)} est désormais <strong>actif</strong>.
    </p>
    <a href="${attestationUrl}" style="display:block;background:#2563eb;color:white;text-decoration:none;padding:14px 24px;border-radius:8px;text-align:center;font-weight:600;margin:24px 0;">
      Consulter et imprimer l'attestation
    </a>
    <p style="font-size:13px;color:#6b7280;line-height:1.6;">
      Consentement enregistré et horodaté par MATCHS360. Référence :
      <span style="font-family:monospace;">${escapeHtml(inserted.id)}</span>.
      Chaque autorisation est <strong>révocable à tout moment</strong> depuis votre
      espace « Mes consentements ».
    </p>
    <p style="font-size:13px;color:#6b7280;line-height:1.6;">
      Si vous n'êtes pas à l'origine de cette validation, merci de contacter le club
      dans les plus brefs délais.
    </p>
  </div>
</div>`,
        });
        if (mailErr) console.error("attestation email to guardian failed", mailErr);
      }

      // ---- 2. Notification aux coachs referents de l'enfant --------
      const { data: memberships } = await admin
        .from("team_members")
        .select("team_id")
        .eq("user_id", body.minor_profile_id)
        .eq("is_active", true)
        .is("deleted_at", null);
      const teamIds = (memberships ?? []).map((m) => m.team_id).filter(Boolean);

      if (teamIds.length > 0) {
        const { data: referents } = await admin
          .from("team_members")
          .select("user_id")
          .in("team_id", teamIds)
          .eq("member_type", "coach")
          .eq("coach_role", "referent")
          .eq("is_active", true)
          .is("deleted_at", null);

        const referentIds = Array.from(
          new Set((referents ?? []).map((r) => r.user_id).filter(Boolean)),
        ) as string[];

        if (referentIds.length > 0) {
          const summary =
            `Photographie : ${consentPhoto ? "accordée" : "refusée"} — ` +
            `Auto-évaluation : ${consentSelfEval ? "accordée" : "refusée"}.`;

          const { error: notifErr } = await admin.from("notifications").insert(
            referentIds.map((uid) => ({
              user_id: uid,
              title: `Consentement parental reçu — ${childName}`,
              message:
                `${guardianDisplayName} (${relLabel}) a validé le consentement. ${summary}`,
              type: "success",
              link: `/consent/${inserted.id}/attestation`,
            })),
          );
          if (notifErr) console.error("referent notifications insert failed", notifErr);

          if (resend) {
            const { data: refProfiles } = await admin
              .from("profiles")
              .select("email, first_name")
              .in("id", referentIds);

            for (const ref of refProfiles ?? []) {
              if (!ref.email) continue;
              const hello = ref.first_name ? `Bonjour ${escapeHtml(ref.first_name)},` : "Bonjour,";
              const { error: refMailErr } = await resend.emails.send({
                from: getFromEmail(),
                to: [ref.email],
                subject: `Consentement parental reçu — ${childName}`,
                html: `
<div style="background:#f4f4f5;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;">
    <h1 style="margin:0 0 8px;font-size:20px;color:#3B82F6;">MATCHS360</h1>
    <h2 style="margin:0 0 16px;font-size:17px;color:#111827;">Consentement parental reçu</h2>
    <p style="font-size:14px;color:#374151;line-height:1.6;">
      ${hello}<br><br>
      <strong>${escapeHtml(guardianDisplayName)}</strong>, ${escapeHtml(relQuality)} de
      <strong>${escapeHtml(childName)}</strong>, a validé le consentement parental le
      ${escapeHtml(signedAtLabel)}. Le compte de l'enfant est désormais actif.
    </p>
    ${decisionsTable}
    <p style="font-size:13px;color:#6b7280;line-height:1.6;">
      Merci de respecter ces choix : une autorisation refusée ne peut pas être
      contournée dans l'application, et le représentant légal peut la modifier
      à tout moment.
    </p>
    <a href="${attestationUrl}" style="display:block;background:#2563eb;color:white;text-decoration:none;padding:14px 24px;border-radius:8px;text-align:center;font-weight:600;margin:24px 0;">
      Consulter l'attestation
    </a>
  </div>
</div>`,
              });
              if (refMailErr) console.error("attestation email to referent failed", refMailErr);
            }
          }
        }
      }
    } catch (e) {
      console.error("attestation dispatch error", (e as Error)?.message);
    }

    return json({ ok: true, consent_id: inserted.id }, 200, cors);
  } catch (e) {
    console.error("record-parental-consent fatal", e);
    // Pas de fuite : message metier seulement.
    return json({ error: "INTERNAL_ERROR" }, 500, buildCorsHeaders(req));
  }
};

function json(body: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

Deno.serve(handler);
