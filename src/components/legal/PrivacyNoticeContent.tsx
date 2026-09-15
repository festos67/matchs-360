/**
 * @component PrivacyNoticeContent
 * @description Texte de la notice d'information sur les données personnelles,
 *              commun à la page publique /confidentialite et à la fenêtre
 *              d'accusé de lecture. Rédigé simplement pour être compris par
 *              tous les utilisateurs, mineurs compris.
 * @maintenance Toute modification du fond impose d'incrémenter
 *              PRIVACY_NOTICE_VERSION (src/lib/privacy-notice.ts). Les durées
 *              de conservation reprennent les tâches planifiées en base
 *              (purge_old_evaluations, purge_old_audit_log,
 *              purge_old_invitations, erasure_requests.scheduled_for).
 */
import type { ReactNode } from "react";
import { PRIVACY_NOTICE_VERSION_LABEL } from "@/lib/privacy-notice";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <div className="text-sm text-muted-foreground leading-relaxed space-y-2">{children}</div>
    </section>
  );
}

export function PrivacyNoticeContent() {
  return (
    <div className="space-y-5">
      <Section title="Qui est responsable de vos données ?">
        <p>
          Le club auquel vous êtes rattaché décide de l'utilisation de vos données :
          il en est responsable. MATCHS360 est la plateforme qu'il utilise pour suivre
          la progression sportive de ses membres. Pour toute question, adressez-vous
          d'abord au responsable de votre club.
        </p>
      </Section>

      <Section title="Quelles données ?">
        <ul className="list-disc pl-5 space-y-1">
          <li>Votre identité : nom, prénom, surnom, date de naissance, adresse e-mail.</li>
          <li>Votre club, vos équipes et votre rôle (joueur, coach, supporter, responsable).</li>
          <li>Votre photo, uniquement si son affichage est autorisé.</li>
          <li>
            Le suivi sportif : débriefs, notes et commentaires, objectifs, auto-débriefs
            et avis des supporters.
          </li>
          <li>Pour un joueur mineur : le consentement de son représentant légal et son attestation.</li>
          <li>Un journal de sécurité des actions importantes.</li>
        </ul>
      </Section>

      <Section title="Pour quoi faire ?">
        <ul className="list-disc pl-5 space-y-1">
          <li>Suivre et accompagner la progression sportive des joueurs.</li>
          <li>
            Permettre aux coachs, aux joueurs, aux supporters et aux parents d'échanger
            sur cette progression.
          </li>
          <li>Envoyer les e-mails utiles : invitations, demandes de débrief, notifications.</li>
          <li>Sécuriser la plateforme et prouver les consentements recueillis.</li>
        </ul>
      </Section>

      <Section title="Qui peut les voir ?">
        <ul className="list-disc pl-5 space-y-1">
          <li>Vous-même.</li>
          <li>Les coachs et les responsables de votre club.</li>
          <li>Les supporters rattachés à un joueur, uniquement pour ce joueur.</li>
          <li>Pour un joueur mineur, son représentant légal.</li>
          <li>Les administrateurs de la plateforme, pour l'assistance et la sécurité.</li>
        </ul>
      </Section>

      <Section title="Et pour les mineurs ?">
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong className="text-foreground">Moins de 15 ans :</strong> aucune action n'est
            possible sur le compte tant qu'un représentant légal n'a pas donné son accord.
            Lui seul autorise la photo et l'auto-débrief.
          </li>
          <li>
            <strong className="text-foreground">De 15 à 17 ans :</strong> la photo n'est affichée
            qu'avec l'autorisation d'un parent, enregistrée par le club.
          </li>
          <li>
            <strong className="text-foreground">18 ans et plus :</strong> vous décidez vous-même de
            l'affichage de votre photo, depuis votre profil.
          </li>
        </ul>
      </Section>

      <Section title="Combien de temps ?">
        <ul className="list-disc pl-5 space-y-1">
          <li>
            Débriefs : les 30 derniers débriefs de coach, les 10 derniers auto-débriefs et les
            10 derniers avis de supporters de chaque joueur restent disponibles ; les plus anciens
            sont retirés.
          </li>
          <li>Journal de sécurité : 1 an.</li>
          <li>Invitations expirées ou annulées : supprimées après 90 jours.</li>
          <li>
            Votre compte : anonymisé 7 jours après une demande de suppression, annulable pendant
            ce délai.
          </li>
        </ul>
      </Section>

      <Section title="Où sont-elles stockées ?">
        <p>
          La base de données est hébergée par Supabase dans l'Union européenne (Irlande).
          Le site est hébergé par OVHcloud. Les e-mails sont envoyés par le service Resend.
        </p>
      </Section>

      <Section title="Vos droits">
        <ul className="list-disc pl-5 space-y-1">
          <li>Consulter et télécharger vos données : « Mon profil », puis « Exporter mes données ».</li>
          <li>Corriger vos informations : « Mon profil », ou demandez à votre club.</li>
          <li>Supprimer votre compte : « Mon profil », puis « Supprimer mon compte ».</li>
          <li>
            Retirer une autorisation : la photo depuis « Mon profil » (majeurs) ; les parents
            depuis « Mes consentements ».
          </li>
          <li>
            En cas de désaccord, vous pouvez adresser une réclamation à la CNIL (
            <a
              href="https://www.cnil.fr"
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline"
            >
              cnil.fr
            </a>
            ).
          </li>
        </ul>
      </Section>

      <p className="text-xs text-muted-foreground">Version du {PRIVACY_NOTICE_VERSION_LABEL}.</p>
    </div>
  );
}
