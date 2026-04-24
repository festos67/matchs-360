/**
 * @page PlayerDetail
 * @route /players/:playerId
 *
 * Fiche détaillée d'un joueur — pivot central de l'application.
 *
 * @description
 * Page la plus complexe de l'app. Centralise la consultation et la création de
 * débriefs pour un joueur, l'historique de ses évaluations, ses objectifs
 * individuels et le référentiel de compétences associé à son équipe.
 *
 * @tabs
 * - **Résultat** : dernière évaluation officielle (radar coach par défaut, voir
 *   mem://logic/radar-view-priority). Possibilité d'overlay self/supporter.
 * - **Évolution** (alias "Historique" pour les non-joueurs) : 3 sections —
 *   Coach, Auto-débrief, Supporter (mem://features/evaluation-history).
 * - **Objectifs** : objectifs individuels avec drag-drop priorité
 *   (mem://features/player-objectives).
 * - **Référentiel** : vue lecture seule du framework actif.
 *
 * @access
 * - Coach assigné : peut créer/éditer débriefs (sauf historiques figés)
 * - Coach Référent / Club Admin / Admin : édition étendue + reset framework
 * - Joueur (lui-même) : lecture seule + bouton self-débrief
 *   (mem://features/player/interface-restrictions)
 * - Supporter lié : peut consulter résultat + créer débrief sur invitation
 *
 * @features
 * - Système de **brouillons** anti-perte (mem://features/evaluation-draft-system)
 * - **Mutation** de joueur entre équipes (mem://features/player-mutation)
 * - Export PDF avec pré-chargement base64 (PrintablePlayerSheet)
 * - Reset / Nouveau débrief — comportements distincts
 *   (mem://logic/evaluation/reset-vs-new-behavior)
 *
 * @maintenance
 * - L'auteur d'un débrief est identifié par `evaluator_id` (mem://technical/evaluation-structure)
 * - Snapshot du framework déclenché à chaque création de débrief
 *   (mem://technical/framework-snapshot-system)
 * - Calculs de progression : voir mem://features/progression-percentage-logic
 */
import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { TrendingUp, RotateCcw, BookOpen, ClipboardList, Download, Plus, Target, Save, Trash2, ChevronUp, Star, ArrowLeft, Pencil, X } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useReactToPrint } from "react-to-print";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EvaluationForm, type EvaluationFormHandle } from "@/components/evaluation/EvaluationForm";
import { PrintablePlayerSheet } from "@/components/evaluation/PrintablePlayerSheet";
import { PrintableFramework } from "@/components/framework/PrintableFramework";
import { ReadOnlyFrameworkView } from "@/components/framework/ReadOnlyFrameworkView";
import { PlayerMutationModal } from "@/components/modals/PlayerMutationModal";
import { EditPlayerModal } from "@/components/modals/EditPlayerModal";
import { ManageSupportersModal } from "@/components/modals/ManageSupportersModal";
import { RequestSupporterEvaluationModal } from "@/components/modals/RequestSupporterEvaluationModal";

import { PlayerSidebar } from "@/components/player/PlayerSidebar";
import { PlayerEvaluationTab } from "@/components/player/PlayerEvaluationTab";
import { PlayerHistoryTab } from "@/components/player/PlayerHistoryTab";
import { PlayerObjectivesTab } from "@/components/player/PlayerObjectivesTab";

import { usePlayerData, getPlayerName } from "@/hooks/usePlayerData";
import { calculateRadarData, calculateOverallAverage, type ThemeScores } from "@/lib/evaluation-utils";
import { useAuth } from "@/hooks/useAuth";
import { useClubAdminScope } from "@/hooks/useClubAdminScope";
import { toast } from "sonner";
import { loadFrameworkThemes } from "@/lib/framework-loader";
import type { Evaluation, Theme } from "@/hooks/usePlayerData";

export default function PlayerDetail() {
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading, roles } = useAuth();
  const { isSuperAdmin, myAdminClubIds } = useClubAdminScope();
  const navigate = useNavigate();

  const {
    player, teamMembership, referentCoach,
    frameworkId, frameworkName, themes, evaluations,
    canEvaluate, canMutate, isAdmin, isPlayerViewingOwnProfile,
    loading, refetchAll, refetchEvaluations,
  } = usePlayerData(id);

  // Local UI state
  const [selectedEvaluation, setSelectedEvaluation] = useState<Evaluation | null>(null);
  const [selectedEvalThemes, setSelectedEvalThemes] = useState<Theme[]>([]);
  const [comparisonIds, setComparisonIds] = useState<string[]>([]);
  const [isViewingHistory, setIsViewingHistory] = useState(false);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newEvalKey, setNewEvalKey] = useState(0);
  const [activeTab, setActiveTab] = useState("radar");
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [pendingTabChange, setPendingTabChange] = useState<string | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [hasDraftEvaluation, setHasDraftEvaluation] = useState(false);
  const [historyPrintEvaluation, setHistoryPrintEvaluation] = useState<Evaluation | null>(null);
  const [historyPrintThemes, setHistoryPrintThemes] = useState<Theme[]>([]);

  // Modals
  const [showMutationModal, setShowMutationModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showSupportersModal, setShowSupportersModal] = useState(false);
  const [showRequestSupporterModal, setShowRequestSupporterModal] = useState(false);

  // Refs
  const printRef = useRef<HTMLDivElement>(null);
  const historyPrintRef = useRef<HTMLDivElement>(null);
  const frameworkPrintRef = useRef<HTMLDivElement>(null);
  const radarSectionRef = useRef<HTMLDivElement>(null);
  const evaluationFormRef = useRef<EvaluationFormHandle>(null);

  // Scroll handler
  useEffect(() => {
    const main = document.querySelector("main");
    if (!main) return;
    const handleScroll = () => setShowScrollTop(main.scrollTop > 400);
    main.addEventListener("scroll", handleScroll);
    return () => main.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToTop = useCallback(() => document.querySelector("main")?.scrollTo({ top: 0, behavior: "smooth" }), []);
  const scrollToRadar = useCallback(() => {
    setTimeout(() => radarSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 300);
  }, []);

  // Redirect if not authed
  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  // Drill-in guard: club_admin viewing a player whose team belongs to a foreign club
  useEffect(() => {
    if (!teamMembership) return;
    if (isSuperAdmin) return;
    const isClubAdminRole = roles.some((r) => r.role === "club_admin");
    if (!isClubAdminRole) return;
    const playerClubId = teamMembership.team?.club_id;
    if (playerClubId && !myAdminClubIds.includes(playerClubId)) {
      toast.error("Accès refusé : ressource hors de votre club");
      navigate("/players");
    }
  }, [teamMembership, isSuperAdmin, myAdminClubIds, roles, navigate]);

  // Set initial selected evaluation when data loads
  useEffect(() => {
    if (evaluations.length > 0 && !selectedEvaluation) {
      const latestCoach = evaluations.find(e => e.type === "coach" && !e.deleted_at && e.framework_id === frameworkId);
      setSelectedEvaluation(latestCoach || evaluations.filter(e => !e.deleted_at)[0] || null);
    }
  }, [evaluations, selectedEvaluation, frameworkId]);

  // Sync selectedEvalThemes with themes
  useEffect(() => {
    if (themes.length > 0) setSelectedEvalThemes(themes);
  }, [themes]);

  // Print handlers
  const handlePrint = useReactToPrint({ contentRef: printRef, documentTitle: `Fiche_${player?.first_name || "Joueur"}_${new Date().toLocaleDateString("fr-FR")}` });
  const handlePrintFramework = useReactToPrint({ contentRef: frameworkPrintRef, documentTitle: `Referentiel_${teamMembership?.team?.name || "Equipe"}_${new Date().toLocaleDateString("fr-FR")}` });
  const handlePrintHistory = useReactToPrint({ contentRef: historyPrintRef, documentTitle: `Fiche_${player?.first_name || "Joueur"}_${new Date().toLocaleDateString("fr-FR")}` });

  const handlePrintEvaluationFromHistory = useCallback(async (evaluation: Evaluation) => {
    let printThemes = themes;
    if (evaluation.framework_id && evaluation.framework_id !== frameworkId) {
      const { themes: loaded } = await loadFrameworkThemes(evaluation.framework_id);
      printThemes = loaded;
    }
    setHistoryPrintThemes(printThemes);
    setHistoryPrintEvaluation(evaluation);
    setTimeout(() => handlePrintHistory(), 300);
  }, [handlePrintHistory, themes, frameworkId]);

  // Helpers
  const getRadarDataFromEvaluation = (evaluation: Evaluation | null, useThemes?: Theme[]): ThemeScores[] => {
    const t = useThemes || selectedEvalThemes;
    if (!evaluation || t.length === 0) return [];
    return t.map(theme => ({
      theme_id: theme.id,
      theme_name: theme.name,
      theme_color: theme.color,
      skills: theme.skills.map(skill => {
        const score = evaluation.scores.find(s => s.skill_id === skill.id);
        return { skill_id: skill.id, score: score?.score ?? null, is_not_observed: score?.is_not_observed ?? false, comment: score?.comment ?? null };
      }),
      objective: evaluation.objectives.find(o => o.theme_id === theme.id)?.content ?? null,
    }));
  };

  const latestOfficialEvaluation = evaluations.find(e => e.type === "coach" && !e.deleted_at && e.framework_id === frameworkId);
  const overallAverage = calculateOverallAverage(getRadarDataFromEvaluation(latestOfficialEvaluation || null, themes));

  const handleViewEvaluation = async (evaluation: Evaluation) => {
    setSelectedEvaluation(evaluation);
    const latestCoachOnCurrentFw = evaluations.find(e => e.type === "coach" && !e.deleted_at && e.framework_id === frameworkId);
    setIsViewingHistory(evaluation.id !== latestCoachOnCurrentFw?.id);
    if (evaluation.framework_id && evaluation.framework_id !== frameworkId) {
      const { themes: loaded } = await loadFrameworkThemes(evaluation.framework_id);
      setSelectedEvalThemes(loaded);
    } else {
      setSelectedEvalThemes(themes);
    }
    setActiveTab("radar");
  };

  const handleReturnToCurrent = () => {
    if (evaluations.length > 0) {
      setSelectedEvaluation(evaluations[0]);
      setIsViewingHistory(false);
      setComparisonIds([]);
      setSelectedEvalThemes(themes);
    }
  };

  const toggleComparison = (evalId: string) => {
    setComparisonIds(prev => {
      if (prev.includes(evalId)) return prev.filter(id => id !== evalId);
      if (prev.length >= 3) { toast.error("Maximum 3 débriefs en comparaison"); return prev; }
      return [...prev, evalId];
    });
  };

  // Progression calculation
  const getProgressionData = () => {
    const activeCoachEvals = evaluations.filter(e => !e.deleted_at && e.type === "coach");
    if (activeCoachEvals.length < 2) return { percent: null };
    const currentAvg = calculateOverallAverage(getRadarDataFromEvaluation(activeCoachEvals[0]));
    const previousAvg = calculateOverallAverage(getRadarDataFromEvaluation(activeCoachEvals[1]));
    if (currentAvg === null || previousAvg === null || previousAvg === 0) return { percent: null };
    return { percent: Math.round(((currentAvg - previousAvg) / previousAvg) * 100) };
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
  const playerName = getPlayerName(player);

  // Print datasets for PrintablePlayerSheet
  const comparisonDatasets = (() => {
    const datasets: Array<{ label: string; data: ReturnType<typeof calculateRadarData>; color: string }> = [];
    comparisonIds.forEach((evalId, index) => {
      const evaluation = evaluations.find(e => e.id === evalId);
      if (evaluation && evaluation.id !== selectedEvaluation?.id) {
        datasets.push({ label: evaluation.name, data: calculateRadarData(getRadarDataFromEvaluation(evaluation)), color: ["#6B7280", "#F97316", "#06B6D4", "#8B5CF6"][index % 4] });
      }
    });
    return datasets;
  })();

  return (
    <AppLayout>
      {/* Hidden printable components */}
      <div className="hidden">
        {selectedEvaluation && teamMembership && (
          <PrintablePlayerSheet
            ref={printRef}
            player={player}
            club={{ name: teamMembership.team.club?.name || "", logo_url: teamMembership.team.club?.logo_url, primary_color: teamColor }}
            team={{ name: teamMembership.team.name }}
            evaluation={selectedEvaluation}
            themes={selectedEvalThemes}
            progressionPercent={getProgressionData().percent}
            previousEvaluationDate={(() => {
              const activeCoachEvals = evaluations.filter(e => !e.deleted_at && e.type === "coach" && e.framework_id === frameworkId);
              return activeCoachEvals.length >= 2 ? activeCoachEvals[1].date : null;
            })()}
            comparisonDatasets={comparisonDatasets}
          />
        )}
        {historyPrintEvaluation && teamMembership && (
          <PrintablePlayerSheet
            ref={historyPrintRef}
            player={player}
            club={{ name: teamMembership.team.club?.name || "", logo_url: teamMembership.team.club?.logo_url, primary_color: teamColor }}
            team={{ name: teamMembership.team.name }}
            evaluation={historyPrintEvaluation}
            themes={historyPrintThemes.length > 0 ? historyPrintThemes : themes}
          />
        )}
      </div>

      {/* Layout sidebar + contenu */}
      <div className="flex flex-col lg:flex-row -m-3 md:-m-6 lg:gap-0 min-h-[calc(100vh-3.5rem)]">
        <PlayerSidebar
          player={player}
          teamMembership={teamMembership}
          referentCoach={referentCoach}
          overallAverage={overallAverage}
          evaluations={evaluations}
          canEvaluate={canEvaluate}
          canMutate={canMutate}
          isAdmin={isAdmin}
          isPlayerViewingOwnProfile={isPlayerViewingOwnProfile}
          isViewingHistory={isViewingHistory}
          hasDraftEvaluation={hasDraftEvaluation}
          hasSelectedEvaluation={!!selectedEvaluation}
          progressionData={getProgressionData()}
          onNewEvaluation={(resume: boolean) => {
            if (resume) {
              setIsCreatingNew(false);
              setHasDraftEvaluation(false);
              setActiveTab("evaluation");
              scrollToRadar();
            } else {
              setIsCreatingNew(true);
              setNewEvalKey(k => k + 1);
              setHasDraftEvaluation(false);
              setActiveTab("evaluation");
              scrollToRadar();
            }
          }}
          onRequestSelfEval={() => toast.success("Demande d'auto-débrief envoyée au joueur")}
          onRequestSupporterEval={() => setShowRequestSupporterModal(true)}
          onEditPlayer={() => setShowEditModal(true)}
          onTransferPlayer={() => setShowMutationModal(true)}
          onManageSupporters={() => setShowSupportersModal(true)}
          onPrint={() => handlePrint()}
        />

        {/* Contenu principal */}
        <div className="flex-1 min-w-0 p-4 md:p-5">

      {/* Modals */}
      {teamMembership && (
        <PlayerMutationModal open={showMutationModal} onOpenChange={setShowMutationModal} playerId={id!} playerName={playerName} currentTeamId={teamMembership.team_id} currentTeamName={teamMembership.team.name} clubId={teamMembership.team.club_id} onSuccess={refetchAll} />
      )}
      {player && teamMembership && (
        <ManageSupportersModal
          open={showSupportersModal} onOpenChange={setShowSupportersModal} playerId={id!} playerName={playerName} clubId={teamMembership.team.club_id} onSuccess={refetchAll}
          onViewEvaluation={(evaluationId) => {
            const evaluation = evaluations.find(e => e.id === evaluationId);
            if (evaluation) { setShowSupportersModal(false); handleViewEvaluation(evaluation); }
          }}
        />
      )}
      {player && (
        <RequestSupporterEvaluationModal open={showRequestSupporterModal} onOpenChange={setShowRequestSupporterModal} playerId={id!} playerName={playerName} onSuccess={refetchAll} />
      )}
      {player && (
        <EditPlayerModal open={showEditModal} onOpenChange={setShowEditModal} player={player} onSuccess={refetchAll} />
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(newTab) => {
        if (activeTab === "evaluation" && newTab !== "evaluation" && evaluationFormRef.current?.hasChanges()) {
          setPendingTabChange(newTab);
          return;
        }
        setActiveTab(newTab);
      }} className="space-y-6">
        <div className="flex items-center gap-3 w-full">
          <TabsList className="bg-muted h-12 p-1 rounded-lg w-full">
            <TabsTrigger value="radar" className="gap-2 flex-1 h-10 text-sm font-semibold data-[state=active]:bg-accent data-[state=active]:text-accent-foreground data-[state=active]:shadow-md rounded-md transition-all">
              <TrendingUp className="w-4 h-4" />Résultat
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2 flex-1 h-10 text-sm font-semibold data-[state=active]:bg-accent data-[state=active]:text-accent-foreground data-[state=active]:shadow-md rounded-md transition-all">
              <RotateCcw className="w-4 h-4" />Évolution
            </TabsTrigger>
            {frameworkId && themes.length > 0 && (
              <TabsTrigger value="framework" className="gap-2 flex-1 h-10 text-sm font-semibold data-[state=active]:bg-accent data-[state=active]:text-accent-foreground data-[state=active]:shadow-md rounded-md transition-all">
                <BookOpen className="w-4 h-4" />Référentiel de l'équipe
              </TabsTrigger>
            )}
            {teamMembership && (
              <TabsTrigger value="objectives" className="gap-2 flex-1 h-10 text-sm font-semibold data-[state=active]:bg-accent data-[state=active]:text-accent-foreground data-[state=active]:shadow-md rounded-md transition-all">
                <Target className="w-4 h-4" />Objectifs
              </TabsTrigger>
            )}
          </TabsList>
        </div>

        {/* Radar Tab */}
        <TabsContent value="radar">
          <PlayerEvaluationTab
            player={player}
            teamMembership={teamMembership}
            referentCoach={referentCoach}
            evaluations={evaluations}
            selectedEvaluation={selectedEvaluation}
            selectedEvalThemes={selectedEvalThemes}
            themes={themes}
            frameworkId={frameworkId}
            canEvaluate={canEvaluate}
            isViewingHistory={isViewingHistory}
            comparisonIds={comparisonIds}
            onReturnToCurrent={handleReturnToCurrent}
            onToggleComparison={toggleComparison}
            hideSupporterLayer={isPlayerViewingOwnProfile}
          />
        </TabsContent>

        {/* Evaluation Tab */}
        <TabsContent value="evaluation" ref={radarSectionRef}>
          {isCreatingNew && (
            <div className="mb-4 p-3 bg-success/10 border border-success/30 rounded-lg flex items-center justify-between">
              <span className="text-sm text-success">✨ <strong>Nouvelle évaluation</strong> - Les données seront enregistrées séparément</span>
              <Button size="sm" variant="outline" onClick={() => setIsCreatingNew(false)}>Annuler</Button>
            </div>
          )}
          {!isCreatingNew && selectedEvaluation && !isViewingHistory && (
            <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg flex items-center justify-between">
              <span className="text-sm text-blue-600 dark:text-blue-400">📝 Modification de: <strong>{selectedEvaluation.name}</strong></span>
              <Button size="sm" variant="outline" onClick={() => { setIsCreatingNew(true); setNewEvalKey(k => k + 1); }}>
                <Plus className="w-4 h-4 mr-1" />Créer une nouvelle
              </Button>
            </div>
          )}
          {frameworkId && themes.length > 0 ? (
            <EvaluationForm
              ref={evaluationFormRef}
              key={isCreatingNew ? `new-${newEvalKey}` : (selectedEvaluation?.id || "empty")}
              playerId={player.id}
              playerName={playerName}
              teamId={teamMembership?.team_id || ""}
              frameworkId={frameworkId}
              themes={themes}
              existingEvaluation={isCreatingNew ? null : selectedEvaluation}
              previousEvaluation={(() => {
                if (!isCreatingNew) return undefined;
                const coachEvals = evaluations.filter(e => e.type === "coach" && !e.deleted_at && e.framework_id === frameworkId);
                return coachEvals[0] || undefined;
              })()}
              previousScores={(() => {
                const coachEvals = evaluations.filter(e => e.type === "coach" && !e.deleted_at && e.framework_id === frameworkId);
                const previousEval = isCreatingNew ? coachEvals[0] : coachEvals[1];
                if (!previousEval) return undefined;
                const map: Record<string, number | null> = {};
                previousEval.scores.forEach(s => { map[s.skill_id] = s.score; });
                return map;
              })()}
              onSaved={async (savedEvaluationId) => {
                setComparisonIds([]);
                setIsViewingHistory(false);
                setActiveTab("radar");

                const { data: refreshedEvaluations } = await refetchEvaluations();
                const activeEvaluations = (refreshedEvaluations ?? []).filter(e => !e.deleted_at);
                const latestCoach = activeEvaluations.find(e => e.type === "coach" && e.framework_id === frameworkId);
                const savedEvaluation = activeEvaluations.find(e => e.id === savedEvaluationId);

                setSelectedEvaluation(savedEvaluation || latestCoach || activeEvaluations[0] || null);
                setSelectedEvalThemes(themes);
                setIsCreatingNew(false);

                setTimeout(() => {
                  document.querySelector("main")?.scrollTo({ top: 0, behavior: "smooth" });
                }, 300);
              }}
              readOnly={!canEvaluate || isViewingHistory}
              coachName={referentCoach ? `${referentCoach.first_name || ""} ${referentCoach.last_name || ""}`.trim() : undefined}
              evaluationNumber={(() => {
                const coachEvals = evaluations.filter(e => e.type === "coach" && !e.deleted_at && e.framework_id === frameworkId).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
                return isCreatingNew ? coachEvals.length + 1 : coachEvals.findIndex(e => e.id === selectedEvaluation?.id) + 1;
              })()}
            />
          ) : (
            <div className="glass-card p-12 text-center">
              <ClipboardList className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium text-muted-foreground">Référentiel non configuré</h3>
              <p className="text-sm text-muted-foreground mt-1">L'équipe doit d'abord configurer son référentiel de compétences</p>
              {teamMembership && (
                <Button className="mt-4" onClick={() => navigate(`/teams/${teamMembership.team_id}/framework`)}>Configurer le référentiel</Button>
              )}
            </div>
          )}
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history">
          <PlayerHistoryTab
            evaluations={evaluations}
            themes={themes}
            selectedEvaluation={selectedEvaluation}
            comparisonIds={comparisonIds}
            teamColor={teamColor}
            canEvaluate={canEvaluate}
            currentFrameworkId={frameworkId}
            onViewEvaluation={handleViewEvaluation}
            onEditEvaluation={(evaluation) => {
              setSelectedEvaluation(evaluation);
              setSelectedEvalThemes(themes);
              setIsCreatingNew(false);
              setIsViewingHistory(false);
              setActiveTab("evaluation");
            }}
            onToggleComparison={toggleComparison}
            onRefresh={refetchAll}
            onPrintEvaluation={handlePrintEvaluationFromHistory}
            hideSupporterSection={isPlayerViewingOwnProfile}
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
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="gap-2" onClick={() => handlePrintFramework()}>
                    <Download className="w-4 h-4" />Imprimer
                  </Button>
                  {isPlayerViewingOwnProfile && (
                    <Button size="sm" variant="accent" className="gap-2" onClick={() => navigate("/player/self-evaluation")}>
                      <Star className="w-4 h-4" />M'auto-débriefer
                    </Button>
                  )}
                </div>
              </div>
              <ReadOnlyFrameworkView themes={themes} />
            </div>
            <div style={{ position: "absolute", left: "-9999px", top: 0 }}>
              <PrintableFramework ref={frameworkPrintRef} frameworkName={frameworkName || "Référentiel de compétences"} teamName={teamMembership?.team?.name || ""} clubName={teamMembership?.team?.club?.name || ""} clubLogoUrl={teamMembership?.team?.club?.logo_url} themes={themes} />
            </div>
          </TabsContent>
        )}

        {/* Objectives Tab */}
        {teamMembership && (
          <TabsContent value="objectives">
            <PlayerObjectivesTab playerId={id!} teamId={teamMembership.team_id} canEdit={canEvaluate} />
          </TabsContent>
        )}
      </Tabs>

      {/* Tab change interception dialog */}
      <AlertDialog open={!!pendingTabChange} onOpenChange={(open) => { if (!open) setPendingTabChange(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Débrief en cours</AlertDialogTitle>
            <AlertDialogDescription>Vous avez un débrief en cours avec des modifications non enregistrées. Que souhaitez-vous faire ?</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-2 pt-2">
            <Button onClick={async () => {
              try { await evaluationFormRef.current?.save(); setHasDraftEvaluation(true); toast.success("Débrief sauvegardé en brouillon"); scrollToTop(); } catch { toast.error("Erreur lors de la sauvegarde"); }
              const tab = pendingTabChange; setPendingTabChange(null); if (tab) setActiveTab(tab);
            }} className="w-full justify-start gap-2">
              <Save className="w-4 h-4" />Sauvegarder et reprendre plus tard
            </Button>
            <Button variant="secondary" onClick={async () => {
              try { await evaluationFormRef.current?.save(); setIsCreatingNew(false); setHasDraftEvaluation(false); refetchAll(); toast.success("Débrief finalisé avec succès"); scrollToTop(); } catch { toast.error("Erreur lors de la sauvegarde"); }
              const tab = pendingTabChange; setPendingTabChange(null); if (tab) setActiveTab(tab);
            }} className="w-full justify-start gap-2">
              <ClipboardList className="w-4 h-4" />Finaliser le débrief
            </Button>
            <Button variant="outline" onClick={() => setShowCancelConfirm(true)} className="w-full justify-start gap-2 text-destructive hover:text-destructive">
              <Trash2 className="w-4 h-4" />Annuler le débrief en cours
            </Button>
          </div>
          <div className="flex justify-end pt-2">
            <Button variant="ghost" size="sm" onClick={() => setPendingTabChange(null)}>Retour au débrief</Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel confirmation */}
      <AlertDialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmer l'annulation</AlertDialogTitle>
            <AlertDialogDescription>Êtes-vous sûr de vouloir annuler ce débrief ? Toutes les modifications non enregistrées seront perdues.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Non, revenir</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              setShowCancelConfirm(false); setIsCreatingNew(false); setHasDraftEvaluation(false);
              const tab = pendingTabChange; setPendingTabChange(null); if (tab) setActiveTab(tab);
            }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Oui, annuler le débrief
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {showScrollTop && (
        <Button onClick={scrollToTop} size="icon" className="fixed bottom-6 right-6 z-50 rounded-full shadow-lg h-12 w-12" aria-label="Retour en haut">
          <ChevronUp className="w-5 h-5" />
        </Button>
      )}
        </div>
      </div>
    </AppLayout>
  );
}
