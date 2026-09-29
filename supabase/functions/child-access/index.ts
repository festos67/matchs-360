/**
 * Edge function : child-access
 *
 * Accès des joueurs inscrits SANS adresse e-mail (identifiant technique
 * `prenom.nom`). Aucun courrier ne peut leur parvenir : ni invitation, ni lien
 * de réinitialisation. Trois actions :
 *
 *  - « request »  (public)   L'enfant a oublié son mot de passe. Son coach
 *                            référent et son représentant légal sont prévenus.
 *                            Anti-spam : une seule demande ouverte par enfant,
 *                            au plus une notification par 24 h, limite par
 *                            appareil. Réponse toujours identique (on ne révèle
 *                            pas si l'identifiant existe).
 *  - « generate » (connecté) Le coach référent, le responsable du club ou un
 *                            administrateur génère un CODE D'ACCÈS à usage
 *                            unique (7 jours), affiché une seule fois. Le mot de
 *                            passe actuel n'est PAS modifié : si l'enfant le
 *                            retrouve, il reste valable. Le parent est prévenu.
 *  - « redeem »   (public)   L'enfant saisit identifiant + code et choisit son
 *                            propre mot de passe. 5 essais faux bloquent le code.
 *                            Le parent est prévenu (trace d'une éventuelle
 *                            utilisation par un tiers).
 *
 * Les codes ne sont stockés que sous forme d'empreinte salée
 * (public.child_access_codes, lisible par le service_role uniquement).
 */
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { buildCorsHeaders, handleCorsPreflight, isAllowedOrigin } from "../_shared/cors.ts";
import { getFromEmail } from "../_shared/email-config.ts";
import { sendEmail } from "../_shared/send-email.ts";
import { identifierFromEmail, isTechnicalAddress, technicalEmailFor } from "../_shared/technical-identity.ts";

const CODE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;
const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 128;
const NOTIFY_INTERVAL_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const REQUEST_LIMIT_PER_HOUR = 5;
const REDEEM_LIMIT_PER_HOUR = 10;
const GENERATE_LIMIT_PER_DAY = 20;

// Mots courts, sans accent, faciles à lire et à taper pour un enfant.
const WORDS = [
  "arbre", "avion", "balle", "ballon", "bateau", "bijou", "bonbon", "bouton", "brique", "cactus",
  "canard", "carte", "castor", "cerise", "chat", "cheval", "chien", "citron", "clown", "cobra",
  "colline", "comete", "coquille", "corde", "crabe", "crayon", "dauphin", "domino", "dragon", "etoile",
  "fleur", "foret", "fraise", "fusee", "girafe", "glace", "gorille", "grenouille", "guitare", "hibou",
  "jardin", "kiwi", "koala", "lac", "lapin", "lion", "loup", "lune", "mangue", "marmotte",
  "melon", "moto", "mouette", "nuage", "orange", "ours", "panda", "papillon", "phare", "piano",
  "pingouin", "pirate", "plage", "pluie", "poire", "pomme", "pont", "prune", "puzzle", "radis",
  "renard", "requin", "robot", "rocher", "sable", "sapin", "sirene", "soleil", "souris", "stylo",
  "tambour", "tigre", "tomate", "tortue", "train", "trefle", "tulipe", "vague", "velo", "volcan",
  "zebre", "ananas", "banane", "biscuit", "bouee", "camion", "flute", "fourmi", "ile", "pieuvre",
];

const REL_LABEL: Record<string, string> = {
  mere: "mère",
  pere: "père",
  tuteur_legal: "tuteur légal",
  autre_titulaire: "représentant légal",
};

type Json = Record<string, unknown>;

interface ChildRow {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
  club_id: string | null;
}

function escapeHtml(input: unknown): string {
  if (input === null || input === undefined) return "";
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Entier uniforme dans [0, n) (tirage par rejet, sans biais). */
function randomInt(n: number): number {
  const limit = Math.floor(0x100000000 / n) * n;
  const buf = new Uint32Array(1);
  do {
    crypto.getRandomValues(buf);
  } while (buf[0] >= limit);
  return buf[0] % n;
}

/** Code lisible : trois mots et deux chiffres, ex. « lune-velo-tigre-47 ». */
function generateCode(): string {
  const words = [0, 1, 2].map(() => WORDS[randomInt(WORDS.length)]);
  return `${words.join("-")}-${10 + randomInt(90)}`;
}

/** Tolérant à la saisie : majuscules, accents, espaces et tirets ignorés. */
function normalizeCode(code: string): string {
  return code
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function normalizeIdentifier(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim().toLowerCase();
  return /^[a-z0-9._-]{1,64}$/.test(value) ? value : null;
}

function childName(child: ChildRow): string {
  return child.nickname || [child.first_name, child.last_name].filter(Boolean).join(" ") || "votre enfant";
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Europe/Paris",
  }).format(new Date(iso));
}

function appOrigin(req: Request): string {
  const origin = req.headers.get("origin");
  return origin && isAllowedOrigin(origin) ? origin : "https://matchs360.fr";
}

function emailHtml(title: string, paragraphs: string[], cta?: { label: string; url: string }): string {
  return `
<div style="background:#f4f4f5;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;">
    <h1 style="margin:0 0 8px;font-size:20px;color:#3B82F6;">MATCHS360</h1>
    <h2 style="margin:0 0 16px;font-size:17px;color:#111827;">${escapeHtml(title)}</h2>
    ${paragraphs.map((p) => `<p style="font-size:14px;color:#374151;line-height:1.6;">${p}</p>`).join("\n")}
    ${
    cta
      ? `<a href="${cta.url}" style="display:block;background:#2563eb;color:white;text-decoration:none;padding:14px 24px;border-radius:8px;text-align:center;font-weight:600;margin:24px 0;">${escapeHtml(cta.label)}</a>`
      : ""
  }
  </div>
</div>`;
}

/**
 * Limite par appareil, persistante (table child_access_rate_log). Échec
 * fermé : en cas d'erreur de lecture, la demande est considérée comme limitée.
 */
async function isRateLimited(
  admin: SupabaseClient,
  ipHash: string,
  action: string,
  max: number,
  windowMs: number,
): Promise<boolean> {
  const since = new Date(Date.now() - windowMs).toISOString();
  const { count, error } = await admin
    .from("child_access_rate_log")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .eq("action", action)
    .gte("created_at", since);
  if (error) {
    console.error("child-access rate log read failed", error);
    return true;
  }
  if ((count ?? 0) >= max) return true;
  await admin.from("child_access_rate_log").insert({ ip_hash: ipHash, action });
  // Ménage opportuniste : rien au-delà de 2 jours n'est utile.
  await admin
    .from("child_access_rate_log")
    .delete()
    .lt("created_at", new Date(Date.now() - 2 * 24 * HOUR_MS).toISOString());
  return false;
}

async function clientIpHash(req: Request): Promise<string> {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("cf-connecting-ip") ||
    "unknown";
  return await sha256Hex(`child-access:${ip}`);
}

async function findChildByIdentifier(admin: SupabaseClient, identifier: string): Promise<ChildRow | null> {
  const { data } = await admin
    .from("profiles")
    .select("id, email, first_name, last_name, nickname, club_id")
    .eq("email", technicalEmailFor(identifier))
    .is("deleted_at", null)
    .maybeSingle();
  return (data as ChildRow | null) ?? null;
}

async function consentPending(admin: SupabaseClient, childId: string): Promise<boolean> {
  const { data, error } = await admin.rpc("minor_consent_pending", { _player_id: childId });
  if (error) {
    console.error("minor_consent_pending failed", error);
    return true; // échec fermé
  }
  return data === true;
}

async function childTeams(admin: SupabaseClient, childId: string): Promise<{ teamIds: string[]; clubIds: string[] }> {
  const { data } = await admin
    .from("team_members")
    .select("team_id, teams!inner(club_id)")
    .eq("user_id", childId)
    .eq("member_type", "player")
    .eq("is_active", true)
    .is("deleted_at", null);
  const rows = (data ?? []) as Array<{ team_id: string; teams: { club_id: string | null } | null }>;
  return {
    teamIds: rows.map((r) => r.team_id),
    clubIds: rows.map((r) => r.teams?.club_id).filter((c): c is string => !!c),
  };
}

/** Coachs référents de l'enfant ; à défaut, responsables de son club. */
async function staffToNotify(admin: SupabaseClient, child: ChildRow): Promise<string[]> {
  const { teamIds, clubIds } = await childTeams(admin, child.id);
  if (teamIds.length > 0) {
    const { data: refs } = await admin
      .from("team_members")
      .select("user_id")
      .in("team_id", teamIds)
      .eq("member_type", "coach")
      .eq("coach_role", "referent")
      .eq("is_active", true)
      .is("deleted_at", null);
    const ids = Array.from(new Set((refs ?? []).map((r: { user_id: string }) => r.user_id)));
    if (ids.length > 0) return ids;
  }
  const clubs = Array.from(new Set([...clubIds, ...(child.club_id ? [child.club_id] : [])]));
  if (clubs.length === 0) return [];
  const { data: admins } = await admin
    .from("user_roles")
    .select("user_id")
    .eq("role", "club_admin")
    .in("club_id", clubs);
  return Array.from(new Set((admins ?? []).map((r: { user_id: string }) => r.user_id)));
}

async function guardiansOf(
  admin: SupabaseClient,
  childId: string,
): Promise<Array<{ email: string; first_name: string | null; relationship: string }>> {
  const { data: consents } = await admin
    .from("parental_consents")
    .select("guardian_profile_id, relationship")
    .eq("minor_profile_id", childId)
    .is("revoked_at", null);
  const rows = (consents ?? []) as Array<{ guardian_profile_id: string; relationship: string }>;
  if (rows.length === 0) return [];
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, email, first_name")
    .in("id", rows.map((r) => r.guardian_profile_id));
  return ((profiles ?? []) as Array<{ id: string; email: string; first_name: string | null }>)
    .filter((p) => !!p.email)
    .map((p) => ({
      email: p.email,
      first_name: p.first_name,
      relationship: rows.find((r) => r.guardian_profile_id === p.id)?.relationship ?? "",
    }));
}

async function emailMany(recipients: string[], subject: string, html: string): Promise<void> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey || recipients.length === 0) return;
  const resend = new Resend(apiKey);
  for (const to of recipients) {
    try {
      const { error } = await sendEmail(resend, { from: getFromEmail(), to: [to], subject, html });
      if (error) console.error("child-access email failed", { subject, error });
    } catch (e) {
      console.error("child-access email exception", (e as Error)?.message);
    }
  }
}

/** Ferme les codes encore actifs et la demande ouverte de l'enfant. */
async function closeOpenAccess(admin: SupabaseClient, childId: string, exceptCodeId?: string): Promise<void> {
  const now = new Date().toISOString();
  let revoke = admin
    .from("child_access_codes")
    .update({ revoked_at: now })
    .eq("child_id", childId)
    .is("used_at", null)
    .is("revoked_at", null);
  if (exceptCodeId) revoke = revoke.neq("id", exceptCodeId);
  await revoke;
  await admin
    .from("child_access_requests")
    .update({ resolved_at: now })
    .eq("child_id", childId)
    .is("resolved_at", null);
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

async function handleRequest(req: Request, admin: SupabaseClient, body: Json): Promise<Json> {
  const genericOk = { ok: true };
  if (await isRateLimited(admin, await clientIpHash(req), "request", REQUEST_LIMIT_PER_HOUR, HOUR_MS)) {
    return genericOk;
  }
  const identifier = normalizeIdentifier(body.identifier);
  if (!identifier) return genericOk;
  const child = await findChildByIdentifier(admin, identifier);
  if (!child || (await consentPending(admin, child.id))) return genericOk;

  const now = new Date();
  const { data: open } = await admin
    .from("child_access_requests")
    .select("id, request_count, notified_at")
    .eq("child_id", child.id)
    .is("resolved_at", null)
    .maybeSingle();

  let requestId: string;
  if (open) {
    requestId = open.id;
    await admin
      .from("child_access_requests")
      .update({ last_request_at: now.toISOString(), request_count: (open.request_count ?? 1) + 1 })
      .eq("id", open.id);
    if (open.notified_at && now.getTime() - new Date(open.notified_at).getTime() < NOTIFY_INTERVAL_MS) {
      return genericOk; // déjà prévenus dans les dernières 24 h
    }
  } else {
    const { data: created, error } = await admin
      .from("child_access_requests")
      .insert({ child_id: child.id })
      .select("id")
      .single();
    if (error || !created) return genericOk; // demande concurrente déjà ouverte
    requestId = created.id;
  }

  const name = childName(child);
  const origin = appOrigin(req);
  const playerUrl = `${origin}/players/${child.id}`;

  // Coach référent (ou responsable du club) : notification + e-mail.
  const staffIds = await staffToNotify(admin, child);
  if (staffIds.length > 0) {
    const { error: notifErr } = await admin.from("notifications").insert(
      staffIds.map((uid) => ({
        user_id: uid,
        title: `Accès oublié — ${name}`,
        message:
          `${name} (identifiant ${identifier}) a oublié son mot de passe. ` +
          `Générez-lui un code d'accès depuis sa fiche.`,
        type: "info",
        link: `/players/${child.id}`,
      })),
    );
    if (notifErr) console.error("child-access staff notification failed", notifErr);

    const { data: staffProfiles } = await admin.from("profiles").select("email").in("id", staffIds);
    await emailMany(
      ((staffProfiles ?? []) as Array<{ email: string | null }>).map((p) => p.email).filter((e): e is string => !!e),
      `Accès oublié — ${name}`,
      emailHtml(
        "Un joueur a oublié son mot de passe",
        [
          `<strong>${escapeHtml(name)}</strong> (identifiant <strong style="font-family:monospace;">${escapeHtml(identifier)}</strong>) n'a pas d'adresse e-mail et a oublié son mot de passe.`,
          "Depuis sa fiche, cliquez sur « Générer l'accès » : un code à usage unique s'affiche, à lui remettre. Il choisira ensuite son propre mot de passe.",
          "S'il retrouve son mot de passe entre-temps, celui-ci reste valable.",
        ],
        { label: "Ouvrir la fiche du joueur", url: playerUrl },
      ),
    );
  }

  // Représentant légal : e-mail.
  const guardians = await guardiansOf(admin, child.id);
  await emailMany(
    guardians.map((g) => g.email),
    `${name} a demandé un nouveau mot de passe`,
    emailHtml(
      "Demande de nouveau mot de passe",
      [
        "Bonjour,",
        `<strong>${escapeHtml(name)}</strong> a indiqué avoir oublié son mot de passe MATCHS360 (identifiant <strong style="font-family:monospace;">${escapeHtml(identifier)}</strong>).`,
        "Vous pouvez lui en définir un nouveau depuis votre espace « Mes enfants ». Son coach peut aussi lui remettre un code d'accès.",
        "S'il retrouve son mot de passe, celui-ci reste valable : vous n'avez rien à faire.",
      ],
      { label: "Ouvrir « Mes enfants »", url: `${origin}/parent/my-children` },
    ),
  );

  await admin.from("child_access_requests").update({ notified_at: now.toISOString() }).eq("id", requestId);
  return genericOk;
}

async function handleGenerate(
  req: Request,
  admin: SupabaseClient,
  body: Json,
): Promise<{ status: number; body: Json }> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { status: 401, body: { error: "Authentification requise.", code: "AUTH_MISSING" } };
  const { data: callerData, error: callerErr } = await admin.auth.getUser(token);
  const caller = callerData?.user;
  if (callerErr || !caller) return { status: 401, body: { error: "Session invalide.", code: "AUTH_INVALID" } };

  const childId = typeof body.child_id === "string" ? body.child_id : "";
  if (!/^[0-9a-f-]{36}$/i.test(childId)) {
    return { status: 400, body: { error: "Joueur manquant.", code: "INPUT_MISSING_CHILD" } };
  }

  const { data: childData } = await admin
    .from("profiles")
    .select("id, email, first_name, last_name, nickname, club_id")
    .eq("id", childId)
    .is("deleted_at", null)
    .maybeSingle();
  const child = childData as ChildRow | null;
  if (!child) return { status: 404, body: { error: "Joueur introuvable.", code: "NOT_FOUND" } };

  // Autorisation : administrateur, responsable du club du joueur, ou coach
  // référent d'une de ses équipes actives.
  const { teamIds, clubIds } = await childTeams(admin, child.id);
  const { data: callerRoles } = await admin.from("user_roles").select("role, club_id").eq("user_id", caller.id);
  const roles = (callerRoles ?? []) as Array<{ role: string; club_id: string | null }>;
  const allClubs = new Set([...clubIds, ...(child.club_id ? [child.club_id] : [])]);
  const isAdmin = roles.some((r) => r.role === "admin");
  const isClubAdmin = roles.some((r) => r.role === "club_admin" && !!r.club_id && allClubs.has(r.club_id));
  let isReferent = false;
  if (!isAdmin && !isClubAdmin && teamIds.length > 0) {
    const { data: ref } = await admin
      .from("team_members")
      .select("id")
      .eq("user_id", caller.id)
      .eq("member_type", "coach")
      .eq("coach_role", "referent")
      .eq("is_active", true)
      .is("deleted_at", null)
      .in("team_id", teamIds)
      .limit(1);
    isReferent = (ref?.length ?? 0) > 0;
  }
  if (!isAdmin && !isClubAdmin && !isReferent) {
    return {
      status: 403,
      body: { error: "Réservé au coach référent du joueur et au responsable du club.", code: "FORBIDDEN" },
    };
  }

  if (!isTechnicalAddress(child.email)) {
    return {
      status: 400,
      body: {
        error: "Ce joueur a sa propre adresse e-mail : il récupère son accès avec « Mot de passe oublié ».",
        code: "NOT_TECHNICAL_ACCOUNT",
      },
    };
  }
  if (await consentPending(admin, child.id)) {
    return {
      status: 409,
      body: { error: "Le représentant légal n'a pas encore donné son consentement.", code: "MINOR_CONSENT_PENDING" },
    };
  }

  const { count: recentCount } = await admin
    .from("child_access_codes")
    .select("id", { count: "exact", head: true })
    .eq("created_by", caller.id)
    .gte("created_at", new Date(Date.now() - 24 * HOUR_MS).toISOString());
  if ((recentCount ?? 0) >= GENERATE_LIMIT_PER_DAY) {
    return {
      status: 429,
      body: { error: "Trop de codes générés aujourd'hui. Réessayez demain.", code: "RATE_LIMITED" },
    };
  }

  // Un seul code actif par enfant : les précédents sont annulés.
  await closeOpenAccess(admin, child.id);

  const code = generateCode();
  const salt = randomHex(16);
  const codeHash = await sha256Hex(`${salt}:${normalizeCode(code)}`);
  const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();

  const { data: inserted, error: insErr } = await admin
    .from("child_access_codes")
    .insert({ child_id: child.id, code_hash: codeHash, code_salt: salt, created_by: caller.id, expires_at: expiresAt })
    .select("id")
    .single();
  if (insErr || !inserted) {
    console.error("child access code insert failed", insErr);
    return { status: 500, body: { error: "Impossible de créer le code.", code: "INTERNAL_ERROR" } };
  }

  await admin.from("audit_log").insert({
    actor_id: caller.id,
    actor_role: isAdmin ? "admin" : isClubAdmin ? "club_admin" : "coach",
    action: "child_access_code_generated",
    table_name: "child_access_codes",
    record_id: inserted.id,
    after_data: { child_id: child.id, expires_at: expiresAt },
  });

  const name = childName(child);
  const identifier = identifierFromEmail(child.email) ?? "";
  const origin = appOrigin(req);
  const guardians = await guardiansOf(admin, child.id);
  await emailMany(
    guardians.map((g) => g.email),
    `Le club a créé un code d'accès pour ${name}`,
    emailHtml(
      "Code d'accès créé par le club",
      [
        "Bonjour,",
        `Le club a créé un code d'accès pour <strong>${escapeHtml(name)}</strong> (identifiant <strong style="font-family:monospace;">${escapeHtml(identifier)}</strong>). Il le lui remettra en main propre.`,
        `Ce code ne sert qu'une fois, jusqu'au ${escapeHtml(formatDate(expiresAt))} : ${escapeHtml(name)} s'en sert pour choisir son propre mot de passe. Son mot de passe actuel reste valable d'ici là.`,
        "Vous pouvez aussi définir vous-même son mot de passe depuis votre espace « Mes enfants ». Si vous n'êtes pas au courant de cette démarche, contactez le club.",
      ],
      { label: "Ouvrir « Mes enfants »", url: `${origin}/parent/my-children` },
    ),
  );

  return {
    status: 200,
    body: { ok: true, code, identifier, expires_at: expiresAt, child_name: name },
  };
}

async function handleRedeem(req: Request, admin: SupabaseClient, body: Json): Promise<Json> {
  if (await isRateLimited(admin, await clientIpHash(req), "redeem", REDEEM_LIMIT_PER_HOUR, HOUR_MS)) {
    return { error: "RATE_LIMITED" };
  }
  const identifier = normalizeIdentifier(body.identifier);
  const code = typeof body.code === "string" ? normalizeCode(body.code) : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!identifier || !code) return { error: "INVALID_CODE" };

  // Vérifié AVANT le code : un mot de passe refusé ne doit jamais renseigner
  // sur la validité du code.
  if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    return { error: "PASSWORD_POLICY" };
  }

  const child = await findChildByIdentifier(admin, identifier);
  if (!child || (await consentPending(admin, child.id))) return { error: "INVALID_CODE" };

  const { data: active } = await admin
    .from("child_access_codes")
    .select("id, code_hash, code_salt, failed_attempts")
    .eq("child_id", child.id)
    .is("used_at", null)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!active) return { error: "INVALID_CODE" };

  const candidate = await sha256Hex(`${active.code_salt}:${code}`);
  if (!timingSafeEqual(candidate, active.code_hash)) {
    const attempts = (active.failed_attempts ?? 0) + 1;
    const locked = attempts >= MAX_FAILED_ATTEMPTS;
    await admin
      .from("child_access_codes")
      .update({ failed_attempts: attempts, ...(locked ? { revoked_at: new Date().toISOString() } : {}) })
      .eq("id", active.id);
    return { error: locked ? "CODE_LOCKED" : "INVALID_CODE" };
  }

  const { error: pwErr } = await admin.auth.admin.updateUserById(child.id, { password });
  if (pwErr) {
    console.error("child password update failed", pwErr);
    return /password/i.test(pwErr.message ?? "") ? { error: "PASSWORD_POLICY" } : { error: "UPDATE_FAILED" };
  }

  const usedAt = new Date().toISOString();
  await admin.from("child_access_codes").update({ used_at: usedAt }).eq("id", active.id);
  await closeOpenAccess(admin, child.id, active.id);

  await admin.from("audit_log").insert({
    actor_id: child.id,
    actor_role: "player",
    action: "child_access_code_redeemed",
    table_name: "child_access_codes",
    record_id: active.id,
    after_data: { child_id: child.id },
  });

  // Le parent est prévenu : c'est aussi ce qui révélerait une utilisation du
  // code par quelqu'un d'autre que l'enfant.
  const name = childName(child);
  const guardians = await guardiansOf(admin, child.id);
  await emailMany(
    guardians.map((g) => g.email),
    `Nouveau mot de passe pour ${name}`,
    emailHtml(
      "Nouveau mot de passe choisi",
      [
        "Bonjour,",
        `Le code d'accès de <strong>${escapeHtml(name)}</strong> a été utilisé le ${escapeHtml(formatDate(usedAt))} pour choisir un nouveau mot de passe.`,
        `Si ce n'est pas ${escapeHtml(name)} qui l'a fait, redéfinissez son mot de passe depuis votre espace « Mes enfants » et prévenez le club.`,
      ],
      { label: "Ouvrir « Mes enfants »", url: `${appOrigin(req)}/parent/my-children` },
    ),
  );

  return { ok: true };
}

// ---------------------------------------------------------------------------

Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  const cors = buildCorsHeaders(req);
  const reply = (body: Json, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceKey) return reply({ error: "INTERNAL_ERROR" }, 500);
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    let body: Json = {};
    try {
      body = await req.json();
    } catch {
      return reply({ error: "INVALID_JSON" }, 400);
    }

    switch (body.action) {
      case "request":
        return reply(await handleRequest(req, admin, body));
      case "redeem":
        return reply(await handleRedeem(req, admin, body));
      case "generate": {
        const result = await handleGenerate(req, admin, body);
        return reply(result.body, result.status);
      }
      default:
        return reply({ error: "UNKNOWN_ACTION" }, 400);
    }
  } catch (e) {
    console.error("child-access fatal", (e as Error)?.message);
    return reply({ error: "INTERNAL_ERROR" }, 500);
  }
});
