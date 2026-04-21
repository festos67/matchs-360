# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)

## Sécurité

### Buckets publics `club-logos` et `user-photos`
Les buckets de stockage `club-logos` et `user-photos` sont configurés en **accès public** pour permettre l'affichage des images dans l'interface sans nécessiter d'authentification préalable.

#### Pourquoi ce choix ?
- **Paths non énumérables** : Les fichiers sont stockés avec des chemins basés sur des UUID (Universally Unique Identifiers), rendant impossible l'énumération par force brute sans connaître les identifiants exacts.
- **Performances** : Les avatars et logos sont affichés fréquemment dans les listes, cartes et exports PDF ; les URLs signées impliqueraient une latence supplémentaire et une complexité de gestion du cache.

#### Mitigations en place
- **UUID comme barrière** : Les paths suivent le format `<bucket>/<uuid>/<timestamp>_<filename>.jpg` — une entropie suffisante pour empêcher la découverte de fichiers.
- **Validation des uploads** :
  - Taille maximale : 5 Mo
  - Types MIME stricts : `image/jpeg`, `image/png`
  - Recadrage côté client avant envoi (cropping + compression)
- **RLS sur les métadonnées** : L'accès aux tables `profiles.photo_url` et `clubs.logo_url` est protégé par Row Level Security (RLS) — seuls les utilisateurs autorisés peuvent modifier ces champs.
- **Prévention du listing** : Les buckets sont configurés sans listing de répertoire ; seul l'accès direct à un fichier connu est autorisé.
- **Nettoyage automatique** : Les anciennes images sont purgées lors des mises à jour pour éviter l'accumulation de fichiers orphelins.
- **Exports PDF** : Pour les impressions (`PrintablePlayerSheet`, `PrintableFramework`), les images sont pré-chargées en base64 via le hook `useImageAsBase64` afin d'éviter les problèmes CORS et garantir la fiabilité des exports.
