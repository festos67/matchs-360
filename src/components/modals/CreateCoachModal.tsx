import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { UserCog, UserCheck, UserPlus } from "lucide-react";
import { UserPhotoUpload } from "@/components/shared/UserPhotoUpload";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getEdgeFunctionErrorMessage } from "@/lib/edge-function-errors";

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

interface ExistingUser {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  photo_url: string | null;
  roles: string[];
}

interface CreateCoachModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clubId: string;
  onSuccess?: () => void;
}

const roleLabels: Record<string, string> = {
  club_admin: "Responsable club",
  coach: "Coach",
  player: "Joueur",
  supporter: "Supporter",
};

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
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  // Existing user selection
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [existingUsers, setExistingUsers] = useState<ExistingUser[]>([]);
  const [selectedExistingUser, setSelectedExistingUser] = useState<ExistingUser | null>(null);
  const [loadingUsers, setLoadingUsers] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CoachFormData>({
    resolver: zodResolver(coachSchema),
  });

  useEffect(() => {
    if (open && clubId) {
      fetchTeams();
      fetchExistingUsers();
    }
    if (!open) {
      setMode("new");
      setSelectedExistingUser(null);
      setPhotoFile(null);
      setPhotoPreview(null);
    }
  }, [open, clubId]);

  useEffect(() => {
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

  const fetchExistingUsers = async () => {
    setLoadingUsers(true);
    try {
      // Get all users in this club who are NOT already coaches
      const { data: clubProfiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, email, photo_url")
        .eq("club_id", clubId)
        .is("deleted_at", null);

      if (profilesError) throw profilesError;

      // Get all roles for these users
      const userIds = (clubProfiles || []).map((p) => p.id);
      if (userIds.length === 0) {
        setExistingUsers([]);
        setLoadingUsers(false);
        return;
      }

      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .eq("club_id", clubId)
        .in("user_id", userIds);

      if (rolesError) throw rolesError;

      // Group roles by user
      const rolesByUser: Record<string, string[]> = {};
      (roles || []).forEach((r) => {
        if (!rolesByUser[r.user_id]) rolesByUser[r.user_id] = [];
        rolesByUser[r.user_id].push(r.role);
      });

      // Filter out users who are already coaches
      const nonCoachUsers = (clubProfiles || [])
        .filter((p) => {
          const userRoles = rolesByUser[p.id] || [];
          return !userRoles.includes("coach");
        })
        .map((p) => ({
          ...p,
          roles: rolesByUser[p.id] || [],
        }));

      setExistingUsers(nonCoachUsers);
    } catch (error) {
      console.error("Error fetching existing users:", error);
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleSelectExistingUser = (user: ExistingUser) => {
    setSelectedExistingUser(user);
    setValue("firstName", user.first_name || "");
    setValue("lastName", user.last_name || "");
    setValue("email", user.email);
    if (user.photo_url) {
      setPhotoPreview(user.photo_url);
      setPhotoFile(null); // No new file, existing photo
    } else {
      setPhotoPreview(null);
      setPhotoFile(null);
    }
  };

  const handleClearExistingUser = () => {
    setSelectedExistingUser(null);
    reset();
    setPhotoPreview(null);
    setPhotoFile(null);
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

  const uploadPhotoForUser = async (userId: string): Promise<string | null> => {
    if (!photoFile) return null;
    const ext = photoFile.name.split(".").pop() || "png";
    const path = `${userId}/photo.${ext}`;
    const { error } = await supabase.storage.from("user-photos").upload(path, photoFile, { upsert: true });
    if (error) {
      console.error("Photo upload error:", error);
      return null;
    }
    const { data: urlData } = supabase.storage.from("user-photos").getPublicUrl(path);
    return `${urlData.publicUrl}?t=${Date.now()}`;
  };

  const addCoachRoleToExistingUser = async (data: CoachFormData) => {
    if (!selectedExistingUser) return;
    setLoading(true);
    try {
      const assignedTeams = getAssignedTeams();

      // 1. Add coach role in user_roles
      const { error: roleError } = await supabase
        .from("user_roles")
        .insert({
          user_id: selectedExistingUser.id,
          role: "coach" as any,
          club_id: clubId,
        });
      if (roleError) throw roleError;

      // 2. Add team memberships
      for (const assignment of assignedTeams) {
        // Check for existing membership
        const { data: existing } = await supabase
          .from("team_members")
          .select("id, is_active, member_type")
          .eq("user_id", selectedExistingUser.id)
          .eq("team_id", assignment.teamId)
          .maybeSingle();

        if (existing) {
          // If same user exists as player, we need a separate coach entry
          // But unique constraint is on (team_id, user_id), so update
          if (existing.member_type === "coach") {
            await supabase
              .from("team_members")
              .update({
                is_active: true,
                left_at: null,
                coach_role: assignment.role,
                joined_at: new Date().toISOString(),
              })
              .eq("id", existing.id);
          } else {
            // Existing is player - we can't have two rows for same user+team
            // So we just add a new one if possible, or skip
            const { error: insertErr } = await supabase.from("team_members").insert({
              user_id: selectedExistingUser.id,
              team_id: assignment.teamId,
              member_type: "coach",
              coach_role: assignment.role,
              is_active: true,
            });
            // If unique constraint fails, it means there's already a record
            if (insertErr) {
              console.warn("Could not insert team_member, may already exist:", insertErr);
            }
          }
        } else {
          const { error: insertErr } = await supabase.from("team_members").insert({
            user_id: selectedExistingUser.id,
            team_id: assignment.teamId,
            member_type: "coach",
            coach_role: assignment.role,
            is_active: true,
          });
          if (insertErr) throw insertErr;
        }
      }

      // 3. Upload photo if new one provided
      if (photoFile) {
        const photoUrl = await uploadPhotoForUser(selectedExistingUser.id);
        if (photoUrl) {
          await supabase.from("profiles").update({ photo_url: photoUrl }).eq("id", selectedExistingUser.id);
        }
      }

      const assignedTeamNames = assignedTeams
        .map((a) => teams.find((t) => t.id === a.teamId)?.name)
        .filter(Boolean);

      toast.success(`Rôle Coach ajouté à ${data.firstName} ${data.lastName}`, {
        description:
          assignedTeamNames.length > 0
            ? `Rattaché à : ${assignedTeamNames.join(", ")}`
            : `Le coach pourra être rattaché à une équipe ultérieurement.`,
      });

      resetAndClose();
    } catch (error: any) {
      console.error("Error adding coach role:", error);
      if (error.message?.includes("duplicate") || error.code === "23505") {
        toast.error("Cet utilisateur est déjà coach dans ce club.");
      } else {
        toast.error("Erreur lors de l'ajout du rôle coach", {
          description: error.message,
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const inviteNewCoach = async (data: CoachFormData) => {
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

      if (assignedTeams.length > 0) {
        payload.teamAssignments = assignedTeams.map((a) => ({
          teamId: a.teamId,
          coachRole: a.role,
        }));
        payload.teamId = assignedTeams[0].teamId;
        payload.coachRole = assignedTeams[0].role;
      }

      const { data: result, error } = await supabase.functions.invoke("send-invitation", {
        body: payload,
      });

      if (error) throw error;
      if (result?.error) throw new Error(result.error);

      if (photoFile && result?.userId) {
        const photoUrl = await uploadPhotoForUser(result.userId);
        if (photoUrl) {
          await supabase.from("profiles").update({ photo_url: photoUrl }).eq("id", result.userId);
        }
      }

      const assignedTeamNames = assignedTeams
        .map((a) => teams.find((t) => t.id === a.teamId)?.name)
        .filter(Boolean);

      toast.success(`Coach invité avec succès !`, {
        description:
          assignedTeamNames.length > 0
            ? `Une invitation a été envoyée à ${data.email}. Le coach sera rattaché à : ${assignedTeamNames.join(", ")}.`
            : `Une invitation a été envoyée à ${data.email}. Le coach pourra être rattaché à une équipe ultérieurement.`,
      });

      resetAndClose();
    } catch (error: unknown) {
      console.error("Error inviting coach:", error);
      const errorMessage = await getEdgeFunctionErrorMessage(error);

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

  const resetAndClose = () => {
    reset();
    setTeamAssignments([]);
    setPhotoFile(null);
    setPhotoPreview(null);
    setSelectedExistingUser(null);
    setMode("new");
    onOpenChange(false);
    onSuccess?.();
  };

  const onSubmit = async (data: CoachFormData) => {
    if (selectedExistingUser) {
      await addCoachRoleToExistingUser(data);
    } else {
      await inviteNewCoach(data);
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setCancelConfirmOpen(true);
      return;
    }
    onOpenChange(isOpen);
  };

  const assignedCount = getAssignedTeams().length;

  const watchFirstName = watch("firstName");
  const watchLastName = watch("lastName");

  const getInitials = () => {
    const f = watchFirstName?.charAt(0) || "";
    const l = watchLastName?.charAt(0) || "";
    return (f + l).toUpperCase() || "?";
  };

  return (
    <>
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

        {/* Mode selector */}
        <div className="flex gap-2 mt-2">
          <Button
            type="button"
            variant={mode === "new" ? "default" : "outline"}
            size="sm"
            className="flex-1 gap-2"
            onClick={() => {
              setMode("new");
              handleClearExistingUser();
            }}
          >
            <UserPlus className="w-4 h-4" />
            Nouvel utilisateur
          </Button>
          <Button
            type="button"
            variant={mode === "existing" ? "default" : "outline"}
            size="sm"
            className="flex-1 gap-2"
            onClick={() => {
              setMode("existing");
              handleClearExistingUser();
            }}
          >
            <UserCheck className="w-4 h-4" />
            Utilisateur existant
          </Button>
        </div>

        {/* Existing user selector */}
        {mode === "existing" && !selectedExistingUser && (
          <div className="space-y-2 mt-2">
            <Label className="text-sm">Sélectionner un utilisateur du club</Label>
            {loadingUsers ? (
              <div className="flex items-center justify-center py-6">
                <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              </div>
            ) : existingUsers.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-sm border border-dashed rounded-lg">
                Aucun utilisateur disponible (tous sont déjà coachs)
              </div>
            ) : (
              <div className="border rounded-lg divide-y max-h-[200px] overflow-y-auto">
                {existingUsers.map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    className="w-full flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors text-left"
                    onClick={() => handleSelectExistingUser(user)}
                  >
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-medium shrink-0 overflow-hidden">
                      {user.photo_url ? (
                        <img src={user.photo_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        `${(user.first_name || "?").charAt(0)}${(user.last_name || "").charAt(0)}`.toUpperCase()
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">
                        {user.first_name} {user.last_name}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {user.roles.map((role) => (
                        <Badge key={role} variant="secondary" className="text-xs">
                          {roleLabels[role] || role}
                        </Badge>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Selected existing user banner */}
        {selectedExistingUser && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20 mt-2">
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-medium shrink-0 overflow-hidden">
              {selectedExistingUser.photo_url ? (
                <img src={selectedExistingUser.photo_url} alt="" className="w-full h-full object-cover" />
              ) : (
                getInitials()
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm">
                {selectedExistingUser.first_name} {selectedExistingUser.last_name}
              </p>
              <div className="flex items-center gap-1.5">
                {selectedExistingUser.roles.map((role) => (
                  <Badge key={role} variant="secondary" className="text-xs">
                    {roleLabels[role] || role}
                  </Badge>
                ))}
                <Badge className="text-xs bg-green-500 text-white">+ Coach</Badge>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClearExistingUser}
              className="text-xs"
            >
              Changer
            </Button>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 mt-2">
          {/* Photo - only show for new users or when no existing photo */}
          {(mode === "new" || (selectedExistingUser && !selectedExistingUser.photo_url)) && (
            <UserPhotoUpload
              photoPreview={photoPreview}
              initials={getInitials()}
              onFileSelected={(file, preview) => {
                setPhotoFile(file);
                setPhotoPreview(preview);
              }}
              onRemovePhoto={() => {
                setPhotoFile(null);
                setPhotoPreview(null);
              }}
              label="Ajouter une photo (optionnel)"
            />
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">Prénom</Label>
              <Input
                id="firstName"
                placeholder="Jean"
                {...register("firstName")}
                disabled={!!selectedExistingUser}
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
                disabled={!!selectedExistingUser}
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
              disabled={!!selectedExistingUser}
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
              onClick={() => setCancelConfirmOpen(true)}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              ) : selectedExistingUser ? (
                "Ajouter le rôle Coach"
              ) : (
                "Inviter le coach"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>

    <AlertDialog open={cancelConfirmOpen} onOpenChange={setCancelConfirmOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Annuler la création ?</AlertDialogTitle>
          <AlertDialogDescription>
            Les informations saisies seront perdues. Voulez-vous vraiment annuler la création de ce coach ?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button onClick={() => setCancelConfirmOpen(false)}>
            Continuer la saisie
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setCancelConfirmOpen(false);
              reset();
              setTeamAssignments([]);
              setPhotoFile(null);
              setPhotoPreview(null);
              setSelectedExistingUser(null);
              setMode("new");
              onOpenChange(false);
            }}
          >
            Confirmer l'annulation
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
};
