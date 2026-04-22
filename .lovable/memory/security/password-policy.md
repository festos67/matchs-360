---
name: Password Policy Standards
description: Min length 12 (user) / 14 (admin reset), HIBP enabled, centralized in src/lib/password-policy.ts
type: feature
---
Politique mot de passe alignée OWASP ASVS 2021 + CNIL 2022-100 :
- USER_MIN_LENGTH = 12 (signup, reset, invite, self-change) — `userPasswordSchema`
- ADMIN_MIN_LENGTH = 14 (admin-users edge function `update-password` / `test-update-password`)
- MAX_LENGTH = 128
- Pas de complexité forcée (NIST recommande contre)
- HIBP (pwned password detection) activé via Supabase Auth (configure_auth password_hibp_enabled=true)
- Validation centralisée dans `src/lib/password-policy.ts` (validateUserPassword, validateAdminPassword)
- Surfaces couvertes : Auth.tsx (signup + test-mode reset), ResetPassword.tsx, InviteAccept.tsx, Profile.tsx (self-change), ClubUsers.tsx + AdminUsers.tsx (admin reset), supabase/functions/admin-users/index.ts
