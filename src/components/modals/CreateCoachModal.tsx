import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { UserCog } from "lucide-react";
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
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const coachSchema = z.object({
  firstName: z.string().min(1, "Prénom requis").max(50),
  lastName: z.string().min(1, "Nom requis").max(50),
  email: z.string().email("Email invalide").max(255),
});

type CoachFormData = z.infer<typeof coachSchema>;

interface Team {
  id: string;
  name: string;
  season: string | null;
}

interface TeamAssignment {
  teamId: string;
  assigned: boolean;
  role: "referent" | "assistant";
}

interface CreateCoachModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clubId: string;
  onSuccess?: () => void;
}

export const CreateCoachModal = ({
  open,
  onOpenChange,
  clubId,
  onSuccess,
}: CreateCoachModalProps) => {
  const [loading, setLoading] = useState(false);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [teamAssignments, setTeamAssignments] = useState<TeamAssignment[]>([]);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CoachFormData>({
    resolver: zodResolver(coachSchema),
  });

  useEffect(() => {
    if (open && clubId) {
      fetchTeams();
    }
  }, [open, clubId]);

  useEffect(() => {
    // Initialize assignments when teams are loaded
    if (teams.length > 0) {
      setTeamAssignments(
        teams.map((team) => ({
          teamId: team.id,
          assigned: false,
          role: "assistant" as const,
        }))
      );
    }
  }, [teams]);

  const fetchTeams = async () => {
    setLoadingTeams(true);
    try {
      const { data, error } = await supabase
        .from("teams")
        .select("id, name, season")
        .eq("club_id", clubId)
        .is("deleted_at", null)
        .order("name");

      if (error) throw error;
      setTeams(data || []);
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

  const getAssignedTeams = () => {
    return teamAssignments.filter((a) => a.assigned);
  };

  const onSubmit = async (data: CoachFormData) => {
    setLoading(true);
    try {
      const assignedTeams = getAssignedTeams();

      const payload: any = {
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        clubId,
        intendedRole: "coach",
      };

      // Si des équipes sont assignées, on envoie la liste
      if (assignedTeams.length > 0) {
        payload.teamAssignments = assignedTeams.map((a) => ({
          teamId: a.teamId,
          coachRole: a.role,
        }));
        // Pour la compatibilité avec l'ancien format, on envoie aussi la première équipe
        payload.teamId = assignedTeams[0].teamId;
        payload.coachRole = assignedTeams[0].role;
      }

      const { data: result, error } = await supabase.functions.invoke("send-invitation", {
        body: payload,
      });

      if (error) throw error;
      if (result?.error) throw new Error(result.error);

      const assignedTeamNames = assignedTeams
        .map((a) => teams.find((t) => t.id === a.teamId)?.name)
        .filter(Boolean);

      toast.success(`Coach invité avec succès !`, {
        description:
          assignedTeamNames.length > 0
            ? `Une invitation a été envoyée à ${data.email}. Le coach sera rattaché à : ${assignedTeamNames.join(", ")}.`
            : `Une invitation a été envoyée à ${data.email}. Le coach pourra être rattaché à une équipe ultérieurement.`,
      });

      reset();
      setTeamAssignments([]);
      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      console.error("Error inviting coach:", error);
      const errorMessage = error.message || "Une erreur est survenue";

      if (errorMessage.includes("déjà ce rôle")) {
        toast.error("Coach déjà existant", {
          description: "Cet utilisateur est déjà coach dans ce club.",
        });
      } else {
        toast.error("Erreur lors de l'invitation", {
          description: errorMessage,
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      reset();
      setTeamAssignments([]);
    }
    onOpenChange(isOpen);
  };

  const assignedCount = getAssignedTeams().length;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <UserCog className="w-5 h-5 text-primary" />
            </div>
            Ajouter un Coach
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 mt-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">Prénom</Label>
              <Input
                id="firstName"
                placeholder="Jean"
                {...register("firstName")}
              />
              {errors.firstName && (
                <p className="text-sm text-destructive">{errors.firstName.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Nom</Label>
              <Input
                id="lastName"
                placeholder="Dupont"
                {...register("lastName")}
              />
              {errors.lastName && (
                <p className="text-sm text-destructive">{errors.lastName.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="coach@exemple.com"
              {...register("email")}
            />
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email.message}</p>
            )}
          </div>

          {/* Matrice d'équipes */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Équipes du club</Label>
              {assignedCount > 0 && (
                <span className="text-xs text-muted-foreground">
                  {assignedCount} équipe{assignedCount > 1 ? "s" : ""} sélectionnée{assignedCount > 1 ? "s" : ""}
                </span>
              )}
            </div>

            {loadingTeams ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              </div>
            ) : teams.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-sm border border-dashed rounded-lg">
                Aucune équipe disponible dans ce club
              </div>
            ) : (
              <div className="border rounded-lg divide-y">
                {teams.map((team) => {
                  const assignment = teamAssignments.find((a) => a.teamId === team.id);
                  const isAssigned = assignment?.assigned || false;
                  const role = assignment?.role || "assistant";

                  return (
                    <div
                      key={team.id}
                      className={cn(
                        "p-3 transition-colors",
                        isAssigned ? "bg-primary/5" : "bg-background"
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
                            <p className="font-medium text-sm truncate">{team.name}</p>
                            {team.season && (
                              <p className="text-xs text-muted-foreground">{team.season}</p>
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
                            onClick={() => setTeamRole(team.id, "referent")}
                            className={cn(
                              "px-3 py-1.5 text-xs font-medium transition-colors border-l",
                              role === "referent"
                                ? "bg-primary text-primary-foreground"
                                : "bg-background hover:bg-muted"
                            )}
                          >
                            Référent
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Activez les équipes auxquelles rattacher le coach et choisissez son rôle. Laissez tout désactivé pour rattacher ultérieurement.
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              ) : (
                "Inviter le coach"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};