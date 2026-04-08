import { UserPhotoUpload } from "@/components/shared/UserPhotoUpload";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserCheck, UserPlus } from "lucide-react";
import type { UseFormReturn } from "react-hook-form";
import type { CoachFormData, ExistingUser } from "@/hooks/useCreateCoach";

const roleLabels: Record<string, string> = {
  club_admin: "Responsable club",
  coach: "Coach",
  player: "Joueur",
  supporter: "Supporter",
};

interface CoachFormFieldsProps {
  form: UseFormReturn<CoachFormData>;
  mode: "new" | "existing";
  setMode: (mode: "new" | "existing") => void;
  existingUsers: ExistingUser[];
  selectedExistingUser: ExistingUser | null;
  loadingUsers: boolean;
  photoPreview: string | null;
  onSelectExistingUser: (user: ExistingUser) => void;
  onClearExistingUser: () => void;
  onPhotoSelected: (file: File, preview: string) => void;
  onRemovePhoto: () => void;
}

export function CoachFormFields({
  form,
  mode,
  setMode,
  existingUsers,
  selectedExistingUser,
  loadingUsers,
  photoPreview,
  onSelectExistingUser,
  onClearExistingUser,
  onPhotoSelected,
  onRemovePhoto,
}: CoachFormFieldsProps) {
  const { register, watch, formState: { errors } } = form;

  const getInitials = () => {
    const f = watch("firstName")?.charAt(0) || "";
    const l = watch("lastName")?.charAt(0) || "";
    return (f + l).toUpperCase() || "?";
  };

  return (
    <>
      {/* Mode selector */}
      <div className="flex gap-2 mt-2">
        <Button type="button" variant={mode === "new" ? "default" : "outline"} size="sm" className="flex-1 gap-2" onClick={() => { setMode("new"); onClearExistingUser(); }}>
          <UserPlus className="w-4 h-4" />Nouvel utilisateur
        </Button>
        <Button type="button" variant={mode === "existing" ? "default" : "outline"} size="sm" className="flex-1 gap-2" onClick={() => { setMode("existing"); onClearExistingUser(); }}>
          <UserCheck className="w-4 h-4" />Utilisateur existant
        </Button>
      </div>

      {/* Existing user selector */}
      {mode === "existing" && !selectedExistingUser && (
        <div className="space-y-2 mt-2">
          <Label className="text-sm">Sélectionner un utilisateur du club</Label>
          {loadingUsers ? (
            <div className="flex items-center justify-center py-6">
              <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          ) : existingUsers.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground text-sm border border-dashed rounded-lg">
              Aucun utilisateur disponible (tous sont déjà coachs)
            </div>
          ) : (
            <div className="border rounded-lg divide-y max-h-[200px] overflow-y-auto">
              {existingUsers.map(user => (
                <button key={user.id} type="button" className="w-full flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors text-left" onClick={() => onSelectExistingUser(user)}>
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-medium shrink-0 overflow-hidden">
                    {user.photo_url ? <img src={user.photo_url} alt="" className="w-full h-full object-cover" /> : `${(user.first_name || "?").charAt(0)}${(user.last_name || "").charAt(0)}`.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{user.first_name} {user.last_name}</p>
                    <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {user.roles.map(role => <Badge key={role} variant="secondary" className="text-xs">{roleLabels[role] || role}</Badge>)}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Selected existing user banner */}
      {selectedExistingUser && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/5 border border-primary/20 mt-2">
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-medium shrink-0 overflow-hidden">
            {selectedExistingUser.photo_url ? <img src={selectedExistingUser.photo_url} alt="" className="w-full h-full object-cover" /> : getInitials()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm">{selectedExistingUser.first_name} {selectedExistingUser.last_name}</p>
            <div className="flex items-center gap-1.5">
              {selectedExistingUser.roles.map(role => <Badge key={role} variant="secondary" className="text-xs">{roleLabels[role] || role}</Badge>)}
              <Badge className="text-xs bg-green-500 text-white">+ Coach</Badge>
            </div>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={onClearExistingUser} className="text-xs">Changer</Button>
        </div>
      )}

      {/* Photo upload */}
      {(mode === "new" || (selectedExistingUser && !selectedExistingUser.photo_url)) && (
        <UserPhotoUpload
          photoPreview={photoPreview}
          initials={getInitials()}
          onFileSelected={onPhotoSelected}
          onRemovePhoto={onRemovePhoto}
          label="Ajouter une photo (optionnel)"
        />
      )}

      {/* Name fields */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="firstName">Prénom</Label>
          <Input id="firstName" placeholder="Jean" {...register("firstName")} disabled={!!selectedExistingUser} />
          {errors.firstName && <p className="text-sm text-destructive">{errors.firstName.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="lastName">Nom</Label>
          <Input id="lastName" placeholder="Dupont" {...register("lastName")} disabled={!!selectedExistingUser} />
          {errors.lastName && <p className="text-sm text-destructive">{errors.lastName.message}</p>}
        </div>
      </div>

      {/* Email */}
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" placeholder="coach@exemple.com" {...register("email")} disabled={!!selectedExistingUser} />
        {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
      </div>
    </>
  );
}
