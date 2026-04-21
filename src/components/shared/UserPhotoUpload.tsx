/**
 * @component UserPhotoUpload
 * @description Composant d'upload de photo de profil avec preview circulaire,
 *              fallback initiales et action de suppression. Déclenche PhotoCropModal
 *              en amont pour garantir le recadrage.
 * @props
 *  - photoPreview: string | null — URL/data preview
 *  - initials: string — fallback si pas de photo
 *  - onFileSelected: (file, preview) => void
 *  - onRemovePhoto: () => void
 * @features
 *  - Avatar circulaire (Avatar shadcn) avec fallback
 *  - Bouton Camera pour sélection fichier
 *  - Bouton X pour suppression
 *  - Validation type/taille avec toast d'erreur
 *  - Input file caché (ref)
 * @maintenance
 *  - Workflow média complet : mem://technical/media-processing-workflow
 *  - Sync invitation : mem://technical/user-invitation-photo-sync
 */
import { useRef } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Camera, X } from "lucide-react";
import { toast } from "sonner";

interface UserPhotoUploadProps {
  photoPreview: string | null;
  initials: string;
  onFileSelected: (file: File, preview: string) => void;
  onRemovePhoto: () => void;
  label?: string;
}

export function UserPhotoUpload({
  photoPreview,
  initials,
  onFileSelected,
  onRemovePhoto,
  label = "Cliquez pour ajouter une photo",
}: UserPhotoUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowedTypes = ["image/jpeg", "image/png", "image/gif"];
    if (!allowedTypes.includes(file.type)) {
      toast.error("Format non supporté. Utilisez JPEG, PNG ou GIF");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("La photo ne doit pas dépasser 5 Mo");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      onFileSelected(file, ev.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative group">
        <Avatar className="h-20 w-20">
          <AvatarImage src={photoPreview || undefined} className="object-cover" />
          <AvatarFallback className="bg-primary/10 text-primary text-xl font-medium">
            {initials}
          </AvatarFallback>
        </Avatar>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
        >
          <Camera className="w-5 h-5 text-white" />
        </button>
        {photoPreview && (
          <button
            type="button"
            onClick={() => {
              onRemovePhoto();
              if (fileInputRef.current) fileInputRef.current.value = "";
            }}
            className="absolute -top-1 -right-1 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center text-xs"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif"
        className="hidden"
        onChange={handlePhotoChange}
      />
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
