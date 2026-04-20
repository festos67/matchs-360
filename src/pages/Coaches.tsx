import { useState, useEffect, useMemo } from "react";
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
import { Pencil, Users, Loader2, Search, Plus } from "lucide-react";
import { EditCoachModal } from "@/components/modals/EditCoachModal";
import { CreateCoachModal } from "@/components/modals/CreateCoachModal";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CircleAvatar } from "@/components/shared/CircleAvatar";

interface CoachData {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  photo_url: string | null;
  club_id: string | null;
  club_name: string | null;
  club_short_name?: string | null;
  club_logo_url?: string | null;
  club_primary_color?: string | null;
  assignments: {
    team_id: string;
    team_name: string;
    coach_role: "referent" | "assistant";
    season: string | null;
    team_color?: string | null;
    team_short_name?: string | null;
  }[];
}

const Coaches = () => {
  const { hasAdminRole: isAdmin, currentRole, user } = useAuth();
  const [coaches, setCoaches] = useState<CoachData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCoach, setSelectedCoach] = useState<CoachData | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [clubFilter, setClubFilter] = useState("all");
  const [teamFilter, setTeamFilter] = useState("all");

  useEffect(() => {
    fetchCoaches();
  }, [isAdmin, currentRole]);

  const fetchCoaches = async () => {
    setLoading(true);
    try {
      let coachRolesQuery = supabase
        .from("user_roles")
        .select("user_id, club_id")
        .eq("role", "coach");

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

      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, email, first_name, last_name, photo_url, club_id")
        .in("id", userIds)
        .is("deleted_at", null);

      if (profilesError) throw profilesError;

      const clubIds = [...new Set(coachRoles.map((r) => r.club_id).filter(Boolean))] as string[];
      let clubsMap: Record<string, { name: string; short_name: string | null; logo_url: string | null; primary_color: string | null }> = {};
      
      if (clubIds.length > 0) {
        const { data: clubs } = await supabase
          .from("clubs")
          .select("id, name, short_name, logo_url, primary_color")
          .in("id", clubIds);
        
        if (clubs) {
          clubsMap = clubs.reduce((acc, club) => {
            acc[club.id] = {
              name: club.name,
              short_name: club.short_name,
              logo_url: club.logo_url,
              primary_color: club.primary_color,
            };
            return acc;
          }, {} as typeof clubsMap);
        }
      }

      const { data: teamMembers, error: tmError } = await supabase
        .from("team_members")
        .select(`
          user_id,
          team_id,
          coach_role,
          teams:team_id (id, name, season, color, short_name)
        `)
        .in("user_id", userIds)
        .eq("member_type", "coach")
        .eq("is_active", true);

      if (tmError) throw tmError;

      const coachesData: CoachData[] = (profiles || []).map((profile) => {
        const coachRole = coachRoles.find((r) => r.user_id === profile.id);
        const assignments = (teamMembers || [])
          .filter((tm) => tm.user_id === profile.id && tm.teams)
          .map((tm) => ({
            team_id: tm.team_id,
            team_name: (tm.teams as any).name,
            coach_role: tm.coach_role as "referent" | "assistant",
            season: (tm.teams as any).season,
            team_color: (tm.teams as any).color,
            team_short_name: (tm.teams as any).short_name,
          }));

        const clubInfo = coachRole?.club_id ? clubsMap[coachRole.club_id] : null;
        return {
          id: profile.id,
          email: profile.email,
          first_name: profile.first_name,
          last_name: profile.last_name,
          photo_url: profile.photo_url,
          club_id: coachRole?.club_id || null,
          club_name: clubInfo?.name || null,
          club_short_name: clubInfo?.short_name || null,
          club_logo_url: clubInfo?.logo_url || null,
          club_primary_color: clubInfo?.primary_color || null,
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

  const uniqueClubs = useMemo(() => {
    const map = new Map<string, string>();
    coaches.forEach((c) => { if (c.club_id && c.club_name) map.set(c.club_id, c.club_name); });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [coaches]);

  const uniqueTeams = useMemo(() => {
    const map = new Map<string, string>();
    coaches.forEach((c) => {
      if (clubFilter !== "all" && c.club_id !== clubFilter) return;
      c.assignments.forEach((a) => map.set(a.team_id, a.team_name));
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [coaches, clubFilter]);

  const filteredCoaches = useMemo(() => {
    return coaches.filter((coach) => {
      if (clubFilter !== "all" && coach.club_id !== clubFilter) return false;
      if (teamFilter !== "all" && !coach.assignments.some((a) => a.team_id === teamFilter)) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const name = `${coach.first_name || ""} ${coach.last_name || ""}`.toLowerCase();
        if (!name.includes(q) && !coach.email.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [coaches, clubFilter, teamFilter, searchQuery]);

  const groupedCoaches = useMemo(() => {
    const groups: Record<string, {
      clubName: string;
      clubShortName: string | null;
      clubLogoUrl: string | null;
      clubPrimaryColor: string | null;
      coaches: CoachData[];
    }> = {};
    filteredCoaches.forEach((coach) => {
      const key = coach.club_id || "no-club";
      if (!groups[key]) {
        groups[key] = {
          clubName: coach.club_name || "Sans club",
          clubShortName: coach.club_short_name || null,
          clubLogoUrl: coach.club_logo_url || null,
          clubPrimaryColor: coach.club_primary_color || null,
          coaches: [],
        };
      }
      groups[key].coaches.push(coach);
    });
    return Object.values(groups).sort((a, b) => a.clubName.localeCompare(b.clubName));
  }, [filteredCoaches]);

  useEffect(() => { setTeamFilter("all"); }, [clubFilter]);

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
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold">Gestion des Coachs</h1>
            <p className="text-muted-foreground mt-1">
              {isAdmin
                ? "Gérez tous les coachs de la plateforme"
                : "Gérez les coachs de votre club"}
            </p>
          </div>
          {(currentRole?.role === "club_admin" && currentRole?.club_id) && (
            <Button onClick={() => setCreateModalOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Ajouter un coach
            </Button>
          )}
        </div>

        {/* Search & Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher un coach..."
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
              {uniqueClubs.map(([id, name]) => (
                <SelectItem key={id} value={id}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={teamFilter} onValueChange={setTeamFilter}>
            <SelectTrigger className="w-full sm:w-[220px]">
              <SelectValue placeholder="Toutes les équipes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les équipes</SelectItem>
              {uniqueTeams.map(([id, name]) => (
                <SelectItem key={id} value={id}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Coaches grouped by club */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredCoaches.length === 0 ? (
          <div className="rounded-lg border bg-card">
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Users className="w-12 h-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-semibold">Aucun coach trouvé</h3>
              <p className="text-muted-foreground text-sm mt-1">
                {searchQuery || clubFilter !== "all" || teamFilter !== "all"
                  ? "Aucun coach ne correspond aux filtres sélectionnés."
                  : isAdmin
                    ? "Aucun coach n'a encore été ajouté sur la plateforme."
                    : "Aucun coach n'a encore été ajouté à votre club."}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {groupedCoaches.map((group) => (
              <div key={group.clubName}>
                <div className="flex items-center gap-3 mb-3">
                  <CircleAvatar
                    shape="square"
                    size="sm"
                    name={group.clubName}
                    shortName={group.clubShortName}
                    imageUrl={group.clubLogoUrl}
                    color={group.clubPrimaryColor || "#3B82F6"}
                    showName={false}
                    className="!w-10 !h-10"
                  />
                  <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">{group.clubName}</h2>
                  <span className="text-xs text-muted-foreground">({group.coaches.length})</span>
                </div>
                <div className="rounded-lg border bg-card">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Coach</TableHead>
                        <TableHead>Affectations</TableHead>
                        <TableHead className="w-[100px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.coaches.map((coach) => (
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
                                    variant="outline"
                                    className="border-2 font-medium"
                                    style={
                                      assignment.coach_role === "referent"
                                        ? {
                                            backgroundColor: assignment.team_color || "#3B82F6",
                                            borderColor: assignment.team_color || "#3B82F6",
                                            color: "#fff",
                                          }
                                        : {
                                            backgroundColor: `${assignment.team_color || "#3B82F6"}1A`,
                                            borderColor: assignment.team_color || "#3B82F6",
                                            color: assignment.team_color || "#3B82F6",
                                          }
                                    }
                                  >
                                    {assignment.team_name}
                                    <span className="ml-1 opacity-80">
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
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedCoach && (
        <EditCoachModal
          open={editModalOpen}
          onOpenChange={setEditModalOpen}
          coach={selectedCoach}
          onSuccess={handleEditSuccess}
        />
      )}

      {currentRole?.role === "club_admin" && currentRole?.club_id && (
        <CreateCoachModal
          open={createModalOpen}
          onOpenChange={setCreateModalOpen}
          clubId={currentRole.club_id}
          onSuccess={fetchCoaches}
        />
      )}
    </AppLayout>
  );
};

export default Coaches;
