/**
 * @hook useFrameworkThemes / fetchFrameworkThemesCached
 * @description Accès MIS EN CACHE aux thèmes + compétences d'un référentiel.
 *
 * PERF — `loadFrameworkThemes()` était appelée directement (hors react-query)
 * depuis au moins six endroits (PlayerDetail, EvaluationDetail,
 * SupporterPlayerView, PlayerEvaluationTab, TemplatePreviewDialog,
 * usePlayerData). Chaque montage de composant relançait donc le chargement
 * complet du référentiel — thèmes + toutes les compétences — alors qu'un
 * référentiel ne change quasiment jamais entre deux navigations.
 *
 * Ce module centralise l'accès derrière le cache react-query :
 *  - `useFrameworkThemes` pour les usages déclaratifs (rendu) ;
 *  - `fetchFrameworkThemesCached` pour les usages impératifs (callbacks,
 *    Promise.all), avec la MÊME signature que `loadFrameworkThemes` afin de
 *    permettre un remplacement direct.
 *
 * Les deux partagent la même queryKey : un référentiel déjà chargé par un
 * composant est réutilisé par les autres, et les appels concurrents sur le
 * même id sont dédupliqués par react-query (utile contre le N+1 de
 * PlayerEvaluationTab, qui charge plusieurs référentiels en parallèle).
 *
 * @maintenance
 *  - Après modification d'un référentiel, invalider ["framework-themes", id]
 *    (les éditeurs passent par save_framework_atomic, qui crée un NOUVEL id :
 *    l'ancienne entrée devient simplement inutilisée puis évincée).
 */
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/query-client";
import {
  loadFrameworkThemes,
  type FrameworkTheme,
} from "@/lib/framework-loader";

export type { FrameworkTheme };

export interface FrameworkThemesResult {
  themes: FrameworkTheme[];
  fromSnapshot: boolean;
}

/** Durée pendant laquelle un référentiel déjà chargé est considéré à jour. */
const FRAMEWORK_STALE_TIME = 10 * 60 * 1000; // 10 min
/** Durée de conservation en cache après la dernière utilisation. */
const FRAMEWORK_GC_TIME = 30 * 60 * 1000; // 30 min

export const frameworkThemesKey = (frameworkId: string) =>
  ["framework-themes", frameworkId] as const;

function frameworkThemesOptions(frameworkId: string) {
  return {
    queryKey: frameworkThemesKey(frameworkId),
    queryFn: () => loadFrameworkThemes(frameworkId),
    staleTime: FRAMEWORK_STALE_TIME,
    gcTime: FRAMEWORK_GC_TIME,
  };
}

/**
 * Version impérative, mise en cache. Signature identique à
 * `loadFrameworkThemes` : remplacement direct dans les callbacks.
 */
export async function fetchFrameworkThemesCached(
  frameworkId: string,
): Promise<FrameworkThemesResult> {
  return queryClient.fetchQuery(frameworkThemesOptions(frameworkId));
}

/** Version déclarative, pour un chargement au rendu. */
export function useFrameworkThemes(frameworkId: string | null | undefined) {
  return useQuery({
    ...frameworkThemesOptions(frameworkId ?? ""),
    enabled: !!frameworkId,
  });
}

/** Force le rechargement d'un référentiel (après édition par exemple). */
export function invalidateFrameworkThemes(frameworkId: string) {
  return queryClient.invalidateQueries({
    queryKey: frameworkThemesKey(frameworkId),
  });
}
