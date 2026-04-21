/**
 * @page Profile
 * @route /profile
 *
 * Page de gestion du profil utilisateur courant.
 * (mem://features/profile-management)
 *
 * @description
 * Permet à tout utilisateur connecté de gérer ses informations personnelles,
 * sa photo de profil, et de visualiser ses rôles et affiliations actifs.
 *
 * @sections
 * - Informations : prénom, nom, surnom, email (lecture seule)
 * - Photo de profil : upload via PhotoCropModal (recadrage circulaire)
 *   (mem://technical/media-processing-workflow)
 * - Mes rôles : badges des rôles actifs avec affiliations club/équipe
 * - Sécurité : changement de mot de passe
 *
 * @access Tout utilisateur authentifié (auto-scopé sur user.id)
 *
 * @maintenance
 * - L'upload photo suit le flux : crop local → user-photos bucket → MAJ profile
 *   (mem://technical/user-invitation-photo-sync)
 * - L'URL inclut un timestamp pour cache-busting (?v=Date.now())
 */
import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Camera,
  X,
  Shield,
  Building2,
  UserCog,
  UserCircle,
  Heart,
  KeyRound,
  Save,
} from "lucide-react";
import { PhotoCropModal } from "@/components/shared/PhotoCropModal";

const roleConfig: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  admin: { label: "Administrateur", icon: Shield, color: "bg-destructive text-destructive-foreground" },
  club_admin: { label: "Responsable Club", icon: Building2, color: "bg-primary text-primary-foreground" },
  coach: { label: "Coach", icon: UserCog, color: "bg-orange-500 text-white" },
  player: { label: "Joueur", icon: UserCircle, color: "bg-green-500 text-white" },
  supporter: { label: "Supporter", icon: Heart, color: "bg-pink-500 text-white" },
};

export default function Profile() {
  const { user, profile, roles, currentRole, loading: authLoading, refreshProfile } = useAuth();
  const navigate = useNavigate();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [nickname, setNickname] = useState("");
  const [saving, setSaving] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [showCropModal, setShowCropModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Password change
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (profile) {
      setFirstName(profile.first_name || "");
      setLastName(profile.last_name || "");
      setNickname(profile.nickname || "");
      setPhotoPreview(profile.photo_url || null);
    }
  }, [profile]);

  const clubIds = roles.filter((r) => r.club_id).map((r) => r.club_id!);
  const uniqueClubIds = [...new Set(clubIds)];

  const { data: clubNames = {} } = useQuery({
    queryKey: ["profile-club-names", uniqueClubIds.sort().join(",")],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clubs")
        .select("id, name")
        .in("id", uniqueClubIds);
      if (error) throw error;
      const map: Record<string, string> = {};
      data?.forEach((c) => (map[c.id] = c.name));
      return map;
    },
    enabled: uniqueClubIds.length > 0,
    staleTime: 1000 * 60 * 5,
  });

  const getInitials = () => {
    const first = firstName?.charAt(0) || "";
    const last = lastName?.charAt(0) || "";
    return (first + last).toUpperCase() || "?";
  };

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
      setCropImageSrc(ev.target?.result as string);
      setShowCropModal(true);
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleCropComplete = (blob: Blob) => {
    const file = new File([blob], "photo.jpg", { type: "image/jpeg" });
    setPhotoFile(file);
    setRemovePhoto(false);
    setPhotoPreview(URL.createObjectURL(blob));
    setShowCropModal(false);
    setCropImageSrc(null);
  };

  const handleRemovePhoto = () => {
    setPhotoFile(null);
    setPhotoPreview(null);
    setRemovePhoto(true);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const uploadPhoto = async (): Promise<string | null> => {
    if (!photoFile || !user) return null;
    const ext = photoFile.name.split(".").pop() || "png";
    const path = `${user.id}/photo.${ext}`;
    const { error } = await supabase.storage
      .from("user-photos")
      .upload(path, photoFile, { upsert: true });
    if (error) throw error;
    const { data: urlData } = supabase.storage
      .from("user-photos")
      .getPublicUrl(path);
    return `${urlData.publicUrl}?t=${Date.now()}`;
  };

  const handleSaveProfile = async () => {
    if (!user) return;
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
        .eq("id", user.id);

      if (error) throw error;
      await refreshProfile();
      toast.success("Profil mis à jour avec succès");
      // Redirect to role-specific dashboard
      const dashboardPath = (() => {
        switch (currentRole?.role) {
          case "admin": return "/admin/dashboard";
          case "club_admin": return "/club/redirect";
          case "coach": return "/coach/dashboard";
          case "player": return "/player/dashboard";
          case "supporter": return "/supporter/dashboard";
          default: return "/";
        }
      })();
      navigate(dashboardPath);
    } catch (error) {
      console.error("Error updating profile:", error);
      toast.error("Erreur lors de la mise à jour du profil");
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      toast.error("Les mots de passe ne correspondent pas");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("Le mot de passe doit contenir au moins 6 caractères");
      return;
    }
    try {
      setChangingPassword(true);
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (error) throw error;
      toast.success("Mot de passe modifié avec succès");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error: unknown) {
      console.error("Error changing password:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Erreur lors du changement de mot de passe"
      );
    } finally {
      setChangingPassword(false);
    }
  };

  if (authLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-6 p-4 md:p-6">
        <h1 className="text-2xl font-display font-bold">Mon profil</h1>

        {/* Photo & Identity */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Informations personnelles</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Avatar */}
            <div className="flex flex-col items-center gap-2">
              <div className="relative group">
                <Avatar className="h-24 w-24">
                  <AvatarImage src={photoPreview || undefined} />
                  <AvatarFallback className="bg-primary/10 text-primary text-2xl font-medium">
                    {getInitials()}
                  </AvatarFallback>
                </Avatar>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                >
                  <Camera className="w-6 h-6 text-white" />
                </button>
                {photoPreview && (
                  <button
                    type="button"
                    onClick={handleRemovePhoto}
                    className="absolute -top-1 -right-1 w-6 h-6 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center"
                  >
                    <X className="w-3.5 h-3.5" />
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
              <p className="text-xs text-muted-foreground">
                Cliquez pour modifier votre photo
              </p>
            </div>

            {/* Fields */}
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
              <Input value={user?.email || ""} disabled className="bg-muted" />
              <p className="text-xs text-muted-foreground">
                L'email ne peut pas être modifié
              </p>
            </div>

            <Button onClick={handleSaveProfile} disabled={saving}>
              <Save className="w-4 h-4 mr-2" />
              {saving ? "Enregistrement..." : "Enregistrer"}
            </Button>
          </CardContent>
        </Card>

        {/* Roles */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Mes rôles</CardTitle>
          </CardHeader>
          <CardContent>
            {roles.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aucun rôle attribué
              </p>
            ) : (
              <div className="space-y-3">
                {roles.map((role) => {
                  const config = roleConfig[role.role];
                  if (!config) return null;
                  const Icon = config.icon;
                  return (
                    <div
                      key={role.id}
                      className="flex items-center gap-3 p-3 rounded-lg border bg-card"
                    >
                      <div
                        className={`w-9 h-9 rounded-lg flex items-center justify-center ${config.color}`}
                      >
                        <Icon className="w-4.5 h-4.5" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">{config.label}</p>
                        {role.club_id && clubNames[role.club_id] && (
                          <p className="text-xs text-muted-foreground">
                            {clubNames[role.club_id]}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Password Change */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <KeyRound className="w-5 h-5" />
              Changer le mot de passe
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="newPassword">Nouveau mot de passe</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimum 6 caractères"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">
                Confirmer le nouveau mot de passe
              </Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirmez votre mot de passe"
              />
            </div>
            <Button
              onClick={handleChangePassword}
              disabled={changingPassword || !newPassword || !confirmPassword}
              variant="outline"
            >
              <KeyRound className="w-4 h-4 mr-2" />
              {changingPassword
                ? "Modification..."
                : "Modifier le mot de passe"}
            </Button>
          </CardContent>
        </Card>
      </div>

      {cropImageSrc && (
        <PhotoCropModal
          open={showCropModal}
          imageSrc={cropImageSrc}
          onClose={() => { setShowCropModal(false); setCropImageSrc(null); }}
          onCropComplete={handleCropComplete}
        />
      )}
    </AppLayout>
  );
}
