/**
 * @modal EditClubModal
 * @description Modale d'édition des informations d'un club existant : nom,
 *              initiales, couleurs primaire/secondaire, logo.
 * @access Super Admin, Responsable Club (sur son club)
 * @features
 *  - Pré-remplissage des champs depuis l'objet club
 *  - Upload/remplacement logo via storage `club-logos` (chemins UUID non énumérables)
 *  - ColorPickerButton (react-colorful) avec preview live
 *  - Cache-busting par timestamp sur l'URL du logo
 * @maintenance
 *  - Sécurité storage : voir README section Sécurité (chemins UUID)
 *  - Couleurs HSL semantic tokens (design system)
 */
import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Image, X } from "lucide-react";
import { ColorPickerButton } from "@/components/shared/ColorPickerButton";

interface EditClubModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  club: {
    id: string;
    name: string;
    short_name?: string | null;
    primary_color: string;
    secondary_color: string | null;
    logo_url: string | null;
    referent_name: string | null;
    referent_email: string | null;
  };
  onSuccess: () => void;
}

export function EditClubModal({ open, onOpenChange, club, onSuccess }: EditClubModalProps) {
  const [name, setName] = useState(club.name);
  const [shortName, setShortName] = useState(club.short_name || "");
  const [primaryColor, setPrimaryColor] = useState(club.primary_color);
  const [referentName, setReferentName] = useState(club.referent_name || "");
  const [referentEmail, setReferentEmail] = useState(club.referent_email || "");
  const [logoUrl, setLogoUrl] = useState(club.logo_url || "");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName(club.name);
      setShortName(club.short_name || "");
      setPrimaryColor(club.primary_color);
      setReferentName(club.referent_name || "");
      setReferentEmail(club.referent_email || "");
      setLogoUrl(club.logo_url || "");
      setLogoFile(null);
      setLogoPreview(null);
    }
  }, [open, club]);

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
    setLogoUrl("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const uploadLogo = async (): Promise<string | null> => {
    if (!logoFile) return null;
    const { validateUpload } = await import("@/lib/upload-validation");
    const { contentType, safeExt } = validateUpload(logoFile, "image");
    const path = `${club.id}/logo.${safeExt}`;
    const { error } = await supabase.storage
      .from("club-logos")
      .upload(path, logoFile, { upsert: true, contentType });
    if (error) throw error;
    const { data: urlData } = supabase.storage.from("club-logos").getPublicUrl(path);
    return urlData.publicUrl;
  };

  const currentLogoDisplay = logoPreview || logoUrl;

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Le nom du club est requis");
      return;
    }
    setSaving(true);
    try {
      let finalLogoUrl = logoUrl.trim() || null;

      if (logoFile) {
        const uploaded = await uploadLogo();
        if (uploaded) finalLogoUrl = uploaded;
      }

      const { error } = await supabase
        .from("clubs")
        .update({
          name: name.trim(),
          short_name: shortName.trim().toUpperCase() || null,
          primary_color: primaryColor,
          referent_name: referentName.trim() || null,
          referent_email: referentEmail.trim() || null,
          logo_url: finalLogoUrl,
        })
        .eq("id", club.id);

      if (error) throw error;
      toast.success("Club mis à jour");
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error updating club:", error);
      toast.error("Erreur lors de la mise à jour");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Paramètres du club</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="grid grid-cols-[1fr,auto] gap-4">
            <div className="space-y-2">
              <Label htmlFor="club-name">Nom du club</Label>
              <Input id="club-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="club-short">Initiales</Label>
              <Input
                id="club-short"
                value={shortName}
                onChange={(e) => setShortName(e.target.value.slice(0, 3))}
                maxLength={3}
                placeholder="ABC"
                className="w-20 text-center uppercase font-bold"
              />
            </div>
          </div>

          {/* Logo Upload */}
          <div className="space-y-2">
            <Label>Logo du club</Label>
            <div className="flex items-center gap-4">
              {currentLogoDisplay ? (
                <div className="relative w-16 h-16 rounded-xl border border-border overflow-hidden bg-white">
                  <img src={currentLogoDisplay} alt="Logo" className="w-full h-full object-contain" />
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
                accept="image/jpeg,image/png,image/gif"
                onChange={handleLogoSelect}
                className="hidden"
              />
              {currentLogoDisplay && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Changer
                </Button>
              )}
              <p className="text-xs text-muted-foreground">
                JPG, PNG ou GIF — 2 Mo max
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Couleur principale</Label>
            <ColorPickerButton value={primaryColor} onChange={setPrimaryColor} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="club-referent">Nom du référent</Label>
            <Input id="club-referent" value={referentName} onChange={(e) => setReferentName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="club-email">Email du référent</Label>
            <Input id="club-email" type="email" value={referentEmail} onChange={(e) => setReferentEmail(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Enregistrement..." : "Enregistrer"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
