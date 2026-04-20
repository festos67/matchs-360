import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Heart } from "lucide-react";
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
import { PlayerSelector } from "./PlayerSelector";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getEdgeFunctionErrorMessage } from "@/lib/edge-function-errors";
import { usePlanLimitHandler } from "@/hooks/usePlanLimitHandler";

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

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<SupporterFormData>({
    resolver: zodResolver(supporterSchema),
    defaultValues: {
      playerIds: [],
    },
  });

  useEffect(() => {
    if (open && clubId) {
      fetchPlayers();
    }
  }, [open, clubId]);

  useEffect(() => {
    setValue("playerIds", selectedPlayers);
  }, [selectedPlayers, setValue]);

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

  const handleSelectionChange = (playerIds: string[]) => {
    setSelectedPlayers(playerIds);
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
      const errorMessage = await getEdgeFunctionErrorMessage(error);
      if (errorMessage.includes("PLAN_LIMIT_SUPPORTERS")) {
        if (handlePlanLimit({ message: errorMessage }, "supporters_per_team")) { setLoading(false); return; }
      }
      toast.error("Erreur lors de l'invitation", {
        description: errorMessage,
      });
    } finally {
      setLoading(false);
    }
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Heart className="w-5 h-5 text-primary" />
            </div>
            Ajouter un Supporter
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 mt-4">
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
