/**
 * @page SupporterPlayerView
 * @route /supporter/players/:id
 * @access Supporter (joueur lié uniquement)
 * @description Fiche lecture seule d'un joueur suivi : identité (équipe, club,
 *              coach) + dernière évaluation officielle (radar). Les auto-débriefs
 *              restent privés (non affichés). Le détail complet d'un débrief
 *              s'ouvre via /evaluations/:id (lecture seule).
 */
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Trophy, ClipboardList } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CircleAvatar } from "@/components/shared/CircleAvatar";
import { EvaluationRadar } from "@/components/evaluation/EvaluationRadar";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { loadFrameworkThemes } from "@/lib/framework-loader";
import {
  calculateRadarData,
  calculateOverallAverage,
  formatAverage,
  type ThemeScores,
} from "@/lib/evaluation-utils";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

export default function SupporterPlayerView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["supporter-player-view", id, user?.id],
    enabled: !!user && !!id,
    queryFn: async () => {
      if (!user || !id) return null;

      const { data: link } = await supabase
        .from("supporters_link").select("id")
        .eq("supporter_id", user.id).eq("player_id", id).maybeSingle();
      if (!link) return { notLinked: true as const };

      const { data: player } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, nickname, photo_url, photo_is_minor, image_rights_consent_at, birthdate")
        .eq("id", id).maybeSingle();
      if (!player) return { notLinked: true as const };

      const { data: membership } = await supabase
        .from("team_members")
        .select("team_id, teams(id, name, color, club:clubs(name))")
        .eq("user_id", id).eq("member_type", "player").eq("is_active", true).is("deleted_at", null)
        .maybeSingle();
      const team = (membership?.teams as any) ?? null;

      let coachName: string | null = null;
      if (team?.id) {
        const { data: coach } = await supabase
          .from("team_members")
          .select("profile:profiles!team_members_user_id_fkey(first_name, last_name)")
          .eq("team_id", team.id).eq("member_type", "coach").eq("coach_role", "referent")
          .eq("is_active", true).is("deleted_at", null).maybeSingle();
        const c = (coach?.profile as any);
        if (c) coachName = `${c.first_name || ""} ${c.last_name || ""}`.trim() || null;
      }

      const { data: latest } = await supabase
        .from("evaluations")
        .select("id, name, date, framework_id, evaluator_id, scores:evaluation_scores(skill_id, score, is_not_observed, comment)")
        .eq("player_id", id).eq("type", "coach" as any).is("deleted_at", null)
        .order("date", { ascending: false }).limit(1).maybeSingle();

      let latestEval:
        | null
        | {
            id: string;
            name: string;
            date: string;
            author: string | null;
            radarData: ReturnType<typeof calculateRadarData>;
            overall: number | null;
          } = null;

      if (latest) {
        const { themes } = await loadFrameworkThemes(latest.framework_id);
        const scoreMap = new Map((latest.scores || []).map((s: any) => [s.skill_id, s]));
        const themeScores: ThemeScores[] = themes.map((t) => ({
          theme_id: t.id,
          theme_name: t.name,
          theme_color: t.color,
          skills: t.skills.map((sk) => {
            const s: any = scoreMap.get(sk.id);
            return {
              skill_id: sk.id,
              score: s?.score ?? null,
              is_not_observed: s?.is_not_observed ?? false,
              comment: s?.comment ?? null,
            };
          }),
          objective: null,
        }));
        let author: string | null = null;
        if (latest.evaluator_id) {
          const { data: a } = await supabase
            .from("profiles").select("first_name, last_name").eq("id", latest.evaluator_id).maybeSingle();
          if (a) author = `${a.first_name || ""} ${a.last_name || ""}`.trim() || null;
        }
        latestEval = {
          id: latest.id,
          name: latest.name,
          date: latest.date,
          author,
          radarData: calculateRadarData(themeScores),
          overall: calculateOverallAverage(themeScores),
        };
      }

      return { player, team, coachName, latestEval };
    },
  });

  if (isLoading) {
    return (
      <AppLayout>
        <div className="space-y-6">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </AppLayout>
    );
  }

  if (!data || "notLinked" in data) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-64 text-center gap-4 px-4">
          <p className="text-muted-foreground max-w-md">
            Ce joueur n'est pas associé à votre compte.
          </p>
          <Button onClick={() => navigate("/supporter/dashboard")}>Retour à mes joueurs</Button>
        </div>
      </AppLayout>
    );
  }

  const { player, team, coachName, latestEval } = data;
  const playerName =
    player.nickname?.trim() ||
    `${player.first_name || ""} ${player.last_name || ""}`.trim() ||
    "Joueur";
  const teamColor = team?.color || "#3B82F6";

  return (
    <AppLayout>
      <div className="space-y-6">
        <Button variant="ghost" size="sm" onClick={() => navigate("/supporter/dashboard")} className="gap-2">
          <ArrowLeft className="w-4 h-4" /> Retour à mes joueurs
        </Button>

        <Card>
          <CardContent className="p-6 flex items-center gap-4">
            <CircleAvatar
              shape="circle"
              name={playerName}
              profile={player as any}
              color={teamColor}
              size="md"
              showName={false}
            />
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-display font-bold">{playerName}</h1>
              {team?.name && (
                <p className="text-sm text-muted-foreground">
                  {team.name}{team?.club?.name ? ` · ${team.club.name}` : ""}
                </p>
              )}
              {coachName && <p className="text-sm text-muted-foreground">Coach : {coachName}</p>}
            </div>
          </CardContent>
        </Card>

        <div>
          <h2 className="text-xl font-display font-semibold mb-4 flex items-center gap-2">
            <Trophy className="w-5 h-5 text-primary" />
            Dernière évaluation
          </h2>
          {latestEval ? (
            <Card>
              <CardContent className="p-6 space-y-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <p className="font-semibold">{latestEval.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(latestEval.date), "d MMM yyyy", { locale: fr })}
                      {latestEval.author && ` · par ${latestEval.author}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-3xl font-bold text-primary">{formatAverage(latestEval.overall)}</p>
                    <p className="text-xs text-muted-foreground">Moyenne /5</p>
                  </div>
                </div>
                <EvaluationRadar data={latestEval.radarData} />
                <div className="flex justify-end">
                  <Button variant="outline" onClick={() => navigate(`/evaluations/${latestEval.id}`)}>
                    Consulter le détail
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground">
                Aucune évaluation officielle pour le moment.
              </CardContent>
            </Card>
          )}
        </div>

        <div className="flex justify-center">
          <Button variant="ghost" onClick={() => navigate("/supporter/debriefs")} className="gap-2">
            <ClipboardList className="w-4 h-4" />
            Voir tous les débriefs
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}
