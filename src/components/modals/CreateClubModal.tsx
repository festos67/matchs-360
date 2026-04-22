/**
 * @modal CreateClubModal
 * @description Modale de création d'un nouveau club (réservée Super Admin).
 *              Gère un formulaire en 2 étapes : informations club (nom, initiales,
 *              couleurs primaire/secondaire, logo) puis invitation du Responsable Club.
 * @access Super Admin uniquement
 * @features
 *  - Validation Zod (nom requis, short_name 3 chars max auto-uppercase)
 *  - ColorPickerButton (react-colorful) pour couleurs HSL
 *  - Upload logo via storage `club-logos` (chemins UUID)
 *  - Persistance brouillon (draft) en localStorage pour reprise
 *  - Logique transactionnelle : rollback du club si invitation Responsable échoue
 *  - AlertDialog anti-annulation pour éviter pertes de données
 * @maintenance
 *  - Voir mem://features/admin/club-management pour le flux transactionnel
 *  - Voir mem://features/entity-short-names pour la gestion du short_name
 *  - Standard modale : max-h-85vh + scroll interne (mem://style/ui-patterns/management-modals-standards)
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Building2, X, Image } from "lucide-react";
import { ColorPickerButton } from "@/components/shared/ColorPickerButton";
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
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getEdgeFunctionErrorMessage } from "@/lib/edge-function-errors";
import { typedZodResolver } from "@/lib/typed-zod-resolver";

const DRAFT_KEY = "create-club-draft";

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

const defaultValues: ClubFormData = {
  name: "",
  shortName: "",
  primaryColor: "#3B82F6",
  secondaryColor: "#0A1628",
  referentEmail: "",
  referentFirstName: "",
  referentLastName: "",
};

function loadDraft(): Partial<ClubFormData> & { logoPreview?: string } | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveDraft(data: Partial<ClubFormData>, logoPreview: string | null) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...data, logoPreview }));
  } catch { /* ignore */ }
}

function clearDraft() {
  localStorage.removeItem(DRAFT_KEY);
}

interface CreateClubModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export const CreateClubModal = ({ open, onOpenChange, onSuccess }: CreateClubModalProps) => {
  const [loading, setLoading] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const draft = loadDraft();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    getValues,
    setValue,
    formState: { errors },
  } = useForm<ClubFormData>({
    resolver: typedZodResolver<ClubFormData>(clubSchema),
    defaultValues: draft
      ? { ...defaultValues, ...draft }
      : defaultValues,
  });

  // Restore logo preview from draft on mount
  useEffect(() => {
    if (open && draft?.logoPreview && !logoPreview) {
      setLogoPreview(draft.logoPreview);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const primaryColor = watch("primaryColor");
  const secondaryColor = watch("secondaryColor");
  const watchName = watch("name");
  const watchShortName = watch("shortName");

  const hasFormData = useCallback(() => {
    const v = getValues();
    return !!(v.name || v.shortName || v.referentEmail || v.referentFirstName || v.referentLastName || logoPreview);
  }, [getValues, logoPreview]);

  const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowedTypes = ["image/jpeg", "image/png", "image/gif"];
    if (!allowedTypes.includes(file.type)) {
      toast.error("Format non supporté. Utilisez JPEG, PNG ou GIF");
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
    const { validateUpload } = await import("@/lib/upload-validation");
    const { contentType, safeExt } = validateUpload(logoFile, "image");
    const path = `${clubId}/logo.${safeExt}`;
    const { error } = await supabase.storage
      .from("club-logos")
      .upload(path, logoFile, { upsert: true, contentType });
    if (error) throw error;
    const { data: urlData } = supabase.storage.from("club-logos").getPublicUrl(path);
    return urlData.publicUrl;
  };

  // Intercept close attempts
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && hasFormData()) {
      setShowConfirm(true);
      return;
    }
    onOpenChange(nextOpen);
  };

  const handleSaveDraft = () => {
    saveDraft(getValues(), logoPreview);
    setShowConfirm(false);
    onOpenChange(false);
    toast.info("Brouillon sauvegardé");
  };

  const handleDiscard = () => {
    clearDraft();
    reset(defaultValues);
    removeLogo();
    setShowConfirm(false);
    onOpenChange(false);
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

      if (logoFile) {
        try {
          const logoUrl = await uploadLogo(club.id);
          if (logoUrl) {
            await supabase.from("clubs").update({ logo_url: logoUrl }).eq("id", club.id);
          }
        } catch (logoError) {
          console.error("Logo upload failed:", logoError);
        }
      }

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
      
      clearDraft();
      reset(defaultValues);
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
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto" onInteractOutside={(e) => { if (hasFormData()) { e.preventDefault(); setShowConfirm(true); } }}>
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
                  <Input id="name" placeholder="FC Example" {...register("name")} />
                  {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="shortName">Initiales</Label>
                  <Input id="shortName" placeholder="FCE" maxLength={3} className="w-20 text-center uppercase font-bold" {...register("shortName")} />
                  {errors.shortName && <p className="text-sm text-destructive">{errors.shortName.message}</p>}
                </div>
              </div>

              {/* Logo Upload */}
              <div className="space-y-2">
                <Label>Logo du club</Label>
                <div className="flex items-center gap-4">
                  {logoPreview ? (
                    <div className="relative w-16 h-16 rounded-xl border border-border overflow-hidden">
                      <img src={logoPreview} alt="Logo" className="w-full h-full object-contain" />
                      <button type="button" onClick={removeLogo} className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => fileInputRef.current?.click()} className="w-16 h-16 rounded-xl border-2 border-dashed border-border hover:border-primary/50 flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer">
                      <Image className="w-5 h-5 text-muted-foreground" />
                      <span className="text-[10px] text-muted-foreground">Logo</span>
                    </button>
                  )}
                  <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/gif" onChange={handleLogoSelect} className="hidden" />
                  <p className="text-xs text-muted-foreground">JPG, PNG ou GIF — 2 Mo max</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Couleur principale</Label>
                  <ColorPickerButton value={watch("primaryColor") || "#000000"} onChange={(c) => setValue("primaryColor", c)} />
                </div>
                <div className="space-y-2">
                  <Label>Couleur secondaire</Label>
                  <ColorPickerButton value={watch("secondaryColor") || "#ffffff"} onChange={(c) => setValue("secondaryColor", c)} />
                </div>
              </div>
            </div>


            {/* Referent Info */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Responsable du club</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="referentFirstName">Prénom</Label>
                  <Input id="referentFirstName" placeholder="Jean" {...register("referentFirstName")} />
                  {errors.referentFirstName && <p className="text-sm text-destructive">{errors.referentFirstName.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="referentLastName">Nom</Label>
                  <Input id="referentLastName" placeholder="Dupont" {...register("referentLastName")} />
                  {errors.referentLastName && <p className="text-sm text-destructive">{errors.referentLastName.message}</p>}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="referentEmail">Email</Label>
                <Input id="referentEmail" type="email" placeholder="responsable@club.com" {...register("referentEmail")} />
                {errors.referentEmail && <p className="text-sm text-destructive">{errors.referentEmail.message}</p>}
                <p className="text-xs text-muted-foreground">Une invitation sera envoyée à cette adresse</p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t border-border">
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
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

      {/* Confirmation dialog */}
      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sauvegarder le brouillon ?</AlertDialogTitle>
            <AlertDialogDescription>
              Souhaitez-vous sauvegarder les informations saisies pour reprendre plus tard ?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button onClick={handleSaveDraft}>
              Oui, sauvegarder
            </Button>
            <Button variant="secondary" onClick={handleDiscard}>
              Non, abandonner
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
