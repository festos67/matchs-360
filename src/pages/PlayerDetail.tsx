import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Calendar, TrendingUp, MessageSquare, Edit, Plus, ClipboardList } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EvaluationForm } from "@/components/evaluation/EvaluationForm";
import { EvaluationRadar } from "@/components/evaluation/EvaluationRadar";
import { calculateRadarData, calculateOverallAverage, formatAverage, type ThemeScores } from "@/lib/evaluation-utils";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Player {
  id: string;
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
  photo_url: string | null;
  email: string;
}

interface TeamMembership {
  team_id: string;
  team: {
    id: string;
    name: string;
    club_id: string;
    club: { name: string; primary_color: string };
  };
}

interface Theme {
  id: string;
  name: string;
  color: string | null;
  order_index: number;
  skills: Skill[];
}

interface Skill {
  id: string;
  name: string;
  definition: string | null;
  order_index: number;
}

interface Evaluation {
  id: string;
  name: string;
  date: string;
  coach: { first_name: string | null; last_name: string | null };
  scores: Array<{
    skill_id: string;
    score: number | null;
    is_not_observed: boolean;
    comment: string | null;
  }>;
  objectives: Array<{
    theme_id: string;
    content: string;
  }>;
}

export default function PlayerDetail() {
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading, isAdmin, roles } = useAuth();
  const navigate = useNavigate();
  
  const [player, setPlayer] = useState<Player | null>(null);
  const [teamMembership, setTeamMembership] = useState<TeamMembership | null>(null);
  const [frameworkId, setFrameworkId] = useState<string | null>(null);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [selectedEvaluation, setSelectedEvaluation] = useState<Evaluation | null>(null);
  const [loading, setLoading] = useState(true);
  const [canEvaluate, setCanEvaluate] = useState(false);
  const [activeTab, setActiveTab] = useState("radar");

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user && id) fetchPlayerData();
  }, [user, id]);

  const fetchPlayerData = async () => {
    try {
      // Fetch player profile
      const { data: playerData, error: playerError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (playerError) throw playerError;
      if (!playerData) {
        toast.error("Joueur non trouvé");
        navigate(-1);
        return;
      }
      setPlayer(playerData);

      // Fetch team membership
      const { data: membership } = await supabase
        .from("team_members")
        .select("team_id, team:teams(id, name, club_id, club:clubs(name, primary_color))")
        .eq("user_id", id)
        .eq("member_type", "player")
        .eq("is_active", true)
        .maybeSingle();

      if (membership) {
        setTeamMembership(membership as TeamMembership);

        // Check if current user can evaluate this player
        const { data: coachMembership } = await supabase
          .from("team_members")
          .select("coach_role")
          .eq("team_id", membership.team_id)
          .eq("user_id", user?.id)
          .eq("member_type", "coach")
          .eq("is_active", true)
          .maybeSingle();

        const isClubAdmin = roles.some(r => r.role === "club_admin" && r.club_id === membership.team?.club_id);
        setCanEvaluate(isAdmin || isClubAdmin || !!coachMembership);

        // Fetch framework
        const { data: framework } = await supabase
          .from("competence_frameworks")
          .select("id")
          .eq("team_id", membership.team_id)
          .maybeSingle();

        if (framework) {
          setFrameworkId(framework.id);

          // Fetch themes with skills
          const { data: themesData } = await supabase
            .from("themes")
            .select("*, skills(*)")
            .eq("framework_id", framework.id)
            .order("order_index");

          if (themesData) {
            const sortedThemes = themesData.map(theme => ({
              ...theme,
              skills: (theme.skills || []).sort((a: Skill, b: Skill) => a.order_index - b.order_index)
            }));
            setThemes(sortedThemes);
          }
        }
      }

      // Fetch evaluations
      const { data: evalData } = await supabase
        .from("evaluations")
        .select(`
          id,
          name,
          date,
          coach:profiles!evaluations_coach_id_fkey(first_name, last_name),
          scores:evaluation_scores(skill_id, score, is_not_observed, comment),
          objectives:evaluation_objectives(theme_id, content)
        `)
        .eq("player_id", id)
        .order("date", { ascending: false });

      if (evalData) {
        setEvaluations(evalData as Evaluation[]);
        if (evalData.length > 0) {
          setSelectedEvaluation(evalData[0] as Evaluation);
        }
      }
    } catch (error: any) {
      console.error("Error fetching player:", error);
      toast.error("Erreur lors du chargement");
    } finally {
      setLoading(false);
    }
  };

  const getPlayerName = () => {
    if (!player) return "";
    if (player.nickname) return player.nickname;
    if (player.first_name && player.last_name) return `${player.first_name} ${player.last_name}`;
    return player.first_name || player.last_name || "Joueur";
  };

  // Calculate radar data from selected evaluation
  const getRadarDataFromEvaluation = (): ThemeScores[] => {
    if (!selectedEvaluation || themes.length === 0) return [];
    
    return themes.map(theme => ({
      theme_id: theme.id,
      theme_name: theme.name,
      theme_color: theme.color,
      skills: theme.skills.map(skill => {
        const score = selectedEvaluation.scores.find(s => s.skill_id === skill.id);
        return {
          skill_id: skill.id,
          score: score?.score ?? null,
          is_not_observed: score?.is_not_observed ?? false,
          comment: score?.comment ?? null,
        };
      }),
      objective: selectedEvaluation.objectives.find(o => o.theme_id === theme.id)?.content ?? null,
    }));
  };

  const radarData = calculateRadarData(getRadarDataFromEvaluation());
  const overallAverage = calculateOverallAverage(getRadarDataFromEvaluation());

  if (authLoading || loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      </AppLayout>
    );
  }

  if (!player) return null;

  const teamColor = teamMembership?.team?.club?.primary_color || "#3B82F6";

  return (
    <AppLayout>
      {/* Back Button */}
      <Button variant="ghost" className="mb-6 -ml-2" onClick={() => navigate(-1)}>
        <ArrowLeft className="w-4 h-4 mr-2" />
        Retour
      </Button>

      {/* Player Header */}
      <div className="glass-card p-8 mb-8">
        <div className="flex items-start gap-8">
          <div
            className="w-32 h-32 rounded-2xl flex items-center justify-center text-4xl font-display font-bold shrink-0"
            style={{
              background: player.photo_url
                ? `url(${player.photo_url}) center/cover`
                : `linear-gradient(135deg, ${teamColor} 0%, ${teamColor}88 100%)`,
              color: "white",
            }}
          >
            {!player.photo_url && getPlayerName().split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
          </div>

          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-display font-bold">{getPlayerName()}</h1>
              {teamMembership && <Badge variant="secondary">{teamMembership.team.name}</Badge>}
            </div>
            <p className="text-muted-foreground">{player.email}</p>
            {teamMembership && (
              <p className="text-sm text-muted-foreground mt-1">{teamMembership.team.club?.name}</p>
            )}

            <div className="flex gap-6 mt-6">
              <div className="text-center">
                <p className="text-3xl font-display font-bold text-primary">{formatAverage(overallAverage)}</p>
                <p className="text-sm text-muted-foreground">Score moyen</p>
              </div>
              <div className="w-px bg-border" />
              <div className="text-center">
                <p className="text-3xl font-display font-bold">{evaluations.length}</p>
                <p className="text-sm text-muted-foreground">Évaluations</p>
              </div>
              <div className="w-px bg-border" />
              <div className="text-center">
                <p className="text-3xl font-display font-bold text-success">
                  {evaluations.length >= 2 ? "+12%" : "-"}
                </p>
                <p className="text-sm text-muted-foreground">Progression</p>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            {canEvaluate && frameworkId && (
              <Button className="gap-2" onClick={() => setActiveTab("evaluation")}>
                <Plus className="w-4 h-4" />
                Évaluer
              </Button>
            )}
            <Button variant="outline" size="icon">
              <Edit className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-muted/50">
          <TabsTrigger value="radar">Vue Radar</TabsTrigger>
          <TabsTrigger value="evaluation">
            <ClipboardList className="w-4 h-4 mr-2" />
            Évaluation
          </TabsTrigger>
          <TabsTrigger value="history">Historique</TabsTrigger>
          <TabsTrigger value="advice">Conseils</TabsTrigger>
        </TabsList>

        {/* Radar Tab */}
        <TabsContent value="radar" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 glass-card p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-display font-semibold">Analyse des compétences</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    {selectedEvaluation ? selectedEvaluation.name : "Aucune évaluation"}
                  </p>
                </div>
                {evaluations.length > 1 && (
                  <Button variant="outline" size="sm">
                    <Calendar className="w-4 h-4 mr-2" />
                    Comparer
                  </Button>
                )}
              </div>
              {radarData.length > 0 ? (
                <EvaluationRadar data={radarData} primaryColor={teamColor} />
              ) : (
                <div className="h-[350px] flex items-center justify-center text-muted-foreground">
                  Aucune évaluation disponible
                </div>
              )}
            </div>

            <div className="glass-card p-6">
              <h3 className="font-display font-semibold mb-4">Détail par thématique</h3>
              <div className="space-y-4">
                {themes.map((theme) => {
                  const themeData = radarData.find(d => d.theme === theme.name);
                  return (
                    <div key={theme.id}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: theme.color || "#3B82F6" }} />
                          <span className="text-sm font-medium">{theme.name}</span>
                        </div>
                        <span className="text-sm text-muted-foreground">{themeData?.score || 0}/5</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${((themeData?.score || 0) / 5) * 100}%`,
                            backgroundColor: theme.color || "#3B82F6",
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Evaluation Tab */}
        <TabsContent value="evaluation">
          {frameworkId && themes.length > 0 ? (
            <EvaluationForm
              playerId={player.id}
              playerName={getPlayerName()}
              teamId={teamMembership?.team_id || ""}
              frameworkId={frameworkId}
              themes={themes}
              existingEvaluation={selectedEvaluation}
              onSaved={fetchPlayerData}
              readOnly={!canEvaluate}
            />
          ) : (
            <div className="glass-card p-12 text-center">
              <ClipboardList className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium text-muted-foreground">Référentiel non configuré</h3>
              <p className="text-sm text-muted-foreground mt-1">
                L'équipe doit d'abord configurer son référentiel de compétences
              </p>
              {teamMembership && (
                <Button className="mt-4" onClick={() => navigate(`/teams/${teamMembership.team_id}/framework`)}>
                  Configurer le référentiel
                </Button>
              )}
            </div>
          )}
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history">
          <div className="glass-card p-6">
            <h2 className="text-xl font-display font-semibold mb-6">Historique des évaluations</h2>
            {evaluations.length > 0 ? (
              <div className="space-y-4">
                {evaluations.map((evaluation) => (
                  <div
                    key={evaluation.id}
                    className={`flex items-center gap-4 p-4 rounded-lg cursor-pointer transition-colors ${
                      selectedEvaluation?.id === evaluation.id
                        ? "bg-primary/10 border border-primary/30"
                        : "bg-muted/30 hover:bg-muted/50"
                    }`}
                    onClick={() => {
                      setSelectedEvaluation(evaluation);
                      setActiveTab("radar");
                    }}
                  >
                    <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
                      <TrendingUp className="w-6 h-6 text-primary" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">{evaluation.name}</p>
                      <p className="text-sm text-muted-foreground">
                        Par {evaluation.coach?.first_name} {evaluation.coach?.last_name} •{" "}
                        {new Date(evaluation.date).toLocaleDateString("fr-FR")}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-display font-bold text-lg">
                        {(() => {
                          const themeScores = themes.map(theme => ({
                            theme_id: theme.id,
                            theme_name: theme.name,
                            theme_color: theme.color,
                            skills: theme.skills.map(skill => {
                              const score = evaluation.scores.find(s => s.skill_id === skill.id);
                              return {
                                skill_id: skill.id,
                                score: score?.score ?? null,
                                is_not_observed: score?.is_not_observed ?? false,
                                comment: null,
                              };
                            }),
                            objective: null,
                          }));
                          return formatAverage(calculateOverallAverage(themeScores));
                        })()}
                      </p>
                      <p className="text-xs text-muted-foreground">/5</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                Aucune évaluation enregistrée
              </div>
            )}
          </div>
        </TabsContent>

        {/* Advice Tab */}
        <TabsContent value="advice">
          <div className="glass-card p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-display font-semibold">Conseils personnalisés</h2>
              <Button size="sm" variant="outline" className="gap-2">
                <MessageSquare className="w-4 h-4" />
                Générer des conseils
              </Button>
            </div>
            
            {selectedEvaluation ? (
              <div className="space-y-4">
                {/* Show objectives from selected evaluation */}
                {selectedEvaluation.objectives.length > 0 ? (
                  selectedEvaluation.objectives.map((obj) => {
                    const theme = themes.find(t => t.id === obj.theme_id);
                    return (
                      <div
                        key={obj.theme_id}
                        className="p-4 rounded-lg bg-primary/10 border border-primary/20"
                      >
                        <h4 className="font-medium text-primary mb-2 flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: theme?.color || "#3B82F6" }} />
                          {theme?.name || "Thématique"}
                        </h4>
                        <p className="text-sm text-muted-foreground">{obj.content}</p>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    Aucun objectif défini pour cette évaluation
                  </div>
                )}

                {/* Show skill comments */}
                {selectedEvaluation.scores.filter(s => s.comment).length > 0 && (
                  <>
                    <h3 className="font-medium mt-6 pt-4 border-t border-border">Conseils par compétence</h3>
                    {selectedEvaluation.scores
                      .filter(s => s.comment)
                      .map((score) => {
                        const skill = themes.flatMap(t => t.skills).find(s => s.id === score.skill_id);
                        return (
                          <div key={score.skill_id} className="p-4 rounded-lg bg-muted/30">
                            <h4 className="font-medium text-sm mb-1">{skill?.name || "Compétence"}</h4>
                            <p className="text-sm text-muted-foreground">{score.comment}</p>
                          </div>
                        );
                      })}
                  </>
                )}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                Sélectionnez une évaluation pour voir les conseils
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
}