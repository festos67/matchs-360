/**
 * @module default-competences
 * @description Catalogue des compétences par défaut proposées dans
 *              l'attestation de compétences. Reprend les compétences
 *              transversales du référentiel type MATCHS360.
 */
export interface DefaultCompetence {
  name: string;
  definition: string;
}

export const DEFAULT_COMPETENCES: DefaultCompetence[] = [
  { name: "Engagement", definition: "Capacité à s'investir pleinement et avec constance dans les entraînements, les matchs et la vie d'équipe." },
  { name: "Respect", definition: "Attitude respectueuse envers les coéquipiers, l'adversaire, les arbitres, l'encadrement et les règles du jeu." },
  { name: "Confiance en soi", definition: "Capacité à croire en ses moyens, à oser entreprendre et à assumer ses choix sur le terrain comme en dehors." },
  { name: "Gestion des émotions", definition: "Capacité à reconnaître, exprimer et réguler ses émotions dans les moments de pression, de réussite ou d'échec." },
  { name: "Dépassement de soi", definition: "Volonté de repousser ses limites, de fournir des efforts soutenus pour progresser au-delà du niveau attendu." },
  { name: "Communication", definition: "Capacité à transmettre clairement ses idées, écouter les autres et favoriser les échanges constructifs au sein du groupe." },
  { name: "Compétences relationnelles", definition: "Aptitude à créer du lien, à coopérer, à entretenir des relations positives avec les autres membres du collectif." },
  { name: "Capacité d'apprentissage", definition: "Capacité à intégrer rapidement de nouveaux savoirs, gestes ou consignes et à les mettre en pratique." },
  { name: "Organisation", definition: "Capacité à planifier ses tâches, à gérer son temps et son matériel et à structurer son activité de manière efficace." },
  { name: "Adaptabilité", definition: "Capacité à ajuster son comportement, son jeu ou ses choix face à des situations nouvelles ou inattendues." },
  { name: "Autonomie", definition: "Capacité à agir, décider et progresser par soi-même sans nécessiter une supervision permanente." },
  { name: "Patience", definition: "Capacité à persévérer dans l'effort et à accepter que les progrès s'inscrivent dans la durée." },
  { name: "Curiosité", definition: "Envie de découvrir, de questionner et d'apprendre continuellement de nouvelles choses sur soi, le sport et les autres." },
];