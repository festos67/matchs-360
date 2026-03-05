import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(club.name);
      setShortName(club.short_name || "");
      setPrimaryColor(club.primary_color);
      setReferentName(club.referent_name || "");
      setReferentEmail(club.referent_email || "");
      setLogoUrl(club.logo_url || "");
    }
  }, [open, club]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Le nom du club est requis");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("clubs")
        .update({
          name: name.trim(),
          short_name: shortName.trim().toUpperCase() || null,
          primary_color: primaryColor,
          referent_name: referentName.trim() || null,
          referent_email: referentEmail.trim() || null,
          logo_url: logoUrl.trim() || null,
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
          <div className="space-y-2">
            <Label htmlFor="club-color">Couleur principale</Label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                id="club-color"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="w-10 h-10 rounded cursor-pointer border border-border"
              />
              <Input value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="flex-1" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="club-logo">URL du logo</Label>
            <Input id="club-logo" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://..." />
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
