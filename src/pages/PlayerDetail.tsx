import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, TrendingUp, MessageSquare, Edit, Plus, ClipboardList, Download, RotateCcw, BookOpen, Trash2, Heart, Star, ArrowRightLeft, Users, Mail } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useReactToPrint } from "react-to-print";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { EvaluationForm } from "@/components/evaluation/EvaluationForm";
import { EvaluationRadar } from "@/components/evaluation/EvaluationRadar";
import { ComparisonRadar } from "@/components/evaluation/ComparisonRadar";
import { PrintablePlayerSheet } from "@/components/evaluation/PrintablePlayerSheet";
import { PlayerMutationModal } from "@/components/modals/PlayerMutationModal";
import { EditPlayerModal } from "@/components/modals/EditPlayerModal";
import { ManageSupportersModal } from "@/components/modals/ManageSupportersModal";
import { RequestSupporterEvaluationModal } from "@/components/modals/RequestSupporterEvaluationModal";
import { EvaluationHistory } from "@/components/player/EvaluationHistory";
import { SupporterRequestsPanel } from "@/components/player/SupporterRequestsPanel";
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
    club: { name: string; primary_color: string; logo_url?: string | null };
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
  deleted_at: string | null;
  type: "coach_assessment" | "player_self_assessment" | "supporter_assessment";
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

// Predefined colors for comparison
const COMPARISON_COLORS = [
  "#6B7280", // Gray
  "#F97316", // Orange
  "#06B6D4", // Cyan
  "#8B5CF6", // Purple
];

export default function PlayerDetail() {
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading, isAdmin, roles } = useAuth();
  const navigate = useNavigate();
  const printRef = useRef<HTMLDivElement>(null);
  
  const [player, setPlayer] = useState<Player | null>(null);
  const [teamMembership, setTeamMembership] = useState<TeamMembership | null>(null);
  const [frameworkId, setFrameworkId] = useState<string | null>(null);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [selectedEvaluation, setSelectedEvaluation] = useState<Evaluation | null>(null);
  const [comparisonIds, setComparisonIds] = useState<string[]>([]);
  const [isViewingHistory, setIsViewingHistory] = useState(false);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [loading, setLoading] = useState(true);
  const [canEvaluate, setCanEvaluate] = useState(false);
  const [canMutate, setCanMutate] = useState(false);
  const [showMutationModal, setShowMutationModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showSupportersModal, setShowSupportersModal] = useState(false);
  const [showRequestSupporterModal, setShowRequestSupporterModal] = useState(false);
  // Multi-source radar overlay checkboxes (for admin/coach god view)
  const [showCoachLayer, setShowCoachLayer] = useState(true);
  const [showSelfEvalLayer, setShowSelfEvalLayer] = useState(false);
  const [showSupporterLayer, setShowSupporterLayer] = useState(false);
  // Legacy toggle states (kept for backward compat)
  const [showSelfEvaluation, setShowSelfEvaluation] = useState(false);
  const [showSupporterEvaluation, setShowSupporterEvaluation] = useState(false);
  const [activeTab, setActiveTab] = useState("radar");

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Fiche_${player?.first_name || "Joueur"}_${new Date().toLocaleDateString("fr-FR")}`,
  });

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
        .select("team_id, team:teams(id, name, club_id, club:clubs(name, primary_color, logo_url))")
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
        setCanMutate(isAdmin || isClubAdmin);

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

      // Fetch evaluations (all, including soft-deleted for filtering later)
      const { data: evalData } = await supabase
        .from("evaluations")
        .select(`
          id,
          name,
          date,
          deleted_at,
          type,
          coach:profiles!evaluations_coach_id_fkey(first_name, last_name),
          scores:evaluation_scores(skill_id, score, is_not_observed, comment),
          objectives:evaluation_objectives(theme_id, content)
        `)
        .eq("player_id", id)
        .order("date", { ascending: false });

      if (evalData) {
        setEvaluations(evalData as Evaluation[]);
        // Set selected to latest COACH evaluation (not self-assessment or supporter)
        const latestCoach = evalData.find(
          e => e.type === "coach_assessment" && !e.deleted_at
        );
        if (latestCoach) {
          setSelectedEvaluation(latestCoach as Evaluation);
        } else {
          // Fallback to first non-deleted if no coach eval exists
          const activeEvals = evalData.filter(e => !e.deleted_at);
          if (activeEvals.length > 0) {
            setSelectedEvaluation(activeEvals[0] as Evaluation);
          }
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
  const getRadarDataFromEvaluation = (evaluation: Evaluation | null): ThemeScores[] => {
    if (!evaluation || themes.length === 0) return [];
    
    return themes.map(theme => ({
      theme_id: theme.id,
      theme_name: theme.name,
      theme_color: theme.color,
      skills: theme.skills.map(skill => {
        const score = evaluation.scores.find(s => s.skill_id === skill.id);
        return {
          skill_id: skill.id,
          score: score?.score ?? null,
          is_not_observed: score?.is_not_observed ?? false,
          comment: score?.comment ?? null,
        };
      }),
      objective: evaluation.objectives.find(o => o.theme_id === theme.id)?.content ?? null,
    }));
  };

  // For stats display, use latest COACH evaluation only (not self-assessments)
  const latestOfficialEvaluation = evaluations.find(
    e => e.type === "coach_assessment" && !e.deleted_at
  );
  
  const radarData = calculateRadarData(getRadarDataFromEvaluation(selectedEvaluation));
  // Overall average for header stats = official evaluation only
  const overallAverage = calculateOverallAverage(getRadarDataFromEvaluation(latestOfficialEvaluation || null));

  // Build comparison datasets
  const getComparisonDatasets = () => {
    const datasets: Array<{
      id: string;
      label: string;
      date: string;
      data: ReturnType<typeof calculateRadarData>;
      color: string;
      isCurrent?: boolean;
    }> = [];

    // Add current/selected evaluation
    if (selectedEvaluation) {
      const data = calculateRadarData(getRadarDataFromEvaluation(selectedEvaluation));
      datasets.push({
        id: selectedEvaluation.id,
        label: selectedEvaluation.name,
        date: selectedEvaluation.date,
        data,
        color: teamMembership?.team?.club?.primary_color || "#3B82F6",
        isCurrent: true,
      });
    }

    // Add comparison evaluations
    comparisonIds.forEach((evalId, index) => {
      const evaluation = evaluations.find(e => e.id === evalId);
      if (evaluation && evaluation.id !== selectedEvaluation?.id) {
        const data = calculateRadarData(getRadarDataFromEvaluation(evaluation));
        datasets.push({
          id: evaluation.id,
          label: evaluation.name,
          date: evaluation.date,
          data,
          color: COMPARISON_COLORS[index % COMPARISON_COLORS.length],
          isCurrent: false,
        });
      }
    });

    return datasets;
  };

  const toggleComparison = (evalId: string) => {
    setComparisonIds(prev => {
      if (prev.includes(evalId)) {
        return prev.filter(id => id !== evalId);
      }
      if (prev.length >= 3) {
        toast.error("Maximum 3 évaluations en comparaison");
        return prev;
      }
      return [...prev, evalId];
    });
  };

  const handleViewEvaluation = (evaluation: Evaluation) => {
    setSelectedEvaluation(evaluation);
    setIsViewingHistory(evaluation.id !== evaluations[0]?.id);
    setActiveTab("radar");
  };

  const handleReturnToCurrent = () => {
    if (evaluations.length > 0) {
      setSelectedEvaluation(evaluations[0]);
      setIsViewingHistory(false);
      setComparisonIds([]);
    }
  };

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
  const comparisonDatasets = getComparisonDatasets();
  const showComparison = comparisonIds.length > 0;
  
  // Get latest self-evaluation for comparison
  const latestSelfEvaluation = evaluations.find(
    e => e.type === "player_self_assessment" && !e.deleted_at
  );
  
  // Get latest supporter evaluation for comparison
  const latestSupporterEvaluation = evaluations.find(
    e => e.type === "supporter_assessment" && !e.deleted_at
  );
  
  // Get latest coach evaluation (for the toggle comparison)
  const latestCoachEvaluation = evaluations.find(
    e => e.type === "coach_assessment" && !e.deleted_at
  );
  
  // Build datasets for self-evaluation overlay (2-way comparison)
  const getSelfEvalOverlayDatasets = () => {
    const datasets: Array<{
      id: string;
      label: string;
      date: string;
      data: ReturnType<typeof calculateRadarData>;
      color: string;
      isCurrent?: boolean;
    }> = [];

    // Add coach evaluation as primary
    if (latestCoachEvaluation) {
      datasets.push({
        id: latestCoachEvaluation.id,
        label: "Évaluation Coach",
        date: latestCoachEvaluation.date,
        data: calculateRadarData(getRadarDataFromEvaluation(latestCoachEvaluation)),
        color: teamColor,
        isCurrent: true,
      });
    }

    // Add self-evaluation as secondary (dashed/yellow)
    if (latestSelfEvaluation) {
      datasets.push({
        id: latestSelfEvaluation.id,
        label: "Auto-évaluation",
        date: latestSelfEvaluation.date,
        data: calculateRadarData(getRadarDataFromEvaluation(latestSelfEvaluation)),
        color: "#F59E0B", // Amber/Yellow for self-evaluation
        isCurrent: false,
      });
    }

    return datasets;
  };
  
  // Build datasets for supporter evaluation overlay (3-way comparison)
  const getSupporterEvalOverlayDatasets = () => {
    const datasets: Array<{
      id: string;
      label: string;
      date: string;
      data: ReturnType<typeof calculateRadarData>;
      color: string;
      isCurrent?: boolean;
    }> = [];

    // Add coach evaluation as primary
    if (latestCoachEvaluation) {
      datasets.push({
        id: latestCoachEvaluation.id,
        label: "Évaluation Coach",
        date: latestCoachEvaluation.date,
        data: calculateRadarData(getRadarDataFromEvaluation(latestCoachEvaluation)),
        color: teamColor,
        isCurrent: true,
      });
    }

    // Add self-evaluation (if available)
    if (latestSelfEvaluation) {
      datasets.push({
        id: latestSelfEvaluation.id,
        label: "Auto-évaluation",
        date: latestSelfEvaluation.date,
        data: calculateRadarData(getRadarDataFromEvaluation(latestSelfEvaluation)),
        color: "#F59E0B", // Amber/Yellow
        isCurrent: false,
      });
    }

    // Add supporter evaluation (dashed/orange)
    if (latestSupporterEvaluation) {
      datasets.push({
        id: latestSupporterEvaluation.id,
        label: "Évaluation Supporter",
        date: latestSupporterEvaluation.date,
        data: calculateRadarData(getRadarDataFromEvaluation(latestSupporterEvaluation)),
        color: "#F97316", // Orange for supporter
        isCurrent: false,
      });
    }

    return datasets;
  };
  
  // NEW: Build multi-source overlay datasets based on checkbox selections
  const getMultiSourceOverlayDatasets = () => {
    const datasets: Array<{
      id: string;
      label: string;
      date: string;
      data: ReturnType<typeof calculateRadarData>;
      color: string;
      isCurrent?: boolean;
    }> = [];

    // Add coach evaluation if checkbox is checked
    if (showCoachLayer && latestCoachEvaluation) {
      datasets.push({
        id: latestCoachEvaluation.id,
        label: "Évaluation Coach",
        date: latestCoachEvaluation.date,
        data: calculateRadarData(getRadarDataFromEvaluation(latestCoachEvaluation)),
        color: teamColor,
        isCurrent: true,
      });
    }

    // Add self-evaluation if checkbox is checked
    if (showSelfEvalLayer && latestSelfEvaluation) {
      datasets.push({
        id: latestSelfEvaluation.id,
        label: "Auto-évaluation",
        date: latestSelfEvaluation.date,
        data: calculateRadarData(getRadarDataFromEvaluation(latestSelfEvaluation)),
        color: "#F59E0B", // Amber/Yellow
        isCurrent: false,
      });
    }

    // Add supporter evaluation if checkbox is checked
    if (showSupporterLayer && latestSupporterEvaluation) {
      datasets.push({
        id: latestSupporterEvaluation.id,
        label: "Évaluation Supporter",
        date: latestSupporterEvaluation.date,
        data: calculateRadarData(getRadarDataFromEvaluation(latestSupporterEvaluation)),
        color: "#F97316", // Orange
        isCurrent: false,
      });
    }

    return datasets;
  };
  
  const hasSelfEvaluation = !!latestSelfEvaluation;
  const hasSupporterEvaluation = !!latestSupporterEvaluation;
  
  // Check if multi-source mode is active (any layer besides default coach)
  const isMultiSourceMode = showSelfEvalLayer || showSupporterLayer;


  return (
    <AppLayout>
      {/* Hidden printable component */}
      <div className="hidden">
        {selectedEvaluation && teamMembership && (
          <PrintablePlayerSheet
            ref={printRef}
            player={player}
            club={{
              name: teamMembership.team.club?.name || "",
              logo_url: teamMembership.team.club?.logo_url,
              primary_color: teamColor,
            }}
            team={{ name: teamMembership.team.name }}
            evaluation={selectedEvaluation}
            themes={themes}
          />
        )}
      </div>

      {/* Back Button */}
      <Button variant="ghost" className="mb-6 -ml-2" onClick={() => navigate(-1)}>
        <ArrowLeft className="w-4 h-4 mr-2" />
        Retour
      </Button>

      {/* History viewing banner */}
      {isViewingHistory && (
        <div className="mb-4 p-3 bg-warning/10 border border-warning/30 rounded-lg flex items-center justify-between">
          <span className="text-sm text-warning">
            📜 Vous consultez un débrief passé: <strong>{selectedEvaluation?.name}</strong>
          </span>
          <Button size="sm" variant="outline" onClick={handleReturnToCurrent} className="gap-2">
            <RotateCcw className="w-4 h-4" />
            Retour à la version actuelle
          </Button>
        </div>
      )}

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
                <p className="text-3xl font-display font-bold">{evaluations.filter(e => e.type === "coach_assessment" && !e.deleted_at).length}</p>
                <p className="text-sm text-muted-foreground">Débriefs officiels</p>
              </div>
              <div className="w-px bg-border" />
              <div className="text-center">
                {(() => {
                  // Compare current evaluation (t0) with previous one (t-1) - ONLY coach assessments
                  const activeCoachEvals = evaluations.filter(e => !e.deleted_at && e.type === "coach_assessment");
                  if (activeCoachEvals.length < 2) {
                    return (
                      <>
                        <p className="text-3xl font-display font-bold text-muted-foreground">-</p>
                        <p className="text-sm text-muted-foreground">Progression</p>
                      </>
                    );
                  }
                  
                  // t0 = most recent, t-1 = second most recent (coach evaluations only)
                  const currentEval = activeCoachEvals[0];
                  const previousEval = activeCoachEvals[1];
                  
                  const currentAvg = calculateOverallAverage(getRadarDataFromEvaluation(currentEval));
                  const previousAvg = calculateOverallAverage(getRadarDataFromEvaluation(previousEval));
                  
                  if (currentAvg === null || previousAvg === null || previousAvg === 0) {
                    return (
                      <>
                        <p className="text-3xl font-display font-bold text-muted-foreground">-</p>
                        <p className="text-sm text-muted-foreground">Progression</p>
                      </>
                    );
                  }
                  
                  const progressionPercent = ((currentAvg - previousAvg) / previousAvg) * 100;
                  const isPositive = progressionPercent >= 0;
                  const formattedPercent = `${isPositive ? "+" : ""}${progressionPercent.toFixed(0)}%`;
                  
                  return (
                    <>
                      <p className={`text-3xl font-display font-bold ${isPositive ? "text-success" : "text-destructive"}`}>
                        {formattedPercent}
                      </p>
                      <p className="text-sm text-muted-foreground">Progression</p>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            {selectedEvaluation && (
              <Button variant="outline" className="gap-2" onClick={() => handlePrint()}>
                <Download className="w-4 h-4" />
                Télécharger PDF
              </Button>
            )}
            {canEvaluate && frameworkId && !isViewingHistory && (
              <Button className="gap-2" onClick={() => {
                setIsCreatingNew(true);
                setActiveTab("evaluation");
              }}>
                <Plus className="w-4 h-4" />
                Nouveau débrief
              </Button>
            )}
            {canMutate && teamMembership && (
              <Button variant="outline" className="gap-2" onClick={() => setShowMutationModal(true)}>
                <ArrowRightLeft className="w-4 h-4" />
                Mutation
              </Button>
            )}
            {canEvaluate && teamMembership && (
              <Button variant="outline" className="gap-2" onClick={() => setShowSupportersModal(true)}>
                <Heart className="w-4 h-4" />
                Supporters
              </Button>
            )}
            {canEvaluate && teamMembership && (
              <Button variant="outline" className="gap-2 border-warning/50 text-warning hover:bg-warning/10" onClick={() => setShowRequestSupporterModal(true)}>
                <Users className="w-4 h-4" />
                Demander avis
              </Button>
            )}
            {canMutate && (
              <Button variant="outline" size="icon" onClick={() => setShowEditModal(true)}>
                <Edit className="w-4 h-4" />
              </Button>
            )}
            {isAdmin && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="icon">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Supprimer ce joueur ?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Cette action supprimera définitivement le joueur {getPlayerName()} ainsi que toutes ses évaluations et données associées. Cette action est irréversible.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annuler</AlertDialogCancel>
                    <AlertDialogAction 
                      onClick={async () => {
                        try {
                          // Soft delete du profil
                          const { error: profileError } = await supabase
                            .from("profiles")
                            .update({ deleted_at: new Date().toISOString() })
                            .eq("id", id);
                          
                          if (profileError) throw profileError;

                          // Désactiver aussi les team_members associés
                          const { error: memberError } = await supabase
                            .from("team_members")
                            .update({ is_active: false, left_at: new Date().toISOString() })
                            .eq("user_id", id);
                          
                          if (memberError) throw memberError;
                          
                          toast.success("Joueur supprimé avec succès");
                          navigate(-1);
                        } catch (error: unknown) {
                          console.error("Error deleting player:", error);
                          toast.error("Erreur lors de la suppression");
                        }
                      }}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Supprimer
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>
      </div>

      {/* Mutation Modal */}
      {teamMembership && (
        <PlayerMutationModal
          open={showMutationModal}
          onOpenChange={setShowMutationModal}
          playerId={id!}
          playerName={getPlayerName()}
          currentTeamId={teamMembership.team_id}
          currentTeamName={teamMembership.team.name}
          clubId={teamMembership.team.club_id}
          onSuccess={fetchPlayerData}
        />
      )}

      {/* Supporters Modal */}
      {player && teamMembership && (
        <ManageSupportersModal
          open={showSupportersModal}
          onOpenChange={setShowSupportersModal}
          playerId={id!}
          playerName={getPlayerName()}
          clubId={teamMembership.team.club_id}
          onSuccess={fetchPlayerData}
        />
      )}

      {/* Request Supporter Evaluation Modal */}
      {player && (
        <RequestSupporterEvaluationModal
          open={showRequestSupporterModal}
          onOpenChange={setShowRequestSupporterModal}
          playerId={id!}
          playerName={getPlayerName()}
          onSuccess={fetchPlayerData}
        />
      )}

      {/* Edit Player Modal */}
      {player && (
        <EditPlayerModal
          open={showEditModal}
          onOpenChange={setShowEditModal}
          player={player}
          onSuccess={fetchPlayerData}
        />
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="bg-muted/50">
          <TabsTrigger value="radar">Vue Radar</TabsTrigger>
          <TabsTrigger value="evaluation" disabled={isViewingHistory}>
            <ClipboardList className="w-4 h-4 mr-2" />
            Évaluation
          </TabsTrigger>
          <TabsTrigger value="history">Historique</TabsTrigger>
          {canEvaluate && (
            <TabsTrigger value="invitations" className="gap-2">
              <Mail className="w-4 h-4" />
              Invitations
            </TabsTrigger>
          )}
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
                    {isMultiSourceMode ? (
                      (() => {
                        const sources = [];
                        if (showCoachLayer && latestCoachEvaluation) sources.push("Coach");
                        if (showSelfEvalLayer && latestSelfEvaluation) sources.push("Auto-éval");
                        if (showSupporterLayer && latestSupporterEvaluation) sources.push("Supporter");
                        return sources.length > 0 
                          ? `Comparaison: ${sources.join(" vs ")}` 
                          : "Sélectionnez au moins une source";
                      })()
                    ) : showComparison ? (
                      `${selectedEvaluation?.name || "Évaluation"} + ${comparisonIds.length} comparaison(s)`
                    ) : selectedEvaluation ? (
                      selectedEvaluation.name
                    ) : (
                      "Aucune évaluation"
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-4 flex-wrap">
                  {/* Multi-source checkboxes for admin/coach (god view) */}
                  {canEvaluate && !showComparison && (
                    <>
                      {/* Coach layer */}
                      {latestCoachEvaluation && (
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="coach-layer"
                            checked={showCoachLayer}
                            onCheckedChange={(checked) => setShowCoachLayer(checked as boolean)}
                          />
                          <Label 
                            htmlFor="coach-layer" 
                            className="text-sm cursor-pointer flex items-center gap-1.5"
                          >
                            <ClipboardList className="w-4 h-4 text-primary" />
                            Coach
                          </Label>
                        </div>
                      )}
                      {/* Self-evaluation layer */}
                      {hasSelfEvaluation && (
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="self-eval-layer"
                            checked={showSelfEvalLayer}
                            onCheckedChange={(checked) => {
                              setShowSelfEvalLayer(checked as boolean);
                              setShowSelfEvaluation(checked as boolean);
                            }}
                          />
                          <Label 
                            htmlFor="self-eval-layer" 
                            className="text-sm cursor-pointer flex items-center gap-1.5"
                          >
                            <Star className="w-4 h-4 text-amber-500" />
                            Auto-éval
                          </Label>
                        </div>
                      )}
                      {/* Supporter layer */}
                      {hasSupporterEvaluation && (
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="supporter-layer"
                            checked={showSupporterLayer}
                            onCheckedChange={(checked) => {
                              setShowSupporterLayer(checked as boolean);
                              setShowSupporterEvaluation(checked as boolean);
                            }}
                          />
                          <Label 
                            htmlFor="supporter-layer" 
                            className="text-sm cursor-pointer flex items-center gap-1.5"
                          >
                            <Heart className="w-4 h-4 text-orange-500" />
                            Supporter
                          </Label>
                        </div>
                      )}
                    </>
                  )}
                  {teamMembership && (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="gap-2 text-muted-foreground hover:text-foreground"
                      onClick={() => navigate(`/teams/${teamMembership.team_id}/framework`)}
                    >
                      <BookOpen className="w-4 h-4" />
                      Voir le référentiel
                    </Button>
                  )}
                  {showComparison && (
                    <Button variant="outline" size="sm" onClick={() => setComparisonIds([])}>
                      Effacer comparaison
                    </Button>
                  )}
                </div>
              </div>
              
              {radarData.length > 0 ? (
                isMultiSourceMode ? (
                  <ComparisonRadar 
                    datasets={getMultiSourceOverlayDatasets()} 
                    primaryColor={teamColor}
                  />
                ) : showComparison ? (
                  <ComparisonRadar 
                    datasets={comparisonDatasets} 
                    primaryColor={teamColor}
                  />
                ) : (
                  <EvaluationRadar data={radarData} primaryColor={teamColor} />
                )
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

          {/* Objectives & Advice section from selected evaluation */}
          {selectedEvaluation && (
            (selectedEvaluation.objectives?.length > 0 || selectedEvaluation.scores?.some(s => s.comment)) && (
              <div className="glass-card p-6 space-y-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-primary" />
                    <h3 className="font-display font-semibold text-lg">Objectifs & Conseils</h3>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {new Date(selectedEvaluation.date).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                  </Badge>
                </div>

                {/* Objectifs par thématique */}
                {selectedEvaluation.objectives && selectedEvaluation.objectives.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                      <ClipboardList className="w-4 h-4" />
                      Objectifs par thématique
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {selectedEvaluation.objectives.map((objective) => {
                        const theme = themes.find(t => t.id === objective.theme_id);
                        return (
                          <div 
                            key={objective.theme_id} 
                            className="p-4 rounded-lg border-l-4 bg-muted/30"
                            style={{ borderLeftColor: theme?.color || "#3B82F6" }}
                          >
                            <div className="flex items-center gap-2 mb-2">
                              <div 
                                className="w-2.5 h-2.5 rounded-full shrink-0" 
                                style={{ backgroundColor: theme?.color || "#3B82F6" }} 
                              />
                              <span className="text-sm font-semibold text-foreground">{theme?.name || "Thème"}</span>
                            </div>
                            <p className="text-sm text-muted-foreground leading-relaxed break-words whitespace-pre-wrap">
                              {objective.content}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Conseils par compétence */}
                {selectedEvaluation.scores?.filter(s => s.comment).length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                      <MessageSquare className="w-4 h-4" />
                      Conseils par compétence
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {selectedEvaluation.scores
                        .filter(s => s.comment)
                        .map((score) => {
                          const skill = themes.flatMap(t => t.skills).find(s => s.id === score.skill_id);
                          const theme = themes.find(t => t.skills.some(s => s.id === score.skill_id));
                          return (
                            <div 
                              key={score.skill_id} 
                              className="p-4 rounded-lg bg-primary/5 border border-primary/10"
                            >
                              <div className="flex items-center gap-2 mb-2">
                                <div 
                                  className="w-2 h-2 rounded-full shrink-0" 
                                  style={{ backgroundColor: theme?.color || "hsl(var(--primary))" }} 
                                />
                                <span className="text-sm font-medium text-foreground">{skill?.name || "Compétence"}</span>
                              </div>
                              <p className="text-sm text-muted-foreground leading-relaxed break-words whitespace-pre-wrap">
                                {score.comment}
                              </p>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}
              </div>
            )
          )}
        </TabsContent>

        {/* Evaluation Tab */}
        <TabsContent value="evaluation">
          {/* Mode indicator */}
          {isCreatingNew && (
            <div className="mb-4 p-3 bg-success/10 border border-success/30 rounded-lg flex items-center justify-between">
              <span className="text-sm text-success">
                ✨ <strong>Nouvelle évaluation</strong> - Les données seront enregistrées séparément
              </span>
              <Button size="sm" variant="outline" onClick={() => setIsCreatingNew(false)}>
                Annuler
              </Button>
            </div>
          )}
          {!isCreatingNew && selectedEvaluation && !isViewingHistory && (
            <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg flex items-center justify-between">
              <span className="text-sm text-blue-600 dark:text-blue-400">
                📝 Modification de: <strong>{selectedEvaluation.name}</strong>
              </span>
              <Button size="sm" variant="outline" onClick={() => setIsCreatingNew(true)}>
                <Plus className="w-4 h-4 mr-1" />
                Créer une nouvelle
              </Button>
            </div>
          )}
          
          {frameworkId && themes.length > 0 ? (
            <EvaluationForm
              playerId={player.id}
              playerName={getPlayerName()}
              teamId={teamMembership?.team_id || ""}
              frameworkId={frameworkId}
              themes={themes}
              existingEvaluation={isCreatingNew ? null : selectedEvaluation}
              onSaved={() => {
                setIsCreatingNew(false);
                fetchPlayerData();
              }}
              readOnly={!canEvaluate || isViewingHistory}
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
          <EvaluationHistory
            evaluations={evaluations}
            themes={themes}
            selectedEvaluation={selectedEvaluation}
            comparisonIds={comparisonIds}
            teamColor={teamColor}
            canEvaluate={canEvaluate}
            onViewEvaluation={handleViewEvaluation}
            onEditEvaluation={(evaluation) => {
              setSelectedEvaluation(evaluation);
              setIsCreatingNew(false);
              setIsViewingHistory(false);
              setActiveTab("evaluation");
            }}
            onToggleComparison={toggleComparison}
            onRefresh={fetchPlayerData}
          />
        </TabsContent>

        {/* Invitations Tab - Only for staff (admin/coach) */}
        {canEvaluate && (
          <TabsContent value="invitations">
            <SupporterRequestsPanel
              playerId={id!}
              playerName={getPlayerName()}
              onViewEvaluation={(evaluationId) => {
                const evaluation = evaluations.find(e => e.id === evaluationId);
                if (evaluation) {
                  handleViewEvaluation(evaluation);
                }
              }}
            />
          </TabsContent>
        )}

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
