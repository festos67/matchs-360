import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, Plus, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";

const Teams = () => {
  const { user, isAdmin, currentRole } = useAuth();

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

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold text-foreground">
              Équipes
            </h1>
            <p className="text-muted-foreground mt-1">
              {isAdmin ? "Toutes les équipes" : "Vos équipes"}
            </p>
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
        ) : teams && teams.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {teams.map((team) => (
              <Link key={team.id} to={`/teams/${team.id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer group">
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
            ))}
          </div>
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
    </AppLayout>
  );
};

export default Teams;
