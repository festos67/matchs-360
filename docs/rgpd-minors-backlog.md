# RGPD mineurs — backlog & notes

## Statut de conformite (post Phase 6)

Les 6 phases de mise en conformite RGPD mineurs sont deployees. Le
blocage Phase 0 ("adultes only") est leve : les inscriptions de mineurs
sont ouvertes avec les protections suivantes :

- Phase 1 : detection age (`is_minor`, `requires_parental_consent`).
- Phase 2 : consentement parental (`parental_consents`, edge function
  `record-parental-consent`, ecran `GuardianConsent`).
- Phase 3 : droit a l'image (bucket prive `user-photos-minors`, signed URLs).
- Phase 4 : masquage entre pairs (`profiles_safe`), journal d'acces
  (`minor_data_access_log`), notifications parentales (`pending_notifications`).
- Phase 5 : droits parentaux — acces (art. 15), portabilite (art. 20),
  effacement (art. 17) via `/parent/my-children` et les edge functions
  `export-minor-data`, `request-erasure`, `execute-erasure`.
- Phase 6 : gouvernance d'activation (`govern_minor_activation`),
  watermark PDF mineur, surnom protege, retention 3 ans.

## Backlog A2-014 — captation video / photo d'action

**A NE PAS DEPLOYER SANS CONFORMITE PREALABLE.**

Si une fonctionnalite de captation video ou photo d'action (match,
entrainement) est ajoutee, elle doit imperativement :

1. Faire l'objet d'un **consentement parental SPECIFIQUE** pour les
   mineurs, distinct du droit a l'image deja capture pour la photo de
   profil (Phase 3, `image_rights_consent_*`).
2. Etendre `parental_consents.consent_scope` avec une cle dediee
   (ex. `video_capture_action: true`).
3. Etendre le bucket prive ou en creer un nouveau (`user-videos-minors`)
   avec les memes regles que `user-photos-minors`.
4. Tracer chaque acces video dans `minor_data_access_log`
   (`access_type='video_view'`).
5. Permettre la revocation independante du consentement video.
6. Inclure cette categorie dans l'export `export-minor-data` (art. 20)
   et la purge `execute-erasure` (art. 17).

## Retention

- `purge_old_minor_evaluations()` anonymise (UPDATE, jamais DELETE) les
  commentaires d'evaluations de mineurs ayant quitte leur club depuis
  plus de 3 ans. Programme mensuellement via pg_cron.
- `execute-erasure` (cron quotidien 03:00 UTC) execute les demandes
  d'effacement validees apres 7 jours de grace.

## Rollback Phase 6 (urgence uniquement)

En cas d'incident grave et necessite de re-bloquer les inscriptions de
mineurs :

```sql
DROP TRIGGER IF EXISTS trg_govern_minor_activation ON public.profiles;
CREATE TRIGGER trg_block_minor_signup_phase0
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.block_minor_signup_phase0();
```

La fonction `block_minor_signup_phase0()` est conservee a cet effet.