import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Search, Users, Loader2, User, ChevronDown } from "lucide-react";

interface PlayerData {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
  photo_url: string | null;
  teams: { id: string; name: string; club_name: string | null }[];
}

const STORAGE_KEY = "players-collapsed-teams";

const Players = () => {
  const { hasAdminRole: isAdmin, currentRole } = useAuth();
  const navigate = useNavigate();
  const [players, setPlayers] = useState<PlayerData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [collapsedTeams, setCollapsedTeams] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  const isCoach = currentRole?.role === "coach";
  const pageTitle = isCoach ? "Mes Joueurs" : "Joueurs";
  const pageSubtitle = isAdmin
    ? "Tous les joueurs de la plateforme"
    : isCoach
    ? "Les joueurs de vos équipes"
    : "Les joueurs de votre périmètre";

  useEffect(() => {
    fetchPlayers();
  }, [isAdmin, currentRole]);

  const toggleTeam = (teamId: string) => {
    setCollapsedTeams((prev) => {
      const next = { ...prev, [teamId]: !prev[teamId] };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const fetchPlayers = async () => {
    setLoading(true);
    try {
      const { data: teamMembers, error } = await supabase
        .from("team_members")
        .select(`
          user_id,
          team_id,
          teams:team_id (id, name, clubs:club_id (name))
        `)
        .eq("member_type", "player")
        .eq("is_active", true);

      if (error) throw error;

      const userIds = [...new Set((teamMembers || []).map((tm) => tm.user_id))];

      if (userIds.length === 0) {
        setPlayers([]);
        setLoading(false);
        return;
      }

      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, email, first_name, last_name, nickname, photo_url")
        .in("id", userIds)
        .is("deleted_at", null);

      if (profilesError) throw profilesError;

      const playersData: PlayerData[] = (profiles || []).map((profile) => {
        const memberEntries = (teamMembers || []).filter(
          (tm) => tm.user_id === profile.id && tm.teams
        );
        const teams = memberEntries.map((tm) => ({
          id: (tm.teams as any).id,
          name: (tm.teams as any).name,
          club_name: (tm.teams as any).clubs?.name || null,
        }));

        return {
          id: profile.id,
          email: profile.email,
          first_name: profile.first_name,
          last_name: profile.last_name,
          nickname: profile.nickname,
          photo_url: profile.photo_url,
          teams,
        };
      });

      playersData.sort((a, b) => {
        const nameA = `${a.last_name || ""} ${a.first_name || ""}`.trim().toLowerCase();
        const nameB = `${b.last_name || ""} ${b.first_name || ""}`.trim().toLowerCase();
        return nameA.localeCompare(nameB);
      });

      setPlayers(playersData);
    } catch (error) {
      console.error("Error fetching players:", error);
    } finally {
      setLoading(false);
    }
  };

  const getInitials = (firstName: string | null, lastName: string | null) => {
    const first = firstName?.charAt(0) || "";
    const last = lastName?.charAt(0) || "";
    return (first + last).toUpperCase() || "?";
  };

  const getDisplayName = (player: PlayerData) => {
    const fullName = [player.first_name, player.last_name].filter(Boolean).join(" ");
    return fullName || player.nickname || player.email;
  };

  const filteredPlayers = players.filter((player) => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    return (
      player.first_name?.toLowerCase().includes(term) ||
      player.last_name?.toLowerCase().includes(term) ||
      player.nickname?.toLowerCase().includes(term) ||
      player.email.toLowerCase().includes(term) ||
      player.teams.some((t) => t.name.toLowerCase().includes(term))
    );
  });

  // Group players by team for coach view
  const teamGroups = useMemo(() => {
    if (!isCoach) return null;
    const groups: Record<string, { teamName: string; players: PlayerData[] }> = {};
    filteredPlayers.forEach((player) => {
      player.teams.forEach((team) => {
        if (!groups[team.id]) {
          groups[team.id] = { teamName: team.name, players: [] };
        }
        if (!groups[team.id].players.find((p) => p.id === player.id)) {
          groups[team.id].players.push(player);
        }
      });
    });
    // Sort groups by team name
    return Object.entries(groups).sort((a, b) => a[1].teamName.localeCompare(b[1].teamName));
  }, [filteredPlayers, isCoach]);

  const renderPlayerRow = (player: PlayerData) => (
    <TableRow
      key={player.id}
      className="cursor-pointer hover:bg-muted/50"
      onClick={() => navigate(`/players/${player.id}`)}
    >
      <TableCell>
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            <AvatarImage src={player.photo_url || undefined} />
            <AvatarFallback className="bg-primary/10 text-primary font-medium">
              {getInitials(player.first_name, player.last_name)}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="font-medium">{getDisplayName(player)}</p>
            <p className="text-sm text-muted-foreground">{player.email}</p>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <span className="text-sm text-muted-foreground">
          {player.nickname || "—"}
        </span>
      </TableCell>
      {!isCoach && (
        <TableCell>
          <div className="flex flex-wrap gap-1.5">
            {player.teams.length === 0 ? (
              <span className="text-sm text-muted-foreground">—</span>
            ) : (
              player.teams.map((team) => (
                <Badge key={team.id} variant="secondary">
                  {team.name}
                </Badge>
              ))
            )}
          </div>
        </TableCell>
      )}
    </TableRow>
  );

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold">{pageTitle}</h1>
            <p className="text-muted-foreground mt-1">{pageSubtitle}</p>
          </div>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher un joueur par nom, surnom, équipe..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredPlayers.length === 0 ? (
          <div className="rounded-lg border bg-card flex flex-col items-center justify-center py-12 text-center">
            <Users className="w-12 h-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold">
              {search ? "Aucun joueur trouvé" : "Aucun joueur"}
            </h3>
            <p className="text-muted-foreground text-sm mt-1">
              {search
                ? "Essayez avec d'autres termes de recherche."
                : "Aucun joueur n'a encore été ajouté."}
            </p>
          </div>
        ) : isCoach && teamGroups ? (
          <div className="space-y-4">
            {teamGroups.map(([teamId, group]) => {
              const isOpen = collapsedTeams[teamId] !== true;
              return (
                <Collapsible key={teamId} open={isOpen} onOpenChange={() => toggleTeam(teamId)}>
                  <CollapsibleTrigger className="flex items-center gap-2 w-full p-3 rounded-lg bg-muted/60 hover:bg-muted transition-colors cursor-pointer">
                    <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? "" : "-rotate-90"}`} />
                    <Users className="w-4 h-4 text-primary" />
                    <span className="font-display font-semibold text-sm">{group.teamName}</span>
                    <Badge variant="secondary" className="ml-auto text-xs">{group.players.length}</Badge>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="rounded-lg border bg-card mt-1">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Joueur</TableHead>
                            <TableHead>Surnom</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {group.players.map((player) => renderPlayerRow(player))}
                        </TableBody>
                      </Table>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </div>
        ) : (
          <div className="rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Joueur</TableHead>
                  <TableHead>Surnom</TableHead>
                  <TableHead>Équipe(s)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPlayers.map((player) => renderPlayerRow(player))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Count */}
        {!loading && (
          <p className="text-sm text-muted-foreground">
            {filteredPlayers.length} joueur{filteredPlayers.length > 1 ? "s" : ""}
            {search && ` sur ${players.length}`}
          </p>
        )}
      </div>
    </AppLayout>
  );
};

export default Players;
