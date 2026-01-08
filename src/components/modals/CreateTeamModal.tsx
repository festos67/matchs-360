import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Users, Star } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

const teamSchema = z.object({
  name: z.string().min(2, "Le nom doit contenir au moins 2 caractères").max(100),
  season: z.string().min(4, "Saison requise").max(20),
  description: z.string().max(500).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Couleur invalide"),
  coachId: z.string().optional(),
});

type TeamFormData = z.infer<typeof teamSchema>;

interface Coach {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
}

interface CreateTeamModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clubId: string;
  clubColor?: string;
  onSuccess?: () => void;
}

export const CreateTeamModal = ({
  open,
  onOpenChange,
  clubId,
  clubColor = "#3B82F6",
  onSuccess,
}: CreateTeamModalProps) => {
  const [loading, setLoading] = useState(false);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [loadingCoaches, setLoadingCoaches] = useState(false);
  const { user, currentRole } = useAuth();

  // Determine if current user is a coach (they will be auto-assigned)
  const isCoachCreating = currentRole?.role === "coach";

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<TeamFormData>({
    resolver: zodResolver(teamSchema),
    defaultValues: {
      season: "2024-2025",
      color: clubColor,
    },
  });

  const color = watch("color");

  // Fetch available coaches for the club (only for admin/club_admin)
  useEffect(() => {
    if (open && clubId && !isCoachCreating) {
      fetchCoaches();
    }
  }, [open, clubId, isCoachCreating]);

  const fetchCoaches = async () => {
    setLoadingCoaches(true);
    try {
      // Get all users with coach role in this club
      const { data: coachRoles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("club_id", clubId)
        .eq("role", "coach");

      if (rolesError) throw rolesError;

      if (coachRoles && coachRoles.length > 0) {
        const coachIds = coachRoles.map(r => r.user_id);
        
        const { data: profiles, error: profilesError } = await supabase
          .from("profiles")
          .select("id, first_name, last_name, email")
          .in("id", coachIds);

        if (profilesError) throw profilesError;
        setCoaches(profiles || []);
      } else {
        setCoaches([]);
      }
    } catch (error) {
      console.error("Error fetching coaches:", error);
    } finally {
      setLoadingCoaches(false);
    }
  };

  const onSubmit = async (data: TeamFormData) => {
    setLoading(true);
    try {
      // Create the team
      const { data: team, error: teamError } = await supabase
        .from("teams")
        .insert({
          club_id: clubId,
          name: data.name,
          season: data.season,
          description: data.description || null,
          color: data.color,
        })
        .select()
        .single();

      if (teamError) throw teamError;

      // Determine which coach to assign
      let coachToAssign: string | null = null;
      
      if (isCoachCreating && user) {
        // Coach creating team = auto-assign themselves as referent
        coachToAssign = user.id;
      } else if (data.coachId) {
        // Admin/Club selected a coach
        coachToAssign = data.coachId;
      }

      // Create team_member entry for the coach
      if (coachToAssign) {
        const { error: memberError } = await supabase
          .from("team_members")
          .insert({
            team_id: team.id,
            user_id: coachToAssign,
            member_type: "coach",
            coach_role: "referent",
          });

        if (memberError) throw memberError;
      }

      toast.success(`Équipe "${data.name}" créée avec succès !`);
      reset();
      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      console.error("Error creating team:", error);
      toast.error("Erreur lors de la création de l'équipe", {
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const getCoachDisplayName = (coach: Coach) => {
    if (coach.first_name || coach.last_name) {
      return `${coach.first_name || ""} ${coach.last_name || ""}`.trim();
    }
    return coach.email;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Users className="w-5 h-5 text-primary" />
            </div>
            Nouvelle Équipe
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 mt-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nom de l'équipe</Label>
            <Input
              id="name"
              placeholder="U15 A, Seniors B..."
              {...register("name")}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="season">Saison</Label>
              <Input
                id="season"
                placeholder="2024-2025"
                {...register("season")}
              />
              {errors.season && (
                <p className="text-sm text-destructive">{errors.season.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="color">Couleur</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  id="color"
                  {...register("color")}
                  className="w-10 h-10 rounded-lg border border-border cursor-pointer"
                />
                <Input {...register("color")} className="flex-1" />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description (optionnel)</Label>
            <Textarea
              id="description"
              placeholder="Notes sur l'équipe..."
              {...register("description")}
              rows={3}
            />
          </div>

          {/* Coach Selection - Only for Admin/Club Admin */}
          {!isCoachCreating && (
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Star className="w-4 h-4 text-warning" />
                Coach Responsable
              </Label>
              <Select onValueChange={(value) => setValue("coachId", value)}>
                <SelectTrigger>
                  <SelectValue placeholder={
                    loadingCoaches 
                      ? "Chargement..." 
                      : coaches.length === 0 
                        ? "Aucun coach disponible" 
                        : "Sélectionner un coach"
                  } />
                </SelectTrigger>
                <SelectContent>
                  {coaches.map((coach) => (
                    <SelectItem key={coach.id} value={coach.id}>
                      {getCoachDisplayName(coach)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {coaches.length === 0 && !loadingCoaches && (
                <p className="text-sm text-muted-foreground">
                  Créez d'abord un coach pour pouvoir l'assigner à cette équipe.
                </p>
              )}
            </div>
          )}

          {/* Auto-assign info for coaches */}
          {isCoachCreating && (
            <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/30">
              <Star className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-sm">Vous serez Coach Référent</p>
                <p className="text-sm text-muted-foreground mt-1">
                  En créant cette équipe, vous serez automatiquement assigné comme coach référent.
                </p>
              </div>
            </div>
          )}

          {/* Preview */}
          <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/30">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold"
              style={{
                background: `linear-gradient(135deg, ${color} 0%, ${color}88 100%)`,
                color: "white",
              }}
            >
              {watch("name")?.slice(0, 2).toUpperCase() || "EQ"}
            </div>
            <div>
              <p className="font-medium">{watch("name") || "Nouvelle équipe"}</p>
              <p className="text-sm text-muted-foreground">{watch("season")}</p>
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
                "Créer l'équipe"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
