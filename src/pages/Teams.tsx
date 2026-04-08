import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, Plus, ChevronRight, Search, Trash2, RotateCcw, Archive, UserCog } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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
import { toast } from "sonner";
import { CreateTeamModal } from "@/components/modals/CreateTeamModal";
import type { Tables } from "@/integrations/supabase/types";

type TeamMemberPartial = {
  id: string;
  member_type: string;
  user_id: string;
  is_active: boolean;
  coach_role?: string | null;
  profiles: { first_name: string | null; last_name: string | null } | null;
};

type TeamClub = Pick<Tables<"clubs">, "id" | "name" | "logo_url" | "primary_color">;

type TeamWithRelations = Tables<"teams"> & {
  clubs: TeamClub | null;
  team_members: TeamMemberPartial[];
};

const Teams = () => {
  const { user, hasAdminRole: isAdmin, currentRole, roles } = useAuth();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [clubFilter, setClubFilter] = useState("all");
  const [coachFilter, setCoachFilter] = useState("all");
  const [teamToDelete, setTeamToDelete] = useState<{ id: string; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [showCreateTeam, setShowCreateTeam] = useState(false);

  const { data: teams, isLoading } = useQuery({
    queryKey: ["teams", user?.id, currentRole?.role, showArchived],
    queryFn: async () => {
      let query = supabase
        .from("teams")
        .select(`
          *,
          clubs (id, name, logo_url, primary_color),
          team_members (id, member_type, user_id, is_active, profiles:user_id (first_name, last_name))
        `)
        .order("name");

      if (showArchived) {
        query = query.not("deleted_at", "is", null);
      } else {
        query = query.is("deleted_at", null);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const getTeamMemberCount = (team: TeamWithRelations) => {
    return team.team_members?.filter(m => m.member_type === "player" && m.is_active).length || 0;
  };

  const getCoachCount = (team: TeamWithRelations) => {
    return team.team_members?.filter(m => m.member_type === "coach" && m.is_active).length || 0;
  };

  const canDeleteTeam = (team: TeamWithRelations) => {
    if (isAdmin) return true;
    if (currentRole?.role === "club_admin" && team.clubs?.id) {
      return roles.some(r => r.role === "club_admin" && r.club_id === team.clubs!.id);
    }
    return false;
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
      queryClient.invalidateQueries({ queryKey: ["teams"] });
    } catch (error) {
      console.error("Error deleting team:", error);
      toast.error("Erreur lors de la suppression de l'équipe");
    } finally {
      setIsDeleting(false);
      setTeamToDelete(null);
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
      queryClient.invalidateQueries({ queryKey: ["teams"] });
    } catch (error) {
      console.error("Error restoring team:", error);
      toast.error("Erreur lors de la restauration de l'équipe");
    } finally {
      setIsRestoring(false);
    }
  };

  // Extract unique clubs for filter
  const uniqueClubs = teams
    ? Array.from(new Map(teams.filter(t => t.clubs).map(t => [t.clubs!.id, t.clubs!])).values())
        .sort((a, b) => a.name.localeCompare(b.name))
    : [];

  // Extract unique coaches for filter
  const uniqueCoaches = (() => {
    const map = new Map<string, string>();
    teams?.forEach((team) => {
      team.team_members?.filter(m => m.member_type === "coach" && m.is_active).forEach(m => {
        const name = `${m.profiles?.first_name || ""} ${m.profiles?.last_name || ""}`.trim();
        if (name && m.user_id) {
          map.set(m.user_id, name);
        }
      });
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  })();

  // When acting as coach, only show teams where user is coach
  const roleFilteredTeams = (() => {
    if (currentRole?.role === "coach" && user) {
      return teams?.filter((team) =>
        team.team_members?.some(m => m.member_type === "coach" && m.is_active && m.user_id === user.id)
      );
    }
    return teams;
  })();

  const filteredTeams = roleFilteredTeams?.filter((team) => {
    if (clubFilter !== "all" && team.clubs?.id !== clubFilter) return false;
    if (coachFilter !== "all") {
      const hasCoach = team.team_members?.some(m => m.member_type === "coach" && m.is_active && m.user_id === coachFilter);
      if (!hasCoach) return false;
    }
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      team.name.toLowerCase().includes(query) ||
      team.clubs?.name?.toLowerCase().includes(query) ||
      team.season?.toLowerCase().includes(query)
    );
  });

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground">
              {showArchived ? "Équipes archivées" : currentRole?.role === "club_admin" ? "Les équipes du club" : "Équipes"}
            </h1>
            <p className="text-muted-foreground mt-1">
              {isAdmin ? "Toutes les équipes" : currentRole?.role === "club_admin" ? "Gérez vos équipes" : "Vos équipes"}
            </p>
          </div>
          {(isAdmin || currentRole?.role === "club_admin") && (
            <Button onClick={() => setShowCreateTeam(true)} className="gap-2">
              <Plus className="w-4 h-4" />
              Nouvelle équipe
            </Button>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher une équipe..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={clubFilter} onValueChange={setClubFilter}>
            <SelectTrigger className="w-full sm:w-[220px]">
              <SelectValue placeholder="Tous les clubs" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les clubs</SelectItem>
              {uniqueClubs.map((club) => (
                <SelectItem key={club.id} value={club.id}>{club.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={coachFilter} onValueChange={setCoachFilter}>
            <SelectTrigger className="w-full sm:w-[220px]">
              <SelectValue placeholder="Tous les coachs" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les coachs</SelectItem>
              {uniqueCoaches.map(([id, name]) => (
                <SelectItem key={id} value={id}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Admin Toggle for Archived Teams */}
        {isAdmin && (
          <div className="flex items-center space-x-3 p-4 rounded-lg border border-border bg-muted/30">
            <Switch
              id="show-archived"
              checked={showArchived}
              onCheckedChange={setShowArchived}
            />
            <Label htmlFor="show-archived" className="flex items-center gap-2 cursor-pointer">
              <Archive className="w-4 h-4 text-muted-foreground" />
              Afficher les équipes archivées
            </Label>
            {showArchived && (
              <Badge variant="secondary" className="ml-2">
                Mode archivage
              </Badge>
            )}
          </div>
        )}

        {/* Teams Grid */}
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardHeader>
                  <Skeleton className="h-6 w-32" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-4 w-24 mb-2" />
                  <Skeleton className="h-4 w-20" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredTeams && filteredTeams.length > 0 ? (
          (() => {
            // Group teams by club
            const grouped: Record<string, { clubName: string; clubColor: string; teams: typeof filteredTeams }> = {};
            filteredTeams!.forEach((team) => {
              const clubId = team.clubs?.id || "no-club";
              if (!grouped[clubId]) {
                grouped[clubId] = {
                  clubName: team.clubs?.name || "Sans club",
                  clubColor: team.clubs?.primary_color || "#6366f1",
                  teams: [],
                };
              }
              grouped[clubId].teams!.push(team);
            });
            const sortedGroups = Object.values(grouped).sort((a, b) => a.clubName.localeCompare(b.clubName));

            return (
              <div className="space-y-6">
                {sortedGroups.map((group) => (
                  <div key={group.clubName}>
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: group.clubColor }} />
                      <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{group.clubName}</h2>
                      <span className="text-xs text-muted-foreground">({group.teams!.length})</span>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      {group.teams!.map((team) => (
                        <div key={team.id} className="relative group">
                          {showArchived ? (
                            <Card className="opacity-60 bg-muted/50 border-dashed">
                              <CardHeader className="pb-2">
                                <div className="flex items-center justify-between">
                                  <CardTitle className="text-lg flex items-center gap-2 text-muted-foreground">
                                    <div
                                      className="w-3 h-3 rounded-full opacity-50"
                                      style={{ backgroundColor: team.color || team.clubs?.primary_color || "#6366f1" }}
                                    />
                                    {team.name}
                                  </CardTitle>
                                  <Badge variant="outline" className="text-xs text-destructive border-destructive/30">
                                    Archivée
                                  </Badge>
                                </div>
                              </CardHeader>
                              <CardContent>
                                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                                  <span>{team.clubs?.name}</span>
                                  {team.season && (
                                    <Badge variant="outline" className="text-xs opacity-50">
                                      {team.season}
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                    <div className="flex items-center gap-1">
                                      <Users className="w-4 h-4" />
                                      <span>{getTeamMemberCount(team)} joueurs</span>
                                    </div>
                                  </div>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="gap-2 text-primary hover:text-primary"
                                    onClick={() => handleRestoreTeam(team.id, team.name)}
                                    disabled={isRestoring}
                                  >
                                    <RotateCcw className="w-4 h-4" />
                                    Restaurer
                                  </Button>
                                </div>
                              </CardContent>
                            </Card>
                          ) : (
                            <>
                              <Link to={`/teams/${team.id}`}>
                                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                                  <CardHeader className="pb-2">
                                    <div className="flex items-center justify-between">
                                      <CardTitle className="text-lg flex items-center gap-2">
                                        <div
                                          className="w-3 h-3 rounded-full"
                                          style={{ backgroundColor: team.color || team.clubs?.primary_color || "#6366f1" }}
                                        />
                                        {team.name}
                                      </CardTitle>
                                      <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                                    </div>
                                  </CardHeader>
                                  <CardContent>
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                                      {team.season && (
                                        <Badge variant="outline" className="text-xs">
                                          {team.season}
                                        </Badge>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-4 text-sm">
                                      <div className="flex items-center gap-1">
                                        <Users className="w-4 h-4 text-muted-foreground" />
                                        <span>{getTeamMemberCount(team)} joueurs</span>
                                      </div>
                                      <span className="text-muted-foreground">
                                        {getCoachCount(team)} coach{getCoachCount(team) > 1 ? "s" : ""}
                                      </span>
                                    </div>
                                  </CardContent>
                                </Card>
                              </Link>
                              
                              {canDeleteTeam(team) && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                  onClick={(e) => {
                                    e.preventDefault();
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
                  </div>
                ))}
              </div>
            );
          })()
        ) : teams && teams.length > 0 && filteredTeams?.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Search className="w-12 h-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Aucun résultat</h3>
              <p className="text-muted-foreground">
                Aucune équipe ne correspond à "{searchQuery}"
              </p>
            </CardContent>
          </Card>
        ) : showArchived ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Archive className="w-12 h-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Aucune équipe archivée</h3>
              <p className="text-muted-foreground">
                Toutes les équipes sont actives.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Users className="w-12 h-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">Aucune équipe</h3>
              <p className="text-muted-foreground mb-4">
                {isAdmin || currentRole?.role === "club_admin"
                  ? "Créez une équipe depuis la page d'un club."
                  : "Vous n'êtes membre d'aucune équipe pour le moment."}
              </p>
              {(isAdmin || currentRole?.role === "club_admin") && (
                <Button asChild>
                  <Link to="/clubs">
                    <Plus className="w-4 h-4 mr-2" />
                    Voir les clubs
                  </Link>
                </Button>
              )}
            </CardContent>
          </Card>
        )}
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

      {showCreateTeam && currentRole?.club_id && (
        <CreateTeamModal
          open={showCreateTeam}
          onOpenChange={setShowCreateTeam}
          clubId={currentRole.club_id}
          onSuccess={() => queryClient.invalidateQueries({ queryKey: ["teams"] })}
        />
      )}
    </AppLayout>
  );
};

export default Teams;