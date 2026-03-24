import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, TrendingUp, MessageSquare, Edit, Plus, ClipboardList, Download, RotateCcw, BookOpen, Trash2, Heart, Star, ArrowRightLeft, Users, ChevronUp, Save } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useReactToPrint } from "react-to-print";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { EvaluationForm, type EvaluationFormHandle } from "@/components/evaluation/EvaluationForm";
import { EvaluationRadar } from "@/components/evaluation/EvaluationRadar";
import { ComparisonRadar } from "@/components/evaluation/ComparisonRadar";
import { PrintablePlayerSheet } from "@/components/evaluation/PrintablePlayerSheet";
import { PlayerMutationModal } from "@/components/modals/PlayerMutationModal";
import { EditPlayerModal } from "@/components/modals/EditPlayerModal";
import { ManageSupportersModal } from "@/components/modals/ManageSupportersModal";
import { RequestSupporterEvaluationModal } from "@/components/modals/RequestSupporterEvaluationModal";
import { EvaluationHistory } from "@/components/player/EvaluationHistory";

import { PrintableFramework } from "@/components/framework/PrintableFramework";
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
  const frameworkPrintRef = useRef<HTMLDivElement>(null);
  
  const [player, setPlayer] = useState<Player | null>(null);
  const [teamMembership, setTeamMembership] = useState<TeamMembership | null>(null);
  const [referentCoach, setReferentCoach] = useState<{ first_name: string | null; last_name: string | null } | null>(null);
  const [frameworkId, setFrameworkId] = useState<string | null>(null);
  const [frameworkName, setFrameworkName] = useState<string>("");
  const [themes, setThemes] = useState<Theme[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [selectedEvaluation, setSelectedEvaluation] = useState<Evaluation | null>(null);
  const [comparisonIds, setComparisonIds] = useState<string[]>([]);
  const [isViewingHistory, setIsViewingHistory] = useState(false);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newEvalKey, setNewEvalKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [canEvaluate, setCanEvaluate] = useState(false);
  const [canMutate, setCanMutate] = useState(false);
  const [showMutationModal, setShowMutationModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showSupportersModal, setShowSupportersModal] = useState(false);
  const [showRequestSupporterModal, setShowRequestSupporterModal] = useState(false);
  // Multi-source radar overlay checkboxes (for admin/coach god view)
  const [showCoachLayer, setShowCoachLayer] = useState(false);
  const [showSelfEvalLayer, setShowSelfEvalLayer] = useState(false);
  const [showSupporterLayer, setShowSupporterLayer] = useState(false);
  // Legacy toggle states (kept for backward compat)
  const [showSelfEvaluation, setShowSelfEvaluation] = useState(false);
  const [showSupporterEvaluation, setShowSupporterEvaluation] = useState(false);
  const [activeTab, setActiveTab] = useState("radar");
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [pendingTabChange, setPendingTabChange] = useState<string | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [hasDraftEvaluation, setHasDraftEvaluation] = useState(false);
  const evaluationFormRef = useRef<EvaluationFormHandle>(null);

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 400);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `Fiche_${player?.first_name || "Joueur"}_${new Date().toLocaleDateString("fr-FR")}`,
  });

  const handlePrintFramework = useReactToPrint({
    contentRef: frameworkPrintRef,
    documentTitle: `Referentiel_${teamMembership?.team?.name || "Equipe"}_${new Date().toLocaleDateString("fr-FR")}`,
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

        // Fetch referent coach
        const { data: referentData } = await supabase
          .from("team_members")
          .select("user:profiles!team_members_user_id_fkey(first_name, last_name)")
          .eq("team_id", membership.team_id)
          .eq("member_type", "coach")
          .eq("coach_role", "referent")
          .eq("is_active", true)
          .maybeSingle();

        if (referentData?.user) {
          setReferentCoach(referentData.user as any);
        }

        // Fetch framework
        const { data: framework } = await supabase
          .from("competence_frameworks")
          .select("id, name")
          .eq("team_id", membership.team_id)
          .eq("is_archived", false)
          .maybeSingle();

        if (framework) {
          setFrameworkId(framework.id);
          setFrameworkName(framework.name);

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
        toast.error("Maximum 3 débriefs en comparaison");
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

  // Get the PREVIOUS (second latest) coach evaluation for "Dernier débrief" button
  const coachEvaluations = evaluations.filter(
    e => e.type === "coach_assessment" && !e.deleted_at
  );
  const previousCoachEvaluation = coachEvaluations.length >= 2 ? coachEvaluations[1] : null;
  
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
        label: "Débrief Coach",
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
        label: "Auto-débrief",
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
        label: "Débrief Coach",
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
        label: "Auto-débrief",
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
        label: "Débrief Supporter",
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

    // Always add the currently selected evaluation as the base
    if (selectedEvaluation) {
      datasets.push({
        id: selectedEvaluation.id,
        label: selectedEvaluation.name,
        date: selectedEvaluation.date,
        data: calculateRadarData(getRadarDataFromEvaluation(selectedEvaluation)),
        color: teamColor,
        isCurrent: true,
      });
    }

    // Add latest coach evaluation as overlay if checkbox is checked (and different from selected)
    if (showCoachLayer && latestCoachEvaluation && latestCoachEvaluation.id !== selectedEvaluation?.id) {
      datasets.push({
        id: latestCoachEvaluation.id,
        label: "Dernier débrief",
        date: latestCoachEvaluation.date,
        data: calculateRadarData(getRadarDataFromEvaluation(latestCoachEvaluation)),
        color: "#6366F1", // Indigo for previous coach debrief
        isCurrent: false,
      });
    }

    // Add self-evaluation if checkbox is checked
    if (showSelfEvalLayer && latestSelfEvaluation && latestSelfEvaluation.id !== selectedEvaluation?.id) {
      datasets.push({
        id: latestSelfEvaluation.id,
        label: "Auto-débrief",
        date: latestSelfEvaluation.date,
        data: calculateRadarData(getRadarDataFromEvaluation(latestSelfEvaluation)),
        color: "#F59E0B",
        isCurrent: false,
      });
    }

    // Add supporter evaluation if checkbox is checked
    if (showSupporterLayer && latestSupporterEvaluation && latestSupporterEvaluation.id !== selectedEvaluation?.id) {
      datasets.push({
        id: latestSupporterEvaluation.id,
        label: "Débrief Supporter",
        date: latestSupporterEvaluation.date,
        data: calculateRadarData(getRadarDataFromEvaluation(latestSupporterEvaluation)),
        color: "#F97316",
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
            progressionPercent={(() => {
              const activeCoachEvals = evaluations.filter(e => !e.deleted_at && e.type === "coach_assessment");
              if (activeCoachEvals.length < 2) return null;
              const currentAvg = calculateOverallAverage(getRadarDataFromEvaluation(activeCoachEvals[0]));
              const previousAvg = calculateOverallAverage(getRadarDataFromEvaluation(activeCoachEvals[1]));
              if (currentAvg === null || previousAvg === null || previousAvg === 0) return null;
              return Math.round(((currentAvg - previousAvg) / previousAvg) * 100);
            })()}
            previousEvaluationDate={(() => {
              const activeCoachEvals = evaluations.filter(e => !e.deleted_at && e.type === "coach_assessment");
              return activeCoachEvals.length >= 2 ? activeCoachEvals[1].date : null;
            })()}
            comparisonDatasets={comparisonDatasets
              .filter(ds => !ds.isCurrent)
              .map(ds => ({
                label: ds.label,
                data: ds.data,
                color: ds.color,
              }))}
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
            {!player.photo_url && (() => {
              const fullName = `${player.first_name || ""} ${player.last_name || ""}`.trim();
              const initials = (fullName || player.nickname || "J").split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
              return initials;
            })()}
          </div>

          <div className="flex-1">
            <h1 className="text-3xl font-display font-bold mb-2">
              {player.first_name || player.last_name
                ? `${player.first_name || ""} ${player.last_name || ""}`.trim()
                : player.nickname || "Joueur"}
            </h1>
            {player.nickname && (player.first_name || player.last_name) && (
              <p className="text-muted-foreground italic">{player.nickname}</p>
            )}
            <p className="text-muted-foreground">{player.email}</p>
            {teamMembership && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1 flex-wrap">
                <span>{teamMembership.team.club?.name}</span>
                <span className="text-muted-foreground/50">·</span>
                <span>{teamMembership.team.name}</span>
                {referentCoach && (
                  <>
                    <span className="text-muted-foreground/50">·</span>
                    <span>Coach {referentCoach.first_name} {referentCoach.last_name}</span>
                  </>
                )}
              </div>
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

          <div className="flex items-start gap-2">
            <div className="flex flex-col gap-1.5">
              {/* Row 1: Débrief - full width */}
              {canEvaluate && teamMembership && !isViewingHistory && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="lg" className="w-full gap-3 justify-center bg-primary text-primary-foreground hover:bg-primary/90 shadow-md font-medium text-2xl px-10 h-14" title="Créer un nouveau débrief pour ce joueur">
                      <Plus className="w-6 h-6" />Débrief
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        {hasDraftEvaluation ? "Débrief en cours" : "Nouveau débrief"}
                      </AlertDialogTitle>
                      <AlertDialogDescription>
                        {hasDraftEvaluation
                          ? "Un débrief a été sauvegardé en brouillon. Souhaitez-vous le poursuivre ou en démarrer un nouveau ?"
                          : `Voulez-vous créer un nouveau débrief pour ${getPlayerName()} ?`
                        }
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Annuler</AlertDialogCancel>
                      {hasDraftEvaluation ? (
                        <>
                          <AlertDialogAction onClick={() => {
                            setIsCreatingNew(true);
                            setNewEvalKey(k => k + 1);
                            setHasDraftEvaluation(false);
                            setActiveTab("evaluation");
                          }} className="bg-secondary text-secondary-foreground hover:bg-secondary/80">
                            Nouveau débrief
                          </AlertDialogAction>
                          <AlertDialogAction onClick={() => {
                            setIsCreatingNew(false);
                            setHasDraftEvaluation(false);
                            setActiveTab("evaluation");
                          }}>
                            Poursuivre le débrief
                          </AlertDialogAction>
                        </>
                      ) : (
                        <AlertDialogAction onClick={() => { setIsCreatingNew(true); setNewEvalKey(k => k + 1); setActiveTab("evaluation"); }}>
                          Confirmer
                        </AlertDialogAction>
                      )}
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              {/* Row 2: Supporter + Avis supporter side by side */}
              {canEvaluate && teamMembership && (
                <div className="flex gap-1.5">
                  <Button variant="outline" size="sm" className="gap-2 justify-center flex-1" onClick={() => setShowSupportersModal(true)} title="Ajouter ou gérer les supporters liés au joueur">
                    <Plus className="w-3.5 h-3.5 text-primary" />Supporter
                  </Button>
                  <Button variant="outline" size="sm" className="gap-2 justify-center flex-1 border-warning/50 text-warning hover:bg-warning/10" onClick={() => setShowRequestSupporterModal(true)} title="Demander un avis d'évaluation à un supporter">
                    <Heart className="w-3.5 h-3.5" />
                    Avis supporter
                  </Button>
                </div>
              )}
              {/* Row 3: Demande de transfert - full width */}
              {canMutate && teamMembership && (
                <Button variant="outline" size="sm" className="w-full gap-2 justify-center" onClick={() => setShowMutationModal(true)} title="Transférer le joueur vers une autre équipe">
                  <ArrowRightLeft className="w-3.5 h-3.5 text-primary" />Demande de transfert
                </Button>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              {canMutate && (
                <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setShowEditModal(true)} title="Modifier les informations du joueur">
                  <Edit className="w-4 h-4" />
                </Button>
              )}
              {isAdmin && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="icon" className="h-9 w-9" title="Supprimer définitivement ce joueur">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Supprimer ce joueur ?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Cette action supprimera définitivement le joueur {getPlayerName()} ainsi que tous ses débriefs et données associées. Cette action est irréversible.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Annuler</AlertDialogCancel>
                      <AlertDialogAction 
                        onClick={async () => {
                          try {
                            const { error: profileError } = await supabase
                              .from("profiles")
                              .update({ deleted_at: new Date().toISOString() })
                              .eq("id", id);
                            
                            if (profileError) throw profileError;

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
          onViewEvaluation={(evaluationId) => {
            const evaluation = evaluations.find(e => e.id === evaluationId);
            if (evaluation) {
              setShowSupportersModal(false);
              handleViewEvaluation(evaluation);
            }
          }}
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
      <Tabs value={activeTab} onValueChange={(newTab) => {
        // Intercept tab change if evaluation is in progress
        if (activeTab === "evaluation" && newTab !== "evaluation" && evaluationFormRef.current?.hasChanges()) {
          setPendingTabChange(newTab);
          return;
        }
        setActiveTab(newTab);
      }} className="space-y-6">
        <div className="flex items-center gap-3 max-w-2xl">
          <TabsList className="bg-muted h-12 p-1 rounded-lg flex-1">
            <TabsTrigger value="radar" className="gap-2 flex-1 h-10 text-sm font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md rounded-md transition-all">
              <TrendingUp className="w-4 h-4" />
              Résultat
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2 flex-1 h-10 text-sm font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md rounded-md transition-all">
              <RotateCcw className="w-4 h-4" />
              Historique
            </TabsTrigger>
            {frameworkId && themes.length > 0 && (
              <TabsTrigger value="framework" className="gap-2 flex-1 h-10 text-sm font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md rounded-md transition-all">
                <BookOpen className="w-4 h-4" />
                Référentiel
              </TabsTrigger>
            )}
          </TabsList>
          {selectedEvaluation && (
            <Button variant="outline" size="sm" className="h-10 gap-2 border-primary/30 bg-primary/10 text-primary hover:bg-primary/20" onClick={() => handlePrint()} title="Imprimer ou exporter la fiche résultat">
              <Download className="w-4 h-4" />
              Imprimer résultat
            </Button>
          )}
        </div>

        {/* Radar Tab */}
        <TabsContent value="radar" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 glass-card p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-display font-semibold">Analyse des résultats</h2>
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
                    ) : selectedEvaluation ? (
                      (() => {
                        const coachEvals = evaluations
                          .filter(e => e.type === "coach_assessment" && !e.deleted_at)
                          .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
                        const evalIndex = coachEvals.findIndex(e => e.id === selectedEvaluation.id);
                        const evalNumber = evalIndex >= 0 ? evalIndex + 1 : "–";
                        const playerName = player ? `${player.first_name || ""} ${player.last_name || ""}`.trim() : "";
                        const coachName = referentCoach ? `${referentCoach.first_name || ""} ${referentCoach.last_name || ""}`.trim() : "";
                        const evalDate = new Date(selectedEvaluation.date);
                        const dateStr = evalDate.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
                        const timeStr = evalDate.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
                        return `Débrief N°${evalNumber} – ${playerName} – ${coachName} – ${dateStr} ${timeStr}`;
                      })()
                    ) : (
                      "Aucune évaluation"
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-4 flex-wrap">
                  {/* Multi-source checkboxes for admin/coach (god view) */}
                  {canEvaluate && !showComparison && (
                    <>
                      {/* Dernier débrief layer */}
                      {previousCoachEvaluation && (
                        <div className="flex items-center gap-2">
                          <Checkbox
                            id="coach-layer"
                            checked={comparisonIds.includes(previousCoachEvaluation.id)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setComparisonIds(prev => [...prev, previousCoachEvaluation.id]);
                              } else {
                                setComparisonIds(prev => prev.filter(id => id !== previousCoachEvaluation.id));
                              }
                            }}
                          />
                          <Label 
                            htmlFor="coach-layer" 
                            className="text-sm cursor-pointer flex items-center gap-1.5"
                          >
                            <ClipboardList className="w-4 h-4 text-primary" />
                            Dernier débrief
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
              <Button size="sm" variant="outline" onClick={() => { setIsCreatingNew(true); setNewEvalKey(k => k + 1); }}>
                <Plus className="w-4 h-4 mr-1" />
                Créer une nouvelle
              </Button>
            </div>
          )}
          
          {frameworkId && themes.length > 0 ? (
            <EvaluationForm
              ref={evaluationFormRef}
              key={isCreatingNew ? `new-${newEvalKey}` : (selectedEvaluation?.id || "empty")}
              playerId={player.id}
              playerName={getPlayerName()}
              teamId={teamMembership?.team_id || ""}
              frameworkId={frameworkId}
              themes={themes}
              existingEvaluation={isCreatingNew ? null : selectedEvaluation}
              previousEvaluation={(() => {
                if (!isCreatingNew) return undefined;
                const coachEvals = evaluations.filter(
                  e => e.type === "coach_assessment" && !e.deleted_at
                );
                return coachEvals[0] || undefined;
              })()}
              previousScores={(() => {
                const coachEvals = evaluations.filter(
                  e => e.type === "coach_assessment" && !e.deleted_at
                );
                const previousEval = isCreatingNew 
                  ? coachEvals[0]
                  : coachEvals[1];
                if (!previousEval) return undefined;
                const map: Record<string, number | null> = {};
                previousEval.scores.forEach(s => {
                  map[s.skill_id] = s.score;
                });
                return map;
              })()}
              onSaved={() => {
                setIsCreatingNew(false);
                fetchPlayerData();
              }}
              readOnly={!canEvaluate || isViewingHistory}
              coachName={referentCoach ? `${referentCoach.first_name || ""} ${referentCoach.last_name || ""}`.trim() : undefined}
              evaluationNumber={(() => {
                const coachEvals = evaluations
                  .filter(e => e.type === "coach_assessment" && !e.deleted_at)
                  .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
                return isCreatingNew ? coachEvals.length + 1 : coachEvals.findIndex(e => e.id === selectedEvaluation?.id) + 1;
              })()}
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



        {/* Framework Tab */}
        {frameworkId && themes.length > 0 && (
          <TabsContent value="framework">
            <div className="glass-card p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <BookOpen className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-xl font-display font-semibold">{frameworkName || "Référentiel de l'équipe"}</h2>
                    <p className="text-sm text-muted-foreground">
                      {teamMembership?.team?.name} · {themes.length} thématique{themes.length > 1 ? "s" : ""} · {themes.reduce((acc, t) => acc + t.skills.length, 0)} compétences
                    </p>
                  </div>
                </div>
                <Button variant="outline" size="sm" className="gap-2" onClick={() => handlePrintFramework()}>
                  <Download className="w-4 h-4" />
                  Imprimer
                </Button>
              </div>

              <div className="space-y-4">
                {themes.map((theme) => (
                  <div key={theme.id} className="border border-border rounded-xl overflow-hidden">
                    <div className="flex items-center gap-3 px-4 py-3 bg-muted/30">
                      <div
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: theme.color || "hsl(var(--primary))" }}
                      />
                      <h3 className="font-semibold text-sm">{theme.name}</h3>
                      <Badge variant="secondary" className="ml-auto text-xs">
                        {theme.skills.length} compétence{theme.skills.length > 1 ? "s" : ""}
                      </Badge>
                    </div>
                    {theme.skills.length > 0 && (
                      <div className="divide-y divide-border">
                        {theme.skills.map((skill) => (
                          <div key={skill.id} className="px-4 py-2.5 flex items-start gap-3">
                            <span className="text-sm font-medium">{skill.name}</span>
                            {skill.definition && (
                              <span className="text-xs text-muted-foreground ml-auto text-right max-w-[50%]">
                                {skill.definition}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Hidden printable framework */}
            <div style={{ position: "absolute", left: "-9999px", top: 0 }}>
              <PrintableFramework
                ref={frameworkPrintRef}
                frameworkName={frameworkName || "Référentiel de compétences"}
                teamName={teamMembership?.team?.name || ""}
                clubName={teamMembership?.team?.club?.name || ""}
                themes={themes}
              />
            </div>
          </TabsContent>
        )}

      </Tabs>

      {/* Interception dialog when leaving evaluation tab */}
      <AlertDialog open={!!pendingTabChange} onOpenChange={(open) => { if (!open) setPendingTabChange(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Débrief en cours</AlertDialogTitle>
            <AlertDialogDescription>
              Vous avez un débrief en cours avec des modifications non enregistrées. Que souhaitez-vous faire ?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-2 pt-2">
            <Button
              onClick={async () => {
                try {
                  await evaluationFormRef.current?.save();
                  setHasDraftEvaluation(true);
                  toast.success("Débrief sauvegardé en brouillon");
                } catch (e) {
                  toast.error("Erreur lors de la sauvegarde");
                }
                const tab = pendingTabChange;
                setPendingTabChange(null);
                if (tab) setActiveTab(tab);
              }}
              className="w-full justify-start gap-2"
            >
              <Save className="w-4 h-4" />
              Sauvegarder et reprendre plus tard
            </Button>
            <Button
              variant="secondary"
              onClick={async () => {
                try {
                  await evaluationFormRef.current?.save();
                  setIsCreatingNew(false);
                  setHasDraftEvaluation(false);
                  fetchPlayerData();
                  toast.success("Débrief finalisé avec succès");
                } catch (e) {
                  toast.error("Erreur lors de la sauvegarde");
                }
                const tab = pendingTabChange;
                setPendingTabChange(null);
                if (tab) setActiveTab(tab);
              }}
              className="w-full justify-start gap-2"
            >
              <ClipboardList className="w-4 h-4" />
              Finaliser le débrief
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setShowCancelConfirm(true);
              }}
              className="w-full justify-start gap-2 text-destructive hover:text-destructive"
            >
              <Trash2 className="w-4 h-4" />
              Annuler le débrief en cours
            </Button>
          </div>
          <div className="flex justify-end pt-2">
            <Button variant="ghost" size="sm" onClick={() => setPendingTabChange(null)}>
              Retour au débrief
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel confirmation dialog */}
      <AlertDialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer l'annulation</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir annuler ce débrief ? Toutes les modifications non enregistrées seront perdues. Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowCancelConfirm(false)}>
              Non, revenir
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setShowCancelConfirm(false);
                setIsCreatingNew(false);
                setHasDraftEvaluation(false);
                const tab = pendingTabChange;
                setPendingTabChange(null);
                if (tab) setActiveTab(tab);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Oui, annuler le débrief
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {showScrollTop && (
        <Button
          onClick={scrollToTop}
          size="icon"
          className="fixed bottom-6 right-6 z-50 rounded-full shadow-lg h-12 w-12"
          aria-label="Retour en haut"
        >
          <ChevronUp className="w-5 h-5" />
        </Button>
      )}
    </AppLayout>
  );
}
