import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from "@supabase/supabase-js";

const FALLBACK_ERROR_MESSAGE = "Une erreur est survenue";

export const getEdgeFunctionErrorMessage = async (error: unknown): Promise<string> => {
  if (error instanceof FunctionsHttpError) {
    try {
      const payload = await error.context.json();
      if (payload && typeof payload === "object") {
        const responseError = (payload as { error?: unknown }).error;
        if (typeof responseError === "string" && responseError.trim()) {
          return responseError;
        }
      }
    } catch {
      try {
        const text = await error.context.text();
        if (text.trim()) return text;
      } catch {
        // Ignore secondary parsing errors and continue with fallback below
      }
    }

    return "Le serveur a renvoyé une erreur pendant l'envoi de l'invitation";
  }

  if (error instanceof FunctionsRelayError) {
    return "Le relais d'exécution backend est momentanément indisponible";
  }

  if (error instanceof FunctionsFetchError) {
    return "Impossible de contacter le backend d'invitation";
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return FALLBACK_ERROR_MESSAGE;
};
