import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, X, ShieldCheck } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

interface UserRole {
  id: string;
  role: string;
  club_id: string | null;
  club_name?: string | null;
}

interface Team {
  id: string;
  name: string;
}

interface PlayerOption {
  id: string;
  name: string;
}

interface AddRoleSectionProps {
  userId: string;
  clubId: string;
  /** Rôle actuel principal de l'utilisateur (pour l'exclure de la liste) */
  currentRole: string;
  onRoleAdded?: () => void;
}

const roleLabels: Record<string, string> = {
  club_admin: "Responsable club",
  coach: "Coach",
  player: "Joueur",
  supporter: "Supporter",
};

const roleColors: Record<string, string> = {
  club_admin: "bg-blue-500 text-white",
  coach: "bg-green-500 text-white",
  player: "bg-orange-500 text-white",
  supporter: "bg-purple-500 text-white",
};

export function AddRoleSection({ userId, clubId, currentRole, onRoleAdded }: AddRoleSectionProps) {
  const { hasAdminRole: isAdmin } = useAuth();
  const [existingRoles, setExistingRoles] = useState<UserRole[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newRole, setNewRole] = useState("");
  const [selectedTeam, setSelectedTeam] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState("");
  const [coachRole, setCoachRole] = useState<"referent" | "assistant">("assistant");
  const [teams, setTeams] = useState<Team[]>([]);
  const [players, setPlayers] = useState<PlayerOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchExistingRoles();
  }, [userId]);

  useEffect(() => {
    if (newRole === "coach" || newRole === "player") {
      fetchTeams();
    }
    if (newRole === "supporter") {
      fetchPlayers();
    }
  }, [newRole]);

  const fetchExistingRoles = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("user_roles")
        .select("id, role, club_id")
        .eq("user_id", userId);

      if (error) throw error;
      setExistingRoles((data || []).map((r) => ({
        ...r,
        club_name: null,
      })));
    } catch (error) {
      console.error("Error fetching roles:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTeams = async () => {
    const { data } = await supabase
      .from("teams")
      .select("id, name")
      .eq("club_id", clubId)
      .is("deleted_at", null)
      .order("name");
    setTeams(data || []);
  };

  const fetchPlayers = async () => {
    const { data } = await supabase
      .from("team_members")
      .select(`
        user_id,
        profiles:user_id (id, first_name, last_name, nickname)
      `)
      .eq("member_type", "player")
      .eq("is_active", true);

    const playerList: PlayerOption[] = (data || [])
      .filter((tm: any) => tm.profiles && tm.user_id !== userId)
      .map((tm: any) => ({
        id: tm.profiles.id,
        name: tm.profiles.nickname || `${tm.profiles.first_name || ""} ${tm.profiles.last_name || ""}`.trim() || "Joueur",
      }));

    const unique = playerList.filter(
      (p, i, self) => self.findIndex((x) => x.id === p.id) === i
    );
    setPlayers(unique);
  };

  const handleAddRole = async () => {
    setSaving(true);
    try {
      // 1. Ajouter dans user_roles
      const roleExists = existingRoles.some(
        (r) => r.role === newRole && (r.club_id === clubId || newRole === "supporter")
      );

      if (!roleExists) {
        const { error } = await supabase
          .from("user_roles")
          .insert({
            user_id: userId,
            role: newRole as any,
            club_id: clubId,
          });
        if (error) throw error;
      }

      // 2. Ajouter dans team_members si nécessaire
      if ((newRole === "coach" || newRole === "player") && selectedTeam) {
        // Vérifier s'il existe déjà
        const { data: existing } = await supabase
          .from("team_members")
          .select("id, is_active")
          .eq("user_id", userId)
          .eq("team_id", selectedTeam)
          .eq("member_type", newRole === "coach" ? "coach" : "player")
          .maybeSingle();

        if (existing && !existing.is_active) {
          await supabase
            .from("team_members")
            .update({
              is_active: true,
              left_at: null,
              coach_role: newRole === "coach" ? coachRole : null,
              joined_at: new Date().toISOString(),
            })
            .eq("id", existing.id);
        } else if (!existing) {
          await supabase.from("team_members").insert({
            user_id: userId,
            team_id: selectedTeam,
            member_type: newRole === "coach" ? "coach" : "player",
            coach_role: newRole === "coach" ? coachRole : null,
            is_active: true,
          });
        }
      }

      // 3. Ajouter lien supporter si nécessaire
      if (newRole === "supporter" && selectedPlayer) {
        const { data: existingLink } = await supabase
          .from("supporters_link")
          .select("id")
          .eq("supporter_id", userId)
          .eq("player_id", selectedPlayer)
          .maybeSingle();

        if (!existingLink) {
          await supabase.from("supporters_link").insert({
            supporter_id: userId,
            player_id: selectedPlayer,
          });
        }
      }

      toast.success(`Rôle "${roleLabels[newRole] || newRole}" ajouté`);
      resetForm();
      fetchExistingRoles();
      onRoleAdded?.();
    } catch (error: any) {
      console.error("Error adding role:", error);
      toast.error("Erreur lors de l'ajout du rôle", {
        description: error.message,
      });
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setShowAddForm(false);
    setNewRole("");
    setSelectedTeam("");
    setSelectedPlayer("");
    setCoachRole("assistant");
  };

  // Rôles disponibles (exclure le rôle actuel et admin)
  const availableRoles = Object.keys(roleLabels).filter(
    (role) => role !== "admin"
  );

  const needsTeam = newRole === "coach" || newRole === "player";
  const needsPlayer = newRole === "supporter";

  const canSubmit =
    newRole &&
    (!needsTeam || selectedTeam) &&
    (!needsPlayer || selectedPlayer);

  if (loading) return null;

  return (
    <div className="space-y-3">
      <Separator />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-muted-foreground" />
          <Label className="text-sm font-semibold">Rôles</Label>
        </div>
        {!showAddForm && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setShowAddForm(true)}
            className="gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            Ajouter un rôle
          </Button>
        )}
      </div>

      {/* Rôles existants */}
      <div className="flex flex-wrap gap-1.5">
        {existingRoles.map((role) => (
          <Badge
            key={role.id}
            className={roleColors[role.role] || "bg-muted text-foreground"}
          >
            {roleLabels[role.role] || role.role}
          </Badge>
        ))}
        {existingRoles.length === 0 && (
          <span className="text-sm text-muted-foreground">Aucun rôle attribué</span>
        )}
      </div>

      {/* Formulaire d'ajout */}
      {showAddForm && (
        <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
          <p className="text-sm font-medium">Ajouter un nouveau rôle</p>

          <div className="space-y-2">
            <Label className="text-xs">Type de rôle</Label>
            <Select value={newRole} onValueChange={setNewRole}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Sélectionner un rôle" />
              </SelectTrigger>
              <SelectContent>
                {availableRoles.map((role) => (
                  <SelectItem key={role} value={role}>
                    {roleLabels[role]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {needsTeam && (
            <div className="space-y-2">
              <Label className="text-xs">Équipe</Label>
              <Select value={selectedTeam} onValueChange={setSelectedTeam}>
                <SelectTrigger className="h-9">
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

          {newRole === "coach" && selectedTeam && (
            <div className="space-y-2">
              <Label className="text-xs">Type de coach</Label>
              <Select
                value={coachRole}
                onValueChange={(v) => setCoachRole(v as "referent" | "assistant")}
              >
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="assistant">Assistant</SelectItem>
                  <SelectItem value="referent">Référent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {needsPlayer && (
            <div className="space-y-2">
              <Label className="text-xs">Joueur à suivre</Label>
              <Select value={selectedPlayer} onValueChange={setSelectedPlayer}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Sélectionner un joueur" />
                </SelectTrigger>
                <SelectContent>
                  {players.map((player) => (
                    <SelectItem key={player.id} value={player.id}>
                      {player.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              size="sm"
              onClick={handleAddRole}
              disabled={saving || !canSubmit}
            >
              {saving ? "Ajout..." : "Ajouter"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={resetForm}
            >
              Annuler
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}