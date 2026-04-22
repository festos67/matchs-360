/**
 * @page Teams
 * @route /teams
 *
 * Annuaire des équipes — groupé par club.
 *
 * @description
 * Vue carte des équipes accessibles. Utilise React Query pour le cache et la
 * synchronisation automatique après création/archivage.
 *
 * @features
 * - Filtres par club et par saison
 * - Switch "Afficher archivées" (Super Admin / Club Admin)
 * - Restauration d'équipes soft-deleted (mem://features/archived-entities-restoration)
 * - Création directe (CreateTeamModal)
 *
 * @access
 * - Super Admin : toutes équipes
 * - Club Admin : équipes de son club
 * - Coach : équipes assignées via team_members
 * - Joueur : son équipe d'affiliation uniquement
 *
 * @maintenance
 * Le soft-delete via `deleted_at` doit être systématiquement filtré
 * (mem://technical/soft-delete-strategy).
 */
import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, Plus, ChevronRight, ChevronDown, Search, Trash2, RotateCcw, Archive, UserCog } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
import { TeamCard } from "@/components/shared/TeamCard";
import { AddEntityButton } from "@/components/shared/AddEntityButton";
import type { Tables } from "@/integrations/supabase/types";

type TeamMemberPartial = {
  id: string;
  member_type: string;
  user_id: string;
  is_active: boolean;
  coach_role?: string | null;
  profiles: { first_name: string | null; last_name: string | null } | null;
};

type TeamClub = Pick<Tables<"clubs">, "id" | "name" | "logo_url" | "primary_color" | "short_name">;

type TeamWithRelations = Tables<"teams"> & {
  clubs: TeamClub | null;
  team_members: TeamMemberPartial[];
};

const STORAGE_KEY_CLUBS = "teams-collapsed-clubs";

/**
 * Saison sportive courante (août → juillet).
 * Ex: en mars 2026 → "2025-2026".
 */
const getCurrentSeason = () => {
  const now = new Date();
  const y = now.getFullYear();
  const startYear = now.getMonth() >= 6 ? y : y - 1;
  return `${startYear}-${startYear + 1}`;
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
  const [collapsedClubs, setCollapsedClubs] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_CLUBS);
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  const toggleClub = (clubId: string) => {
    setCollapsedClubs((prev) => {
      const next = { ...prev, [clubId]: !prev[clubId] };
      localStorage.setItem(STORAGE_KEY_CLUBS, JSON.stringify(next));
      return next;
    });
  };

  const currentSeason = getCurrentSeason();

  const { data: teams, isLoading } = useQuery({
    queryKey: ["teams", user?.id, currentRole?.role, showArchived],
    queryFn: async () => {
      let query = supabase
        .from("teams")
        .select(`
          *,
          clubs (id, name, logo_url, primary_color, short_name),
          team_members (id, member_type, user_id, is_active, coach_role, profiles:user_id (first_name, last_name))
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

  const getReferentCoachName = (team: TeamWithRelations) => {
    const ref = team.team_members?.find(
      (m) => m.member_type === "coach" && m.is_active && m.coach_role === "referent"
    );
    if (!ref?.profiles) return "—";
    const name = `${ref.profiles.first_name || ""} ${ref.profiles.last_name || ""}`.trim();
    return name || "—";
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
            <AddEntityButton type="team" onClick={() => setShowCreateTeam(true)} />
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
            const grouped: Record<string, {
              clubId: string;
              clubName: string;
              clubColor: string;
              clubShortName: string | null;
              clubLogoUrl: string | null;
              teams: typeof filteredTeams;
            }> = {};
            filteredTeams!.forEach((team) => {
              const clubId = team.clubs?.id || "no-club";
              if (!grouped[clubId]) {
                grouped[clubId] = {
                  clubId,
                  clubName: team.clubs?.name || "Sans club",
                  clubColor: team.clubs?.primary_color || "#6366f1",
                  clubShortName: team.clubs?.short_name || null,
                  clubLogoUrl: team.clubs?.logo_url || null,
                  teams: [],
                };
              }
              grouped[clubId].teams!.push(team);
            });
            const sortedGroups = Object.values(grouped).sort((a, b) => a.clubName.localeCompare(b.clubName));
            const showClubLevel = sortedGroups.length > 1;

            return (
              <div className="space-y-4">
                {sortedGroups.map((group) => {
                  const clubOpen = collapsedClubs[group.clubId] !== true;
                  const teamsGrid = (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 sm:gap-6">
                      {group.teams!.map((team) => (
                        <div key={team.id} className="relative group">
                          {showArchived ? (
                            <div className="opacity-60">
                              <div className="flex flex-col items-center text-center">
                                <div className="relative">
                                  <div
                                    className="w-full aspect-square max-w-[7rem] rounded-2xl flex items-center justify-center font-display font-bold text-white text-[clamp(1rem,4vw,1.75rem)]"
                                    style={{
                                      background: `linear-gradient(135deg, ${team.color || team.clubs?.primary_color || "#6366f1"} 0%, ${team.color || team.clubs?.primary_color || "#6366f1"}88 100%)`,
                                    }}
                                  >
                                    {team.short_name ||
                                      team.name
                                        .split(" ")
                                        .map((n) => n[0])
                                        .join("")
                                        .slice(0, 2)
                                        .toUpperCase()}
                                  </div>
                                  <Badge
                                    variant="outline"
                                    className="absolute -top-2 -right-2 text-[10px] text-destructive border-destructive/30 bg-background"
                                  >
                                    Archivée
                                  </Badge>
                                </div>
                                <p className="font-semibold text-foreground mt-2 text-sm">{team.name}</p>
                                {team.season && team.season !== currentSeason && (
                                  <p className="text-xs text-muted-foreground mt-0.5">{team.season}</p>
                                )}
                                <p className="text-xs text-muted-foreground">
                                  Coach : {getReferentCoachName(team)}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {getTeamMemberCount(team)} joueur{getTeamMemberCount(team) > 1 ? "s" : ""}
                                </p>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="gap-2 mt-2 text-primary hover:text-primary"
                                  onClick={() => handleRestoreTeam(team.id, team.name)}
                                  disabled={isRestoring}
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                  Restaurer
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <TeamCard
                                id={team.id}
                                name={team.name}
                                shortName={team.short_name}
                                color={team.color || team.clubs?.primary_color}
                                season={team.season}
                                hideSeason={team.season === currentSeason}
                                referentCoachName={getReferentCoachName(team)}
                                playerCount={getTeamMemberCount(team)}
                              />
                              {canDeleteTeam(team) && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setTeamToDelete({ id: team.id, name: team.name });
                                  }}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  );

                  if (!showClubLevel) {
                    return <div key={group.clubId}>{teamsGrid}</div>;
                  }

                  const clubInitials = (group.clubShortName || group.clubName.slice(0, 2)).toUpperCase();
                  return (
                    <Collapsible
                      key={group.clubId}
                      open={clubOpen}
                      onOpenChange={() => toggleClub(group.clubId)}
                    >
                      <CollapsibleTrigger className="flex items-center gap-2 w-full p-3 rounded-lg bg-accent/10 hover:bg-accent/15 transition-colors cursor-pointer">
                        <ChevronDown
                          className={`w-4 h-4 text-muted-foreground transition-transform ${clubOpen ? "" : "-rotate-90"}`}
                        />
                        <div
                          className="w-6 h-6 rounded flex items-center justify-center overflow-hidden shrink-0"
                          style={{ backgroundColor: group.clubLogoUrl ? "transparent" : group.clubColor }}
                        >
                          {group.clubLogoUrl ? (
                            <img src={group.clubLogoUrl} alt={group.clubName} className="w-full h-full object-contain" />
                          ) : (
                            <span className="text-[10px] font-bold text-white leading-none">
                              {clubInitials}
                            </span>
                          )}
                        </div>
                        <span className="font-display font-bold text-sm uppercase tracking-wider">
                          {group.clubName}
                        </span>
                        <Badge variant="secondary" className="ml-auto text-xs">
                          {group.teams!.length} équipe{group.teams!.length > 1 ? "s" : ""}
                        </Badge>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="mt-3 pl-4 border-l-2 border-primary/20">
                          {teamsGrid}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  );
                })}
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