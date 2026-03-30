import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Trophy, Search, User } from "lucide-react";
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
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

const evaluationSchema = z.object({
  name: z.string().min(2, "Le nom doit contenir au moins 2 caractères").max(100),
  playerId: z.string().min(1, "Joueur requis"),
});

type EvaluationFormData = z.infer<typeof evaluationSchema>;

interface Team {
  id: string;
  name: string;
}

interface Player {
  id: string;
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
  team_id: string;
  team_name: string;
}

interface CreateEvaluationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  preselectedTeamId?: string;
}

export const CreateEvaluationModal = ({
  open,
  onOpenChange,
  onSuccess,
  preselectedTeamId,
}: CreateEvaluationModalProps) => {
  const { user, hasAdminRole: isAdmin } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [teams, setTeams] = useState<Team[]>([]);
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<string>("");
  const [searchPlayer, setSearchPlayer] = useState("");

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<EvaluationFormData>({
    resolver: zodResolver(evaluationSchema),
    defaultValues: {
      name: `Débrief ${new Date().toLocaleDateString("fr-FR")}`,
    },
  });

  const selectedPlayerId = watch("playerId");

  useEffect(() => {
    if (open) {
      fetchTeams();
    }
  }, [open]);

  useEffect(() => {
    if (preselectedTeamId) {
      setSelectedTeam(preselectedTeamId);
    } else if (selectedTeam && !teams.find(t => t.id === selectedTeam)) {
      setSelectedTeam("");
    }
  }, [preselectedTeamId, teams]);

  useEffect(() => {
    if (selectedTeam) {
      fetchPlayers(selectedTeam);
    }
  }, [selectedTeam]);

  const fetchTeams = async () => {
    // Get teams where user is a coach
    const { data } = await supabase
      .from("team_members")
      .select("team:teams(id, name)")
      .eq("user_id", user?.id)
      .eq("member_type", "coach")
      .eq("is_active", true);

    if (data) {
      const uniqueTeams = data
        .map((d: any) => d.team)
        .filter((t: any) => t !== null);
      setTeams(uniqueTeams);
      if (uniqueTeams.length === 1) {
        setSelectedTeam(uniqueTeams[0].id);
      }
    }
  };

  const fetchPlayers = async (teamId: string) => {
    const { data } = await supabase
      .from("team_members")
      .select(`
        user_id,
        team:teams(id, name),
        profile:profiles(id, first_name, last_name, nickname)
      `)
      .eq("team_id", teamId)
      .eq("member_type", "player")
      .eq("is_active", true);

    if (data) {
      const playersList: Player[] = data
        .filter((d: any) => d.profile)
        .map((d: any) => ({
          id: d.profile.id,
          first_name: d.profile.first_name,
          last_name: d.profile.last_name,
          nickname: d.profile.nickname,
          team_id: d.team?.id,
          team_name: d.team?.name,
        }));
      setPlayers(playersList);
    }
  };

  const filteredPlayers = players.filter((p) => {
    const name = p.nickname || `${p.first_name || ""} ${p.last_name || ""}`;
    return name.toLowerCase().includes(searchPlayer.toLowerCase());
  });

  const selectedPlayer = players.find((p) => p.id === selectedPlayerId);

  const generateUniqueName = async (baseName: string, playerId: string): Promise<string> => {
    // Check if an evaluation with this name already exists for this player
    const { data: existingEvaluations } = await supabase
      .from("evaluations")
      .select("name")
      .eq("player_id", playerId)
      .ilike("name", `${baseName}%`);

    if (!existingEvaluations || existingEvaluations.length === 0) {
      return baseName;
    }

    // Check if the exact name exists
    const exactMatch = existingEvaluations.some(e => e.name === baseName);
    if (!exactMatch) {
      return baseName;
    }

    // Generate unique name with number, date and time (for same-day evaluations)
    const now = new Date();
    const today = now.toLocaleDateString("fr-FR");
    const time = now.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    let counter = 2;
    let uniqueName = `${baseName} #${counter} - ${today} ${time}`;

    while (existingEvaluations.some(e => e.name === uniqueName)) {
      counter++;
      uniqueName = `${baseName} #${counter} - ${today} ${time}`;
    }

    return uniqueName;
  };

  const onSubmit = async (data: EvaluationFormData) => {
    if (!user) return;

    setLoading(true);
    try {
      // Get the team's framework
      const { data: framework } = await supabase
        .from("competence_frameworks")
        .select("id")
        .eq("team_id", selectedTeam)
        .eq("is_archived", false)
        .maybeSingle();

      if (!framework) {
        toast.error("Aucun référentiel de compétences trouvé pour cette équipe");
        setLoading(false);
        return;
      }

      // Generate unique name if needed
      const uniqueName = await generateUniqueName(data.name, data.playerId);

      // Create the evaluation
      const { data: evaluation, error } = await supabase
        .from("evaluations")
        .insert({
          name: uniqueName,
          player_id: data.playerId,
          coach_id: user.id,
          framework_id: framework.id,
        })
        .select()
        .single();

      if (error) throw error;

      toast.success("Débrief créé !");
      reset();
      onOpenChange(false);
      onSuccess?.();

      // Navigate to player detail page to fill the evaluation
      navigate(`/players/${data.playerId}?evaluation=${evaluation.id}`);
    } catch (error: any) {
      console.error("Error creating evaluation:", error);
      toast.error("Erreur lors de la création", {
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Trophy className="w-5 h-5 text-primary" />
            </div>
            Nouveau Débrief
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 mt-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nom du débrief</Label>
            <Input
              id="name"
              placeholder="Débrief mi-saison"
              {...register("name")}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>

          {teams.length > 1 && !preselectedTeamId && (
            <div className="space-y-2">
              <Label>Équipe</Label>
              <Select value={selectedTeam} onValueChange={setSelectedTeam}>
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
            </div>
          )}

          {preselectedTeamId && teams.find(t => t.id === preselectedTeamId) && (
            <div className="space-y-2">
              <Label>Équipe</Label>
              <div className="p-2 rounded-lg bg-muted/50 text-sm font-medium">
                {teams.find(t => t.id === preselectedTeamId)?.name}
              </div>
            </div>
          )}

          {teams.length === 0 && (
            <div className="p-4 rounded-lg bg-muted/50 text-center">
              <p className="text-sm text-muted-foreground">
                Vous n'êtes coach d'aucune équipe.
              </p>
            </div>
          )}

          {selectedTeam && (
            <div className="space-y-2">
              <Label>Joueur</Label>
              <div className="relative mb-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Rechercher un joueur..."
                  value={searchPlayer}
                  onChange={(e) => setSearchPlayer(e.target.value)}
                  className="pl-10"
                />
              </div>
              
              <div className="max-h-48 overflow-y-auto space-y-1 border border-border rounded-lg p-2">
                {filteredPlayers.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    {players.length === 0
                      ? "Aucun joueur dans cette équipe"
                      : "Aucun joueur trouvé"}
                  </p>
                ) : (
                  filteredPlayers.map((player) => {
                    const name = player.nickname ||
                      `${player.first_name || ""} ${player.last_name || ""}`.trim();
                    const isSelected = selectedPlayerId === player.id;

                    return (
                      <div
                        key={player.id}
                        className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${
                          isSelected
                            ? "bg-primary/20 border border-primary/30"
                            : "hover:bg-muted/50"
                        }`}
                        onClick={() => setValue("playerId", player.id)}
                      >
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <User className="w-4 h-4 text-primary" />
                        </div>
                        <span className="font-medium">{name || "Joueur"}</span>
                      </div>
                    );
                  })
                )}
              </div>
              {errors.playerId && (
                <p className="text-sm text-destructive">{errors.playerId.message}</p>
              )}
            </div>
          )}

          {/* Preview */}
          {selectedPlayer && (
            <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/30">
              <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center">
                <User className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="font-medium">
                  {selectedPlayer.nickname ||
                    `${selectedPlayer.first_name || ""} ${selectedPlayer.last_name || ""}`.trim()}
                </p>
                <p className="text-sm text-muted-foreground">
                  {selectedPlayer.team_name}
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
            <Button
              type="submit"
              disabled={loading || !selectedPlayerId || teams.length === 0}
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              ) : (
                "Commencer le débrief"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
