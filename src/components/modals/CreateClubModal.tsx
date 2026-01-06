import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Building2, Upload, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const clubSchema = z.object({
  name: z.string().min(2, "Le nom doit contenir au moins 2 caractères").max(100),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Couleur invalide"),
  secondaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Couleur invalide"),
  referentEmail: z.string().email("Email invalide").max(255),
  referentFirstName: z.string().min(1, "Prénom requis").max(50),
  referentLastName: z.string().min(1, "Nom requis").max(50),
});

type ClubFormData = z.infer<typeof clubSchema>;

interface CreateClubModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export const CreateClubModal = ({ open, onOpenChange, onSuccess }: CreateClubModalProps) => {
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<ClubFormData>({
    resolver: zodResolver(clubSchema),
    defaultValues: {
      primaryColor: "#3B82F6",
      secondaryColor: "#0A1628",
    },
  });

  const primaryColor = watch("primaryColor");
  const secondaryColor = watch("secondaryColor");

  const onSubmit = async (data: ClubFormData) => {
    setLoading(true);
    try {
      // Create the club
      const { data: club, error: clubError } = await supabase
        .from("clubs")
        .insert({
          name: data.name,
          primary_color: data.primaryColor,
          secondary_color: data.secondaryColor,
          referent_name: `${data.referentFirstName} ${data.referentLastName}`,
          referent_email: data.referentEmail,
        })
        .select()
        .single();

      if (clubError) throw clubError;

      // Invite the club admin
      const { error: inviteError } = await supabase.functions.invoke("send-invitation", {
        body: {
          email: data.referentEmail,
          firstName: data.referentFirstName,
          lastName: data.referentLastName,
          clubId: club.id,
          intendedRole: "club_admin",
        },
      });

      if (inviteError) {
        // Rollback club creation
        await supabase.from("clubs").delete().eq("id", club.id);
        throw inviteError;
      }

      toast.success(`Club "${data.name}" créé avec succès !`, {
        description: `Une invitation a été envoyée à ${data.referentEmail}`,
      });
      
      reset();
      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      console.error("Error creating club:", error);
      toast.error("Erreur lors de la création du club", {
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Building2 className="w-5 h-5 text-primary" />
            </div>
            Nouveau Club
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 mt-4">
          {/* Club Info */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Informations du club
            </h3>

            <div className="space-y-2">
              <Label htmlFor="name">Nom du club</Label>
              <Input
                id="name"
                placeholder="FC Example"
                {...register("name")}
              />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name.message}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="primaryColor">Couleur principale</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    id="primaryColor"
                    {...register("primaryColor")}
                    className="w-10 h-10 rounded-lg border border-border cursor-pointer"
                  />
                  <Input
                    {...register("primaryColor")}
                    placeholder="#3B82F6"
                    className="flex-1"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="secondaryColor">Couleur secondaire</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    id="secondaryColor"
                    {...register("secondaryColor")}
                    className="w-10 h-10 rounded-lg border border-border cursor-pointer"
                  />
                  <Input
                    {...register("secondaryColor")}
                    placeholder="#0A1628"
                    className="flex-1"
                  />
                </div>
              </div>
            </div>

            {/* Preview */}
            <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/30">
              <div
                className="w-16 h-16 rounded-xl flex items-center justify-center text-xl font-bold"
                style={{
                  background: `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)`,
                  color: "white",
                }}
              >
                FC
              </div>
              <div>
                <p className="font-medium">Aperçu</p>
                <p className="text-sm text-muted-foreground">
                  Apparence du club dans l'application
                </p>
              </div>
            </div>
          </div>

          {/* Referent Info */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Responsable du club
            </h3>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="referentFirstName">Prénom</Label>
                <Input
                  id="referentFirstName"
                  placeholder="Jean"
                  {...register("referentFirstName")}
                />
                {errors.referentFirstName && (
                  <p className="text-sm text-destructive">{errors.referentFirstName.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="referentLastName">Nom</Label>
                <Input
                  id="referentLastName"
                  placeholder="Dupont"
                  {...register("referentLastName")}
                />
                {errors.referentLastName && (
                  <p className="text-sm text-destructive">{errors.referentLastName.message}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="referentEmail">Email</Label>
              <Input
                id="referentEmail"
                type="email"
                placeholder="responsable@club.com"
                {...register("referentEmail")}
              />
              {errors.referentEmail && (
                <p className="text-sm text-destructive">{errors.referentEmail.message}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Une invitation sera envoyée à cette adresse
              </p>
            </div>
          </div>

          {/* Actions */}
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
                "Créer le club"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
