import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Calculate team average progression by comparing each player's
 * two most recent coach evaluations (t0 vs t-1).
 * 
 * Players with fewer than 2 evaluations are excluded.
 */
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
            .eq("type", "coach_assessment")
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
