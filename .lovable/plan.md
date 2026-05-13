## Fonctionnalité : Attestation de compétences

Nouvelle fonctionnalité permettant aux **Responsables Club** et **Coachs** de générer une attestation/diplôme PDF pour un joueur.

### 1. Point d'entrée UI

**Dans la fiche joueur (`PlayerSidebar.tsx`)** :
- Nouveau cadre dédié sous "Gestion", visible uniquement si `canEvaluate || canMutate` (coach/club admin) et `!isPlayerViewingOwnProfile`.
- Bouton **"+ Attestation de compétences"** stylé vert (équivalent du bouton orange "Nouveau débrief") :
  - Bordure : `border-green-500/50 hover:border-green-500`
  - Icône `Plus` et `Award` en `text-green-500`
- Au clic : ouvre la modale `CompetenceCertificateModal`.

**Dans la sidebar gauche (`Sidebar.tsx` + `MobileSidebar.tsx`)** :
- Raccourci "Attestation de compétences" visible uniquement pour les rôles `coach` et `club_admin`.
- Au clic : ouvre un sélecteur de joueur (réutilise `PlayerSelector`) puis la modale.

### 2. Modale formulaire `CompetenceCertificateModal`

Modale standard (`max-h-85vh`, scroll interne, AlertDialog anti-cancel sur clic extérieur) avec les champs :

| Champ | Type | Obligatoire |
|---|---|---|
| Garant (nom) | Input texte (pré-rempli avec nom user courant) | Oui |
| Période d'accompagnement | Input texte (ex: "Sept. 2024 — Juin 2025") | Non |
| Compétences observées | Liste d'étiquettes (1 à 10) | ≥ 1 |
| Message complémentaire | Textarea | Non |
| Inclure dernier diagramme radar | Checkbox + Select parmi les 3 derniers débriefs coach | Non |

**Gestion des compétences (étiquettes)** :
- Bouton "Choisir dans le catalogue" → popover/select listant les 13 compétences prédéfinies (Engagement, Respect, Confiance en soi, Gestion des émotions, Dépassement de soi, Communication, Compétences relationnelles, Capacité d'apprentissage, Organisation, Adaptabilité, Autonomie, Patience, Curiosité) avec leur définition.
- Bouton "Créer une étiquette vierge" → ajoute une étiquette vide éditable.
- Chaque étiquette ajoutée est éditable (nom + définition) et supprimable.
- Limite 10 affichée.

**Anti-fermeture accidentelle** : interception `onPointerDownOutside` / `onEscapeKeyDown` → AlertDialog "Annuler la saisie ?".

### 3. Workflow validation

1. Clic "Valider" → ouvre une modale **prévisualisation PDF** (composant `PrintableCertificate` rendu offscreen + génération via `html2canvas` + `jsPDF`, ou via `react-to-print` cohérent avec l'existant `PrintablePlayerSheet`).
2. Question 1 : "Souhaitez-vous encore faire des modifications ?" → Oui réouvre le formulaire avec valeurs conservées / Non passe à l'étape 2.
3. Question 2 : "Souhaitez-vous enregistrer le résultat ?" → Oui déclenche le téléchargement PDF / Non ferme.

### 4. Composant `PrintableCertificate.tsx`

Apparence diplôme classique (A4 paysage), incluant :
- Logo MATCHS360 (haut gauche)
- Logo + nom du club (selon `teamMembership.team.club`)
- Titre "Attestation de compétences"
- Nom du joueur (grande typographie)
- Liste des compétences sous forme d'étiquettes/cards (nom + définition)
- Message complémentaire si présent
- Diagramme radar (réutilise `PrintableRadarChart`) si coché
- Période d'accompagnement si renseignée
- Date du jour
- Nom du garant + libellé "Garant"
- Bordure décorative type diplôme, palette couleurs club

### 5. Catalogue des compétences

Constante `DEFAULT_COMPETENCES` dans `src/lib/default-competences.ts` :
```
[
  { name: "Engagement", definition: "..." },
  { name: "Respect", definition: "..." },
  ...13 entrées
]
```
Définitions reprises du référentiel type existant.

### 6. Permissions

- Aucun changement DB nécessaire (génération PDF locale, pas de stockage).
- Visibilité : contrôlée côté UI via les flags `canEvaluate` / `canMutate` (déjà calculés dans `PlayerDetail.tsx`) et le rôle dans la sidebar.

### 7. Fichiers impactés

Nouveaux :
- `src/components/certificate/CompetenceCertificateModal.tsx`
- `src/components/certificate/PrintableCertificate.tsx`
- `src/components/certificate/CompetenceTagEditor.tsx`
- `src/lib/default-competences.ts`

Modifiés :
- `src/components/player/PlayerSidebar.tsx` (nouveau cadre + bouton)
- `src/pages/PlayerDetail.tsx` (état modale, props)
- `src/components/layout/Sidebar.tsx` + `MobileSidebar.tsx` (raccourci coach/club_admin)

### Notes techniques
- Génération PDF : aligner sur l'approche existante (`PrintablePlayerSheet` utilise probablement `react-to-print` ou impression navigateur). Je vérifierai et réutiliserai la même stack.
- Le radar du diplôme réutilisera `PrintableRadarChart` pour cohérence.
- Mémoire à ajouter : `mem://features/competence-certificate` documentant la fonctionnalité.
