import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Plus, User, Star, Settings, FileText, UserCog, BookOpen, Layers, Trash2, ArrowRightLeft, ClipboardList, TrendingUp, TrendingDown, Minus, Printer, Edit, History, RotateCcw, Target, Check, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
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
import { snapshotFramework } from "@/lib/framework-snapshot";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTeamProgression } from "@/hooks/useTeamProgression";
import { PrintableFramework } from "@/components/framework/PrintableFramework";
import { FrameworkHistorySheet } from "@/components/framework/FrameworkHistorySheet";
import { useReactToPrint } from "react-to-print";
import { ObjectivesList } from "@/components/objectives/ObjectivesList";

interface Team {
  id: string;
  name: string;
  short_name: string | null;
  season: string | null;
  color: string | null;
  club_id: string;
  club?: { name: string; primary_color: string };
}

interface TeamMember {
  id: string;
  member_type: "coach" | "player";
  coach_role: "referent" | "assistant" | null;
  profile: { id: string; first_name: string | null; last_name: string | null; nickname: string | null; photo_url: string | null };
}

interface Framework {
  id: string;
  name: string;
  themes: Array<{
    id: string;
    name: string;
    color: string | null;
    order_index: number;
    skills: Array<{ id: string; name: string; definition: string | null; order_index: number }>;
  }>;
}

export default function TeamDetail() {
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading, hasAdminRole: isAdmin, roles } = useAuth();
  const navigate = useNavigate();
  const [team, setTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [framework, setFramework] = useState<Framework | null>(null);
  const [supporterCount, setSupporterCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showPlayerModal, setShowPlayerModal] = useState(false);
  const [showCoachModal, setShowCoachModal] = useState(false);
  const [showSupporterModal, setShowSupporterModal] = useState(false);
  const [showTeamSettings, setShowTeamSettings] = useState(false);
  const [mutationPlayer, setMutationPlayer] = useState<{ id: string; name: string } | null>(null);
  const [showFrameworkHistory, setShowFrameworkHistory] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrintFramework = useReactToPrint({
    contentRef: printRef,
    documentTitle: framework?.name || "Référentiel",
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

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user && id) fetchTeamData();
  }, [user, id]);

  const fetchTeamData = async () => {
    try {
      const { data: teamData, error: teamError } = await supabase.from("teams").select("*, club:clubs(name, primary_color)").eq("id", id).maybeSingle();
      if (teamError) throw teamError;
      if (!teamData) { toast.error("Équipe non trouvée"); navigate("/clubs"); return; }
      setTeam(teamData);

      const { data: membersData, error: membersError } = await supabase.from("team_members").select("id, member_type, coach_role, profile:profiles!inner(id, first_name, last_name, nickname, photo_url, deleted_at)").eq("team_id", id).eq("is_active", true).is("profile.deleted_at", null);
      if (membersError) throw membersError;
      setMembers(membersData as TeamMember[]);

      // Fetch framework with themes and skills
      const { data: frameworkData } = await supabase
        .from("competence_frameworks")
        .select("id, name")
        .eq("team_id", id)
        .eq("is_archived", false)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (frameworkData) {
        const { data: themesData } = await supabase
          .from("themes")
          .select("id, name, color, order_index, skills(id, name, definition, order_index)")
          .eq("framework_id", frameworkData.id)
          .order("order_index");

        setFramework({
          ...frameworkData,
          themes: themesData || []
        });
      }

      // Fetch supporter count for team players
      const playerUserIds = (membersData as TeamMember[]).filter(m => m.member_type === "player").map(m => m.profile.id);
      if (playerUserIds.length > 0) {
        const { count } = await supabase
          .from("supporters_link")
          .select("id", { count: "exact", head: true })
          .in("player_id", playerUserIds);
        setSupporterCount(count || 0);
      }
    } catch (error: any) {
      console.error("Error fetching team:", error);
      toast.error("Erreur lors du chargement");
    } finally {
      setLoading(false);
    }
  };

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

  const handleDeleteFramework = async () => {
    if (!framework) return;
    try {
      // Create a full snapshot before archiving
      await snapshotFramework(framework.id);
      const { error } = await supabase
        .from("competence_frameworks")
        .update({ is_archived: true, archived_at: new Date().toISOString() })
        .eq("id", framework.id);
      
      if (error) throw error;
      
      setFramework(null);
      toast.success("Référentiel archivé — récupérable via l'historique");
    } catch (error: any) {
      console.error("Error archiving framework:", error);
      toast.error("Erreur lors de la suppression");
    }
  };

  if (authLoading || loading) return <AppLayout><div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /></div></AppLayout>;
  if (!team) return null;

  const teamColor = team.color || team.club?.primary_color || "#3B82F6";

  return (
    <AppLayout>
      {!isPlayerViewing && (
        <Button variant="ghost" className="mb-6 -ml-2" onClick={() => navigate(`/clubs/${team.club_id}`)}><ArrowLeft className="w-4 h-4 mr-2" />Retour au club</Button>
      )}
      {isPlayerViewing && (
        <Button variant="ghost" className="mb-6 -ml-2" onClick={() => navigate("/player/dashboard")}><ArrowLeft className="w-4 h-4 mr-2" />Retour au dashboard</Button>
      )}

      <div className="glass-card p-6 mb-8">
        <div className="flex items-center gap-8">
          <div className="w-28 h-28 rounded-2xl flex items-center justify-center text-4xl font-display font-bold flex-shrink-0" style={{ background: `linear-gradient(135deg, ${teamColor} 0%, ${teamColor}88 100%)`, color: "white", boxShadow: `0 4px 24px -4px ${teamColor}40` }}>{team.short_name || team.name.slice(0, 2).toUpperCase()}</div>
          <div className="flex-1">
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
          {canManageTeam && (
            <div className="flex items-start gap-2">
              <div className="flex flex-col gap-1.5">
                {(isAdmin || isClubAdmin) && (
                  <Button variant="outline" size="sm" className="gap-2 justify-start" onClick={() => setShowCoachModal(true)}><Plus className="w-3.5 h-3.5 text-primary" />Coach</Button>
                )}
                <Button variant="outline" size="sm" className="gap-2 justify-start" onClick={() => setShowPlayerModal(true)}><Plus className="w-3.5 h-3.5 text-primary" />Joueur</Button>
                {(isAdmin || isClubAdmin || isReferentCoach) && (
                  <Button variant="outline" size="sm" className="gap-2 justify-start" onClick={() => setShowSupporterModal(true)}><Plus className="w-3.5 h-3.5 text-primary" />Supporter</Button>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Button variant="outline" size="sm" className="gap-2" onClick={() => navigate(`/evaluations?team_id=${id}`)}>
                  <ClipboardList className="w-4 h-4" />
                  Débriefs
                </Button>
                {(isAdmin || isClubAdmin || isReferentCoach) && (
                  <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setShowTeamSettings(true)}>
                    <Settings className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <Tabs defaultValue="effectif" className="space-y-6">
        <TabsList className={`bg-muted h-12 p-1 rounded-lg w-full ${canViewObjectives ? "max-w-xl" : "max-w-md"}`}>
          <TabsTrigger value="effectif" className="gap-2 flex-1 h-10 text-sm font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md rounded-md transition-all">
            <User className="w-4 h-4" />
            Effectif
          </TabsTrigger>
          <TabsTrigger value="indicateurs" className="gap-2 flex-1 h-10 text-sm font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md rounded-md transition-all">
            <TrendingUp className="w-4 h-4" />
            Performance
          </TabsTrigger>
          {canViewObjectives && (
            <TabsTrigger value="objectifs" className="gap-2 flex-1 h-10 text-sm font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md rounded-md transition-all">
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
              {(isAdmin || isClubAdmin) && <Button size="sm" className="gap-2" onClick={() => setShowCoachModal(true)}><Plus className="w-4 h-4" />Coach</Button>}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {coaches.map((coach, index) => (
                <div key={coach.id} className="animate-fade-in-up opacity-0" style={{ animationDelay: `${index * 0.1}s` }}>
                  <CircleAvatar name={getMemberName(coach)} subtitle={coach.coach_role === "referent" ? "Coach Référent ★" : "Coach Assistant"} imageUrl={coach.profile.photo_url} color={teamColor} size="md" badge={coach.coach_role === "referent" ? <div className="w-6 h-6 rounded-full bg-warning flex items-center justify-center"><Star className="w-3 h-3 text-warning-foreground" /></div> : undefined} />
                </div>
              ))}
              {coaches.length === 0 && <div className="col-span-full flex flex-col items-center justify-center h-32 glass-card"><p className="text-muted-foreground">Aucun coach assigné</p></div>}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-display font-semibold">Joueurs ({players.length})</h2>
              {canManageTeam && <Button size="sm" className="gap-2" onClick={() => setShowPlayerModal(true)}><Plus className="w-4 h-4" />Joueur</Button>}
            </div>
            {players.length > 0 ? (
              <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                {players.map((player, index) => (
                  <div key={player.id} className="animate-fade-in-up opacity-0 group relative" style={{ animationDelay: `${index * 0.05}s` }}>
                    <CircleAvatar name={getMemberName(player)} imageUrl={player.profile.photo_url} color={teamColor} size="md" onClick={isPlayerViewing ? (player.profile.id === user?.id ? () => navigate(`/players/${player.profile.id}`) : undefined) : () => navigate(`/players/${player.profile.id}`)} className={isPlayerViewing && player.profile.id !== user?.id ? "cursor-default" : ""} />
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
              <div className="flex flex-col items-center justify-center h-48 glass-card">
                <User className="w-12 h-12 text-muted-foreground/50 mb-4" /><h3 className="text-lg font-medium text-muted-foreground">Aucun joueur</h3>
                {canManageTeam && <Button className="mt-4 gap-2" onClick={() => setShowPlayerModal(true)}><Plus className="w-4 h-4" />Ajouter</Button>}
              </div>
            )}
          </div>
        </TabsContent>

        {/* Indicateurs Tab */}
        <TabsContent value="indicateurs" className="space-y-6">
          {/* Team Progression KPI */}
          <div className="glass-card p-6 flex items-center gap-6">
            <div className={`w-14 h-14 rounded-xl flex items-center justify-center ${
              loadingProgression || progression?.value === null || progression?.value === undefined
                ? "bg-muted text-muted-foreground"
                : progression.value > 0
                  ? "bg-emerald-500/10 text-emerald-600"
                  : progression.value < 0
                    ? "bg-destructive/10 text-destructive"
                    : "bg-muted text-muted-foreground"
            }`}>
              {progression?.value === null || progression?.value === undefined ? (
                <Minus className="w-7 h-7" />
              ) : progression.value >= 0 ? (
                <TrendingUp className="w-7 h-7" />
              ) : (
                <TrendingDown className="w-7 h-7" />
              )}
            </div>
            <div>
              <p className="text-sm text-muted-foreground font-medium">Progression de l'équipe</p>
              {loadingProgression ? (
                <p className="text-3xl font-display font-bold mt-1 text-muted-foreground">…</p>
              ) : progression?.value === null || progression?.value === undefined ? (
                <p className="text-3xl font-display font-bold mt-1 text-muted-foreground">N/A</p>
              ) : (
                <p className={`text-3xl font-display font-bold mt-1 ${
                  progression.value > 0
                    ? "text-emerald-600"
                    : progression.value < 0
                      ? "text-destructive"
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

          {/* Objectives stats */}
          {canViewObjectives && (
            <ObjectivesStats teamId={id!} />
          )}

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

          {framework ? (
            <>
              {/* Framework summary */}
              <div className="glass-card p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <BookOpen className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h2 className="text-base font-display font-semibold">{framework.name}</h2>
                      <p className="text-muted-foreground text-sm">
                        {framework.themes.length} thématique{framework.themes.length > 1 ? "s" : ""} • {totalSkills} compétence{totalSkills > 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {canEditFramework && (
                      <Button variant="outline" size="sm" className="gap-2" onClick={() => navigate(`/teams/${id}/framework`)}>
                        <Edit className="w-4 h-4" />
                        Éditer
                      </Button>
                    )}
                    <Button variant="outline" size="sm" className="gap-2" onClick={() => handlePrintFramework()}>
                      <Printer className="w-4 h-4" />
                      Imprimer
                    </Button>
                    <Button variant="outline" size="sm" className="gap-2" onClick={() => setShowFrameworkHistory(true)}>
                      <History className="w-4 h-4" />
                      Historique
                    </Button>
                    {isAdmin && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm" className="gap-2 text-destructive hover:text-destructive">
                            <RotateCcw className="w-4 h-4" />
                            Réinitialiser
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Réinitialiser le référentiel ?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Le référentiel sera archivé et pourra être restauré depuis l'historique des versions.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Annuler</AlertDialogCancel>
                            <AlertDialogAction onClick={handleDeleteFramework} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                              Réinitialiser
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </div>

                {/* Themes grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
                  {framework.themes.map((theme, index) => (
                    <div 
                      key={theme.id} 
                      className="p-4 rounded-lg border animate-fade-in-up opacity-0"
                      style={{ 
                        animationDelay: `${index * 0.1}s`,
                        borderColor: theme.color || teamColor,
                        backgroundColor: `${theme.color || teamColor}10`
                      }}
                    >
                      <div className="flex items-center gap-3 mb-3">
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: theme.color || teamColor }}
                        />
                        <h3 className="font-semibold">{theme.name}</h3>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {theme.skills.length} compétence{theme.skills.length > 1 ? "s" : ""}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {theme.skills.slice(0, 3).map(skill => (
                          <Badge key={skill.id} variant="secondary" className="text-xs">
                            {skill.name}
                          </Badge>
                        ))}
                        {theme.skills.length > 3 && (
                          <Badge variant="secondary" className="text-xs">
                            +{theme.skills.length - 3}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
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
        </TabsContent>

        {/* Objectifs Tab */}
        {canViewObjectives && (
          <TabsContent value="objectifs" className="space-y-6">
            <ObjectivesList teamId={id!} canEdit={canEditObjectives} />
          </TabsContent>
        )}
      </Tabs>

      <CreatePlayerModal open={showPlayerModal} onOpenChange={setShowPlayerModal} clubId={team.club_id} teams={[{ id: team.id, name: team.name }]} defaultTeamId={team.id} onSuccess={fetchTeamData} />
      <CreateCoachModal open={showCoachModal} onOpenChange={setShowCoachModal} clubId={team.club_id} onSuccess={fetchTeamData} />
      <CreateSupporterModal open={showSupporterModal} onOpenChange={setShowSupporterModal} clubId={team.club_id} onSuccess={fetchTeamData} />
      <EditTeamModal open={showTeamSettings} onOpenChange={setShowTeamSettings} team={team} onSuccess={fetchTeamData} />
      {mutationPlayer && (
        <PlayerMutationModal
          open={!!mutationPlayer}
          onOpenChange={(open) => !open && setMutationPlayer(null)}
          playerId={mutationPlayer.id}
          playerName={mutationPlayer.name}
          currentTeamId={team.id}
          currentTeamName={team.name}
          clubId={team.club_id}
          onSuccess={fetchTeamData}
        />
      )}

      {/* Hidden printable framework */}
      {framework && team && (
        <div style={{ position: "fixed", left: "-9999px", top: 0 }}>
          <PrintableFramework
            ref={printRef}
            frameworkName={framework.name}
            teamName={team.name}
            clubName={team.club?.name || ""}
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
        onRestored={() => fetchTeamData()}
      />
    </AppLayout>
  );
}
