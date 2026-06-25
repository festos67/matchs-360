/**
 * @modal EditPlayerModal
 * @description Modale légère d'édition des informations d'un joueur : prénom,
 *              nom, surnom, photo. Permet aussi d'ajouter des rôles cumulés via
 *              AddRoleSection (ex: joueur + coach assistant).
 * @access Super Admin, Responsable Club, Coach Référent (édition partielle)
 * @features
 *  - Pré-remplissage depuis l'objet player
 *  - Upload/suppression photo avec preview circulaire
 *  - Email en lecture seule (clé d'identification)
 *  - AddRoleSection pour cumul de rôles dans le club
 * @maintenance
 *  - Permissions joueurs : mem://logic/permissions-joueurs
 *  - Soft delete réservé Super Admin uniquement
 *  - Edit flow rôles : mem://features/user-role-management/edit-flow
 */
import { useEffect, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ShieldCheck, AlertTriangle } from "lucide-react";
import { requiresParentalConsent } from "@/lib/age-policy";
import { AddRoleSection } from "@/components/shared/AddRoleSection";
import { UserPhotoUpload } from "@/components/shared/UserPhotoUpload";
import { validateUpload, UploadValidationError } from "@/lib/upload-validation";
import { uploadProfilePhotoForExistingUser } from "@/lib/photo-storage";
import { getEdgeFunctionErrorInfo } from "@/lib/edge-function-errors";

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

type GuardianRelationship = "mere" | "pere" | "tuteur_legal" | "autre_titulaire";

const RELATIONSHIP_LABELS: Record<GuardianRelationship, string> = {
  mere: "Mère",
  pere: "Père",
  tuteur_legal: "Tuteur légal",
  autre_titulaire: "Autre titulaire de l'autorité parentale",
};

type CurrentGuardian = {
  guardian_email: string;
  guardian_first_name: string | null;
  guardian_last_name: string | null;
  relationship: GuardianRelationship;
  status: string;
};

export function EditPlayerModal({ open, onOpenChange, player, onSuccess }: EditPlayerModalProps) {
  const [firstName, setFirstName] = useState(player.first_name || "");
  const [lastName, setLastName] = useState(player.last_name || "");
  const [nickname, setNickname] = useState(player.nickname || "");
  const [birthdate, setBirthdate] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(player.photo_url || null);
  const [removePhoto, setRemovePhoto] = useState(false);

  // ===== Représentant légal (mineur < 15 ans) =====
  const [currentGuardian, setCurrentGuardian] = useState<CurrentGuardian | null>(null);
  const [editingGuardian, setEditingGuardian] = useState(false);
  const [gFirstName, setGFirstName] = useState("");
  const [gLastName, setGLastName] = useState("");
  const [gEmail, setGEmail] = useState("");
  const [gRelationship, setGRelationship] = useState<GuardianRelationship | "">("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submittingGuardian, setSubmittingGuardian] = useState(false);

  const isMinorForConsent = requiresParentalConsent(birthdate);

  // Charge la date de naissance actuelle à l'ouverture (non incluse dans la prop player).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("birthdate")
        .eq("id", player.id)
        .maybeSingle();
      if (!cancelled && !error && data) {
        setBirthdate(data.birthdate ? String(data.birthdate).slice(0, 10) : "");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, player.id]);

  // Charge la désignation guardian active (la plus récente)
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("guardian_designations")
        .select("guardian_email, guardian_first_name, guardian_last_name, relationship, status")
        .eq("minor_profile_id", player.id)
        .order("created_at", { ascending: false })
        .limit(1);
      if (cancelled) return;
      if (error) {
        console.error("guardian designation fetch error", error);
        setCurrentGuardian(null);
      } else {
        const g = (data?.[0] ?? null) as CurrentGuardian | null;
        setCurrentGuardian(g);
        // Pré-remplit le formulaire d'édition avec les valeurs actuelles
        setGFirstName(g?.guardian_first_name ?? "");
        setGLastName(g?.guardian_last_name ?? "");
        setGEmail(g?.guardian_email ?? "");
        setGRelationship((g?.relationship as GuardianRelationship | undefined) ?? "");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, player.id]);

  const guardianFormValid =
    gFirstName.trim().length > 0 &&
    gLastName.trim().length > 0 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(gEmail.trim()) &&
    !!gRelationship;

  const guardianChanged =
    !currentGuardian ||
    gFirstName.trim() !== (currentGuardian.guardian_first_name ?? "") ||
    gLastName.trim() !== (currentGuardian.guardian_last_name ?? "") ||
    gEmail.trim().toLowerCase() !== (currentGuardian.guardian_email ?? "").toLowerCase() ||
    gRelationship !== currentGuardian.relationship;

  const submitGuardianChange = async () => {
    if (!guardianFormValid) return;
    setSubmittingGuardian(true);
    try {
      const { data, error } = await supabase.functions.invoke("change-legal-guardian", {
        body: {
          playerId: player.id,
          guardianFirstName: gFirstName.trim(),
          guardianLastName: gLastName.trim(),
          guardianEmail: gEmail.trim(),
          guardianRelationship: gRelationship,
        },
      });
      const payload = (data ?? {}) as { ok?: boolean; emailSent?: boolean; warning?: string; error?: string };
      if (error) {
        const info = await getEdgeFunctionErrorInfo(error);
        toast.error(info.message, info.hint ? { description: info.hint } : undefined);
        return;
      }
      if (payload.error) {
        toast.error(payload.error);
        return;
      }
      if (payload.warning) {
        toast.warning(payload.warning);
      } else {
        toast.success("Représentant légal mis à jour. Un email de consentement a été envoyé.");
      }
      // Recharge la désignation à jour
      setCurrentGuardian({
        guardian_email: gEmail.trim().toLowerCase(),
        guardian_first_name: gFirstName.trim(),
        guardian_last_name: gLastName.trim(),
        relationship: gRelationship as GuardianRelationship,
        status: "pending",
      });
      setEditingGuardian(false);
      setConfirmOpen(false);
      onSuccess();
    } catch (e) {
      toast.error((e as Error)?.message ?? "Erreur inattendue.");
    } finally {
      setSubmittingGuardian(false);
    }
  };

  const getInitials = () => {
    const first = firstName?.charAt(0) || player.first_name?.charAt(0) || "";
    const last = lastName?.charAt(0) || player.last_name?.charAt(0) || "";
    return (first + last).toUpperCase() || "?";
  };

  // RG7-001 — Route via le helper centralisé (birthdate lue depuis le
  // profil) : mineur → bucket privé, adulte → public. Aucun flux staff
  // ne doit hardcoder le bucket public pour un profil potentiellement mineur.
  const uploadPhoto = async (): Promise<{ photo_url: string; photo_is_minor: boolean } | null> => {
    if (!photoFile) return null;
    // Pre-validate (cohérent avec UploadValidationError catch en handleSave)
    validateUpload(photoFile, "image");
    const res = await uploadProfilePhotoForExistingUser(player.id, photoFile);
    return { photo_url: res.photo_url, photo_is_minor: res.photo_is_minor };
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      let uploaded: { photo_url: string; photo_is_minor: boolean } | null | undefined;
      if (photoFile) {
        uploaded = await uploadPhoto();
      } else if (removePhoto) {
        uploaded = null;
      }

      const updateData: Record<string, unknown> = {
        first_name: firstName.trim() || null,
        last_name: lastName.trim() || null,
        nickname: nickname.trim() || null,
        birthdate: birthdate ? birthdate : null,
      };
      if (uploaded === null) {
        updateData.photo_url = null;
        updateData.photo_is_minor = false;
      } else if (uploaded) {
        updateData.photo_url = uploaded.photo_url;
        updateData.photo_is_minor = uploaded.photo_is_minor;
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
      if (error instanceof UploadValidationError) {
        toast.error(error.message);
      } else {
        const raw = error instanceof Error ? error.message : "";
        // Trigger Postgres : surnom d'un mineur protege.
        if (/NICKNAME_PROTECTED/i.test(raw)) {
          toast.error("Surnom protégé", {
            description:
              "Le surnom d'un mineur ne peut être modifié que par lui-même, son représentant légal ou un administrateur.",
          });
        } else {
          toast.error("Erreur lors de la mise à jour", {
            description: raw || "Une erreur est survenue. Vérifiez vos droits sur ce profil.",
          });
        }
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
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

          <div className="space-y-2">
            <Label htmlFor="edit-birthdate">Date de naissance</Label>
            <Input
              id="edit-birthdate"
              type="date"
              value={birthdate}
              onChange={(e) => setBirthdate(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Permet de corriger une erreur de saisie. Détermine le statut majeur / mineur du joueur.
            </p>
          </div>

          {player.club_id && (
            <AddRoleSection
              userId={player.id}
              clubId={player.club_id}
              currentRole="player"
              onRoleAdded={onSuccess}
            />
          )}

          {isMinorForConsent && (
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Représentant légal</h3>
              </div>

              {!editingGuardian && (
                <>
                  {currentGuardian ? (
                    <div className="text-sm space-y-1">
                      <p>
                        <span className="text-muted-foreground">Nom : </span>
                        <span className="font-medium">
                          {[currentGuardian.guardian_first_name, currentGuardian.guardian_last_name]
                            .filter(Boolean)
                            .join(" ") || "—"}
                        </span>
                      </p>
                      <p>
                        <span className="text-muted-foreground">Lien avec l'enfant : </span>
                        <span className="font-medium">
                          {RELATIONSHIP_LABELS[currentGuardian.relationship] ?? "—"}
                        </span>
                      </p>
                      <p className="break-words">
                        <span className="text-muted-foreground">Email : </span>
                        <a
                          href={`mailto:${currentGuardian.guardian_email}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {currentGuardian.guardian_email}
                        </a>
                      </p>
                      {currentGuardian.status !== "consumed" && (
                        <p className="text-[11px] text-muted-foreground italic">
                          Statut : {currentGuardian.status}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Aucun représentant légal n'a été désigné pour ce joueur.
                    </p>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setEditingGuardian(true)}
                  >
                    {currentGuardian ? "Modifier le représentant légal" : "Désigner un représentant légal"}
                  </Button>
                </>
              )}

              {editingGuardian && (
                <div className="space-y-3">
                  <div className="flex items-start gap-2 rounded-md bg-amber-500/10 border border-amber-500/30 p-3">
                    <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                    <p className="text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
                      Modifier le représentant légal annulera la désignation en cours et
                      <strong> suspendra l'accès du joueur à l'application</strong> tant que le
                      nouveau titulaire n'aura pas donné son consentement par email.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="g-first-name">Prénom</Label>
                      <Input
                        id="g-first-name"
                        value={gFirstName}
                        onChange={(e) => setGFirstName(e.target.value)}
                        placeholder="Prénom"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="g-last-name">Nom</Label>
                      <Input
                        id="g-last-name"
                        value={gLastName}
                        onChange={(e) => setGLastName(e.target.value)}
                        placeholder="Nom"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="g-email">Email</Label>
                    <Input
                      id="g-email"
                      type="email"
                      value={gEmail}
                      onChange={(e) => setGEmail(e.target.value)}
                      placeholder="adresse@email.com"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="g-rel">Lien avec l'enfant</Label>
                    <Select
                      value={gRelationship}
                      onValueChange={(v) => setGRelationship(v as GuardianRelationship)}
                    >
                      <SelectTrigger id="g-rel">
                        <SelectValue placeholder="Choisir…" />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(RELATIONSHIP_LABELS) as GuardianRelationship[]).map((k) => (
                          <SelectItem key={k} value={k}>
                            {RELATIONSHIP_LABELS[k]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditingGuardian(false);
                        // Reset au courant
                        setGFirstName(currentGuardian?.guardian_first_name ?? "");
                        setGLastName(currentGuardian?.guardian_last_name ?? "");
                        setGEmail(currentGuardian?.guardian_email ?? "");
                        setGRelationship(
                          (currentGuardian?.relationship as GuardianRelationship | undefined) ?? "",
                        );
                      }}
                    >
                      Annuler
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={!guardianFormValid || !guardianChanged || submittingGuardian}
                      onClick={() => setConfirmOpen(true)}
                    >
                      Enregistrer le nouveau représentant
                    </Button>
                  </div>
                </div>
              )}
            </div>
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

        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Changer de représentant légal ?</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-2 text-sm">
                  <p>
                    En confirmant, vous allez :
                  </p>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>annuler la désignation actuelle du représentant légal,</li>
                    <li>
                      <strong>suspendre l'accès du joueur à l'application</strong> tant que le
                      nouveau représentant légal n'aura pas validé son consentement,
                    </li>
                    <li>
                      envoyer un email à <strong>{gEmail.trim()}</strong> avec un lien sécurisé
                      pour donner son accord.
                    </li>
                  </ul>
                  <p className="text-muted-foreground">
                    Cette action est tracée (RGPD) et ne peut pas être annulée sans désigner à
                    nouveau un représentant légal.
                  </p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={submittingGuardian}>Annuler</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  submitGuardianChange();
                }}
                disabled={submittingGuardian}
              >
                {submittingGuardian ? "Envoi en cours…" : "Confirmer le changement"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
