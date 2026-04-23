/**
 * @page TeamDetail
 * @route /teams/:teamId
 *
 * Fiche détaillée d'une équipe (effectif, performance, référentiel, objectifs).
 *
 * @tabs
 * - **Effectif** : joueurs, coachs (référent + assistants), supporters de l'équipe
 * - **Performance** : KPI progression équipe + bilan des objectifs collectifs
 *   (mem://features/team-progression-kpi, mem://features/team-performance-layout)
 * - **Objectifs** : objectifs d'équipe avec notifications automatiques
 *   (mem://features/team-objectives)
 * - **Référentiel** : framework de l'équipe — initialisé depuis un modèle club
 *   (mem://logic/team-framework-initialization-rules)
 *
 * @access
 * - Coach Référent : édition complète + réinitialisation framework
 * - Coach Assistant : lecture seule sur les actions de gestion
 *   (mem://features/coach-team-workflow)
 * - Club Admin / Admin : tous droits
 * - Joueur : voit uniquement son équipe (mem://logic/coach-teams-visibility)
 *
 * @features
 * - Création de joueurs/coachs/supporters via modales contextuelles
 * - Mutation de joueur (transfert vers une autre équipe)
 * - Export PDF du référentiel avec logo club en base64
 * - Historique des versions du référentiel (snapshots)
 *
 * @maintenance
 * - `team_members` est la source de vérité du `coach_role`
 *   (mem://logic/coach-role-integrity)
 * - La réinitialisation du framework crée un snapshot avant écrasement
 *   (mem://features/framework-lifecycle-management)
 */
import { useState, useRef, useEffect } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Plus, User, Star, ShieldCheck, Settings, FileText, UserCog, BookOpen, Layers, Trash2, ArrowRightLeft, ClipboardList, TrendingUp, TrendingDown, Minus, Printer, Pencil, History, RotateCcw, Target, Check, X } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { AppLayout } from "@/components/layout/AppLayout";
import { CircleAvatar } from "@/components/shared/CircleAvatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CreatePlayerModal } from "@/components/modals/CreatePlayerModal";
import { EditTeamModal } from "@/components/modals/EditTeamModal";
import { CreateCoachModal } from "@/components/modals/CreateCoachModal";
import { CreateSupporterModal } from "@/components/modals/CreateSupporterModal";
import { PlayerMutationModal } from "@/components/modals/PlayerMutationModal";
import { useAuth } from "@/hooks/useAuth";
import { useClubAdminScope } from "@/hooks/useClubAdminScope";
import { snapshotFramework } from "@/lib/framework-snapshot";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTeamProgression } from "@/hooks/useTeamProgression";
import { PrintableFramework } from "@/components/framework/PrintableFramework";
import { FrameworkHistorySheet } from "@/components/framework/FrameworkHistorySheet";
import { ReadOnlyFrameworkView } from "@/components/framework/ReadOnlyFrameworkView";
import { FrameworkEditDialog } from "@/components/framework/FrameworkEditDialog";
import { AddEntityButton } from "@/components/shared/AddEntityButton";
import { FrameworkNameModal } from "@/components/modals/FrameworkNameModal";
import { useReactToPrint } from "react-to-print";
import { ObjectivesList } from "@/components/objectives/ObjectivesList";
import { ObjectivesStats } from "@/components/objectives/ObjectivesStats";

interface Team {
  id: string;
  name: string;
  short_name: string | null;
  season: string | null;
  color: string | null;
  club_id: string;
  club?: { name: string; primary_color: string; logo_url?: string | null };
}

interface TeamMember {
  id: string;
  member_type: "coach" | "player";
  coach_role: "referent" | "assistant" | null;
  profile: { id: string; first_name: string | null; last_name: string | null; nickname: string | null; photo_url: string | null };
}

interface Skill {
  id: string;
  name: string;
  definition: string | null;
  order_index: number;
  isNew?: boolean;
}

interface Theme {
  id: string;
  name: string;
  color: string | null;
  order_index: number;
  skills: Skill[];
  isNew?: boolean;
}

interface Framework {
  id: string;
  name: string;
  themes: Theme[];
}

export default function TeamDetail() {
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading, hasAdminRole: isAdmin, roles } = useAuth();
  const { isSuperAdmin, myAdminClubIds } = useClubAdminScope();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [showPlayerModal, setShowPlayerModal] = useState(false);
  const [showCoachModal, setShowCoachModal] = useState(false);
  const [showSupporterModal, setShowSupporterModal] = useState(false);
  const [showTeamSettings, setShowTeamSettings] = useState(false);
  const [mutationPlayer, setMutationPlayer] = useState<{ id: string; name: string } | null>(null);
  const [showFrameworkHistory, setShowFrameworkHistory] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") || "effectif");
  const [showEditConfirm, setShowEditConfirm] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [pendingOpenEdit, setPendingOpenEdit] = useState(searchParams.get("editFramework") === "true");
  const [showNameModal, setShowNameModal] = useState(false);
  const [pendingEditThemes, setPendingEditThemes] = useState<Theme[] | null>(null);
  const [saving, setSaving] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);
  const frameworkRef = useRef<HTMLDivElement>(null);

  const handlePrintFramework = useReactToPrint({
    contentRef: printRef,
    documentTitle: "Référentiel",
  });

  // Fetch team data
  const { data: team, isLoading: loadingTeam } = useQuery({
    queryKey: ["team-detail", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("teams").select("*, club:clubs(name, primary_color)").eq("id", id!).maybeSingle();
      if (error) throw error;
      if (!data) { toast.error("Équipe non trouvée"); navigate("/clubs"); return null; }
      return data as Team;
    },
    enabled: !!user && !!id,
  });

  // Drill-in guard: club_admin (not super-admin) viewing a team outside their scope
  useEffect(() => {
    if (!team) return;
    if (isSuperAdmin) return;
    const isClubAdminRole = roles.some((r) => r.role === "club_admin");
    if (!isClubAdminRole) return;
    if (!myAdminClubIds.includes(team.club_id)) {
      toast.error("Accès refusé : ressource hors de votre club");
      navigate("/teams");
    }
  }, [team, isSuperAdmin, myAdminClubIds, roles, navigate]);

  // Fetch members
  const { data: members = [], isLoading: loadingMembers } = useQuery({
    queryKey: ["team-members", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("team_members").select("id, member_type, coach_role, profile:profiles!inner(id, first_name, last_name, nickname, photo_url, deleted_at)").eq("team_id", id!).eq("is_active", true).is("profile.deleted_at", null);
      if (error) throw error;
      return (data || []) as TeamMember[];
    },
    enabled: !!user && !!id,
  });

  // Fetch framework
  const { data: framework = null } = useQuery({
    queryKey: ["team-framework", id],
    queryFn: async () => {
      const { data: frameworkData } = await supabase
        .from("competence_frameworks")
        .select("id, name")
        .eq("team_id", id!)
        .eq("is_archived", false)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!frameworkData) return null;

      const { data: themesData } = await supabase
        .from("themes")
        .select("id, name, color, order_index, skills(id, name, definition, order_index)")
        .eq("framework_id", frameworkData.id)
        .order("order_index");

      const sortedThemes = (themesData || []).map(t => ({
        ...t,
        skills: (t.skills || []).sort((a: Skill, b: Skill) => a.order_index - b.order_index),
      }));

      return { ...frameworkData, themes: sortedThemes } as Framework;
    },
    enabled: !!user && !!id,
  });

  // Auto-open edit dialog after framework initialization
  useEffect(() => {
    if (pendingOpenEdit && framework) {
      setPendingOpenEdit(false);
      setShowEditDialog(true);
    }
  }, [pendingOpenEdit, framework]);

  const playerUserIds = members.filter(m => m.member_type === "player").map(m => m.profile.id);
  const { data: supporterCount = 0 } = useQuery({
    queryKey: ["team-supporter-count", id, playerUserIds],
    queryFn: async () => {
      if (playerUserIds.length === 0) return 0;
      const { count } = await supabase
        .from("supporters_link")
        .select("id", { count: "exact", head: true })
        .in("player_id", playerUserIds);
      return count || 0;
    },
    enabled: playerUserIds.length > 0,
  });

  const isClubAdmin = team ? roles.some(r => r.role === "club_admin" && r.club_id === team.club_id) : false;
  const isCoachOfTeam = members.some(m => m.member_type === "coach" && m.profile.id === user?.id);
  const isReferentCoach = members.some(m => m.member_type === "coach" && m.profile.id === user?.id && m.coach_role === "referent");
  const isPlayerViewing = !isAdmin && !isClubAdmin && !isCoachOfTeam && members.some(m => m.member_type === "player" && m.profile.id === user?.id);
  const isSupporterViewing = roles.some(r => r.role === "supporter") && !isAdmin && !isClubAdmin && !isCoachOfTeam && !isPlayerViewing;
  const canManageTeam = isAdmin || isClubAdmin || isCoachOfTeam;
  const canEditFramework = isAdmin || isClubAdmin || isReferentCoach;
  const canMutatePlayers = isAdmin || isClubAdmin;
  const canEditObjectives = isAdmin || isClubAdmin || isReferentCoach;
  const canViewObjectives = canEditObjectives || isCoachOfTeam || isPlayerViewing;

  const coaches = members.filter(m => m.member_type === "coach");
  const players = members.filter(m => m.member_type === "player");
  const playerIds = players.map(p => p.profile.id);
  const { data: progression, isLoading: loadingProgression } = useTeamProgression(id, playerIds);

  const getMemberName = (member: TeamMember) => {
    const { profile } = member;
    if (profile.nickname) return profile.nickname;
    if (profile.first_name && profile.last_name) return `${profile.first_name} ${profile.last_name}`;
    return profile.first_name || profile.last_name || "Utilisateur";
  };

  const totalSkills = framework?.themes.reduce((acc, theme) => acc + theme.skills.length, 0) || 0;

  const invalidateTeamData = () => {
    queryClient.invalidateQueries({ queryKey: ["team-detail", id] });
    queryClient.invalidateQueries({ queryKey: ["team-members", id] });
    queryClient.invalidateQueries({ queryKey: ["team-framework", id] });
    queryClient.invalidateQueries({ queryKey: ["team-supporter-count", id] });
  };

  const handleDeleteFramework = async () => {
    if (!framework) return;
    try {
      await snapshotFramework(framework.id);
      const { error } = await supabase
        .from("competence_frameworks")
        .update({ is_archived: true, archived_at: new Date().toISOString() })
        .eq("id", framework.id);
      
      if (error) throw error;
      
      queryClient.invalidateQueries({ queryKey: ["team-framework", id] });
      toast.success("Référentiel archivé — récupérable via l'historique");
    } catch (error: unknown) {
      console.error("Error archiving framework:", error);
      toast.error("Erreur lors de la suppression");
    }
  };

  // Navigate to framework section
  const handleGoToFramework = () => {
    setActiveTab("indicateurs");
    setTimeout(() => {
      frameworkRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 300);
  };

  // Framework edit flow (same as ClubFrameworkEditor)
  const handleEditSave = (editedThemes: Theme[]) => {
    setPendingEditThemes(editedThemes);
    setShowEditDialog(false);
    setShowNameModal(true);
  };

  const handleSave = async (confirmedName: string) => {
    if (!framework || !pendingEditThemes) return;
    setShowNameModal(false);
    setSaving(true);

    try {
      try {
        await snapshotFramework(framework.id);
      } catch (snapError) {
        console.warn("Snapshot failed, continuing save:", snapError);
      }

      const { error: fwError } = await supabase
        .from("competence_frameworks")
        .update({ name: confirmedName })
        .eq("id", framework.id);
      if (fwError) throw fwError;

      const allPersistedThemeIds: string[] = [];

      for (const theme of pendingEditThemes) {
        if (theme.isNew) {
          const { data: newTheme, error } = await supabase
            .from("themes")
            .insert({ framework_id: framework.id, name: theme.name, color: theme.color, order_index: theme.order_index })
            .select()
            .single();
          if (error) throw error;
          allPersistedThemeIds.push(newTheme.id);

          if (theme.skills.length > 0) {
            const skillsToInsert = theme.skills.map(s => ({
              theme_id: newTheme.id, name: s.name, definition: s.definition, order_index: s.order_index,
            }));
            const { error: skillsError } = await supabase.from("skills").insert(skillsToInsert);
            if (skillsError) throw skillsError;
          }
        } else {
          allPersistedThemeIds.push(theme.id);
          const { error: themeError } = await supabase
            .from("themes")
            .update({ name: theme.name, color: theme.color, order_index: theme.order_index })
            .eq("id", theme.id);
          if (themeError) throw themeError;

          const persistedSkillIds: string[] = [];
          for (const skill of theme.skills) {
            if (skill.isNew) {
              const { data: insertedSkill, error: insertError } = await supabase
                .from("skills")
                .insert({ theme_id: theme.id, name: skill.name, definition: skill.definition, order_index: skill.order_index })
                .select("id")
                .single();
              if (insertError) throw insertError;
              if (insertedSkill?.id) persistedSkillIds.push(insertedSkill.id);
            } else {
              const { error: updateError } = await supabase
                .from("skills")
                .update({ name: skill.name, definition: skill.definition, order_index: skill.order_index })
                .eq("id", skill.id);
              if (updateError) throw updateError;
              persistedSkillIds.push(skill.id);
            }
          }

          if (persistedSkillIds.length > 0) {
            await supabase.from("skills").delete().eq("theme_id", theme.id).not("id", "in", `(${persistedSkillIds.join(",")})`);
          } else {
            await supabase.from("skills").delete().eq("theme_id", theme.id);
          }
        }
      }

      if (allPersistedThemeIds.length > 0) {
        await supabase.from("themes").delete().eq("framework_id", framework.id).not("id", "in", `(${allPersistedThemeIds.join(",")})`);
      }

      toast.success("Référentiel sauvegardé avec succès");
      setPendingEditThemes(null);
      queryClient.invalidateQueries({ queryKey: ["team-framework", id] });
      setTimeout(() => {
        frameworkRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 300);
    } catch (error: unknown) {
      console.error("Error saving framework:", error);
      toast.error("Erreur lors de la sauvegarde");
    } finally {
      setSaving(false);
    }
  };

  const loading = authLoading || loadingTeam || loadingMembers;

  if (loading) return <AppLayout><div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /></div></AppLayout>;
  if (!team) return null;

  const teamColor = team.color || team.club?.primary_color || "#3B82F6";

  return (
    <AppLayout>
      {!isPlayerViewing && !isSupporterViewing && (
        <Button variant="ghost" className="mb-3 -ml-2" onClick={() => navigate(`/clubs/${team.club_id}`)}><ArrowLeft className="w-4 h-4 mr-2" />Retour au club</Button>
      )}
      {isPlayerViewing && (
        <Button variant="ghost" className="mb-3 -ml-2" onClick={() => navigate("/player/dashboard")}><ArrowLeft className="w-4 h-4 mr-2" />Retour au dashboard</Button>
      )}
      {isSupporterViewing && (
        <Button variant="ghost" className="mb-3 -ml-2" onClick={() => navigate("/supporter/dashboard")}><ArrowLeft className="w-4 h-4 mr-2" />Retour à mes joueurs</Button>
      )}

      <div className="glass-card p-6 mb-5">
        <div className="flex flex-col lg:flex-row lg:items-start gap-6 lg:gap-8">
          <div className="flex items-center gap-6 flex-1 min-w-0">
            <div className="w-20 h-20 lg:w-28 lg:h-28 rounded-2xl flex items-center justify-center text-2xl lg:text-4xl font-display font-bold flex-shrink-0" style={{ background: `linear-gradient(135deg, ${teamColor} 0%, ${teamColor}88 100%)`, color: "white", boxShadow: `0 4px 24px -4px ${teamColor}40` }}>{team.short_name || team.name.slice(0, 2).toUpperCase()}</div>
            <div className="flex-1 min-w-0">
            <h1 className="text-4xl font-display font-bold">
              {team.name}
            </h1>
            <div className="flex items-center gap-3 mt-3 text-base text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1.5">{team.club?.name}</span>
              <span className="flex items-center gap-1.5">• {coaches.length} coach{coaches.length > 1 ? "es" : ""}</span>
              <span className="flex items-center gap-1.5">• {players.length} joueur{players.length > 1 ? "s" : ""}</span>
              <span className="flex items-center gap-1.5">• {supporterCount} supporter{supporterCount > 1 ? "s" : ""}</span>
              {team.season && <Badge variant="secondary">{team.season}</Badge>}
            </div>
            </div>
          </div>
          {canManageTeam && !isPlayerViewing && (isAdmin || isClubAdmin || isReferentCoach) && (
            <div className="flex-shrink-0 self-start">
              <Button
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => setShowTeamSettings(true)}
              >
                <Settings className="w-3.5 h-3.5 text-orange-500" />
                Paramètres
              </Button>
            </div>
          )}
        </div>
      </div>

      {canManageTeam && !isPlayerViewing && (
        <div className="flex flex-col md:flex-row gap-3 mb-4">
          {/* Bloc Ajouter */}
          <div className="bg-card border border-border rounded-xl p-3 flex-1">
            <p className="text-[10px] font-bold text-muted-foreground mb-2 uppercase tracking-wide">Ajouter</p>
            <div className="flex flex-wrap gap-1.5">
              {(isAdmin || isClubAdmin) && (
                <AddEntityButton type="coach" onClick={() => setShowCoachModal(true)} className="flex-1 min-w-[140px]" />
              )}
              <AddEntityButton type="player" onClick={() => setShowPlayerModal(true)} className="flex-1 min-w-[140px]" />
              {(isAdmin || isClubAdmin || isReferentCoach) && (
                <AddEntityButton type="supporter" onClick={() => setShowSupporterModal(true)} className="flex-1 min-w-[140px]" />
              )}
            </div>
          </div>

          {/* Bloc Gestion */}
          <div className="bg-card border border-border rounded-xl p-3 flex-1">
            <p className="text-[10px] font-bold text-muted-foreground mb-2 uppercase tracking-wide">Gestion</p>
            <div className="flex flex-col gap-1.5">
              <button
                type="button"
                onClick={handleGoToFramework}
                className="group relative flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-background hover:bg-secondary hover:border-primary/40 hover:shadow-sm transition-all text-sm font-medium text-foreground w-full"
              >
                <BookOpen className="w-4 h-4 text-orange-500 shrink-0" />
                <span className="flex-1 text-left truncate">Référentiel équipe</span>
                <span className="flex items-center justify-center w-7 h-7 rounded-md shrink-0 bg-orange-500/10">
                  <BookOpen className="w-4 h-4 text-orange-500" />
                </span>
              </button>
              <button
                type="button"
                onClick={() => navigate(`/evaluations?team_id=${id}&new=1`)}
                className="group relative flex items-center gap-2 px-3 py-2 rounded-lg border-2 border-orange-500/85 bg-background hover:bg-orange-500/5 hover:shadow-sm transition-all text-sm font-medium text-foreground w-full"
              >
                <Plus className="w-4 h-4 text-orange-500 shrink-0" />
                <span className="flex-1 text-left truncate">Nouveau débrief</span>
                <span className="flex items-center justify-center w-7 h-7 rounded-md shrink-0 bg-orange-500/10">
                  <ClipboardList className="w-4 h-4 text-orange-500" />
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-muted/80 border border-border h-14 p-1.5 rounded-xl w-full shadow-sm">
          <TabsTrigger value="effectif" className="gap-2 flex-1 h-11 text-sm font-bold data-[state=active]:bg-accent data-[state=active]:text-accent-foreground data-[state=active]:shadow-lg data-[state=inactive]:hover:bg-muted-foreground/10 rounded-lg transition-all cursor-pointer">
            <User className="w-4 h-4" />
            Effectif
          </TabsTrigger>
          <TabsTrigger value="indicateurs" className="gap-2 flex-1 h-11 text-sm font-bold data-[state=active]:bg-accent data-[state=active]:text-accent-foreground data-[state=active]:shadow-lg data-[state=inactive]:hover:bg-muted-foreground/10 rounded-lg transition-all cursor-pointer">
            <TrendingUp className="w-4 h-4" />
            Performance
          </TabsTrigger>
          {canViewObjectives && (
            <TabsTrigger value="objectifs" className="gap-2 flex-1 h-11 text-sm font-bold data-[state=active]:bg-accent data-[state=active]:text-accent-foreground data-[state=active]:shadow-lg data-[state=inactive]:hover:bg-muted-foreground/10 rounded-lg transition-all cursor-pointer">
              <Target className="w-4 h-4" />
              Objectifs
            </TabsTrigger>
          )}
        </TabsList>

        {/* Effectif Tab */}
        <TabsContent value="effectif" className="space-y-8">
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-display font-semibold">Coachs</h2>
              {!isPlayerViewing && (isAdmin || isClubAdmin) && <AddEntityButton type="coach" onClick={() => setShowCoachModal(true)} />}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {coaches.map((coach, index) => (
                <div key={coach.id} className="animate-fade-in-up opacity-0" style={{ animationDelay: `${index * 0.1}s` }}>
                  <CircleAvatar shape="circle" name={getMemberName(coach)} subtitle={coach.coach_role === "referent" ? "Coach Référent" : "Coach Assistant"} imageUrl={coach.profile.photo_url} color={teamColor} size="md" badge={coach.coach_role === "referent" ? <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center"><ShieldCheck className="w-3 h-3 text-white" /></div> : undefined} />
                </div>
              ))}
              {coaches.length === 0 && <div className="col-span-full flex flex-col items-center justify-center h-32 glass-card"><p className="text-muted-foreground">Aucun coach assigné</p></div>}
            </div>
          </div>

          <div className="glass-card p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-display font-semibold">Joueurs ({players.length})</h2>
              {!isPlayerViewing && canManageTeam && <AddEntityButton type="player" onClick={() => setShowPlayerModal(true)} />}
            </div>
            {players.length > 0 ? (
              <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                {players.map((player, index) => (
                  <div key={player.id} className="animate-fade-in-up opacity-0 group relative" style={{ animationDelay: `${index * 0.05}s` }}>
                    <CircleAvatar shape="circle" name={getMemberName(player)} imageUrl={player.profile.photo_url} color={teamColor} size="md" onClick={isPlayerViewing ? (player.profile.id === user?.id ? () => navigate(`/players/${player.profile.id}`) : undefined) : () => navigate(`/players/${player.profile.id}`)} className={isPlayerViewing && player.profile.id !== user?.id ? "cursor-default" : ""} />
                    {canMutatePlayers && (
                      <Button
                        variant="secondary"
                        size="icon"
                        className="absolute -top-2 -right-2 w-7 h-7 opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMutationPlayer({ id: player.profile.id, name: getMemberName(player) });
                        }}
                        title="Mutation"
                      >
                        <ArrowRightLeft className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-48">
                <User className="w-12 h-12 text-muted-foreground/50 mb-4" /><h3 className="text-lg font-medium text-muted-foreground">Aucun joueur</h3>
                {canManageTeam && <Button className="mt-4 gap-2" onClick={() => setShowPlayerModal(true)}><Plus className="w-4 h-4" />Ajouter</Button>}
              </div>
            )}
          </div>
        </TabsContent>

        {/* Indicateurs Tab */}
        <TabsContent value="indicateurs" className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Team Progression KPI */}
            <div className="glass-card p-4">
              <p className="text-sm font-display font-semibold text-foreground uppercase tracking-wide mb-2">Progression de l'équipe</p>
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  loadingProgression || progression?.value === null || progression?.value === undefined
                    ? "bg-muted text-muted-foreground"
                    : progression.value > 0
                      ? "bg-emerald-500/10 text-emerald-600"
                      : progression.value < 0
                        ? "bg-destructive/10 text-destructive"
                        : "bg-muted text-muted-foreground"
                }`}>
                  {progression?.value === null || progression?.value === undefined ? (
                    <Minus className="w-5 h-5" />
                  ) : progression.value >= 0 ? (
                    <TrendingUp className="w-5 h-5" />
                  ) : (
                    <TrendingDown className="w-5 h-5" />
                  )}
                </div>
                <div>
                  {loadingProgression ? (
                    <p className="text-2xl font-display font-bold text-muted-foreground">…</p>
                  ) : progression?.value === null || progression?.value === undefined ? (
                    <p className="text-2xl font-display font-bold text-muted-foreground">N/A</p>
                  ) : (
                    <p className={`text-2xl font-display font-bold ${
                      progression.value > 0 ? "text-emerald-600"
                        : progression.value < 0 ? "text-destructive"
                        : "text-muted-foreground"
                    }`}>
                      {progression.value > 0 ? "+" : ""}{progression.value}%
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {progression?.count
                      ? `Basé sur ${progression.count} joueur${progression.count > 1 ? "s" : ""} évalué${progression.count > 1 ? "s" : ""}`
                      : "Aucun joueur avec 2+ évaluations"}
                  </p>
                </div>
              </div>
            </div>

            {/* Objectives stats */}
            {canViewObjectives && (
              <ObjectivesStats teamId={id!} />
            )}
          </div>

          {/* Self-debrief button for players */}
          {isPlayerViewing && framework && (
            <Button
              onClick={() => navigate("/self-evaluation")}
              className="w-full gap-2 bg-emerald-500 hover:bg-emerald-600 text-white h-11 text-base font-semibold"
            >
              <Star className="w-5 h-5" />
              M'auto-débriefer
            </Button>
          )}

          {/* Framework section - full read-only view like club */}
          <div ref={frameworkRef}>
            {framework ? (
              <div className="pb-8">
                {/* Framework header card (titre + sous-titre + bandeau d'actions à gauche) */}
                <div className="mb-6 rounded-xl border border-border bg-card px-4 sm:px-6 py-5 shadow-sm">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-12 h-12 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0">
                      <BookOpen className="w-6 h-6 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h2 className="!text-2xl font-display font-bold truncate">{framework.name}</h2>
                      <p className="text-muted-foreground mt-1 text-sm">
                        {team.name} • {framework.themes.length} thématique{framework.themes.length > 1 ? "s" : ""} • {totalSkills} compétence{totalSkills > 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>

                  {(canEditFramework || !isSupporterViewing) && (
                    <div className="mt-4 rounded-lg border border-border bg-muted/30 px-3 py-2 inline-flex max-w-full">
                      <div className="flex flex-wrap items-center gap-2">
                        {canEditFramework && (
                          <Button variant="outline" size="sm" onClick={() => setShowEditConfirm(true)}>
                            <Pencil className="w-4 h-4 mr-2 text-orange-500" />
                            Modifier
                          </Button>
                        )}
                        {!isSupporterViewing && (
                          <Button variant="outline" size="sm" onClick={() => setShowFrameworkHistory(true)}>
                            <History className="w-4 h-4 mr-2 text-orange-500" />
                            Historique
                          </Button>
                        )}
                        {!isSupporterViewing && (
                          <Button variant="outline" size="sm" onClick={() => handlePrintFramework()}>
                            <Printer className="w-4 h-4 mr-2 text-orange-500" />
                            Imprimer
                          </Button>
                        )}
                        {canEditFramework && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
                                <RotateCcw className="w-4 h-4 mr-2 text-destructive" />
                                Supprimer
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Supprimer le référentiel ?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Le référentiel <strong>{framework.name}</strong> et ses{" "}
                                  <strong>{framework.themes.length} thématique{framework.themes.length > 1 ? "s" : ""}</strong>{" "}
                                  /{" "}
                                  <strong>{totalSkills} compétence{totalSkills > 1 ? "s" : ""}</strong>{" "}
                                  seront archivés. Les évaluations existantes restent consultables.
                                  Cette action est réversible depuis l'historique des versions.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Annuler</AlertDialogCancel>
                                <AlertDialogAction onClick={handleDeleteFramework} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                  Supprimer
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Full read-only framework view */}
                <ReadOnlyFrameworkView themes={framework.themes} />
              </div>
            ) : (
              /* CTA when no framework */
              <div className="glass-card p-8 flex flex-col items-center justify-center text-center">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                  <Layers className="w-8 h-8 text-primary" />
                </div>
                <h2 className="text-xl font-display font-semibold mb-2">Aucun référentiel configuré</h2>
                <p className="text-muted-foreground mb-6 max-w-md">
                  Le référentiel de compétences permet de débriefer les joueurs sur des critères définis. Configurez-le pour commencer les débriefs.
                </p>
                {canEditFramework ? (
                  <Button className="gap-2" onClick={() => navigate(`/teams/${id}/framework`)}>
                    <FileText className="w-4 h-4" />
                    Configurer le référentiel
                  </Button>
                ) : (
                  <p className="text-sm text-muted-foreground">Contactez le coach référent pour configurer le référentiel.</p>
                )}
              </div>
            )}
          </div>
        </TabsContent>

        {/* Objectifs Tab */}
        {canViewObjectives && (
          <TabsContent value="objectifs" className="space-y-6">
            <ObjectivesList teamId={id!} canEdit={canEditObjectives} />
          </TabsContent>
        )}
      </Tabs>

      <CreatePlayerModal open={showPlayerModal} onOpenChange={setShowPlayerModal} clubId={team.club_id} teams={[{ id: team.id, name: team.name }]} defaultTeamId={team.id} onSuccess={invalidateTeamData} />
      <CreateCoachModal open={showCoachModal} onOpenChange={setShowCoachModal} clubId={team.club_id} onSuccess={invalidateTeamData} />
      <CreateSupporterModal open={showSupporterModal} onOpenChange={setShowSupporterModal} clubId={team.club_id} onSuccess={invalidateTeamData} />
      <EditTeamModal open={showTeamSettings} onOpenChange={setShowTeamSettings} team={team} onSuccess={invalidateTeamData} />
      {mutationPlayer && (
        <PlayerMutationModal
          open={!!mutationPlayer}
          onOpenChange={(open) => !open && setMutationPlayer(null)}
          playerId={mutationPlayer.id}
          playerName={mutationPlayer.name}
          currentTeamId={team.id}
          currentTeamName={team.name}
          clubId={team.club_id}
          onSuccess={invalidateTeamData}
        />
      )}

      {/* Edit confirmation dialog */}
      <AlertDialog open={showEditConfirm} onOpenChange={setShowEditConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Modifier le référentiel ?</AlertDialogTitle>
            <AlertDialogDescription>
              Vous allez entrer en mode modification. Les changements ne seront appliqués qu'après sauvegarde.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setShowEditConfirm(false); setShowEditDialog(true); }}>
              Commencer la modification
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Dialog */}
      {framework && (
        <FrameworkEditDialog
          open={showEditDialog}
          themes={framework.themes}
          frameworkName={framework.name}
          saving={saving}
          onSave={handleEditSave}
          onCancel={() => setShowEditDialog(false)}
        />
      )}

      <FrameworkNameModal
        open={showNameModal}
        onOpenChange={(open) => {
          setShowNameModal(open);
          if (!open && pendingEditThemes) {
            setShowEditDialog(true);
            setPendingEditThemes(null);
          }
        }}
        currentName={framework?.name || ""}
        onConfirm={handleSave}
        saving={saving}
      />

      {/* Hidden printable framework */}
      {framework && team && (
        <div style={{ position: "fixed", left: "-9999px", top: 0 }}>
          <PrintableFramework
            ref={printRef}
            frameworkName={framework.name}
            teamName={team.name}
            clubName={team.club?.name || ""}
            clubLogoUrl={team.club?.logo_url}
            themes={framework.themes}
          />
        </div>
      )}

      <FrameworkHistorySheet
        open={showFrameworkHistory}
        onOpenChange={setShowFrameworkHistory}
        entityId={id!}
        entityType="team"
        activeFrameworkId={framework?.id || null}
        onRestored={() => queryClient.invalidateQueries({ queryKey: ["team-framework", id] })}
      />
    </AppLayout>
  );
}
