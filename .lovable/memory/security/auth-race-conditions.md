---
name: Auth Race Conditions Hardening
description: useAuth utilise un ticket anti-race + purge atomique pour éviter les leaks cross-user (F-307)
type: design
---
`src/hooks/useAuth.tsx` se protège contre les races entre événements `onAuthStateChange` concurrents :
- `authTicketRef` incrémenté à chaque transition d'utilisateur ; les fetchs `fetchProfile`/`fetchRoles` comparent leur ticket au moment du `setState` et abandonnent si désynchronisés (évite qu'un fetch lent de l'user A écrase le state de l'user B).
- `loadedUserIdRef` détecte les transitions A → B et purge IMMÉDIATEMENT `profile`, `roles`, `currentRole` + `queryClient.clear()` AVANT de charger le nouvel utilisateur (élimine la fenêtre où des composants verraient `roles_A + user_B`).
- `loadUserContext` charge profile + roles via `Promise.all` puis `setLoading(false)` UNE SEULE FOIS à la fin (plus de `loading=false` prématuré qui exposait des composants protégés avec `roles=[]`).
- Ne pas réintroduire d'appel direct à `fetchProfile`/`fetchRoles` sans ticket.
