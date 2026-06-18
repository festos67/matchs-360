# Guide de déploiement — matchs-360 sur OVH (hébergement mutualisé)

Le site est buildé et déployé automatiquement par GitHub Actions
(`.github/workflows/deploy.yml`) à chaque push sur `main`.

## 1. Prérequis : activer le SSL (À FAIRE AVANT le premier déploiement)
Le `.htaccess` force HTTPS et envoie un HSTS de 2 ans. **Sans SSL actif, le site
devient inaccessible.**
1. Espace client OVH → Hébergements → matchs360.fr → onglet **Multisite** (ou SSL).
2. Activer le **certificat SSL gratuit (Let's Encrypt)** et attendre l'état « actif ».

## 2. Secrets GitHub (une seule fois)
GitHub → repo → **Settings → Secrets and variables → Actions → New repository secret** :

| Secret | Valeur | Où la trouver |
|---|---|---|
| `FTP_SERVER` | `ftp.cluster129.hosting.ovh.net` | mail OVH « Hébergement » |
| `FTP_USERNAME` | identifiant FTP | Espace OVH → Hébergement → **FTP-SSH** |
| `FTP_PASSWORD` | mot de passe FTP | défini/réinitialisable dans **FTP-SSH** |

⚠️ Ne jamais committer ces valeurs dans le dépôt — uniquement en secrets GitHub.

## 3. Dossier de destination
Par défaut, le site principal d'un mutualisé est servi depuis `/www/`
(`server-dir: ./www/` dans le workflow). Si matchs360.fr est rattaché à un
sous-dossier via **Multisite**, adapter `server-dir` en conséquence.

## 4. Comment déployer
- **Automatique** : tout push sur `main` (y compris via Lovable) déclenche build + déploiement.
- **Manuel** : onglet **Actions** → « Build & Deploy to OVH » → **Run workflow**.

## 5. Vérifier après déploiement
- Le site répond en **https://** (cadenas).
- Rafraîchir une route profonde (ex. `/dashboard`) ne renvoie PAS un 404 Apache
  (le fallback SPA du `.htaccess` fonctionne).
- Headers présents (DevTools → Network → document) : `Strict-Transport-Security`,
  `X-Frame-Options`, `X-Content-Type-Options`.

## 6. À venir (non couvert ici)
- **Pipeline Supabase** (migrations + edge functions) — workflow séparé, Étape 4.
- **Cutover** : retrait de `.env` du dépôt (vars en GitHub Variables) + retrait de
  `lovable-tagger` quand l'édition Lovable sera abandonnée — Étape 5.