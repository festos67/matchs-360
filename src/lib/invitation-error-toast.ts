/**
 * @module invitation-error-toast
 * @description Affiche un toast d'erreur enrichi pour les échecs de l'edge
 *              function `send-invitation`. Mappe les codes d'erreur retournés
 *              par le backend (AUTH_NO_RIGHT_ON_CLUB, EMAIL_SENDER_FORBIDDEN, ...)
 *              à des UX toasts spécifiques (description, durée, action button).
 * @maintenance
 *  - Codes synchronisés avec supabase/functions/send-invitation/index.ts (type ErrorCode)
 *  - Rétrocompat : si le backend ne retourne pas de code, fallback générique
 */
import { toast } from "sonner";
import { getEdgeFunctionErrorInfo } from "./edge-function-errors";

/**
 * Affiche un toast d'erreur enrichi pour un échec d'invocation send-invitation.
 */
export async function toastInvitationError(error: unknown): Promise<void> {
  const info = await getEdgeFunctionErrorInfo(error);

  switch (info.code) {
    case "EMAIL_SENDER_FORBIDDEN":
    case "EMAIL_PROVIDER_NOT_CONFIGURED":
      toast.error("Configuration email incomplète", {
        description:
          (info.hint ?? info.message) +
          "\n\nL'invitation n'a pas pu être envoyée par email. Contactez l'administrateur de la plateforme.",
        duration: 10000,
      });
      return;

    case "EMAIL_RATE_LIMITED":
      toast.warning("Trop d'envois d'email récents", {
        description: info.message,
        duration: 8000,
      });
      return;

    case "EMAIL_PROVIDER_ERROR":
      toast.error("Erreur du service email", {
        description: info.message,
        duration: 8000,
      });
      return;

    case "AUTH_NO_RIGHT_ON_CLUB":
    case "AUTH_CANNOT_GRANT_ROLE":
    case "AUTH_TEAM_OUT_OF_SCOPE":
      toast.error("Action non autorisée", {
        description: info.hint ? `${info.message}\n${info.hint}` : info.message,
        duration: 8000,
      });
      return;

    case "USER_ALREADY_HAS_ROLE_IN_CLUB":
    case "PLAYER_ALREADY_IN_TEAM":
    case "TEAM_ALREADY_HAS_REFERENT":
      toast.warning("Conflit", { description: info.message, duration: 6000 });
      return;

    case "INPUT_INVALID_EMAIL":
    case "INPUT_MISSING_CLUB":
    case "INPUT_TEAM_NOT_IN_CLUB":
    case "INPUT_PLAYERS_OUT_OF_CLUB":
      toast.error("Données invalides", { description: info.message });
      return;

    case "RATE_LIMIT_EXCEEDED":
    case "RATE_LIMIT_CHECK_FAILED":
      toast.warning("Limite d'envoi atteinte", {
        description: info.message,
        duration: 8000,
      });
      return;

    case "AUTH_MISSING":
    case "AUTH_INVALID":
      toast.error("Session expirée", {
        description: "Veuillez vous reconnecter.",
        action: {
          label: "Reconnexion",
          onClick: () => {
            window.location.href = "/auth";
          },
        },
      });
      return;

    default:
      toast.error("Échec de l'invitation", {
        description: info.hint ? `${info.message}\n${info.hint}` : info.message,
        duration: 6000,
      });
  }
}