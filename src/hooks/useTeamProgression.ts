/**
 * @hook useTeamProgression
 * @description Calcule la progression moyenne d'une équipe en comparant pour
 *              chaque joueur ses deux derniers débriefs coach officiels (t0 vs t-1).
 *              Les joueurs ayant moins de 2 débriefs sont exclus du calcul.
 * @param teamId — UUID de l'équipe
 * @param playerIds — liste des IDs des joueurs actifs de l'équipe
 * @returns { progression, loading, eligiblePlayersCount }
 *          progression = pourcentage moyen de variation entre t-1 et t0
 * @features
 *  - useQuery avec key composite [teamId, playerIds]
 *  - Récupération des 2 derniers débriefs coach par joueur (type='coach', deleted_at null)
 *  - Calcul moyenne globale par débrief puis variation %
 *  - Exclusion automatique joueurs < 2 débriefs (fairness)
 * @maintenance
 *  - Logique progression individuelle : mem://features/progression-percentage-logic
 *  - KPI équipe : mem://features/team-progression-kpi
 *  - Calculs scores : mem://logic/evaluation/calculations-logic
 *  - Débriefs consultatifs (self/supporter) exclus
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
export function useTeamProgression(teamId: string | undefined, playerIds: string[]) {
  return useQuery({
    queryKey: ["team-progression", teamId, playerIds],
    queryFn: async () => {
      if (playerIds.length === 0) return { value: null, count: 0 };

      const progressions: number[] = [];

      await Promise.all(
        playerIds.map(async (playerId) => {
          // Get the 2 most recent coach evaluations for this player
          const { data: evals, error } = await supabase
            .from("evaluations")
            .select("id, date")
            .eq("player_id", playerId)
            .eq("type", "coach")
            .is("deleted_at", null)
            .order("date", { ascending: false })
            .limit(2);

          if (error || !evals || evals.length < 2) return;

          const [latest, previous] = evals;

          // Fetch scores for both evaluations in parallel
          const [latestScores, previousScores] = await Promise.all([
            supabase
              .from("evaluation_scores")
              .select("score, is_not_observed")
              .eq("evaluation_id", latest.id),
            supabase
              .from("evaluation_scores")
              .select("score, is_not_observed")
              .eq("evaluation_id", previous.id),
          ]);

          const avgLatest = calcAverage(latestScores.data || []);
          const avgPrevious = calcAverage(previousScores.data || []);

          if (avgLatest !== null && avgPrevious !== null && avgPrevious > 0) {
            const progression = ((avgLatest - avgPrevious) / avgPrevious) * 100;
            progressions.push(progression);
          }
        })
      );

      if (progressions.length === 0) return { value: null, count: 0 };

      const avg = progressions.reduce((a, b) => a + b, 0) / progressions.length;
      return { value: Math.round(avg * 10) / 10, count: progressions.length };
    },
    enabled: !!teamId && playerIds.length > 0,
  });
}

function calcAverage(
  scores: Array<{ score: number | null; is_not_observed: boolean }>
): number | null {
  const valid = scores.filter((s) => !s.is_not_observed && s.score !== null && s.score > 0);
  if (valid.length === 0) return null;
  return valid.reduce((acc, s) => acc + (s.score || 0), 0) / valid.length;
}
