import { useState, useEffect } from "react";
import { UserCog, User, Users } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";

interface Team {
  id: string;
  name: string;
  season: string | null;
  hasReferent: boolean; // true si un autre coach est déjà référent
  referentName?: string; // nom du référent actuel
}

interface TeamAssignment {
  teamId: string;
  assigned: boolean;
  role: "referent" | "assistant";
  originalAssigned: boolean;
  originalRole: "referent" | "assistant" | null;
}

interface CoachData {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  photo_url: string | null;
  club_id: string | null;
  assignments: {
    team_id: string;
    team_name: string;
    coach_role: "referent" | "assistant";
  }[];
}

interface EditCoachModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  coach: CoachData;
  onSuccess?: () => void;
}

export const EditCoachModal = ({
  open,
  onOpenChange,
  coach,
  onSuccess,
}: EditCoachModalProps) => {
  const { isAdmin, currentRole } = useAuth();
  const [loading, setLoading] = useState(false);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [teamAssignments, setTeamAssignments] = useState<TeamAssignment[]>([]);
  const [firstName, setFirstName] = useState(coach.first_name || "");
  const [lastName, setLastName] = useState(coach.last_name || "");
  const [activeTab, setActiveTab] = useState("profile");

  useEffect(() => {
    if (open) {
      setFirstName(coach.first_name || "");
      setLastName(coach.last_name || "");
      fetchTeams();
    }
  }, [open, coach]);

  const fetchTeams = async () => {
    setLoadingTeams(true);
    try {
      // Déterminer quel club cibler
      const clubId = coach.club_id || currentRole?.club_id;
      
      if (!clubId && !isAdmin) {
        setTeams([]);
        setTeamAssignments([]);
        return;
      }

      let query = supabase
        .from("teams")
        .select("id, name, season")
        .is("deleted_at", null)
        .order("name");

      if (clubId) {
        query = query.eq("club_id", clubId);
      }

      const { data: teamsData, error } = await query;

      if (error) throw error;

      // Récupérer les coachs référents actuels pour chaque équipe (sauf le coach en cours d'édition)
      const teamIds = (teamsData || []).map((t) => t.id);
      
      let referentsMap: Record<string, string> = {};
      
      if (teamIds.length > 0) {
        const { data: referents } = await supabase
          .from("team_members")
          .select(`
            team_id,
            profiles:user_id (first_name, last_name)
          `)
          .in("team_id", teamIds)
          .eq("member_type", "coach")
          .eq("coach_role", "referent")
          .eq("is_active", true)
          .neq("user_id", coach.id); // Exclure le coach en cours d'édition

        if (referents) {
          referents.forEach((r) => {
            const profile = r.profiles as any;
            if (profile) {
              referentsMap[r.team_id] = `${profile.first_name || ""} ${profile.last_name || ""}`.trim() || "Un autre coach";
            }
          });
        }
      }

      const teamsWithReferents: Team[] = (teamsData || []).map((team) => ({
        ...team,
        hasReferent: !!referentsMap[team.id],
        referentName: referentsMap[team.id],
      }));

      setTeams(teamsWithReferents);

      // Initialiser les assignments avec l'état actuel
      const assignments: TeamAssignment[] = teamsWithReferents.map((team) => {
        const existingAssignment = coach.assignments.find(
          (a) => a.team_id === team.id
        );
        return {
          teamId: team.id,
          assigned: !!existingAssignment,
          role: existingAssignment?.coach_role || "assistant",
          originalAssigned: !!existingAssignment,
          originalRole: existingAssignment?.coach_role || null,
        };
      });

      setTeamAssignments(assignments);
    } catch (error) {
      console.error("Error fetching teams:", error);
    } finally {
      setLoadingTeams(false);
    }
  };

  const toggleTeamAssignment = (teamId: string) => {
    setTeamAssignments((prev) =>
      prev.map((assignment) =>
        assignment.teamId === teamId
          ? { ...assignment, assigned: !assignment.assigned }
          : assignment
      )
    );
  };

  const setTeamRole = (teamId: string, role: "referent" | "assistant") => {
    setTeamAssignments((prev) =>
      prev.map((assignment) =>
        assignment.teamId === teamId ? { ...assignment, role } : assignment
      )
    );
  };

  const getInitials = () => {
    const first = firstName?.charAt(0) || coach.first_name?.charAt(0) || "";
    const last = lastName?.charAt(0) || coach.last_name?.charAt(0) || "";
    return (first + last).toUpperCase() || "?";
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      // 1. Mettre à jour le profil
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          first_name: firstName,
          last_name: lastName,
        })
        .eq("id", coach.id);

      if (profileError) throw profileError;

      // 2. Gérer les affectations d'équipes
      const toAdd = teamAssignments.filter(
        (a) => a.assigned && !a.originalAssigned
      );
      const toRemove = teamAssignments.filter(
        (a) => !a.assigned && a.originalAssigned
      );
      const toUpdate = teamAssignments.filter(
        (a) =>
          a.assigned &&
          a.originalAssigned &&
          a.role !== a.originalRole
      );

      // Supprimer les affectations
      for (const assignment of toRemove) {
        const { error } = await supabase
          .from("team_members")
          .update({ is_active: false, left_at: new Date().toISOString() })
          .eq("user_id", coach.id)
          .eq("team_id", assignment.teamId)
          .eq("member_type", "coach");

        if (error) throw error;
      }

      // Ajouter les nouvelles affectations (ou réactiver si existante)
      for (const assignment of toAdd) {
        // Vérifier s'il existe déjà une entrée inactive
        const { data: existing } = await supabase
          .from("team_members")
          .select("id")
          .eq("user_id", coach.id)
          .eq("team_id", assignment.teamId)
          .eq("member_type", "coach")
          .maybeSingle();

        if (existing) {
          // Réactiver l'entrée existante
          const { error } = await supabase
            .from("team_members")
            .update({
              is_active: true,
              coach_role: assignment.role,
              left_at: null,
              joined_at: new Date().toISOString(),
            })
            .eq("id", existing.id);

          if (error) throw error;
        } else {
          // Créer une nouvelle entrée
          const { error } = await supabase.from("team_members").insert({
            user_id: coach.id,
            team_id: assignment.teamId,
            member_type: "coach",
            coach_role: assignment.role,
            is_active: true,
          });

          if (error) throw error;
        }
      }

      // Mettre à jour les rôles modifiés
      for (const assignment of toUpdate) {
        const { error } = await supabase
          .from("team_members")
          .update({ coach_role: assignment.role })
          .eq("user_id", coach.id)
          .eq("team_id", assignment.teamId)
          .eq("member_type", "coach")
          .eq("is_active", true);

        if (error) throw error;
      }

      toast.success("Coach mis à jour avec succès !");
      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      console.error("Error updating coach:", error);
      toast.error("Erreur lors de la mise à jour", {
        description: error.message || "Une erreur est survenue",
      });
    } finally {
      setLoading(false);
    }
  };

  const changesCount = teamAssignments.filter(
    (a) =>
      a.assigned !== a.originalAssigned ||
      (a.assigned && a.originalAssigned && a.role !== a.originalRole)
  ).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <UserCog className="w-5 h-5 text-primary" />
            </div>
            Éditer le Coach
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="profile" className="gap-2">
              <User className="w-4 h-4" />
              Profil
            </TabsTrigger>
            <TabsTrigger value="assignments" className="gap-2">
              <Users className="w-4 h-4" />
              Affectations
              {changesCount > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-xs bg-primary text-primary-foreground rounded-full">
                  {changesCount}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="space-y-6 mt-6">
            {/* Avatar */}
            <div className="flex justify-center">
              <Avatar className="h-20 w-20">
                <AvatarImage src={coach.photo_url || undefined} />
                <AvatarFallback className="bg-primary/10 text-primary text-xl font-medium">
                  {getInitials()}
                </AvatarFallback>
              </Avatar>
            </div>

            {/* Champs du profil */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">Prénom</Label>
                <Input
                  id="firstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Nom</Label>
                <Input
                  id="lastName"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={coach.email} disabled className="bg-muted" />
              <p className="text-xs text-muted-foreground">
                L'email ne peut pas être modifié
              </p>
            </div>
          </TabsContent>

          <TabsContent value="assignments" className="space-y-4 mt-6">
            <div className="flex items-center justify-between">
              <Label>Équipes disponibles</Label>
              {teamAssignments.filter((a) => a.assigned).length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {teamAssignments.filter((a) => a.assigned).length} équipe
                  {teamAssignments.filter((a) => a.assigned).length > 1 ? "s" : ""}{" "}
                  assignée{teamAssignments.filter((a) => a.assigned).length > 1 ? "s" : ""}
                </span>
              )}
            </div>

            {loadingTeams ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              </div>
            ) : teams.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-sm border border-dashed rounded-lg">
                Aucune équipe disponible
              </div>
            ) : (
              <div className="border rounded-lg divide-y">
                {teams.map((team) => {
                  const assignment = teamAssignments.find(
                    (a) => a.teamId === team.id
                  );
                  const isAssigned = assignment?.assigned || false;
                  const role = assignment?.role || "assistant";
                  const hasChanged =
                    assignment &&
                    (assignment.assigned !== assignment.originalAssigned ||
                      (assignment.assigned &&
                        assignment.originalAssigned &&
                        assignment.role !== assignment.originalRole));

                  return (
                    <div
                      key={team.id}
                      className={cn(
                        "p-3 transition-colors",
                        isAssigned ? "bg-primary/5" : "bg-background",
                        hasChanged && "ring-1 ring-primary/30"
                      )}
                    >
                      <div className="flex items-center justify-between gap-4">
                        {/* Nom de l'équipe + Switch */}
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <Switch
                            checked={isAssigned}
                            onCheckedChange={() => toggleTeamAssignment(team.id)}
                          />
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">
                              {team.name}
                              {hasChanged && (
                                <span className="ml-2 text-xs text-primary">
                                  (modifié)
                                </span>
                              )}
                            </p>
                            {team.season && (
                              <p className="text-xs text-muted-foreground">
                                {team.season}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Sélecteur de rôle */}
                        <div
                          className={cn(
                            "flex rounded-lg border overflow-hidden transition-opacity",
                            !isAssigned && "opacity-40 pointer-events-none"
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => setTeamRole(team.id, "assistant")}
                            className={cn(
                              "px-3 py-1.5 text-xs font-medium transition-colors",
                              role === "assistant"
                                ? "bg-primary text-primary-foreground"
                                : "bg-background hover:bg-muted"
                            )}
                          >
                            Assistant
                          </button>
                          <button
                            type="button"
                            onClick={() => !team.hasReferent && setTeamRole(team.id, "referent")}
                            disabled={team.hasReferent}
                            title={team.hasReferent ? `Référent actuel : ${team.referentName}` : undefined}
                            className={cn(
                              "px-3 py-1.5 text-xs font-medium transition-colors border-l",
                              role === "referent"
                                ? "bg-primary text-primary-foreground"
                                : team.hasReferent
                                ? "bg-muted text-muted-foreground cursor-not-allowed opacity-50"
                                : "bg-background hover:bg-muted"
                            )}
                          >
                            Référent
                          </button>
                        </div>
                        {team.hasReferent && isAssigned && role === "assistant" && (
                          <span className="text-[10px] text-muted-foreground ml-1 whitespace-nowrap">
                            Réf: {team.referentName}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Activez/désactivez les équipes et choisissez le rôle pour chaque
              affectation.
            </p>
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-3 pt-4 border-t border-border mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? (
              <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
            ) : (
              "Enregistrer"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
