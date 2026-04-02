import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { User, AlertTriangle, UserPlus, ArrowRightLeft, Search, Check } from "lucide-react";
import { UserPhotoUpload } from "@/components/shared/UserPhotoUpload";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getEdgeFunctionErrorMessage } from "@/lib/edge-function-errors";

const playerSchema = z.object({
  firstName: z.string().min(1, "Prénom requis").max(50),
  lastName: z.string().min(1, "Nom requis").max(50),
  nickname: z.string().max(50).optional(),
  email: z.string().email("Email invalide").max(255),
  teamId: z.string().min(1, "Équipe requise"),
});

type PlayerFormData = z.infer<typeof playerSchema>;

interface Team {
  id: string;
  name: string;
}

interface TransferablePlayer {
  id: string;
  firstName: string | null;
  lastName: string | null;
  nickname: string | null;
  teamId: string;
  teamName: string;
}

interface CreatePlayerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clubId: string;
  teams?: Team[];
  defaultTeamId?: string;
  onSuccess?: () => void;
}

export const CreatePlayerModal = ({
  open,
  onOpenChange,
  clubId,
  teams: propTeams,
  defaultTeamId,
  onSuccess,
}: CreatePlayerModalProps) => {
  const [loading, setLoading] = useState(false);
  const [teams, setTeams] = useState<Team[]>(propTeams || []);
  const [showMutationAlert, setShowMutationAlert] = useState(false);
  const [pendingSubmit, setPendingSubmit] = useState<PlayerFormData | null>(null);
  const [activeTab, setActiveTab] = useState("create");
  
  // Transfer state
  const [transferablePlayers, setTransferablePlayers] = useState<TransferablePlayer[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<TransferablePlayer | null>(null);
  const [playerSelectOpen, setPlayerSelectOpen] = useState(false);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [teamSelectOpen, setTeamSelectOpen] = useState(false);

  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);

  // Photo state
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<PlayerFormData>({
    resolver: zodResolver(playerSchema),
    defaultValues: {
      teamId: defaultTeamId || "",
    },
  });

  useEffect(() => {
    if (!propTeams && open && clubId) {
      fetchTeams();
    }
  }, [open, clubId, propTeams]);

  useEffect(() => {
    if (defaultTeamId) {
      setValue("teamId", defaultTeamId);
    }
  }, [defaultTeamId, setValue]);

  useEffect(() => {
    if (open && clubId && defaultTeamId) {
      fetchTransferablePlayers();
    }
  }, [open, clubId, defaultTeamId]);

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setActiveTab("create");
      setSelectedPlayer(null);
      setPhotoFile(null);
      setPhotoPreview(null);
      reset();
    }
  }, [open, reset]);

  const fetchTeams = async () => {
    const { data } = await supabase
      .from("teams")
      .select("id, name")
      .eq("club_id", clubId)
      .is("deleted_at", null)
      .order("name");
    
    if (data) setTeams(data);
  };

  const fetchTransferablePlayers = async () => {
    if (!defaultTeamId) return;
    
    setLoadingPlayers(true);
    try {
      // Get all players from other teams in this club (exclude deleted profiles)
      const { data, error } = await supabase
        .from("team_members")
        .select(`
          user_id,
          team_id,
          teams!inner(id, name, club_id),
          profiles!inner(id, first_name, last_name, nickname, deleted_at)
        `)
        .eq("member_type", "player")
        .eq("is_active", true)
        .eq("teams.club_id", clubId)
        .neq("team_id", defaultTeamId)
        .is("profiles.deleted_at", null);

      if (error) throw error;

      const players: TransferablePlayer[] = (data || []).map((item: any) => ({
        id: item.profiles.id,
        firstName: item.profiles.first_name,
        lastName: item.profiles.last_name,
        nickname: item.profiles.nickname,
        teamId: item.team_id,
        teamName: item.teams.name,
      }));

      setTransferablePlayers(players);
    } catch (error) {
      console.error("Error fetching transferable players:", error);
    } finally {
      setLoadingPlayers(false);
    }
  };

  const uploadPhotoForUser = async (userId: string): Promise<string | null> => {
    if (!photoFile) return null;
    const ext = photoFile.name.split(".").pop() || "png";
    const path = `${userId}/photo.${ext}`;
    const { error } = await supabase.storage.from("user-photos").upload(path, photoFile, { upsert: true });
    if (error) {
      console.error("Photo upload error:", error);
      return null;
    }
    const { data: urlData } = supabase.storage.from("user-photos").getPublicUrl(path);
    return `${urlData.publicUrl}?t=${Date.now()}`;
  };

  const onSubmit = async (data: PlayerFormData, force = false) => {
    setLoading(true);
    try {
      const { data: result, error } = await supabase.functions.invoke("send-invitation", {
        body: {
          email: data.email,
          firstName: data.firstName,
          lastName: data.lastName,
          clubId,
          intendedRole: "player",
          teamId: data.teamId,
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

      toast.success(`Joueur invité avec succès !`, {
        description: `Une invitation a été envoyée à ${data.email}`,
      });
      
      reset();
      setPhotoFile(null);
      setPhotoPreview(null);
      onOpenChange(false);
      onSuccess?.();
    } catch (error: unknown) {
      console.error("Error inviting player:", error);
      const errorMessage = await getEdgeFunctionErrorMessage(error);
      
      // Handle mutation case
      if (errorMessage.includes("déjà dans une équipe") && !force) {
        setPendingSubmit(data);
        setShowMutationAlert(true);
        setLoading(false);
        return;
      }

      toast.error("Erreur lors de l'invitation", {
        description: errorMessage,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleTransfer = async () => {
    if (!selectedPlayer || !defaultTeamId) return;

    setLoading(true);
    try {
      // Reactivate profile if it was soft-deleted
      const { error: reactivateError } = await supabase
        .from("profiles")
        .update({
          deleted_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", selectedPlayer.id)
        .not("deleted_at", "is", null);

      if (reactivateError) {
        console.warn("Profile reactivation warning:", reactivateError);
        // Continue even if this fails (profile might not be deleted)
      }

      // Archive the current team membership
      const { error: archiveError } = await supabase
        .from("team_members")
        .update({
          is_active: false,
          left_at: new Date().toISOString(),
          archived_reason: "Mutation vers une autre équipe",
        })
        .eq("user_id", selectedPlayer.id)
        .eq("team_id", selectedPlayer.teamId)
        .eq("is_active", true);

      if (archiveError) throw archiveError;

      // Check if there's an existing archived membership in destination team
      const { data: existingMembership } = await supabase
        .from("team_members")
        .select("id")
        .eq("user_id", selectedPlayer.id)
        .eq("team_id", defaultTeamId)
        .eq("member_type", "player")
        .eq("is_active", false)
        .maybeSingle();

      if (existingMembership) {
        // Reactivate existing membership
        const { error: reactivateError } = await supabase
          .from("team_members")
          .update({
            is_active: true,
            left_at: null,
            archived_reason: null,
            joined_at: new Date().toISOString(),
          })
          .eq("id", existingMembership.id);

        if (reactivateError) throw reactivateError;
      } else {
        // Create new team membership
        const { error: insertError } = await supabase
          .from("team_members")
          .insert({
            user_id: selectedPlayer.id,
            team_id: defaultTeamId,
            member_type: "player",
            is_active: true,
            joined_at: new Date().toISOString(),
          });

        if (insertError) throw insertError;
      }

      const playerName = selectedPlayer.nickname || 
        `${selectedPlayer.firstName} ${selectedPlayer.lastName}`;

      toast.success("Transfert effectué !", {
        description: `${playerName} a été transféré depuis ${selectedPlayer.teamName}`,
      });

      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      console.error("Error transferring player:", error);
      toast.error("Erreur lors du transfert", {
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleMutationConfirm = () => {
    if (pendingSubmit) {
      onSubmit(pendingSubmit, true);
    }
    setShowMutationAlert(false);
    setPendingSubmit(null);
  };

  const selectedTeam = teams.find((t) => t.id === watch("teamId"));
  const currentTeam = teams.find((t) => t.id === defaultTeamId);

  const getPlayerDisplayName = (player: TransferablePlayer) => {
    const name = player.nickname || `${player.firstName || ""} ${player.lastName || ""}`.trim();
    return `${name} (${player.teamName})`;
  };

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
                <User className="w-5 h-5 text-primary" />
              </div>
              Ajouter un Joueur
            </DialogTitle>
          </DialogHeader>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="create" className="gap-2">
                <UserPlus className="w-4 h-4" />
                Nouveau joueur
              </TabsTrigger>
              <TabsTrigger value="transfer" className="gap-2">
                <ArrowRightLeft className="w-4 h-4" />
                Transférer
              </TabsTrigger>
            </TabsList>

            {/* Create new player tab */}
            <TabsContent value="create" className="mt-4">
              <form onSubmit={handleSubmit((d) => onSubmit(d))} className="space-y-6">
                {/* Photo */}
                <UserPhotoUpload
                  photoPreview={photoPreview}
                  initials={(() => {
                    const f = watch("firstName")?.charAt(0) || "";
                    const l = watch("lastName")?.charAt(0) || "";
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
                      placeholder="Thomas"
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
                  <Label htmlFor="nickname">Surnom (optionnel)</Label>
                  <Input
                    id="nickname"
                    placeholder="Tom"
                    {...register("nickname")}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="joueur@exemple.com"
                    {...register("email")}
                  />
                  {errors.email && (
                    <p className="text-sm text-destructive">{errors.email.message}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Le joueur recevra une invitation pour créer son compte
                  </p>
                </div>

                {(
                  <div className="space-y-2">
                    <Label>Équipe</Label>
                    <Popover open={teamSelectOpen} onOpenChange={setTeamSelectOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={teamSelectOpen}
                          className="w-full justify-between font-normal"
                        >
                          {watch("teamId")
                            ? teams.find((t) => t.id === watch("teamId"))?.name
                            : "Sélectionner une équipe"}
                          <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Rechercher une équipe..." />
                          <CommandList>
                            <CommandEmpty>Aucune équipe trouvée</CommandEmpty>
                            <CommandGroup>
                              {teams.map((team) => (
                                <CommandItem
                                  key={team.id}
                                  value={team.name}
                                  onSelect={() => {
                                    setValue("teamId", team.id);
                                    setTeamSelectOpen(false);
                                  }}
                                >
                                  <Check className={cn("mr-2 h-4 w-4", watch("teamId") === team.id ? "opacity-100" : "opacity-0")} />
                                  {team.name}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    {errors.teamId && (
                      <p className="text-sm text-destructive">{errors.teamId.message}</p>
                    )}
                  </div>
                )}

                {/* Preview */}
                {watch("firstName") && (
                  <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/30">
                    <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                      {watch("firstName")?.[0]}{watch("lastName")?.[0]}
                    </div>
                    <div>
                      <p className="font-medium">
                        {watch("nickname") || `${watch("firstName")} ${watch("lastName")}`}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {currentTeam?.name || selectedTeam?.name || "Équipe non sélectionnée"}
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-4 border-t border-border">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setCancelConfirmOpen(true)}
                  >
                    Annuler
                  </Button>
                  <Button type="submit" disabled={loading}>
                    {loading ? (
                      <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                    ) : (
                      "Inviter le joueur"
                    )}
                  </Button>
                </div>
              </form>
            </TabsContent>

            {/* Transfer existing player tab */}
            <TabsContent value="transfer" className="mt-4">
              <div className="space-y-6">
                {currentTeam && (
                  <div className="p-3 rounded-lg bg-muted/50 text-sm">
                    <span className="text-muted-foreground">Équipe destination :</span>{" "}
                    <span className="font-medium">{currentTeam.name}</span>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Sélectionner un joueur</Label>
                  <Popover open={playerSelectOpen} onOpenChange={setPlayerSelectOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={playerSelectOpen}
                        className="w-full justify-between"
                      >
                        {selectedPlayer ? (
                          getPlayerDisplayName(selectedPlayer)
                        ) : (
                          <span className="text-muted-foreground">Rechercher un joueur...</span>
                        )}
                        <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[400px] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Rechercher par nom..." />
                        <CommandList>
                          <CommandEmpty>
                            {loadingPlayers ? "Chargement..." : "Aucun joueur trouvé"}
                          </CommandEmpty>
                          <CommandGroup>
                            {transferablePlayers.map((player) => (
                              <CommandItem
                                key={player.id}
                                value={`${player.firstName} ${player.lastName} ${player.nickname} ${player.teamName}`}
                                onSelect={() => {
                                  setSelectedPlayer(player);
                                  setPlayerSelectOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    selectedPlayer?.id === player.id ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                <div className="flex flex-col">
                                  <span>
                                    {player.nickname || `${player.firstName} ${player.lastName}`}
                                  </span>
                                  <span className="text-xs text-muted-foreground">
                                    Actuellement : {player.teamName}
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
                    Seuls les joueurs des autres équipes du club sont affichés
                  </p>
                </div>

                {/* Transfer preview */}
                {selectedPlayer && currentTeam && (
                  <div className="p-4 rounded-lg bg-muted/30 space-y-3">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                        {selectedPlayer.firstName?.[0]}{selectedPlayer.lastName?.[0]}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">
                          {selectedPlayer.nickname || `${selectedPlayer.firstName} ${selectedPlayer.lastName}`}
                        </p>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span>{selectedPlayer.teamName}</span>
                          <ArrowRightLeft className="w-3 h-3" />
                          <span className="text-primary font-medium">{currentTeam.name}</span>
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Le joueur sera rattaché au référentiel de la nouvelle équipe. 
                      Ses anciennes évaluations seront conservées dans l'historique.
                    </p>
                  </div>
                )}

                {transferablePlayers.length === 0 && !loadingPlayers && (
                  <div className="text-center py-8 text-muted-foreground">
                    <ArrowRightLeft className="w-10 h-10 mx-auto mb-3 opacity-50" />
                    <p>Aucun joueur disponible pour un transfert</p>
                    <p className="text-xs mt-1">
                      Tous les joueurs du club sont déjà dans cette équipe
                    </p>
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-4 border-t border-border">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setCancelConfirmOpen(true)}
                  >
                    Annuler
                  </Button>
                  <Button 
                    onClick={handleTransfer} 
                    disabled={loading || !selectedPlayer}
                  >
                    {loading ? (
                      <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                    ) : (
                      "Confirmer le transfert"
                    )}
                  </Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Mutation Alert */}
      <AlertDialog open={showMutationAlert} onOpenChange={setShowMutationAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-warning" />
              Mutation de joueur
            </AlertDialogTitle>
            <AlertDialogDescription>
              Ce joueur est déjà rattaché à une autre équipe. Voulez-vous le
              transférer ? Il sera rattaché au référentiel de compétences de la
              nouvelle équipe et ses anciennes évaluations seront archivées.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleMutationConfirm}>
              Confirmer le transfert
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={cancelConfirmOpen} onOpenChange={setCancelConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Annuler la création ?</AlertDialogTitle>
            <AlertDialogDescription>
              Les informations saisies seront perdues. Voulez-vous vraiment annuler la création de ce joueur ?
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
                setSelectedPlayer(null);
                onOpenChange(false);
              }}
            >
              Confirmer l'annulation
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
