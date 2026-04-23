/**
 * @modal CreateEvaluationModal
 * @description Modale de création d'un nouveau débrief (évaluation officielle).
 *              S'adapte au contexte d'ouverture : depuis une équipe (joueur pré-rempli),
 *              depuis la fiche joueur (équipe pré-remplie) ou depuis la recherche globale.
 * @access Coachs assignés, Responsables Club, Super Admin
 * @features
 *  - Sélection en cascade : équipe → joueur → référentiel
 *  - Combobox de recherche pour chaque entité (mem://style/ui-patterns/entity-selection)
 *  - Génération automatique d'un nom de débrief (date + joueur)
 *  - Snapshot JSONB du référentiel créé en parallèle (cf. framework_snapshots)
 *  - Vérification limite plan (max_coach_evals_per_player)
 *  - Redirection automatique vers le formulaire après création
 * @maintenance
 *  - Logique d'adaptation contextuelle : mem://features/evaluation-creation-context
 *  - evaluator_id défini par auth.uid() (mem://technical/evaluation-structure)
 *  - Snapshot automatique : mem://technical/framework-snapshot-system
 */
import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
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
import { usePlanLimitHandler } from "@/hooks/usePlanLimitHandler";
import { typedZodResolver } from "@/lib/typed-zod-resolver";

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
  const { user, hasAdminRole: isAdmin, roles } = useAuth();
  // Clubs where the user is club_admin (full scope on those clubs)
  const clubAdminClubIds = useMemo(
    () =>
      roles
        .filter((r) => r.role === "club_admin" && r.club_id)
        .map((r) => r.club_id as string),
    [roles]
  );
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const { handle: handlePlanLimit, dialog: planLimitDialog } = usePlanLimitHandler();
  const [searchPlayer, setSearchPlayer] = useState("");
  const [clubFilter, setClubFilter] = useState("all");
  const [teamFilter, setTeamFilter] = useState("all");
  const [coachFilter, setCoachFilter] = useState("all");

  // All players with their team/club/coach info
  const [allPlayers, setAllPlayers] = useState<{
    id: string;
    first_name: string | null;
    last_name: string | null;
    nickname: string | null;
    team_id: string;
    team_name: string;
    club_id: string | null;
    club_name: string | null;
    coaches: { id: string; name: string }[];
  }[]>([]);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<EvaluationFormData>({
    resolver: typedZodResolver<EvaluationFormData>(evaluationSchema),
    defaultValues: {
      name: `Débrief ${new Date().toLocaleDateString("fr-FR")}`,
    },
  });

  const selectedPlayerId = watch("playerId");

  useEffect(() => {
    if (open) {
      fetchAllData();
    }
  }, [open]);

  // Reset cascading filters
  useEffect(() => { setTeamFilter("all"); setCoachFilter("all"); }, [clubFilter]);
  useEffect(() => { setCoachFilter("all"); }, [teamFilter]);

  const fetchAllData = async () => {
    // Fetch all team members (players + coaches)
    const { data: teamMembers } = await supabase
      .from("team_members")
      .select(`
        user_id,
        team_id,
        member_type,
        teams:team_id (id, name, club_id, clubs:club_id (id, name))
      `)
      .eq("is_active", true);

    if (!teamMembers) return;

    const playerMembers = teamMembers.filter((tm) => tm.member_type === "player");
    const coachMembers = teamMembers.filter((tm) => tm.member_type === "coach");

    // Scope filtering:
    // - super admin: all data (no filter)
    // - club_admin: all teams of their club(s)
    // - coach: only teams where they are coach
    let relevantPlayerMembers = playerMembers;
    if (!isAdmin) {
      const coachTeamIds = new Set(
        coachMembers.filter((cm) => cm.user_id === user?.id).map((cm) => cm.team_id)
      );
      relevantPlayerMembers = playerMembers.filter((pm) => {
        const team = pm.teams as any;
        const teamClubId = team?.club_id;
        if (teamClubId && clubAdminClubIds.includes(teamClubId)) return true;
        return coachTeamIds.has(pm.team_id);
      });
    }

    const userIds = [...new Set(relevantPlayerMembers.map((tm) => tm.user_id))];
    if (userIds.length === 0) { setAllPlayers([]); return; }

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, nickname")
      .in("id", userIds)
      .is("deleted_at", null);

    // Coach profiles for filter
    const coachUserIds = [...new Set(coachMembers.map((tm) => tm.user_id))];
    let coachProfiles: Record<string, string> = {};
    if (coachUserIds.length > 0) {
      const { data: cProfiles } = await supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .in("id", coachUserIds);
      if (cProfiles) {
        cProfiles.forEach((p) => {
          coachProfiles[p.id] = `${p.first_name || ""} ${p.last_name || ""}`.trim();
        });
      }
    }

    const playersList = (profiles || []).flatMap((profile) => {
      const memberEntries = relevantPlayerMembers.filter((tm) => tm.user_id === profile.id && tm.teams);
      return memberEntries.map((tm) => {
        const team = tm.teams as any;
        const playerTeamCoaches = coachMembers
          .filter((cm) => cm.team_id === tm.team_id)
          .map((cm) => ({ id: cm.user_id, name: coachProfiles[cm.user_id] || "Coach" }));
        const uniqueCoaches = Array.from(new Map(playerTeamCoaches.map((c) => [c.id, c])).values());

        return {
          id: profile.id,
          first_name: profile.first_name,
          last_name: profile.last_name,
          nickname: profile.nickname,
          team_id: team?.id,
          team_name: team?.name || "",
          club_id: team?.club_id || null,
          club_name: team?.clubs?.name || null,
          coaches: uniqueCoaches,
        };
      });
    });

    // Deduplicate by player id (keep first entry, merge info)
    const uniqueMap = new Map<string, typeof playersList[0]>();
    playersList.forEach((p) => {
      if (!uniqueMap.has(p.id)) uniqueMap.set(p.id, p);
    });

    setAllPlayers(playersList);

    // If preselectedTeamId, set team filter
    if (preselectedTeamId) {
      setTeamFilter(preselectedTeamId);
    }
  };

  // Unique clubs, teams, coaches for filter dropdowns
  const uniqueClubs = useMemo(() => {
    const map = new Map<string, string>();
    allPlayers.forEach((p) => { if (p.club_id && p.club_name) map.set(p.club_id, p.club_name); });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [allPlayers]);

  const uniqueTeams = useMemo(() => {
    const map = new Map<string, string>();
    allPlayers.forEach((p) => {
      if (clubFilter !== "all" && p.club_id !== clubFilter) return;
      if (p.team_id && p.team_name) map.set(p.team_id, p.team_name);
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [allPlayers, clubFilter]);

  const uniqueCoaches = useMemo(() => {
    const map = new Map<string, string>();
    allPlayers.forEach((p) => {
      if (clubFilter !== "all" && p.club_id !== clubFilter) return;
      if (teamFilter !== "all" && p.team_id !== teamFilter) return;
      p.coaches.forEach((c) => map.set(c.id, c.name));
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [allPlayers, clubFilter, teamFilter]);

  const filteredPlayers = useMemo(() => {
    // Deduplicate by player id after filtering
    const filtered = allPlayers.filter((p) => {
      if (clubFilter !== "all" && p.club_id !== clubFilter) return false;
      if (teamFilter !== "all" && p.team_id !== teamFilter) return false;
      if (coachFilter !== "all" && !p.coaches.some((c) => c.id === coachFilter)) return false;
      if (searchPlayer.trim()) {
        const term = searchPlayer.toLowerCase();
        const name = `${p.first_name || ""} ${p.last_name || ""} ${p.nickname || ""} ${p.team_name || ""}`.toLowerCase();
        if (!name.includes(term)) return false;
      }
      return true;
    });
    // Deduplicate by player id
    const seen = new Set<string>();
    return filtered.filter((p) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
  }, [allPlayers, clubFilter, teamFilter, coachFilter, searchPlayer]);

  const selectedPlayer = allPlayers.find((p) => p.id === selectedPlayerId);

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
      // Find the player's team to get the framework
      const playerEntry = allPlayers.find((p) => p.id === data.playerId);
      const playerTeamId = teamFilter !== "all" ? teamFilter : playerEntry?.team_id;

      if (!playerTeamId) {
        toast.error("Impossible de déterminer l'équipe du joueur");
        setLoading(false);
        return;
      }

      const { data: framework } = await supabase
        .from("competence_frameworks")
        .select("id")
        .eq("team_id", playerTeamId)
        .eq("is_archived", false)
        .maybeSingle();

      if (!framework) {
        toast.error("Aucun référentiel de compétences trouvé pour cette équipe");
        setLoading(false);
        return;
      }

      const uniqueName = await generateUniqueName(data.name, data.playerId);

      const { data: evaluation, error } = await supabase
        .from("evaluations")
        .insert({
          name: uniqueName,
          player_id: data.playerId,
          evaluator_id: user.id,
          framework_id: framework.id,
        })
        .select()
        .single();

      if (error) throw error;

      toast.success("Débrief créé !");
      reset();
      onOpenChange(false);
      onSuccess?.();
      navigate(`/players/${data.playerId}?evaluation=${evaluation.id}`);
    } catch (error: any) {
      console.error("Error creating evaluation:", error);
      if (handlePlanLimit(error, "coach_evals")) {
        setLoading(false);
        return;
      }
      toast.error("Erreur lors de la création", {
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Trophy className="w-5 h-5 text-primary" />
            </div>
            Nouveau Débrief
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-4">
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

          {/* Filters */}
          <div className="space-y-2">
            <Label>Rechercher un joueur</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher un joueur..."
                value={searchPlayer}
                onChange={(e) => setSearchPlayer(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Select value={clubFilter} onValueChange={setClubFilter}>
                <SelectTrigger className="text-xs h-9">
                  <SelectValue placeholder="Tous les clubs" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les clubs</SelectItem>
                  {uniqueClubs.map(([id, name]) => (
                    <SelectItem key={id} value={id}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={teamFilter} onValueChange={setTeamFilter}>
                <SelectTrigger className="text-xs h-9">
                  <SelectValue placeholder="Toutes les équipes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Toutes les équipes</SelectItem>
                  {uniqueTeams.map(([id, name]) => (
                    <SelectItem key={id} value={id}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={coachFilter} onValueChange={setCoachFilter}>
                <SelectTrigger className="text-xs h-9">
                  <SelectValue placeholder="Tous les coachs" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les coachs</SelectItem>
                  {uniqueCoaches.map(([id, name]) => (
                    <SelectItem key={id} value={id}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Player list */}
          {allPlayers.length === 0 && !isAdmin ? (
            <div className="p-4 rounded-lg bg-muted/50 text-center">
              <p className="text-sm text-muted-foreground">
                Vous n'êtes coach d'aucune équipe.
              </p>
            </div>
          ) : (
            <div className="max-h-48 overflow-y-auto space-y-1 border border-border rounded-lg p-2 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
              {filteredPlayers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {searchPlayer ? "Aucun joueur trouvé" : "Aucun joueur disponible"}
                </p>
              ) : (
                filteredPlayers.map((player) => {
                  const name = player.nickname ||
                    `${player.first_name || ""} ${player.last_name || ""}`.trim();
                  const isSelected = selectedPlayerId === player.id;

                  return (
                    <div
                      key={`${player.id}-${player.team_id}`}
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
                      <div className="flex flex-col">
                        <span className="font-medium text-sm">{name || "Joueur"}</span>
                        <span className="text-xs text-muted-foreground">{player.team_name}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
          {errors.playerId && (
            <p className="text-sm text-destructive">{errors.playerId.message}</p>
          )}

          {/* Preview */}
          {selectedPlayer && (
            <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/30">
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                <User className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="font-medium text-sm">
                  {selectedPlayer.nickname ||
                    `${selectedPlayer.first_name || ""} ${selectedPlayer.last_name || ""}`.trim()}
                </p>
                <p className="text-xs text-muted-foreground">
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
              disabled={loading || !selectedPlayerId || allPlayers.length === 0}
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
    {planLimitDialog}
    </>
  );
};
