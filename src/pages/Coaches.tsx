import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Pencil, Users, Loader2 } from "lucide-react";
import { EditCoachModal } from "@/components/modals/EditCoachModal";

interface CoachData {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  photo_url: string | null;
  club_id: string | null;
  club_name: string | null;
  assignments: {
    team_id: string;
    team_name: string;
    coach_role: "referent" | "assistant";
    season: string | null;
  }[];
}

const Coaches = () => {
  const { hasAdminRole: isAdmin, currentRole, user } = useAuth();
  const [coaches, setCoaches] = useState<CoachData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCoach, setSelectedCoach] = useState<CoachData | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);

  useEffect(() => {
    fetchCoaches();
  }, [isAdmin, currentRole]);

  const fetchCoaches = async () => {
    setLoading(true);
    try {
      // Récupérer tous les utilisateurs avec le rôle coach
      let coachRolesQuery = supabase
        .from("user_roles")
        .select("user_id, club_id")
        .eq("role", "coach");

      // Si club_admin, filtrer par club
      if (!isAdmin && currentRole?.role === "club_admin" && currentRole?.club_id) {
        coachRolesQuery = coachRolesQuery.eq("club_id", currentRole.club_id);
      }

      const { data: coachRoles, error: rolesError } = await coachRolesQuery;

      if (rolesError) throw rolesError;

      if (!coachRoles || coachRoles.length === 0) {
        setCoaches([]);
        setLoading(false);
        return;
      }

      const userIds = [...new Set(coachRoles.map((r) => r.user_id))];

      // Récupérer les profils des coachs
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, email, first_name, last_name, photo_url, club_id")
        .in("id", userIds)
        .is("deleted_at", null);

      if (profilesError) throw profilesError;

      // Récupérer les noms des clubs
      const clubIds = [...new Set(coachRoles.map((r) => r.club_id).filter(Boolean))] as string[];
      let clubsMap: Record<string, string> = {};
      
      if (clubIds.length > 0) {
        const { data: clubs } = await supabase
          .from("clubs")
          .select("id, name")
          .in("id", clubIds);
        
        if (clubs) {
          clubsMap = clubs.reduce((acc, club) => {
            acc[club.id] = club.name;
            return acc;
          }, {} as Record<string, string>);
        }
      }

      // Récupérer les affectations d'équipes
      const { data: teamMembers, error: tmError } = await supabase
        .from("team_members")
        .select(`
          user_id,
          team_id,
          coach_role,
          teams:team_id (id, name, season)
        `)
        .in("user_id", userIds)
        .eq("member_type", "coach")
        .eq("is_active", true);

      if (tmError) throw tmError;

      // Construire les données des coachs
      const coachesData: CoachData[] = (profiles || []).map((profile) => {
        const coachRole = coachRoles.find((r) => r.user_id === profile.id);
        const assignments = (teamMembers || [])
          .filter((tm) => tm.user_id === profile.id && tm.teams)
          .map((tm) => ({
            team_id: tm.team_id,
            team_name: (tm.teams as any).name,
            coach_role: tm.coach_role as "referent" | "assistant",
            season: (tm.teams as any).season,
          }));

        return {
          id: profile.id,
          email: profile.email,
          first_name: profile.first_name,
          last_name: profile.last_name,
          photo_url: profile.photo_url,
          club_id: coachRole?.club_id || null,
          club_name: coachRole?.club_id ? clubsMap[coachRole.club_id] || null : null,
          assignments,
        };
      });

      setCoaches(coachesData);
    } catch (error) {
      console.error("Error fetching coaches:", error);
    } finally {
      setLoading(false);
    }
  };

  const getInitials = (firstName: string | null, lastName: string | null) => {
    const first = firstName?.charAt(0) || "";
    const last = lastName?.charAt(0) || "";
    return (first + last).toUpperCase() || "?";
  };

  const handleEdit = (coach: CoachData) => {
    setSelectedCoach(coach);
    setEditModalOpen(true);
  };

  const handleEditSuccess = () => {
    fetchCoaches();
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold">Gestion des Coachs</h1>
            <p className="text-muted-foreground mt-1">
              {isAdmin
                ? "Gérez tous les coachs de la plateforme"
                : "Gérez les coachs de votre club"}
            </p>
          </div>
        </div>

        {/* Table */}
        <div className="rounded-lg border bg-card">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : coaches.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Users className="w-12 h-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-semibold">Aucun coach trouvé</h3>
              <p className="text-muted-foreground text-sm mt-1">
                {isAdmin
                  ? "Aucun coach n'a encore été ajouté sur la plateforme."
                  : "Aucun coach n'a encore été ajouté à votre club."}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Coach</TableHead>
                  {isAdmin && <TableHead>Club</TableHead>}
                  <TableHead>Affectations</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {coaches.map((coach) => (
                  <TableRow key={coach.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={coach.photo_url || undefined} />
                          <AvatarFallback className="bg-primary/10 text-primary font-medium">
                            {getInitials(coach.first_name, coach.last_name)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">
                            {coach.first_name || ""} {coach.last_name || ""}
                          </p>
                          <p className="text-sm text-muted-foreground">{coach.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    {isAdmin && (
                      <TableCell>
                        {coach.club_name ? (
                          <span className="text-sm">{coach.club_name}</span>
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    )}
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        {coach.assignments.length === 0 ? (
                          <span className="text-sm text-muted-foreground">
                            Aucune équipe assignée
                          </span>
                        ) : (
                          coach.assignments.map((assignment) => (
                            <Badge
                              key={assignment.team_id}
                              variant={assignment.coach_role === "referent" ? "default" : "secondary"}
                              className={
                                assignment.coach_role === "referent"
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-muted text-muted-foreground"
                              }
                            >
                              {assignment.team_name}
                              <span className="ml-1 opacity-70">
                                ({assignment.coach_role === "referent" ? "Réf" : "Ass"})
                              </span>
                            </Badge>
                          ))
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(coach)}
                      >
                        <Pencil className="w-4 h-4" />
                        <span className="sr-only">Éditer</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      {/* Edit Modal */}
      {selectedCoach && (
        <EditCoachModal
          open={editModalOpen}
          onOpenChange={setEditModalOpen}
          coach={selectedCoach}
          onSuccess={handleEditSuccess}
        />
      )}
    </AppLayout>
  );
};

export default Coaches;
