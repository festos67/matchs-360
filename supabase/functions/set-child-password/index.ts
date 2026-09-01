/**
 * Edge function : set-child-password
 *
 * Le representant legal definit ou reinitialise le mot de passe de son enfant
 * mineur, puis le lui transmet.
 *
 * Pourquoi cette fonction existe : un joueur de moins de 15 ans inscrit sans
 * adresse e-mail recoit un identifiant technique. Aucun courrier ne peut donc
 * lui parvenir — ni invitation, ni lien de reinitialisation. Sans un tiers de
 * confiance pour poser son mot de passe, son compte resterait inaccessible.
 * C'est exactement ce qui bloque aujourd'hui la quasi-totalite des mineurs
 * deja inscrits.
 *
 * Securite :
 *  - le caller doit etre authentifie
 *  - il doit etre titulaire de l'autorite parentale sur l'enfant vise, verifie
 *    cote serveur par is_legal_guardian_of() — jamais sur la foi du client
 *  - l'enfant doit etre reellement mineur : on ne redefinit pas le mot de
 *    passe d'un majeur, meme avec un consentement passe non revoque
 *  - longueur minimale alignee sur la politique utilisateur (12)
 *  - l'operation est tracee dans audit_log
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCorsHeaders, handleCorsPreflight } from "../_shared/cors.ts";

const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 128;

interface Body {
  child_id: string;
  password: string;
}

const handler = async (req: Request): Promise<Response> => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;
  const cors = buildCorsHeaders(req);

  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", ...cors },
    });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "AUTH_MISSING" }, 401);
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
      return json({ error: "AUTH_INVALID" }, 401);
    }
    const guardianId = claims.claims.sub as string;

    let body: Body;
    try {
      body = await req.json();
    } catch {
      return json({ error: "INVALID_JSON" }, 400);
    }

    const childId = typeof body?.child_id === "string" ? body.child_id : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!childId) return json({ error: "INPUT_MISSING_CHILD" }, 400);
    if (childId === guardianId) return json({ error: "SELF_TARGET_FORBIDDEN" }, 400);
    if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
      return json(
        { error: "PASSWORD_POLICY", message: `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caracteres.` },
        400,
      );
    }

    // Preuve de filiation : la meme que celle qui gouverne l'acces du parent
    // aux donnees de l'enfant. Repose sur un consentement parental non revoque.
    const { data: isGuardian, error: guardErr } = await admin.rpc("is_legal_guardian_of", {
      _guardian_id: guardianId,
      _minor_id: childId,
    });
    if (guardErr) {
      console.error("is_legal_guardian_of failed", guardErr);
      return json({ error: "GUARDIAN_CHECK_FAILED" }, 500);
    }
    if (isGuardian !== true) {
      return json({ error: "NOT_LEGAL_GUARDIAN" }, 403);
    }

    // Un consentement non revoque peut survivre a la majorite de l'enfant :
    // on refuse alors de toucher au compte, qui appartient a un adulte.
    const { data: childIsMinor, error: minorErr } = await admin.rpc("is_minor", {
      _profile_id: childId,
    });
    if (minorErr) {
      console.error("is_minor failed", minorErr);
      return json({ error: "AGE_CHECK_FAILED" }, 500);
    }
    if (childIsMinor !== true) {
      return json({ error: "CHILD_IS_ADULT" }, 403);
    }

    const { error: updateErr } = await admin.auth.admin.updateUserById(childId, {
      password,
    });
    if (updateErr) {
      console.error("child password update failed", updateErr);
      return json({ error: "UPDATE_FAILED" }, 500);
    }

    // Trace sans jamais consigner le mot de passe lui-meme.
    await admin.from("audit_log").insert({
      actor_id: guardianId,
      actor_role: "guardian",
      action: "child_password_set",
      table_name: "auth.users",
      record_id: childId,
      after_data: { by: "legal_guardian" },
    });

    return json({ ok: true }, 200);
  } catch (e) {
    console.error("set-child-password fatal", e);
    return json({ error: "INTERNAL_ERROR" }, 500);
  }
};

Deno.serve(handler);
