import { useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Building2, Upload, X, Image } from "lucide-react";
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
import { getEdgeFunctionErrorMessage } from "@/lib/edge-function-errors";

const clubSchema = z.object({
  name: z.string().min(2, "Le nom doit contenir au moins 2 caractères").max(100),
  shortName: z.string().max(3, "3 caractères maximum").optional().or(z.literal("")),
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
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
  const watchName = watch("name");
  const watchShortName = watch("shortName");

  const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Veuillez sélectionner une image");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("L'image ne doit pas dépasser 2 Mo");
      return;
    }
    setLogoFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setLogoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const removeLogo = () => {
    setLogoFile(null);
    setLogoPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const uploadLogo = async (clubId: string): Promise<string | null> => {
    if (!logoFile) return null;
    const ext = logoFile.name.split(".").pop() || "png";
    const path = `${clubId}/logo.${ext}`;
    const { error } = await supabase.storage.from("club-logos").upload(path, logoFile, { upsert: true });
    if (error) throw error;
    const { data: urlData } = supabase.storage.from("club-logos").getPublicUrl(path);
    return urlData.publicUrl;
  };

  const onSubmit = async (data: ClubFormData) => {
    setLoading(true);
    try {
      const { data: club, error: clubError } = await supabase
        .from("clubs")
        .insert({
          name: data.name,
          short_name: data.shortName?.toUpperCase() || null,
          primary_color: data.primaryColor,
          secondary_color: data.secondaryColor,
          referent_name: `${data.referentFirstName} ${data.referentLastName}`,
          referent_email: data.referentEmail,
        })
        .select()
        .single();

      if (clubError) throw clubError;

      // Upload logo if provided
      if (logoFile) {
        try {
          const logoUrl = await uploadLogo(club.id);
          if (logoUrl) {
            await supabase.from("clubs").update({ logo_url: logoUrl }).eq("id", club.id);
          }
        } catch (logoError) {
          console.error("Logo upload failed:", logoError);
          // Don't block club creation for logo failure
        }
      }

      // Invite the club admin
      const { data: inviteResult, error: inviteError } = await supabase.functions.invoke("send-invitation", {
        body: {
          email: data.referentEmail,
          firstName: data.referentFirstName,
          lastName: data.referentLastName,
          clubId: club.id,
          intendedRole: "club_admin",
        },
      });

      if (inviteError || inviteResult?.error) {
        await supabase.from("clubs").delete().eq("id", club.id);
        const inviteErrorMessage = inviteResult?.error || await getEdgeFunctionErrorMessage(inviteError);
        throw new Error(inviteErrorMessage);
      }

      toast.success(`Club "${data.name}" créé avec succès !`, {
        description: `Une invitation a été envoyée à ${data.referentEmail}`,
      });
      
      reset();
      removeLogo();
      onOpenChange(false);
      onSuccess?.();
    } catch (error: unknown) {
      console.error("Error creating club:", error);
      toast.error("Erreur lors de la création du club", {
        description: await getEdgeFunctionErrorMessage(error),
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

            <div className="grid grid-cols-[1fr,auto] gap-4">
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
              <div className="space-y-2">
                <Label htmlFor="shortName">Initiales</Label>
                <Input
                  id="shortName"
                  placeholder="FCE"
                  maxLength={3}
                  className="w-20 text-center uppercase font-bold"
                  {...register("shortName")}
                />
                {errors.shortName && (
                  <p className="text-sm text-destructive">{errors.shortName.message}</p>
                )}
              </div>
            </div>

            {/* Logo Upload */}
            <div className="space-y-2">
              <Label>Logo du club</Label>
              <div className="flex items-center gap-4">
                {logoPreview ? (
                  <div className="relative w-16 h-16 rounded-xl border border-border overflow-hidden">
                    <img src={logoPreview} alt="Logo" className="w-full h-full object-contain" />
                    <button
                      type="button"
                      onClick={removeLogo}
                      className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-16 h-16 rounded-xl border-2 border-dashed border-border hover:border-primary/50 flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer"
                  >
                    <Image className="w-5 h-5 text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground">Logo</span>
                  </button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleLogoSelect}
                  className="hidden"
                />
                <p className="text-xs text-muted-foreground">
                  JPG, PNG ou SVG — 2 Mo max
                </p>
              </div>
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
              {logoPreview ? (
                <div className="w-16 h-16 rounded-xl overflow-hidden bg-white flex items-center justify-center border border-border">
                  <img src={logoPreview} alt="Aperçu" className="w-full h-full object-contain" />
                </div>
              ) : (
                <div
                  className="w-16 h-16 rounded-xl flex items-center justify-center text-xl font-bold"
                  style={{
                    background: `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)`,
                    color: "white",
                  }}
                >
                  {watchShortName?.toUpperCase() || watchName?.slice(0, 2).toUpperCase() || "FC"}
                </div>
              )}
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
