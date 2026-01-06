import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Users } from "lucide-react";
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
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const teamSchema = z.object({
  name: z.string().min(2, "Le nom doit contenir au moins 2 caractères").max(100),
  season: z.string().min(4, "Saison requise").max(20),
  description: z.string().max(500).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Couleur invalide"),
});

type TeamFormData = z.infer<typeof teamSchema>;

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

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<TeamFormData>({
    resolver: zodResolver(teamSchema),
    defaultValues: {
      season: "2024-2025",
      color: clubColor,
    },
  });

  const color = watch("color");

  const onSubmit = async (data: TeamFormData) => {
    setLoading(true);
    try {
      const { error } = await supabase.from("teams").insert({
        club_id: clubId,
        name: data.name,
        season: data.season,
        description: data.description || null,
        color: data.color,
      });

      if (error) throw error;

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
