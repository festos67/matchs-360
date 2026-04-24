---
name: Token Storage Strategy
description: Tokens Supabase stockés en sessionStorage (pas localStorage) — purge à fermeture onglet, mitigation XSS
type: design
---
Les JWT Supabase (access + refresh) sont stockés via `sessionStorage` dans `src/integrations/supabase/client.ts` (option `auth.storage`). Conséquences :
- Session purgée à la fermeture de l'onglet/navigateur (pas de persistance multi-session).
- Réduit drastiquement la fenêtre d'exfiltration des tokens en cas de XSS.
- Couplé à la CSP stricte (`script-src 'self'`, `frame-ancestors 'none'`) d'index.html.
- Ne pas revenir à localStorage : décision sécurité (F-702).
