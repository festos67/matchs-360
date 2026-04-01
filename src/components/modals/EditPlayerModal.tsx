import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AddRoleSection } from "@/components/shared/AddRoleSection";
import { UserPhotoUpload } from "@/components/shared/UserPhotoUpload";
import { AddRoleSection } from "@/components/shared/AddRoleSection";

interface Player {
  id: string;
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
  email: string;
  photo_url?: string | null;
  club_id?: string | null;
}

interface EditPlayerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  player: Player;
  onSuccess: () => void;
}

export function EditPlayerModal({ open, onOpenChange, player, onSuccess }: EditPlayerModalProps) {
  const [firstName, setFirstName] = useState(player.first_name || "");
  const [lastName, setLastName] = useState(player.last_name || "");
  const [nickname, setNickname] = useState(player.nickname || "");
  const [saving, setSaving] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(player.photo_url || null);
  const [removePhoto, setRemovePhoto] = useState(false);

  const getInitials = () => {
    const first = firstName?.charAt(0) || player.first_name?.charAt(0) || "";
    const last = lastName?.charAt(0) || player.last_name?.charAt(0) || "";
    return (first + last).toUpperCase() || "?";
  };

  const uploadPhoto = async (): Promise<string | null> => {
    if (!photoFile) return null;
    const ext = photoFile.name.split(".").pop() || "png";
    const path = `${player.id}/photo.${ext}`;
    const { error } = await supabase.storage.from("user-photos").upload(path, photoFile, { upsert: true });
    if (error) throw error;
    const { data: urlData } = supabase.storage.from("user-photos").getPublicUrl(path);
    return `${urlData.publicUrl}?t=${Date.now()}`;
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      let photoUrl: string | null | undefined = undefined;
      if (photoFile) {
        photoUrl = await uploadPhoto();
      } else if (removePhoto) {
        photoUrl = null;
      }

      const updateData: Record<string, unknown> = {
        first_name: firstName.trim() || null,
        last_name: lastName.trim() || null,
        nickname: nickname.trim() || null,
      };
      if (photoUrl !== undefined) {
        updateData.photo_url = photoUrl;
      }

      const { error } = await supabase
        .from("profiles")
        .update(updateData)
        .eq("id", player.id);

      if (error) throw error;

      toast.success("Profil mis à jour");
      onSuccess();
      onOpenChange(false);
    } catch (error: unknown) {
      console.error("Error updating player:", error);
      toast.error("Erreur lors de la mise à jour");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Modifier le joueur</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Photo */}
          <UserPhotoUpload
            photoPreview={photoPreview}
            initials={getInitials()}
            onFileSelected={(file, preview) => {
              setPhotoFile(file);
              setPhotoPreview(preview);
              setRemovePhoto(false);
            }}
            onRemovePhoto={() => {
              setPhotoFile(null);
              setPhotoPreview(null);
              setRemovePhoto(true);
            }}
          />

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">Prénom</Label>
              <Input
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Prénom"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Nom</Label>
              <Input
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Nom"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="nickname">Surnom</Label>
            <Input
              id="nickname"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="Surnom (optionnel)"
            />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={player.email} disabled className="bg-muted" />
          </div>

          {player.club_id && (
            <AddRoleSection
              userId={player.id}
              clubId={player.club_id}
              currentRole="player"
              onRoleAdded={onSuccess}
            />
          )}
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Enregistrement..." : "Enregistrer"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
