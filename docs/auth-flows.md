# Flows auth — règles strictes

## Composants consommant un hash URL `#access_token=...&type=...`

S'applique à : `InviteAccept.tsx`, `ResetPassword.tsx`, et tout futur
composant traitant un magic link / token de récupération / invitation.

### Règles obligatoires

1. **Extraire et valider `type` AVANT toute opération auth** (`invite`,
   `recovery`, etc.). Refuser immédiatement si le type ne correspond pas
   au composant.
2. **Forcer `signOut({ scope: "global" })`** pour purger toute session
   pré-existante (locale + révocation des refresh tokens des autres
   devices). `scope: "local"` est insuffisant.
3. **Nettoyer le hash via `window.history.replaceState` AVANT
   `setSession`**. Sinon le SDK Supabase auto-détecte le hash et fire un
   `SIGNED_IN` parasite intercepté par le listener global du `useAuth`.
4. **Appeler `setSession({ access_token, refresh_token })` explicitement**
   plutôt qu'attendre un event `onAuthStateChange`. Synchrone et
   déterministe.
5. **Valider l'identité côté serveur après `setSession`** (lookup
   `invitations` / `password_resets` par email) pour rejeter les tokens
   métier expirés ou révoqués.
6. **Garder un `useRef(false)` (consumedRef)** pour empêcher la double
   exécution du `useEffect` (React 18 StrictMode en dev).

### Anti-patterns à éviter

- ❌ **Ne JAMAIS** utiliser `onAuthStateChange` pour décider de
  l'acceptation d'un flow critique. Les events sont asynchrones et
  peuvent être déclenchés par d'autres causes (auto-refresh, signin
  parallèle dans un autre tab).
- ❌ **Ne JAMAIS** accepter `SIGNED_IN` ou `TOKEN_REFRESHED` indistinctement
  comme trigger d'un flow invite/recovery.
- ❌ **Ne JAMAIS** utiliser `getSession()` en fallback : renvoie
  potentiellement une session pré-existante non-invite (vecteur R3 /
  F-303).
- ❌ **Ne JAMAIS** nettoyer le hash APRÈS `setSession` (Supabase a déjà
  réagi à l'auto-detect en parallèle).

## Historique

- **F-303** (2026-04-24) : Account Takeover initial — fix signOut local.
- **R3 / A3-001** (2026-04-27) : Régression listener trop permissif —
  refactor déterministe `setSession` explicite, scope `global`, validation
  email côté DB.
- **F-304** : `ResetPassword` — n'accepte que `PASSWORD_RECOVERY`, pas de
  fallback `getSession()`.
- **F-305** : signOut global après update password (à coupler).

## Tests de non-régression

1. Nominal : utilisateur clique son lien invite → set password → login OK.
2. Session pré-existante : utilisateur Bob logué colle l'URL invite
   d'Alice → Bob est déconnecté (signOut global), session Alice établie,
   formulaire affiche email Alice.
3. Invitation cancelled en DB, lien Supabase encore valide → phase erreur,
   session purgée.
4. Lien invalide (mauvais type/token) → phase erreur, pas de session.
5. Hash absent → phase erreur immédiate.
6. DevTools → Event Listeners : `onAuthStateChange` du `useAuth` global
   uniquement, aucun listener additionnel d'`InviteAccept`.