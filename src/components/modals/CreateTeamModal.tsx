import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Users, ShieldCheck } from "lucide-react";
import { ColorPickerButton } from "@/components/shared/ColorPickerButton";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { useAuth } from "@/hooks/useAuth";
import { usePlanLimitHandler } from "@/hooks/usePlanLimitHandler";

const getSeasonOptions = () => {
  const now = new Date();
  const year = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  return [
    `${year - 1}-${year}`,
    `${year}-${year + 1}`,
    `${year + 1}-${year + 2}`,
  ];
};

const getCurrentSeason = () => {
  const now = new Date();
  const year = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  return `${year}-${year + 1}`;
};

const teamSchema = z.object({
  name: z.string().min(2, "Le nom doit contenir au moins 2 caractères").max(100),
  shortName: z.string().max(3, "3 caractères maximum").optional().or(z.literal("")),
  season: z.string().min(4, "Saison requise").max(20),
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
  const { handle: handlePlanLimit, dialog: planLimitDialog } = usePlanLimitHandler();
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [loadingCoaches, setLoadingCoaches] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
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
      season: getCurrentSeason(),
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
          short_name: data.shortName?.toUpperCase() || null,
          season: data.season,
          description: null,
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
      if (handlePlanLimit(error, "teams")) { setLoading(false); return; }
      if (handlePlanLimit(error, "coaches_per_team")) { setLoading(false); return; }
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
    <>
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) {
        setCancelConfirmOpen(true);
      } else {
        onOpenChange(true);
      }
    }}>
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
          <div className="grid grid-cols-[1fr,auto] gap-4">
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
            <div className="space-y-2">
              <Label htmlFor="shortName">Initiales</Label>
              <Input
                id="shortName"
                placeholder="DR1"
                maxLength={3}
                className="w-20 text-center uppercase font-bold"
                {...register("shortName")}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="season">Saison</Label>
              <Select value={watch("season")} onValueChange={(value) => setValue("season", value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner une saison" />
                </SelectTrigger>
                <SelectContent>
                  {getSeasonOptions().map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.season && (
                <p className="text-sm text-destructive">{errors.season.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Couleur</Label>
              <div className="pt-1">
                <ColorPickerButton value={watch("color") || "#000000"} onChange={(c) => setValue("color", c)} />
              </div>
            </div>
          </div>

          {/* Coach Selection - Only for Admin/Club Admin */}
          {!isCoachCreating && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-blue-500" />
                  Coach Référent
                </Label>
                <span className="text-xs text-muted-foreground">(assignable plus tard)</span>
              </div>
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
            </div>
          )}

          {/* Auto-assign info for coaches */}
          {isCoachCreating && (
            <div className="flex items-start gap-3 p-4 rounded-lg bg-muted/30">
              <ShieldCheck className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
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
              {watch("shortName")?.toUpperCase() || watch("name")?.slice(0, 2).toUpperCase() || "EQ"}
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
              onClick={() => setCancelConfirmOpen(true)}
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

    {/* Cancel Confirmation */}
    <AlertDialog open={cancelConfirmOpen} onOpenChange={setCancelConfirmOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Annuler la création ?</AlertDialogTitle>
          <AlertDialogDescription>
            Les informations saisies seront perdues. Voulez-vous vraiment annuler la création de cette équipe ?
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
