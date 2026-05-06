/**
 * @modal CreateSupporterModal
 * @description Modale d'invitation d'un supporter (parent, proche) lié à un ou
 *              plusieurs joueurs. Le supporter accède en lecture seule aux données
 *              de ses joueurs et peut soumettre des débriefs consultatifs sur invitation.
 * @access Coach Référent, Responsable Club, Super Admin (action depuis fiche joueur)
 * @features
 *  - Modes "Nouveau" / "Existant" pour éviter doublons (mem://features/user-role-management/promotion-mode)
 *  - Lien automatique avec le joueur concerné via supporters_link
 *  - Upload photo de profil avec recadrage circulaire
 *  - Vérification limite plan (max_supporters_per_team)
 *  - AlertDialog anti-annulation
 * @maintenance
 *  - Accès données supporter en lecture seule : mem://logic/supporter-data-access
 *  - Identité visuelle Heart rose (mem://style/role-branding-standard)
 */
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Heart, UserPlus, Search, Check, ChevronDown } from "lucide-react";
import { UserPhotoUpload } from "@/components/shared/UserPhotoUpload";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { PlayerSelector } from "./PlayerSelector";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getEdgeFunctionErrorInfo } from "@/lib/edge-function-errors";
import { toastInvitationError } from "@/lib/invitation-error-toast";
import { usePlanLimitHandler } from "@/hooks/usePlanLimitHandler";
import { typedZodResolver } from "@/lib/typed-zod-resolver";

const supporterSchema = z.object({
  firstName: z.string().min(1, "Prénom requis").max(50),
  lastName: z.string().min(1, "Nom requis").max(50),
  email: z.string().email("Email invalide").max(255),
  playerIds: z.array(z.string()).min(1, "Sélectionnez au moins un joueur"),
});

type SupporterFormData = z.infer<typeof supporterSchema>;

interface Player {
  id: string;
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
  team_name?: string;
}

interface ClubMember {
  id: string;
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
  email: string;
  role_label: string;
}

interface CreateSupporterModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clubId: string;
  onSuccess?: () => void;
}

export const CreateSupporterModal = ({
  open,
  onOpenChange,
  clubId,
  onSuccess,
}: CreateSupporterModalProps) => {
  const [loading, setLoading] = useState(false);
  const { handle: handlePlanLimit, dialog: planLimitDialog } = usePlanLimitHandler();
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"new" | "existing">("new");
  const [clubMembers, setClubMembers] = useState<ClubMember[]>([]);
  const [selectedExisting, setSelectedExisting] = useState<ClubMember | null>(null);
  const [existingPickerOpen, setExistingPickerOpen] = useState(false);
  const [existingPlayerIds, setExistingPlayerIds] = useState<string[]>([]);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<SupporterFormData>({
    resolver: typedZodResolver<SupporterFormData>(supporterSchema),
    defaultValues: {
      playerIds: [],
    },
  });

  useEffect(() => {
    if (open && clubId) {
      fetchPlayers();
      fetchClubMembers();
    }
  }, [open, clubId]);

  useEffect(() => {
    setValue("playerIds", selectedPlayers);
  }, [selectedPlayers, setValue]);

  useEffect(() => {
    if (!open) {
      setActiveTab("new");
      setSelectedExisting(null);
      setExistingPlayerIds([]);
      setSelectedPlayers([]);
      setPhotoFile(null);
      setPhotoPreview(null);
      reset();
    }
  }, [open, reset]);

  const fetchPlayers = async () => {
    const { data } = await supabase
      .from("team_members")
      .select(`
        user_id,
        profile:profiles(id, first_name, last_name, nickname),
        team:teams(name)
      `)
      .eq("member_type", "player")
      .eq("is_active", true);

    if (data) {
      const formattedPlayers: Player[] = data.map((item: any) => ({
        id: item.profile.id,
        first_name: item.profile.first_name,
        last_name: item.profile.last_name,
        nickname: item.profile.nickname,
        team_name: item.team?.name,
      }));
      setPlayers(formattedPlayers);
    }
  };

  const fetchClubMembers = async () => {
    // Fetch all profiles of users with a role in this club, who are NOT already supporters
    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .eq("club_id", clubId);

    if (!roles) return;

    const supporterIds = new Set(
      roles.filter((r: any) => r.role === "supporter").map((r: any) => r.user_id),
    );
    const eligible = roles.filter(
      (r: any) =>
        r.role !== "supporter" &&
        !supporterIds.has(r.user_id),
    );

    // Deduplicate by user_id, keep highest-priority role for label
    const labelMap: Record<string, string> = {
      admin: "Super Admin",
      club_admin: "Responsable Club",
      coach: "Coach",
      player: "Joueur",
    };
    const priority: Record<string, number> = {
      admin: 0, club_admin: 1, coach: 2, player: 3,
    };
    const byUser = new Map<string, string>();
    for (const r of eligible as any[]) {
      const cur = byUser.get(r.user_id);
      if (!cur || (priority[r.role] ?? 99) < (priority[cur] ?? 99)) {
        byUser.set(r.user_id, r.role);
      }
    }

    const userIds = Array.from(byUser.keys());
    if (userIds.length === 0) {
      setClubMembers([]);
      return;
    }

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, nickname, email")
      .in("id", userIds)
      .is("deleted_at", null);

    const members: ClubMember[] = (profiles || []).map((p: any) => ({
      id: p.id,
      first_name: p.first_name,
      last_name: p.last_name,
      nickname: p.nickname,
      email: p.email,
      role_label: labelMap[byUser.get(p.id) || ""] || "Membre",
    }));

    members.sort((a, b) => {
      const an = `${a.first_name || ""} ${a.last_name || ""}`.trim().toLowerCase();
      const bn = `${b.first_name || ""} ${b.last_name || ""}`.trim().toLowerCase();
      return an.localeCompare(bn);
    });
    setClubMembers(members);
  };

  const handleSelectionChange = (playerIds: string[]) => {
    setSelectedPlayers(playerIds);
  };

  const uploadPhotoForUser = async (userId: string): Promise<string | null> => {
    if (!photoFile) return null;
    let validated;
    try {
      validated = (await import("@/lib/upload-validation")).validateUpload(photoFile, "image");
    } catch (e) {
      console.error("Photo validation failed:", e);
      return null;
    }
    const path = `${userId}/photo.${validated.safeExt}`;
    const { error } = await supabase.storage
      .from("user-photos")
      .upload(path, photoFile, { upsert: true, contentType: validated.contentType });
    if (error) {
      console.error("Photo upload error:", error);
      return null;
    }
    const { data: urlData } = supabase.storage.from("user-photos").getPublicUrl(path);
    return `${urlData.publicUrl}?t=${Date.now()}`;
  };

  const onSubmit = async (data: SupporterFormData) => {
    setLoading(true);
    try {
      const { data: result, error } = await supabase.functions.invoke("send-invitation", {
        body: {
          email: data.email,
          firstName: data.firstName,
          lastName: data.lastName,
          clubId,
          intendedRole: "supporter",
          playerIds: data.playerIds,
        },
      });

      if (error) throw error;
      if (result?.error) throw new Error(result.error);

      // Upload photo if provided and user was created
      if (photoFile && result?.userId) {
        const photoUrl = await uploadPhotoForUser(result.userId);
        if (photoUrl) {
          await supabase.from("profiles").update({ photo_url: photoUrl }).eq("id", result.userId);
        }
      }

      toast.success(`Supporter invité avec succès !`, {
        description: `Une invitation a été envoyée à ${data.email}`,
      });

      reset();
      setSelectedPlayers([]);
      setPhotoFile(null);
      setPhotoPreview(null);
      onOpenChange(false);
      onSuccess?.();
    } catch (error: unknown) {
      console.error("Error inviting supporter:", error);
      const errorInfo = await getEdgeFunctionErrorInfo(error);
      const errorMessage = errorInfo.message;
      if (errorMessage.includes("PLAN_LIMIT_SUPPORTERS")) {
        if (handlePlanLimit({ message: errorMessage }, "supporters_per_team")) { setLoading(false); return; }
      }
      await toastInvitationError(error);
    } finally {
      setLoading(false);
    }
  };

  const onSubmitExisting = async () => {
    if (!selectedExisting || existingPlayerIds.length === 0) return;
    setLoading(true);
    try {
      const { data: result, error } = await supabase.functions.invoke("send-invitation", {
        body: {
          email: selectedExisting.email,
          firstName: selectedExisting.first_name || "",
          lastName: selectedExisting.last_name || "",
          clubId,
          intendedRole: "supporter",
          playerIds: existingPlayerIds,
        },
      });
      if (error) throw error;
      if (result?.error) throw new Error(result.error);

      toast.success("Rôle supporter ajouté !", {
        description: `${selectedExisting.first_name || ""} ${selectedExisting.last_name || ""} est maintenant supporter.`,
      });
      onOpenChange(false);
      onSuccess?.();
    } catch (error: unknown) {
      console.error("Error adding supporter role:", error);
      const errorInfo = await getEdgeFunctionErrorInfo(error);
      const errorMessage = errorInfo.message;
      if (errorMessage.includes("PLAN_LIMIT_SUPPORTERS")) {
        if (handlePlanLimit({ message: errorMessage }, "supporters_per_team")) { setLoading(false); return; }
      }
      await toastInvitationError(error);
    } finally {
      setLoading(false);
    }
  };

  const memberDisplayName = (m: ClubMember) =>
    m.nickname || `${m.first_name || ""} ${m.last_name || ""}`.trim() || m.email;

  return (
    <>
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) {
        setCancelConfirmOpen(true);
      } else {
        onOpenChange(true);
      }
    }}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Heart className="w-5 h-5 text-primary" />
            </div>
            Ajouter un Supporter
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "new" | "existing")} className="mt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="new" className="gap-2">
              <UserPlus className="w-4 h-4" />
              Nouveau supporter
            </TabsTrigger>
            <TabsTrigger value="existing" className="gap-2">
              <Search className="w-4 h-4" />
              Membre existant
            </TabsTrigger>
          </TabsList>

          <TabsContent value="new" className="mt-4">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Photo */}
          <UserPhotoUpload
            photoPreview={photoPreview}
            initials={(() => {
              const f = (document.getElementById("firstName") as HTMLInputElement)?.value?.charAt(0) || "";
              const l = (document.getElementById("lastName") as HTMLInputElement)?.value?.charAt(0) || "";
              return (f + l).toUpperCase() || "?";
            })()}
            onFileSelected={(file, preview) => {
              setPhotoFile(file);
              setPhotoPreview(preview);
            }}
            onRemovePhoto={() => {
              setPhotoFile(null);
              setPhotoPreview(null);
            }}
            label="Ajouter une photo (optionnel)"
          />
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">Prénom</Label>
              <Input
                id="firstName"
                placeholder="Marie"
                {...register("firstName")}
              />
              {errors.firstName && (
                <p className="text-sm text-destructive">{errors.firstName.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Nom</Label>
              <Input
                id="lastName"
                placeholder="Martin"
                {...register("lastName")}
              />
              {errors.lastName && (
                <p className="text-sm text-destructive">{errors.lastName.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="parent@exemple.com"
              {...register("email")}
            />
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>
              Joueurs suivis ({selectedPlayers.length} sélectionné
              {selectedPlayers.length > 1 ? "s" : ""})
            </Label>
            <PlayerSelector
              players={players}
              selectedPlayerIds={selectedPlayers}
              onSelectionChange={handleSelectionChange}
              placeholder="Rechercher un joueur..."
              emptyMessage="Aucun joueur disponible"
            />
            {errors.playerIds && (
              <p className="text-sm text-destructive">{errors.playerIds.message}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Un supporter peut suivre plusieurs joueurs de différentes équipes
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCancelConfirmOpen(true)}
            >
              Annuler
            </Button>
            <Button type="submit" disabled={loading || selectedPlayers.length === 0}>
              {loading ? (
                <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              ) : (
                "Inviter le supporter"
              )}
            </Button>
          </div>
        </form>
          </TabsContent>

          <TabsContent value="existing" className="mt-4">
            <div className="space-y-6">
              <div className="space-y-2">
                <Label>Sélectionner un membre du club</Label>
                <Popover open={existingPickerOpen} onOpenChange={setExistingPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      className="w-full justify-between"
                    >
                      {selectedExisting ? (
                        <span className="truncate">
                          {memberDisplayName(selectedExisting)}{" "}
                          <span className="text-xs text-muted-foreground">
                            · {selectedExisting.role_label}
                          </span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Rechercher un membre...</span>
                      )}
                      <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Tapez un nom ou un email..." />
                      <CommandList>
                        <CommandEmpty>Aucun membre éligible</CommandEmpty>
                        <CommandGroup>
                          {clubMembers.map((m) => (
                            <CommandItem
                              key={m.id}
                              value={`${m.first_name || ""} ${m.last_name || ""} ${m.nickname || ""} ${m.email}`}
                              onSelect={() => {
                                setSelectedExisting(m);
                                setExistingPickerOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  selectedExisting?.id === m.id ? "opacity-100" : "opacity-0",
                                )}
                              />
                              <div className="flex flex-col min-w-0">
                                <span className="truncate">{memberDisplayName(m)}</span>
                                <span className="text-xs text-muted-foreground truncate">
                                  {m.role_label} · {m.email}
                                </span>
                              </div>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                <p className="text-xs text-muted-foreground">
                  Coachs et responsables du club déjà inscrits, qui n'ont pas encore le rôle supporter.
                </p>
              </div>

              <div className="space-y-2">
                <Label>
                  Joueurs suivis ({existingPlayerIds.length} sélectionné
                  {existingPlayerIds.length > 1 ? "s" : ""})
                </Label>
                <PlayerSelector
                  players={players}
                  selectedPlayerIds={existingPlayerIds}
                  onSelectionChange={setExistingPlayerIds}
                  placeholder="Rechercher un joueur..."
                  emptyMessage="Aucun joueur disponible"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCancelConfirmOpen(true)}
                >
                  Annuler
                </Button>
                <Button
                  type="button"
                  onClick={onSubmitExisting}
                  disabled={loading || !selectedExisting || existingPlayerIds.length === 0}
                >
                  {loading ? (
                    <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  ) : (
                    "Ajouter le rôle supporter"
                  )}
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>

    <AlertDialog open={cancelConfirmOpen} onOpenChange={setCancelConfirmOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Annuler la création ?</AlertDialogTitle>
          <AlertDialogDescription>
            Les informations saisies seront perdues. Voulez-vous vraiment annuler la création de ce supporter ?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button onClick={() => setCancelConfirmOpen(false)}>
            Continuer la saisie
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setCancelConfirmOpen(false);
              reset();
              setSelectedPlayers([]);
              onOpenChange(false);
            }}
          >
            Confirmer l'annulation
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    {planLimitDialog}
    </>
  );
};
