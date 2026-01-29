import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, Plus, ChevronRight, Search, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
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

const Teams = () => {
  const { user, isAdmin, currentRole, roles } = useAuth();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [teamToDelete, setTeamToDelete] = useState<{ id: string; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const { data: teams, isLoading } = useQuery({
    queryKey: ["teams", user?.id, currentRole?.role],
    queryFn: async () => {
      let query = supabase
        .from("teams")
        .select(`
          *,
          clubs (id, name, logo_url, primary_color),
          team_members (id, member_type, user_id)
        `)
        .is("deleted_at", null)
        .order("name");

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const getTeamMemberCount = (team: any) => {
    return team.team_members?.filter((m: any) => m.member_type === "player").length || 0;
  };

  const getCoachCount = (team: any) => {
    return team.team_members?.filter((m: any) => m.member_type === "coach").length || 0;
  };

  const canDeleteTeam = (team: any) => {
    if (isAdmin) return true;
    if (currentRole?.role === "club_admin" && team.clubs?.id) {
      return roles.some(r => r.role === "club_admin" && r.club_id === team.clubs.id);
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
    } catch (error: any) {
      console.error("Error deleting team:", error);
      toast.error("Erreur lors de la suppression de l'équipe");
    } finally {
      setIsDeleting(false);
      setTeamToDelete(null);
    }
  };

  const filteredTeams = teams?.filter((team) => {
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
              Équipes
            </h1>
            <p className="text-muted-foreground mt-1">
              {isAdmin ? "Toutes les équipes" : "Vos équipes"}
            </p>
          </div>
          
          {/* Search Bar */}
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher une équipe..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

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
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredTeams.map((team) => (
              <div key={team.id} className="relative group">
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
                        <span>{team.clubs?.name}</span>
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
                
                {/* Delete Button */}
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
              </div>
            ))}
          </div>
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
              Cette action est irréversible.
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
};

export default Teams;
