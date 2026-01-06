import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { UserCog, Star } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
  teamId: z.string().min(1, "Équipe requise"),
  isReferent: z.boolean(),
});

type CoachFormData = z.infer<typeof coachSchema>;

interface Team {
  id: string;
  name: string;
}

interface CreateCoachModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clubId: string;
  teams?: Team[];
  onSuccess?: () => void;
}

export const CreateCoachModal = ({
  open,
  onOpenChange,
  clubId,
  teams: propTeams,
  onSuccess,
}: CreateCoachModalProps) => {
  const [loading, setLoading] = useState(false);
  const [teams, setTeams] = useState<Team[]>(propTeams || []);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CoachFormData>({
    resolver: zodResolver(coachSchema),
    defaultValues: {
      isReferent: false,
    },
  });

  useEffect(() => {
    if (!propTeams && open && clubId) {
      fetchTeams();
    }
  }, [open, clubId, propTeams]);

  const fetchTeams = async () => {
    const { data } = await supabase
      .from("teams")
      .select("id, name")
      .eq("club_id", clubId)
      .order("name");
    
    if (data) setTeams(data);
  };

  const onSubmit = async (data: CoachFormData) => {
    setLoading(true);
    try {
      const { data: result, error } = await supabase.functions.invoke("send-invitation", {
        body: {
          email: data.email,
          firstName: data.firstName,
          lastName: data.lastName,
          clubId,
          intendedRole: "coach",
          teamId: data.teamId,
          coachRole: data.isReferent ? "referent" : "assistant",
        },
      });

      if (error) throw error;
      if (result?.error) throw new Error(result.error);

      toast.success(`Coach invité avec succès !`, {
        description: `Une invitation a été envoyée à ${data.email}`,
      });
      
      reset();
      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      console.error("Error inviting coach:", error);
      toast.error("Erreur lors de l'invitation", {
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const isReferent = watch("isReferent");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
            <Label>Équipe</Label>
            <Select onValueChange={(value) => setValue("teamId", value)}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner une équipe" />
              </SelectTrigger>
              <SelectContent>
                {teams.map((team) => (
                  <SelectItem key={team.id} value={team.id}>
                    {team.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.teamId && (
              <p className="text-sm text-destructive">{errors.teamId.message}</p>
            )}
          </div>

          <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/30">
            <Checkbox
              id="isReferent"
              checked={isReferent}
              onCheckedChange={(checked) => setValue("isReferent", !!checked)}
            />
            <div className="flex-1">
              <Label
                htmlFor="isReferent"
                className="flex items-center gap-2 cursor-pointer"
              >
                <Star className="w-4 h-4 text-warning" />
                Coach Référent
              </Label>
              <p className="text-sm text-muted-foreground mt-1">
                Peut éditer le référentiel de compétences de l'équipe. Un seul
                coach référent par équipe.
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
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
