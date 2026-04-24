/**
 * @module edge-function-errors
 * @description Helpers de normalisation des erreurs remontées par les Edge Functions
 *              Supabase (FunctionsHttpError, FunctionsRelayError, FunctionsFetchError).
 * @exports
 *  - getEdgeFunctionErrorInfo(error) : Promise<EdgeFunctionErrorInfo> — format structuré
 *    { message, code?, hint? } pour edge functions retournant un body JSON typé.
 *  - getEdgeFunctionErrorMessage(error) : Promise<string> — rétrocompat (concatène hint).
 */
import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
} from "@supabase/supabase-js";

const FALLBACK_ERROR_MESSAGE = "Une erreur est survenue";

export type EdgeFunctionErrorInfo = {
  message: string;
  code?: string;
  hint?: string;
};

/**
 * Lit l'erreur structurée d'une edge function (format { error, code, hint }).
 * Rétrocompatible : si la fonction retourne juste une string, code/hint
 * sont undefined.
 */
export const getEdgeFunctionErrorInfo = async (
  error: unknown,
): Promise<EdgeFunctionErrorInfo> => {
  if (error instanceof FunctionsHttpError) {
    try {
      const payload = await error.context.json();
      if (payload && typeof payload === "object") {
        const p = payload as { error?: unknown; code?: unknown; hint?: unknown };
        const msg =
          typeof p.error === "string" && p.error.trim() ? p.error : "Erreur serveur";
        const code = typeof p.code === "string" ? p.code : undefined;
        const hint = typeof p.hint === "string" ? p.hint : undefined;
        return { message: msg, code, hint };
      }
    } catch {
      try {
        const text = await error.context.text();
        if (text.trim()) return { message: text };
      } catch {
        /* ignore secondary parsing errors */
      }
    }
    return { message: "Le serveur a renvoyé une erreur" };
  }

  if (error instanceof FunctionsRelayError) {
    return {
      message:
        "Le service backend est momentanément indisponible. Réessayez dans quelques instants.",
    };
  }

  if (error instanceof FunctionsFetchError) {
    return {
      message:
        "Impossible de contacter le service d'invitation. Vérifiez votre connexion.",
    };
  }

  if (error instanceof Error && error.message.trim()) {
    return { message: error.message };
  }

  return { message: FALLBACK_ERROR_MESSAGE };
};

/**
 * Rétrocompat : ancien helper qui ne retourne que la string. Concatène le
 * hint s'il existe pour ne pas perdre d'information.
 */
export const getEdgeFunctionErrorMessage = async (
  error: unknown,
): Promise<string> => {
  const info = await getEdgeFunctionErrorInfo(error);
  return info.hint ? `${info.message}\n\nIndice : ${info.hint}` : info.message;
};
