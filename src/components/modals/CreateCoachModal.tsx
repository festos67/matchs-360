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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const coachSchema = z.object({
  firstName: z.string().min(1, "Prénom requis").max(50),
  lastName: z.string().min(1, "Nom requis").max(50),
  email: z.string().email("Email invalide").max(255),
  teamId: z.string().optional(),
  coachRole: z.enum(["referent", "assistant"]).optional(),
});

type CoachFormData = z.infer<typeof coachSchema>;

interface Team {
  id: string;
  name: string;
  season: string | null;
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
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const [selectedCoachRole, setSelectedCoachRole] = useState<string>("");

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

  const onSubmit = async (data: CoachFormData) => {
    setLoading(true);
    try {
      const payload: any = {
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        clubId,
        intendedRole: "coach",
      };

      // Ajouter l'équipe et le rôle si sélectionnés
      if (selectedTeamId) {
        payload.teamId = selectedTeamId;
        payload.coachRole = selectedCoachRole || "assistant";
      }

      const { data: result, error } = await supabase.functions.invoke("send-invitation", {
        body: payload,
      });

      if (error) throw error;
      if (result?.error) throw new Error(result.error);

      const teamName = selectedTeamId 
        ? teams.find(t => t.id === selectedTeamId)?.name 
        : null;

      toast.success(`Coach invité avec succès !`, {
        description: teamName 
          ? `Une invitation a été envoyée à ${data.email}. Le coach sera rattaché à l'équipe "${teamName}".`
          : `Une invitation a été envoyée à ${data.email}. Le coach pourra être rattaché à une équipe ultérieurement.`,
      });
      
      reset();
      setSelectedTeamId("");
      setSelectedCoachRole("");
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
      setSelectedTeamId("");
      setSelectedCoachRole("");
    }
    onOpenChange(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
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

          <div className="space-y-2">
            <Label htmlFor="team">Équipe (optionnel)</Label>
            <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
              <SelectTrigger>
                <SelectValue placeholder={loadingTeams ? "Chargement..." : "Sélectionner une équipe"} />
              </SelectTrigger>
              <SelectContent>
                {teams.map((team) => (
                  <SelectItem key={team.id} value={team.id}>
                    {team.name} {team.season && `(${team.season})`}
                  </SelectItem>
                ))}
                {teams.length === 0 && !loadingTeams && (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">
                    Aucune équipe disponible
                  </div>
                )}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Laissez vide pour rattacher le coach à une équipe ultérieurement
            </p>
          </div>

          {selectedTeamId && (
            <div className="space-y-2">
              <Label htmlFor="coachRole">Rôle dans l'équipe</Label>
              <Select value={selectedCoachRole} onValueChange={setSelectedCoachRole}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner un rôle" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="referent">Coach référent</SelectItem>
                  <SelectItem value="assistant">Coach assistant</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="p-4 rounded-lg bg-muted/30 text-sm text-muted-foreground">
            <p>
              {selectedTeamId 
                ? "Le coach sera automatiquement rattaché à l'équipe sélectionnée dès l'acceptation de l'invitation."
                : "Le coach sera rattaché au club. L'assignation à une équipe se fera lors de la création de l'équipe ou via la gestion du staff."}
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
