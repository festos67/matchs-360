import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { User, AlertTriangle } from "lucide-react";
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
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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

  const fetchTeams = async () => {
    const { data } = await supabase
      .from("teams")
      .select("id, name")
      .eq("club_id", clubId)
      .order("name");
    
    if (data) setTeams(data);
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

      toast.success(`Joueur invité avec succès !`, {
        description: `Une invitation a été envoyée à ${data.email}`,
      });
      
      reset();
      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      console.error("Error inviting player:", error);
      
      // Handle mutation case
      if (error.message.includes("déjà dans une équipe") && !force) {
        setPendingSubmit(data);
        setShowMutationAlert(true);
        setLoading(false);
        return;
      }

      toast.error("Erreur lors de l'invitation", {
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

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <User className="w-5 h-5 text-primary" />
              </div>
              Ajouter un Joueur
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit((d) => onSubmit(d))} className="space-y-6 mt-4">
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

            <div className="space-y-2">
              <Label>Équipe</Label>
              <Select 
                value={watch("teamId")}
                onValueChange={(value) => setValue("teamId", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionner une équipe" />
                </SelectTrigger>
                <SelectContent>
                  {teams.map((team) => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.teamId && (
                <p className="text-sm text-destructive">{errors.teamId.message}</p>
              )}
              <p className="text-xs text-muted-foreground">
                Un joueur ne peut appartenir qu'à une seule équipe
              </p>
            </div>

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
                    {selectedTeam?.name || "Équipe non sélectionnée"}
                  </p>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t border-border">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
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
    </>
  );
};
