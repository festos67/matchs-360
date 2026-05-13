/**
 * @component CertificatePlayerPickerDialog
 * @description Dialog déclenché depuis la sidebar (raccourci coach / club admin)
 *              pour sélectionner un joueur puis naviguer vers sa fiche
 *              avec ?certificate=1, ce qui ouvre la modale d'attestation.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Award, Search } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useClubAdminScope } from "@/hooks/useClubAdminScope";

interface PlayerRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
  team_id: string;
  team_name: string;
  club_id: string | null;
  coaches: { id: string; name: string }[];
}

interface CertificatePlayerPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CertificatePlayerPickerDialog({ open, onOpenChange }: CertificatePlayerPickerDialogProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isSuperAdmin, myAdminClubIds } = useClubAdminScope();
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [teamFilter, setTeamFilter] = useState("all");
  const [coachFilter, setCoachFilter] = useState("all");

  useEffect(() => {
    if (!open) return;
    setTeamFilter("all");
    setCoachFilter("all");
    setLoading(true);
    (async () => {
      // 1. All active team_members (players + coaches) in scope
      const { data: members } = await supabase
        .from("team_members")
        .select("user_id, team_id, member_type, coach_role, teams:team_id (id, name, club_id)")
        .eq("is_active", true)
        .is("deleted_at", null);
      const all = members || [];
      const playerMembers = all.filter((m: any) => m.member_type === "player");
      const coachMembers = all.filter((m: any) => m.member_type === "coach");

      // 2. Determine teams the current user is allowed to certify
      // - super admin: all teams
      // - club_admin: all teams of their club(s)
      // - referent coach: only teams where they are coach_role='referent'
      const allowedTeamIds = new Set<string>();
      if (isSuperAdmin) {
        all.forEach((m: any) => m.team_id && allowedTeamIds.add(m.team_id));
      } else {
        all.forEach((m: any) => {
          const clubId = (m.teams as any)?.club_id;
          if (clubId && myAdminClubIds.includes(clubId)) allowedTeamIds.add(m.team_id);
        });
        coachMembers.forEach((m: any) => {
          if (m.user_id === user?.id && m.coach_role === "referent") {
            allowedTeamIds.add(m.team_id);
          }
        });
      }

      const scopedPlayers = playerMembers.filter((m: any) => allowedTeamIds.has(m.team_id));
      const ids = Array.from(new Set(scopedPlayers.map((m: any) => m.user_id))).filter(Boolean);
      if (ids.length === 0) { setPlayers([]); setLoading(false); return; }

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, nickname")
        .in("id", ids)
        .is("deleted_at", null);

      // Coach profile names for filter labels
      const coachIds = Array.from(new Set(coachMembers.map((m: any) => m.user_id)));
      const coachNameMap: Record<string, string> = {};
      if (coachIds.length > 0) {
        const { data: cProfiles } = await supabase
          .from("profiles")
          .select("id, first_name, last_name")
          .in("id", coachIds);
        (cProfiles || []).forEach((p: any) => {
          coachNameMap[p.id] = `${p.first_name || ""} ${p.last_name || ""}`.trim() || "Coach";
        });
      }

      const profileMap = new Map<string, any>((profiles || []).map((p: any) => [p.id, p]));
      const rows: PlayerRow[] = scopedPlayers.flatMap((m: any) => {
        const profile = profileMap.get(m.user_id);
        if (!profile) return [];
        const team = m.teams as any;
        const coachesForTeam = coachMembers
          .filter((c: any) => c.team_id === m.team_id)
          .map((c: any) => ({ id: c.user_id, name: coachNameMap[c.user_id] || "Coach" }));
        const uniqueCoaches = Array.from(new Map(coachesForTeam.map((c) => [c.id, c])).values());
        return [{
          id: profile.id,
          first_name: profile.first_name,
          last_name: profile.last_name,
          nickname: profile.nickname,
          team_id: m.team_id,
          team_name: team?.name || "",
          club_id: team?.club_id || null,
          coaches: uniqueCoaches,
        }];
      });
      setPlayers(rows);
      setLoading(false);
    })();
  }, [open, isSuperAdmin, myAdminClubIds, user?.id]);

  // Reset coach filter when team changes
  useEffect(() => { setCoachFilter("all"); }, [teamFilter]);

  const uniqueTeams = useMemo(() => {
    const map = new Map<string, string>();
    players.forEach((p) => { if (p.team_id) map.set(p.team_id, p.team_name); });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [players]);

  const uniqueCoaches = useMemo(() => {
    const map = new Map<string, string>();
    players.forEach((p) => {
      if (teamFilter !== "all" && p.team_id !== teamFilter) return;
      p.coaches.forEach((c) => map.set(c.id, c.name));
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [players, teamFilter]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filteredList = players.filter((p) => {
      if (teamFilter !== "all" && p.team_id !== teamFilter) return false;
      if (coachFilter !== "all" && !p.coaches.some((c) => c.id === coachFilter)) return false;
      if (q) {
        const full = `${p.first_name || ""} ${p.last_name || ""} ${p.nickname || ""} ${p.team_name || ""}`.toLowerCase();
        if (!full.includes(q)) return false;
      }
      return true;
    });
    // Deduplicate by player id
    const seen = new Set<string>();
    return filteredList.filter((p) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
  }, [players, search, teamFilter, coachFilter]);

  const displayName = (p: PlayerRow) => {
    const fn = `${p.first_name || ""} ${p.last_name || ""}`.trim();
    return fn || p.nickname || "Joueur";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Award className="w-5 h-5 text-green-600" />
            Attestation de compétences
          </DialogTitle>
          <DialogDescription>
            Choisissez le joueur pour lequel générer l'attestation.
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Rechercher un joueur..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            autoFocus
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
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
        <ScrollArea className="flex-1 -mx-6 px-6">
          {loading ? (
            <div className="text-sm text-muted-foreground py-6 text-center">Chargement…</div>
          ) : filtered.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">
              {players.length === 0
                ? "Vous n'êtes habilité à délivrer aucune attestation. Seuls l'administrateur, le responsable club et le coach référent d'une équipe peuvent en générer."
                : "Aucun joueur trouvé."}
            </div>
          ) : (
            <div className="space-y-1 py-1">
              {filtered.map(p => (
                <button
                  key={p.id}
                  type="button"
                  className="w-full text-left px-3 py-2 rounded-md hover:bg-muted text-sm font-medium"
                  onClick={() => {
                    onOpenChange(false);
                    navigate(`/players/${p.id}?certificate=1`);
                  }}
                >
                  <div className="flex flex-col">
                    <span>{displayName(p)}</span>
                    {p.team_name && (
                      <span className="text-xs text-muted-foreground">{p.team_name}</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}