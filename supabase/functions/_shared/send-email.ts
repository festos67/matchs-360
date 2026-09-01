/**
 * Garde-fou d'envoi.
 *
 * Les joueurs mineurs sans adresse e-mail recoivent une adresse TECHNIQUE qui
 * ne correspond a aucune boite reelle. Le risque n'est pas qu'un courrier
 * arrive quelque part — c'est le REBOND : chaque envoi vers une adresse
 * inexistante est comptabilise par Resend, et des rebonds repetes degradent la
 * reputation d'expedition du domaine, jusqu'a ce que les invitations et
 * demandes de consentement legitimes finissent en indesirables.
 *
 * Il y a une vingtaine de points d'envoi repartis dans une dizaine de
 * fonctions. Plutot que d'ajouter un test a chacun — et d'oublier ceux qui
 * seront ecrits plus tard — on passe par cet enveloppeur :
 *
 *     await resend.emails.send({ ... })   ->   await sendEmail(resend, { ... })
 *
 * Les destinataires techniques sont retires ; si la liste devient vide,
 * l'envoi est abandonne silencieusement et journalise. Un abandon n'est
 * JAMAIS une erreur : ne pas ecrire a une adresse fictive est le comportement
 * attendu, pas un incident.
 */
import { isTechnicalAddress } from "./technical-identity.ts";

export interface OutboundEmail {
  from: string;
  to: string[];
  subject: string;
  html: string;
  [key: string]: unknown;
}

export interface SendResult {
  /** Reponse du fournisseur. Absente sur un abandon. */
  data?: { id?: string } | null;
  error?: { message?: string } | null;
  /** Vrai si aucun destinataire reel ne subsistait : rien n'a ete envoye. */
  skipped?: boolean;
}

interface MinimalResend {
  emails: { send: (payload: OutboundEmail) => Promise<SendResult> };
}

export async function sendEmail(
  resend: MinimalResend,
  payload: OutboundEmail,
): Promise<SendResult> {
  const requested = Array.isArray(payload.to) ? payload.to : [payload.to];
  const recipients = requested.filter((address) => !isTechnicalAddress(address));

  if (recipients.length === 0) {
    console.log("email non envoye : destinataire technique uniquement", {
      subject: payload.subject,
      recipients: requested.length,
    });
    return { skipped: true };
  }

  if (recipients.length !== requested.length) {
    console.log("email : destinataires techniques retires", {
      subject: payload.subject,
      retires: requested.length - recipients.length,
    });
  }

  return await resend.emails.send({ ...payload, to: recipients });
}
