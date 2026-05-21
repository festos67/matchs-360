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
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
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
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
  Download,
  Trash2,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { PhotoCropModal } from "@/components/shared/PhotoCropModal";
import { validateUserPassword, USER_MIN_LENGTH, PASSWORD_HELP_TEXT } from "@/lib/password-policy";
import { uploadProfilePhoto } from "@/lib/photo-storage";
import { Switch } from "@/components/ui/switch";
import { ShieldCheck } from "lucide-react";

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
  const qc = useQueryClient();

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

  // Phase 3 RGPD art. 9 CC — droit a l'image (self pour adultes).
  const [imageRightsConsent, setImageRightsConsent] = useState(false);
  const [savingImageRights, setSavingImageRights] = useState(false);

  // RG2-001 / RG2-002 — droits RGPD adultes (export / effacement self).
  const [erasureReason, setErasureReason] = useState("");

  const exportMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("export-minor-data", {
        body: { subject_profile_id: user!.id },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: { download_url?: string } | null) => {
      if (data?.download_url) window.location.href = data.download_url;
      toast.success("Export prêt", {
        description: "Le téléchargement démarre (lien valable 5 min).",
      });
    },
    onError: (e: Error) =>
      toast.error("Export impossible", { description: e.message }),
  });

  const { data: pendingErasure } = useQuery({
    queryKey: ["my-erasure-request", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("erasure_requests")
        .select("id, scheduled_for, status")
        .eq("subject_profile_id", user!.id)
        .eq("status", "pending")
        .order("requested_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("erasure_requests")
        .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-erasure-request", user?.id] });
      toast.success("Demande annulée");
    },
    onError: (e: Error) => toast.error("Erreur", { description: e.message }),
  });

  const erasureMutation = useMutation({
    mutationFn: async (reason: string) => {
      const { data, error } = await supabase.functions.invoke("request-erasure", {
        body: { subject_profile_id: user!.id, reason: reason || null },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-erasure-request", user?.id] });
      setErasureReason("");
      toast.success("Demande d'effacement enregistrée", {
        description:
          "Vous avez 7 jours pour l'annuler. Passé ce délai, votre compte sera anonymisé automatiquement.",
      });
    },
    onError: (e: Error) => toast.error("Erreur", { description: e.message }),
  });

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
      setImageRightsConsent(!!profile.image_rights_consent_at);
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
    // Routage automatique : adulte -> bucket public, mineur -> bucket prive.
    const bd = (profile?.birthdate as string | null) ?? null;
    const res = await uploadProfilePhoto(user.id, photoFile, bd);
    // NB : pour les mineurs, photo_url stocke le PATH storage (pas une URL).
    // L'app consomme via usePhotoUrl qui gere la signed URL.
    // Persister photo_is_minor en parallele via handleSaveProfile.
    (uploadPhoto as unknown as { __isMinor?: boolean }).__isMinor = res.photo_is_minor;
    return res.photo_url;
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
        updateData.photo_is_minor =
          (uploadPhoto as unknown as { __isMinor?: boolean }).__isMinor ?? false;
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

  // Phase 3 — toggle droit a l'image (adulte / self).
  const handleToggleImageRights = async (next: boolean) => {
    if (!user) return;
    try {
      setSavingImageRights(true);
      const payload: Record<string, unknown> = next
        ? {
            image_rights_consent_at: new Date().toISOString(),
            image_rights_consent_by: user.id,
          }
        : {
            image_rights_consent_at: null,
            image_rights_consent_ip: null,
            image_rights_consent_by: null,
          };
      const { error } = await supabase
        .from("profiles")
        .update(payload)
        .eq("id", user.id);
      if (error) throw error;
      setImageRightsConsent(next);
      await refreshProfile();
      toast.success(
        next
          ? "Diffusion de votre photo autorisée"
          : "Diffusion de votre photo retirée — la photo est immédiatement masquée",
      );
    } catch (e) {
      console.error(e);
      toast.error("Échec de la mise à jour du consentement");
    } finally {
      setSavingImageRights(false);
    }
  };

  const handleChangePassword = async () => {
    // F-305: réauth obligatoire avant tout changement de mot de passe.
    // Empêche un attaquant ayant détourné une session (XSS, poste partagé)
    // de prendre durablement le compte sans connaître le mot de passe actuel.
    if (!currentPassword) {
      toast.error("Veuillez saisir votre mot de passe actuel");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Les mots de passe ne correspondent pas");
      return;
    }
    if (newPassword === currentPassword) {
      toast.error("Le nouveau mot de passe doit être différent de l'actuel");
      return;
    }
    const pwdError = validateUserPassword(newPassword);
    if (pwdError) {
      toast.error(pwdError);
      return;
    }
    const userEmail = profile?.email ?? user?.email;
    if (!userEmail) {
      toast.error("Email utilisateur introuvable, reconnectez-vous");
      return;
    }
    try {
      setChangingPassword(true);

      // Étape 1 — Réauthentification : signInWithPassword avec l'email courant
      // et le mot de passe saisi. En cas d'échec → abort sans toucher au mot
      // de passe. (Note: les comptes OAuth pur sans mot de passe échoueront
      // ici avec un message d'erreur explicite, comportement attendu.)
      const { error: reauthError } = await supabase.auth.signInWithPassword({
        email: userEmail,
        password: currentPassword,
      });
      if (reauthError) {
        toast.error("Mot de passe actuel incorrect");
        return;
      }

      // Étape 2 — Mise à jour effective.
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

        {/* Phase 3 RGPD art. 9 CC — Droit a l'image (self pour adultes) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <ShieldCheck className="w-5 h-5" />
              Droit à l'image
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-start justify-between gap-4 p-3 rounded-lg border bg-card">
              <div className="flex-1 space-y-1">
                <p className="font-medium text-sm">
                  J'autorise la diffusion de ma photo au sein du club
                </p>
                <p className="text-xs text-muted-foreground">
                  Consentement spécifique et révocable à tout moment (RGPD art. 7 §3).
                  Tant que cette option est désactivée, votre photo est masquée
                  partout dans l'application.
                </p>
              </div>
              <Switch
                checked={imageRightsConsent}
                disabled={savingImageRights}
                onCheckedChange={handleToggleImageRights}
                aria-label="Autoriser la diffusion de ma photo"
              />
            </div>
          </CardContent>
        </Card>

        {/* RG2-001 / RG2-002 — Droits RGPD (export art. 20/15, effacement art. 17) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Mes données personnelles (RGPD)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Export */}
            <div className="flex items-start justify-between gap-4 p-3 rounded-lg border bg-card">
              <div className="flex-1 space-y-1">
                <p className="font-medium text-sm">Exporter mes données</p>
                <p className="text-xs text-muted-foreground">
                  Téléchargez une archive ZIP contenant l'intégralité de vos données
                  (profil, évaluations, objectifs, consentements). Format ouvert et
                  réutilisable (art. 20 — portabilité).
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => exportMutation.mutate()}
                disabled={exportMutation.isPending}
              >
                {exportMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Download className="w-4 h-4 mr-2" />
                )}
                Exporter
              </Button>
            </div>

            {/* Pending erasure banner */}
            {pendingErasure ? (
              <div className="flex items-start gap-3 p-3 rounded-lg border border-destructive/50 bg-destructive/5">
                <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                <div className="flex-1 space-y-2">
                  <p className="text-sm font-medium">
                    Suppression de compte programmée
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Votre compte sera anonymisé le{" "}
                    <span className="font-medium text-foreground">
                      {format(new Date(pendingErasure.scheduled_for), "PPP 'à' HH:mm", { locale: fr })}
                    </span>
                    . Vous pouvez encore annuler cette demande jusqu'à cette date.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => cancelMutation.mutate(pendingErasure.id)}
                    disabled={cancelMutation.isPending}
                  >
                    {cancelMutation.isPending && (
                      <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                    )}
                    Annuler la demande
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-4 p-3 rounded-lg border bg-card">
                <div className="flex-1 space-y-1">
                  <p className="font-medium text-sm">Supprimer mon compte</p>
                  <p className="text-xs text-muted-foreground">
                    Délai de grâce de 7 jours, annulable à tout moment. Passé ce
                    délai, vos données sont anonymisées (art. 17).
                  </p>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive">
                      <Trash2 className="w-4 h-4 mr-2" />
                      Demander la suppression
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Demander la suppression de mon compte</AlertDialogTitle>
                      <AlertDialogDescription asChild>
                        <div className="space-y-2 text-sm">
                          <p>
                            Vous demandez l'effacement de vos données personnelles
                            au titre de l'article 17 du RGPD.
                          </p>
                          <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                            <li>
                              <strong>Délai de grâce de 7 jours</strong> pendant lequel
                              vous pouvez annuler la demande depuis cette page.
                            </li>
                            <li>
                              Passé ce délai, vos données sont{" "}
                              <strong>anonymisées</strong> (il ne s'agit pas d'une
                              suppression matérielle) et votre photo de profil est
                              effacée.
                            </li>
                            <li>
                              Un squelette anonymisé peut être conservé pour la
                              traçabilité légale (historique des évaluations sans
                              identité).
                            </li>
                          </ul>
                        </div>
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="space-y-2">
                      <Label htmlFor="erasure-reason">Motif (facultatif)</Label>
                      <Textarea
                        id="erasure-reason"
                        value={erasureReason}
                        onChange={(e) => setErasureReason(e.target.value)}
                        placeholder="Vous pouvez préciser la raison de votre demande…"
                        maxLength={500}
                        rows={3}
                      />
                    </div>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Annuler</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => erasureMutation.mutate(erasureReason)}
                        disabled={erasureMutation.isPending}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        {erasureMutation.isPending && (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        )}
                        Confirmer la demande
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}
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
              <Label htmlFor="currentPassword">Mot de passe actuel</Label>
              <Input
                id="currentPassword"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Votre mot de passe actuel"
                autoComplete="current-password"
              />
              <p className="text-xs text-muted-foreground">
                Requis pour confirmer votre identité avant tout changement.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">Nouveau mot de passe</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={`Minimum ${USER_MIN_LENGTH} caractères`}
                autoComplete="new-password"
              />
              <p className="text-xs text-muted-foreground">{PASSWORD_HELP_TEXT}</p>
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
                autoComplete="new-password"
              />
            </div>
            <Button
              onClick={handleChangePassword}
              disabled={
                changingPassword ||
                !currentPassword ||
                !newPassword ||
                !confirmPassword
              }
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
