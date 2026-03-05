import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Plus, User, Star, Settings, FileText, UserCog, BookOpen, Layers, Trash2, ArrowRightLeft, ClipboardList, TrendingUp, TrendingDown, Minus, BarChart3 } from "lucide-react";
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
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTeamProgression } from "@/hooks/useTeamProgression";

interface Team {
  id: string;
  name: string;
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
    skills: Array<{ id: string; name: string }>;
  }>;
}

export default function TeamDetail() {
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading, isAdmin, roles } = useAuth();
  const navigate = useNavigate();
  const [team, setTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [framework, setFramework] = useState<Framework | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPlayerModal, setShowPlayerModal] = useState(false);
  const [showCoachModal, setShowCoachModal] = useState(false);
  const [showSupporterModal, setShowSupporterModal] = useState(false);
  const [showTeamSettings, setShowTeamSettings] = useState(false);
  const [mutationPlayer, setMutationPlayer] = useState<{ id: string; name: string } | null>(null);

  const isClubAdmin = team ? roles.some(r => r.role === "club_admin" && r.club_id === team.club_id) : false;
  const isCoachOfTeam = members.some(m => m.member_type === "coach" && m.profile.id === user?.id);
  const isReferentCoach = members.some(m => m.member_type === "coach" && m.profile.id === user?.id && m.coach_role === "referent");
  const canManageTeam = isAdmin || isClubAdmin || isCoachOfTeam;
  const canEditFramework = isAdmin || isClubAdmin || isReferentCoach;
  const canMutatePlayers = isAdmin || isClubAdmin;

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
        .maybeSingle();

      if (frameworkData) {
        const { data: themesData } = await supabase
          .from("themes")
          .select("id, name, color, skills(id, name)")
          .eq("framework_id", frameworkData.id)
          .order("order_index");

        setFramework({
          ...frameworkData,
          themes: themesData || []
        });
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
      // Delete the framework (cascade will delete themes and skills)
      const { error } = await supabase
        .from("competence_frameworks")
        .delete()
        .eq("id", framework.id);
      
      if (error) throw error;
      
      setFramework(null);
      toast.success("Référentiel supprimé avec succès");
    } catch (error: any) {
      console.error("Error deleting framework:", error);
      toast.error("Erreur lors de la suppression");
    }
  };

  if (authLoading || loading) return <AppLayout><div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /></div></AppLayout>;
  if (!team) return null;

  const teamColor = team.color || team.club?.primary_color || "#3B82F6";

  return (
    <AppLayout>
      <Button variant="ghost" className="mb-6 -ml-2" onClick={() => navigate(`/clubs/${team.club_id}`)}><ArrowLeft className="w-4 h-4 mr-2" />Retour au club</Button>

      <div className="glass-card p-8 mb-8">
        <div className="flex items-center gap-8">
          <div className="w-24 h-24 rounded-2xl flex items-center justify-center text-3xl font-display font-bold" style={{ background: `linear-gradient(135deg, ${teamColor} 0%, ${teamColor}88 100%)`, color: "white", boxShadow: `0 4px 24px -4px ${teamColor}40` }}>{team.name.slice(0, 2).toUpperCase()}</div>
          <div className="flex-1">
            <div className="flex items-center gap-3"><h1 className="text-3xl font-display font-bold">{team.name}</h1><Badge variant="secondary">{team.season}</Badge></div>
            <p className="text-muted-foreground mt-1">{team.club?.name} • {players.length} joueur{players.length > 1 ? "s" : ""} • {coaches.length} coach{coaches.length > 1 ? "es" : ""}</p>
          </div>
          <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm"
                className="gap-2"
                onClick={() => navigate(`/evaluations?team_id=${id}`)}
              >
                <ClipboardList className="w-4 h-4" />
                Débriefs
              </Button>
              {(isAdmin || isClubAdmin || isReferentCoach) && (
                <>
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="gap-2"
                    onClick={() => setShowSupporterModal(true)}
                  >
                    <Plus className="w-4 h-4" />
                    Supporter
                  </Button>
                  <Button 
                    variant="outline" 
                    size="icon"
                    onClick={() => setShowTeamSettings(true)}
                  >
                    <Settings className="w-4 h-4" />
                  </Button>
                </>
              )}
          </div>
        </div>
      </div>

      <Tabs defaultValue="effectif" className="space-y-6">
        <TabsList className="bg-muted/50">
          <TabsTrigger value="effectif" className="gap-2">
            <User className="w-4 h-4" />
            Effectif
          </TabsTrigger>
          <TabsTrigger value="indicateurs" className="gap-2">
            <BarChart3 className="w-4 h-4" />
            Performance
          </TabsTrigger>
        </TabsList>

        {/* Effectif Tab */}
        <TabsContent value="effectif" className="space-y-8">
          <div>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-display font-semibold">Coachs</h2>
              {(isAdmin || isClubAdmin) && <Button variant="outline" size="sm" className="gap-2" onClick={() => setShowCoachModal(true)}><UserCog className="w-4 h-4" />Coach</Button>}
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
              {canManageTeam && <Button className="gap-2" onClick={() => setShowPlayerModal(true)}><Plus className="w-4 h-4" />Joueur</Button>}
            </div>
            {players.length > 0 ? (
              <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                {players.map((player, index) => (
                  <div key={player.id} className="animate-fade-in-up opacity-0 group relative" style={{ animationDelay: `${index * 0.05}s` }}>
                    <CircleAvatar name={getMemberName(player)} imageUrl={player.profile.photo_url} color={teamColor} size="md" onClick={() => navigate(`/players/${player.profile.id}`)} />
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

          {framework ? (
            <>
              {/* Framework summary */}
              <div className="glass-card p-6">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-xl font-display font-semibold">{framework.name}</h2>
                    <p className="text-muted-foreground text-sm mt-1">
                      {framework.themes.length} thème{framework.themes.length > 1 ? "s" : ""} • {totalSkills} compétence{totalSkills > 1 ? "s" : ""}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {canEditFramework && (
                      <Button className="gap-2" onClick={() => navigate(`/teams/${id}/framework`)}>
                        <FileText className="w-4 h-4" />
                        Éditer le référentiel
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
                            <AlertDialogTitle>Supprimer le référentiel ?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Cette action supprimera définitivement le référentiel ainsi que toutes ses thématiques et compétences. Cette action est irréversible.
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

                {/* Themes grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
    </AppLayout>
  );
}
