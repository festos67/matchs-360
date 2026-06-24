/**
 * @component AddRoleSection
 * @description Section embeddable dans les modales d'édition utilisateur permettant
 *              de cumuler des rôles supplémentaires (ex: joueur → ajouter coach).
 *              Réactive les team_members existants pour éviter les conflits d'index.
 * @props
 *  - userId / clubId / currentRole / onRoleAdded
 * @features
 *  - Sélecteur de rôle disponible (rôles non encore attribués)
 *  - Si rôle = coach : sélection équipe(s) + rôle Référent/Assistant
 *  - Si rôle = player : sélection équipe avec vérif limites plan
 *  - Si rôle = supporter : sélection joueur(s) à supporter
 *  - Réactivation team_members.deleted_at = NULL si existant
 *  - Création user_roles entry
 * @maintenance
 *  - Réactivation pour éviter doublons : mem://features/user-role-management/edit-flow
 *  - Mode promotion : mem://features/user-role-management/promotion-mode
 *  - Index unique métier : mem://technical/database-integrity
 */
import { useState, useEffect, useMemo, useRef } from "react";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Plus, X, ShieldCheck, Check, ChevronsUpDown } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

interface UserRole {
  id: string;
  role: string;
  club_id: string | null;
  club_name?: string | null;
}

interface DisplayRole {
  key: string;
  role: string;
  label: string;
  context?: string;
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
  const [displayRoles, setDisplayRoles] = useState<DisplayRole[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newRole, setNewRole] = useState("");
  const [selectedTeam, setSelectedTeam] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState("");
  const [coachRole, setCoachRole] = useState<"referent" | "assistant">("assistant");
  const [teams, setTeams] = useState<Team[]>([]);
  const [players, setPlayers] = useState<PlayerOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (showAddForm && formRef.current) {
      // Wait for layout (form expansion) before scrolling into view
      requestAnimationFrame(() => {
        formRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      });
    }
  }, [showAddForm]);

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
        club_name: null as string | null,
      })));

      const display: DisplayRole[] = [];

      // 1) club_admin / admin viennent de user_roles
      (data || []).forEach((r) => {
        if (r.role === "club_admin" || r.role === "admin") {
          display.push({
            key: `ur-${r.id}`,
            role: r.role,
            label: roleLabels[r.role] || r.role,
          });
        }
      });

      // 2) Coach / Player : source de vérité = team_members actifs
      const { data: memberships } = await supabase
        .from("team_members")
        .select("id, member_type, coach_role, team:teams(name)")
        .eq("user_id", userId)
        .eq("is_active", true)
        .is("deleted_at", null);

      (memberships || []).forEach((m: any) => {
        if (m.member_type === "player") {
          display.push({
            key: `tm-${m.id}`,
            role: "player",
            label: "Joueur",
            context: m.team?.name,
          });
        } else if (m.member_type === "coach") {
          const suffix = m.coach_role === "referent" ? "Référent" : "Assistant";
          display.push({
            key: `tm-${m.id}`,
            role: "coach",
            label: `Coach ${suffix}`,
            context: m.team?.name,
          });
        }
      });

      // 3) Supporter : lien supporters_link → préciser le joueur suivi
      const { data: supporterLinks } = await supabase
        .from("supporters_link")
        .select("id, player:profiles!supporters_link_player_id_fkey(first_name, last_name, nickname)")
        .eq("supporter_id", userId);

      (supporterLinks || []).forEach((l: any) => {
        const p = l.player;
        const name = p
          ? p.nickname || `${p.first_name || ""} ${p.last_name || ""}`.trim() || "joueur"
          : "joueur";
        display.push({
          key: `sl-${l.id}`,
          role: "supporter",
          label: "Supporter",
          context: `de ${name}`,
        });
      });

      // Si aucune source détaillée mais user_roles contient un rôle, l'afficher en repli
      (data || []).forEach((r) => {
        if (r.role === "player" && !display.some((d) => d.role === "player")) {
          display.push({ key: `ur-${r.id}`, role: "player", label: "Joueur" });
        }
        if (r.role === "coach" && !display.some((d) => d.role === "coach")) {
          display.push({ key: `ur-${r.id}`, role: "coach", label: "Coach" });
        }
        if (r.role === "supporter" && !display.some((d) => d.role === "supporter")) {
          display.push({ key: `ur-${r.id}`, role: "supporter", label: "Supporter" });
        }
      });

      setDisplayRoles(display);
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
        const newMemberType = newRole === "coach" ? "coach" : "player";

        // Vérifier s'il existe déjà un enregistrement pour ce user+team (peu importe le member_type)
        const { data: existingAny } = await supabase
          .from("team_members")
          .select("id, is_active, member_type")
          .eq("user_id", userId)
          .eq("team_id", selectedTeam)
          .maybeSingle();

        if (existingAny) {
          // Mettre à jour l'enregistrement existant (réactiver + changer le type si nécessaire)
          const { error: updateErr } = await supabase
            .from("team_members")
            .update({
              is_active: true,
              left_at: null,
              member_type: newMemberType,
              coach_role: newRole === "coach" ? coachRole : null,
              joined_at: new Date().toISOString(),
              archived_reason: null,
            })
            .eq("id", existingAny.id);
          if (updateErr) throw updateErr;
        } else {
          const { error: insertErr } = await supabase.from("team_members").insert({
            user_id: userId,
            team_id: selectedTeam,
            member_type: newMemberType,
            coach_role: newRole === "coach" ? coachRole : null,
            is_active: true,
          });
          if (insertErr) throw insertErr;
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
          const { error: linkErr } = await supabase.from("supporters_link").insert({
            supporter_id: userId,
            player_id: selectedPlayer,
          });
          if (linkErr) throw linkErr;
        }
      }

      toast.success(`Rôle "${roleLabels[newRole] || newRole}" ajouté`);
      // Notifier l'utilisateur existant par email (best-effort)
      supabase.functions
        .invoke("notify-role-added", { body: { userId, role: newRole, clubId } })
        .catch(() => { /* best-effort : ne pas bloquer l'ajout */ });
      resetForm();
      fetchExistingRoles();
      onRoleAdded?.();
    } catch (error: any) {
      console.error("Error adding role:", error);
      const raw = String(error?.message || "");
      const isPermission =
        error?.code === "42501" ||
        /row-level security|permission denied|violates row-level/i.test(raw);

      if (isPermission && newRole === "supporter") {
        toast.error("Action non autorisée", {
          description:
            "Seuls les responsables de club et les coachs référents peuvent attribuer le rôle Supporter. En tant que coach assistant, demandez à un coach référent ou au responsable du club.",
        });
      } else if (isPermission) {
        toast.error("Action non autorisée", {
          description:
            "Vous n'avez pas les droits pour attribuer ce rôle. Cette action est réservée aux responsables de club et aux coachs référents (selon le rôle).",
        });
      } else {
        toast.error("Erreur lors de l'ajout du rôle", {
          description: raw,
        });
      }
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

  // Rôles disponibles :
  // - Toujours exclure "admin" (super admin) et "club_admin"
  //   (la promotion responsable club se fait via les paramètres du club)
  // - Si l'utilisateur cible est déjà joueur, on ne propose pas un 2ᵉ rôle joueur
  //   (un joueur ne peut pas cumuler deux rôles "Joueur")
  const alreadyPlayer =
    currentRole === "player" || displayRoles.some((r) => r.role === "player");
  const availableRoles = Object.keys(roleLabels).filter((role) => {
    if (role === "admin" || role === "club_admin") return false;
    if (role === "player" && alreadyPlayer) return false;
    return true;
  });

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
        {displayRoles.map((r) => (
          <Badge
            key={r.key}
            className={roleColors[r.role] || "bg-muted text-foreground"}
          >
            {r.label}
            {r.context ? ` · ${r.context}` : ""}
          </Badge>
        ))}
        {displayRoles.length === 0 && (
          <span className="text-sm text-muted-foreground">Aucun rôle attribué</span>
        )}
      </div>

      {/* Formulaire d'ajout */}
      {showAddForm && (
        <div ref={formRef} className="border rounded-lg p-3 space-y-3 bg-muted/30 scroll-mb-4">
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
              <PlayerSearchSelect
                players={players}
                value={selectedPlayer}
                onChange={setSelectedPlayer}
              />
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

function PlayerSearchSelect({ players, value, onChange }: { players: PlayerOption[]; value: string; onChange: (v: string) => void }) {
  const [search, setSearch] = useState("");
  const selectedName = players.find((p) => p.id === value)?.name || "";

  const filtered = useMemo(() => {
    if (!search.trim()) return players;
    const q = search.toLowerCase();
    return players.filter((p) => p.name.toLowerCase().includes(q));
  }, [players, search]);

  return (
    <div className="space-y-2">
      <input
        type="text"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          // Clear selection if user is typing something new
          if (value && e.target.value.toLowerCase() !== selectedName.toLowerCase()) {
            onChange("");
          }
        }}
        placeholder="Rechercher un joueur…"
        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
      <Select
        value={value}
        onValueChange={(v) => {
          onChange(v);
          const name = players.find((p) => p.id === v)?.name || "";
          setSearch(name);
        }}
      >
        <SelectTrigger className="h-9">
          <SelectValue placeholder={filtered.length === 0 ? "Aucun joueur trouvé" : "Sélectionner un joueur"} />
        </SelectTrigger>
        <SelectContent>
          {filtered.map((player) => (
            <SelectItem key={player.id} value={player.id}>
              {player.name}
            </SelectItem>
          ))}
          {filtered.length === 0 && (
            <div className="px-2 py-1.5 text-sm text-muted-foreground">Aucun joueur trouvé</div>
          )}
        </SelectContent>
      </Select>
    </div>
  );
}