import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Plus, Users, Settings, Edit, UserCog, Trash2, RotateCcw, Archive, BookOpen, History, UserPlus, Heart, Printer } from "lucide-react";
import { ClubDashboardSections } from "@/components/club/ClubDashboardSections";
import { AppLayout } from "@/components/layout/AppLayout";
import { CircleAvatar } from "@/components/shared/CircleAvatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CreateTeamModal } from "@/components/modals/CreateTeamModal";
import { CreateCoachModal } from "@/components/modals/CreateCoachModal";
import { CreatePlayerModal } from "@/components/modals/CreatePlayerModal";
import { CreateSupporterModal } from "@/components/modals/CreateSupporterModal";
import { CreateClubFrameworkModal } from "@/components/modals/CreateClubFrameworkModal";
import { EditClubModal } from "@/components/modals/EditClubModal";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { snapshotFramework } from "@/lib/framework-snapshot";
import { FrameworkHistorySheet } from "@/components/framework/FrameworkHistorySheet";
import { PrintableFramework } from "@/components/framework/PrintableFramework";
import { useReactToPrint } from "react-to-print";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Club {
  id: string;
  name: string;
  short_name: string | null;
  primary_color: string;
  secondary_color: string | null;
  logo_url: string | null;
  referent_name: string | null;
  referent_email: string | null;
}

interface Team {
  id: string;
  name: string;
  short_name: string | null;
  season: string | null;
  color: string | null;
  deleted_at: string | null;
}

interface ClubFramework {
  id: string;
  name: string;
  themes_count: number;
  skills_count: number;
}

export default function ClubDetail() {
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading, hasAdminRole: isAdmin, roles } = useAuth();
  const navigate = useNavigate();
  const [club, setClub] = useState<Club | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [archivedTeams, setArchivedTeams] = useState<Team[]>([]);
  const [clubFramework, setClubFramework] = useState<ClubFramework | null>(null);
  const [coachCount, setCoachCount] = useState(0);
  const [playerCount, setPlayerCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [showCoachModal, setShowCoachModal] = useState(false);
  const [showFrameworkModal, setShowFrameworkModal] = useState(false);
  const [showPlayerModal, setShowPlayerModal] = useState(false);
  const [showSupporterModal, setShowSupporterModal] = useState(false);
  const [showClubSettings, setShowClubSettings] = useState(false);
  const [teamToDelete, setTeamToDelete] = useState<{ id: string; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [showFrameworkHistory, setShowFrameworkHistory] = useState(false);
  const [frameworkThemes, setFrameworkThemes] = useState<any[]>([]);
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: clubFramework?.name || "Référentiel du Club",
  });

  const isClubAdmin = roles.some(r => r.role === "club_admin" && r.club_id === id);
  const canManageClub = isAdmin || isClubAdmin;

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user && id) {
      fetchClubData();
    }
  }, [user, id]);

  const fetchClubData = async () => {
    try {
      const { data: clubData, error: clubError } = await supabase.from("clubs").select("*").eq("id", id).maybeSingle();
      if (clubError) throw clubError;
      if (!clubData) {
        toast.error("Club non trouvé");
        navigate("/clubs");
        return;
      }
      setClub(clubData);

      // Fetch active teams
      const { data: teamsData, error: teamsError } = await supabase
        .from("teams")
        .select("*")
        .eq("club_id", id)
        .is("deleted_at", null)
        .order("name");
      if (teamsError) throw teamsError;
      setTeams(teamsData || []);

      // Fetch archived teams (only for admins)
      if (isAdmin) {
        const { data: archivedData, error: archivedError } = await supabase
          .from("teams")
          .select("*")
          .eq("club_id", id)
          .not("deleted_at", "is", null)
          .order("name");
        if (archivedError) throw archivedError;
        setArchivedTeams(archivedData || []);
      }

      // Fetch coach count (via user_roles with role=coach in this club)
      const { count: coaches } = await supabase
        .from("user_roles")
        .select("*", { count: "exact", head: true })
        .eq("role", "coach")
        .eq("club_id", id!);
      setCoachCount(coaches || 0);

      // Fetch player count (via user_roles with role=player in this club)
      const { count: players } = await supabase
        .from("user_roles")
        .select("*", { count: "exact", head: true })
        .eq("role", "player")
        .eq("club_id", id!);
      setPlayerCount(players || 0);

      // Fetch club framework
      const { data: frameworkData } = await supabase
        .from("competence_frameworks")
        .select("id, name, themes:themes(id, skills(count))")
        .eq("club_id", id)
        .eq("is_template", true)
        .eq("is_archived", false)
        .maybeSingle();
      
      if (frameworkData) {
        const themesArr = (frameworkData.themes as any[]) || [];
        const skillsTotal = themesArr.reduce((sum: number, t: any) => sum + (t.skills?.[0]?.count || 0), 0);
        setClubFramework({
          id: frameworkData.id,
          name: frameworkData.name,
          themes_count: themesArr.length,
          skills_count: skillsTotal,
        });

        // Fetch full themes with skills for printing
        const { data: fullThemes } = await supabase
          .from("themes")
          .select("*, skills(*)")
          .eq("framework_id", frameworkData.id)
          .order("order_index");
        if (fullThemes) {
          setFrameworkThemes(fullThemes.map(t => ({
            ...t,
            skills: (t.skills || []).sort((a: any, b: any) => a.order_index - b.order_index),
          })));
        }
      } else {
        setClubFramework(null);
        setFrameworkThemes([]);
      }
    } catch (error: any) {
      console.error("Error fetching club:", error);
      toast.error("Erreur lors du chargement du club");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTeam = async () => {
    if (!teamToDelete) return;
    
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from("teams")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", teamToDelete.id);
      
      if (error) throw error;
      
      toast.success(`Équipe "${teamToDelete.name}" supprimée`);
      fetchClubData();
    } catch (error: any) {
      console.error("Error deleting team:", error);
      toast.error("Erreur lors de la suppression de l'équipe");
    } finally {
      setIsDeleting(false);
      setTeamToDelete(null);
    }
  };

  const handleResetFramework = async () => {
    if (!clubFramework) return;
    setIsResetting(true);
    try {
      await snapshotFramework(clubFramework.id);
      await supabase
        .from("competence_frameworks")
        .update({ is_archived: true, archived_at: new Date().toISOString() })
        .eq("id", clubFramework.id);
      
      setClubFramework(null);
      toast.success("Référentiel archivé — récupérable via l'historique");
      fetchClubData();
    } catch (error: any) {
      console.error("Error resetting framework:", error);
      toast.error("Erreur lors de la réinitialisation");
    } finally {
      setIsResetting(false);
      setShowResetConfirm(false);
    }
  };

  const handleRestoreTeam = async (teamId: string, teamName: string) => {
    setIsRestoring(true);
    try {
      const { error } = await supabase
        .from("teams")
        .update({ deleted_at: null })
        .eq("id", teamId);
      
      if (error) throw error;
      
      toast.success(`L'équipe "${teamName}" a été restaurée et est de nouveau visible par le club et le coach.`);
      fetchClubData();
    } catch (error: any) {
      console.error("Error restoring team:", error);
      toast.error("Erreur lors de la restauration de l'équipe");
    } finally {
      setIsRestoring(false);
    }
  };

  if (authLoading || loading) {
    return <AppLayout><div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /></div></AppLayout>;
  }

  if (!club) return null;

  const displayedTeams = showArchived ? archivedTeams : teams;
  const activeTeamsCount = teams.length;

  return (
    <AppLayout>
      <Button variant="ghost" className="mb-6 -ml-2" onClick={() => navigate("/clubs")}>
        <ArrowLeft className="w-4 h-4 mr-2" />Retour aux clubs
      </Button>

      <div className="glass-card p-6 mb-8">
        <div className="flex items-center gap-8">
          <div className="w-28 h-28 rounded-2xl flex items-center justify-center text-4xl font-display font-bold flex-shrink-0" style={{ background: club.logo_url ? `url(${club.logo_url}) center/cover` : `linear-gradient(135deg, ${club.primary_color} 0%, ${club.primary_color}88 100%)`, color: "white", boxShadow: `0 4px 24px -4px ${club.primary_color}40` }}>
            {!club.logo_url && (club.short_name || club.name.slice(0, 2).toUpperCase())}
          </div>
          <div className="flex-1">
            <h1 className="text-4xl font-display font-bold">
              {club.name}
            </h1>
            <div className="flex items-center gap-3 mt-3 text-base text-muted-foreground flex-wrap">
              {club.referent_name && <span className="flex items-center gap-1.5">Référent : {club.referent_name}</span>}
              <span className="flex items-center gap-1.5">• {activeTeamsCount} équipe{activeTeamsCount > 1 ? "s" : ""}</span>
              <span className="flex items-center gap-1.5">• {coachCount} coach{coachCount > 1 ? "s" : ""}</span>
              <span className="flex items-center gap-1.5">• {playerCount} joueur{playerCount > 1 ? "s" : ""}</span>
            </div>
          </div>
          {canManageClub && (
            <div className="flex items-start gap-2">
              <div className="flex flex-col gap-1.5">
                <Button variant="outline" size="sm" className="gap-2 justify-start" onClick={() => setShowCoachModal(true)}><Plus className="w-3.5 h-3.5 text-primary" />Coach</Button>
                <Button variant="outline" size="sm" className="gap-2 justify-start" onClick={() => setShowTeamModal(true)}><Plus className="w-3.5 h-3.5 text-primary" />Équipe</Button>
                <Button variant="outline" size="sm" className="gap-2 justify-start" onClick={() => setShowPlayerModal(true)}><Plus className="w-3.5 h-3.5 text-primary" />Joueur</Button>
                <Button variant="outline" size="sm" className="gap-2 justify-start" onClick={() => setShowSupporterModal(true)}><Plus className="w-3.5 h-3.5 text-primary" />Supporter</Button>
              </div>
              <div className="flex flex-col gap-1.5">
                <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setShowClubSettings(true)}><Settings className="w-4 h-4" /></Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Club Framework Section */}
      {canManageClub && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-display font-semibold">Référentiel du Club</h2>
          </div>
          
          {clubFramework ? (
            <Card 
              className="border-primary/20 bg-primary/5 cursor-pointer transition-all hover:shadow-lg hover:border-primary/40"
              onClick={() => navigate(`/clubs/${club.id}/framework`)}
            >
              <CardHeader className="py-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <BookOpen className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{clubFramework.name}</CardTitle>
                      <CardDescription>
                        {clubFramework.themes_count} thématique{clubFramework.themes_count > 1 ? "s" : ""} • {clubFramework.skills_count} compétence{clubFramework.skills_count > 1 ? "s" : ""}
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/clubs/${club.id}/framework`);
                      }}
                    >
                      <Edit className="w-4 h-4 mr-2" />
                      Éditer
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePrint();
                      }}
                    >
                      <Printer className="w-4 h-4 mr-2" />
                      Imprimer
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowFrameworkHistory(true);
                      }}
                    >
                      <History className="w-4 h-4 mr-2" />
                      Historique
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowResetConfirm(true);
                      }}
                    >
                      <RotateCcw className="w-4 h-4 mr-2" />
                      Réinitialiser
                    </Button>
                  </div>
                </div>
              </CardHeader>
            </Card>
          ) : (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-8 text-center">
                <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center mb-4">
                  <BookOpen className="w-6 h-6 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium mb-1">Aucun référentiel</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Créez un référentiel de compétences pour le club
                </p>
                <Button className="gap-2" onClick={() => setShowFrameworkModal(true)}>
                  <Plus className="w-4 h-4" />
                  Créer le référentiel
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Admin Toggle for Archived Teams */}
      {isAdmin && archivedTeams.length > 0 && (
        <div className="flex items-center space-x-3 p-4 rounded-lg border border-border bg-muted/30 mb-6">
          <Switch
            id="show-archived-club"
            checked={showArchived}
            onCheckedChange={setShowArchived}
          />
          <Label htmlFor="show-archived-club" className="flex items-center gap-2 cursor-pointer">
            <Archive className="w-4 h-4 text-muted-foreground" />
            Afficher les équipes archivées ({archivedTeams.length})
          </Label>
          {showArchived && (
            <Badge variant="secondary" className="ml-2">
              Mode archivage
            </Badge>
          )}
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-display font-semibold">
          {showArchived ? "Équipes archivées" : "Équipes"}
        </h2>
        {canManageClub && !showArchived && (
          <Button className="gap-2" onClick={() => setShowTeamModal(true)}>
            <Plus className="w-4 h-4" />Nouvelle équipe
          </Button>
        )}
      </div>

      {displayedTeams.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-8">
          {displayedTeams.map((team, index) => (
            <div key={team.id} className="animate-fade-in-up opacity-0 relative group" style={{ animationDelay: `${index * 0.1}s` }}>
              {showArchived ? (
                // Archived team display
                <div className="flex flex-col items-center">
                  <div 
                    className="w-24 h-24 rounded-full flex items-center justify-center text-2xl font-display font-bold opacity-50 border-2 border-dashed border-muted-foreground/30"
                    style={{ 
                      background: `linear-gradient(135deg, ${team.color || club.primary_color}40 0%, ${team.color || club.primary_color}20 100%)`,
                      color: team.color || club.primary_color
                    }}
                  >
                    {team.name.slice(0, 2).toUpperCase()}
                  </div>
                  <p className="mt-3 text-sm font-medium text-muted-foreground line-through">{team.name}</p>
                  <p className="text-xs text-muted-foreground/60">{team.season}</p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2 gap-1.5 text-primary hover:text-primary"
                    onClick={() => handleRestoreTeam(team.id, team.name)}
                    disabled={isRestoring}
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Restaurer
                  </Button>
                </div>
              ) : (
                // Active team display
                <>
                  <CircleAvatar 
                    name={team.name}
                    shortName={team.short_name}
                    subtitle={team.season || ""} 
                    color={team.color || club.primary_color} 
                    size="lg" 
                    onClick={() => navigate(`/teams/${team.id}`)} 
                  />
                  {canManageClub && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 rounded-full bg-background/80 backdrop-blur-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10 border border-border"
                      onClick={(e) => {
                        e.stopPropagation();
                        setTeamToDelete({ id: team.id, name: team.name });
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      ) : showArchived ? (
        <div className="flex flex-col items-center justify-center h-48 glass-card">
          <Archive className="w-12 h-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium text-muted-foreground">Aucune équipe archivée</h3>
          <p className="text-sm text-muted-foreground mt-1">Toutes les équipes sont actives</p>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center h-48 glass-card">
          <Users className="w-12 h-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium text-muted-foreground">Aucune équipe</h3>
          <p className="text-sm text-muted-foreground mt-1">Créez votre première équipe</p>
          {canManageClub && <Button className="mt-4 gap-2" onClick={() => setShowTeamModal(true)}><Plus className="w-4 h-4" />Créer une équipe</Button>}
        </div>
      )}

      <CreateTeamModal open={showTeamModal} onOpenChange={setShowTeamModal} clubId={club.id} clubColor={club.primary_color} onSuccess={fetchClubData} />
      <CreateCoachModal open={showCoachModal} onOpenChange={setShowCoachModal} clubId={club.id} onSuccess={fetchClubData} />
      <CreatePlayerModal open={showPlayerModal} onOpenChange={setShowPlayerModal} clubId={club.id} onSuccess={fetchClubData} />
      <CreateSupporterModal open={showSupporterModal} onOpenChange={setShowSupporterModal} clubId={club.id} onSuccess={fetchClubData} />
      <CreateClubFrameworkModal open={showFrameworkModal} onOpenChange={setShowFrameworkModal} clubId={club.id} onSuccess={fetchClubData} />
      {club && <EditClubModal open={showClubSettings} onOpenChange={setShowClubSettings} club={club} onSuccess={fetchClubData} />}

      <FrameworkHistorySheet
        open={showFrameworkHistory}
        onOpenChange={setShowFrameworkHistory}
        entityId={id!}
        entityType="club"
        activeFrameworkId={clubFramework?.id || null}
        onRestored={() => fetchClubData()}
      />

      {/* Reset Framework Confirmation */}
      <AlertDialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Réinitialiser le référentiel du club ?</AlertDialogTitle>
            <AlertDialogDescription>
              Le référentiel actuel sera archivé et pourra être restauré depuis l'historique des versions.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isResetting}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleResetFramework}
              disabled={isResetting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isResetting ? "Réinitialisation..." : "Réinitialiser"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Hidden printable component */}
      <div style={{ position: "fixed", left: "-9999px", top: 0 }}>
        <PrintableFramework
          ref={printRef}
          frameworkName={clubFramework?.name || "Référentiel du Club"}
          teamName="Modèle du club"
          clubName={club?.name || ""}
          themes={frameworkThemes}
        />
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!teamToDelete} onOpenChange={(open) => !open && setTeamToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer l'équipe</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer l'équipe "{teamToDelete?.name}" ? 
              Cette action archivera l'équipe. Un administrateur pourra la restaurer ultérieurement.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteTeam}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Suppression..." : "Supprimer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}