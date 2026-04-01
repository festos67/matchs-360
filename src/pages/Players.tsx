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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Users, Loader2, User, ChevronDown, Plus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CreatePlayerModal } from "@/components/modals/CreatePlayerModal";
import { EditPlayerModal } from "@/components/modals/EditPlayerModal";

interface PlayerData {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
  photo_url: string | null;
  club_id: string | null;
  club_name: string | null;
  teams: { id: string; name: string; club_name: string | null }[];
  coaches: { id: string; name: string }[];
}

const STORAGE_KEY = "players-collapsed-teams";

const Players = () => {
  const { hasAdminRole: isAdmin, currentRole } = useAuth();
  const navigate = useNavigate();
  const [players, setPlayers] = useState<PlayerData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [clubFilter, setClubFilter] = useState("all");
  const [teamFilter, setTeamFilter] = useState("all");
  const [coachFilter, setCoachFilter] = useState("all");
  const [showCreatePlayer, setShowCreatePlayer] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<PlayerData | null>(null);
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
          member_type,
          teams:team_id (id, name, club_id, clubs:club_id (id, name))
        `)
        .eq("is_active", true);

      if (error) throw error;

      const playerMembers = (teamMembers || []).filter((tm) => tm.member_type === "player");
      const coachMembers = (teamMembers || []).filter((tm) => tm.member_type === "coach");

      const userIds = [...new Set(playerMembers.map((tm) => tm.user_id))];

      if (userIds.length === 0) {
        setPlayers([]);
        setLoading(false);
        return;
      }

      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, email, first_name, last_name, nickname, photo_url, club_id")
        .in("id", userIds)
        .is("deleted_at", null);

      if (profilesError) throw profilesError;

      // Get coach profiles for filter
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

      const playersData: PlayerData[] = (profiles || []).map((profile) => {
        const memberEntries = playerMembers.filter(
          (tm) => tm.user_id === profile.id && tm.teams
        );
        const teams = memberEntries.map((tm) => ({
          id: (tm.teams as any).id,
          name: (tm.teams as any).name,
          club_name: (tm.teams as any).clubs?.name || null,
        }));

        // Find coaches for this player (coaches in the same teams)
        const playerTeamIds = memberEntries.map((tm) => tm.team_id);
        const playerCoaches = coachMembers
          .filter((cm) => playerTeamIds.includes(cm.team_id))
          .map((cm) => ({ id: cm.user_id, name: coachProfiles[cm.user_id] || "Coach" }));
        const uniqueCoaches = Array.from(new Map(playerCoaches.map((c) => [c.id, c])).values());

        const clubName = memberEntries[0] ? (memberEntries[0].teams as any)?.clubs?.name || null : null;
        const clubId = memberEntries[0] ? (memberEntries[0].teams as any)?.club_id || null : null;

        return {
          id: profile.id,
          email: profile.email,
          first_name: profile.first_name,
          last_name: profile.last_name,
          nickname: profile.nickname,
          photo_url: profile.photo_url,
          club_id: clubId,
          club_name: clubName,
          teams,
          coaches: uniqueCoaches,
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

  // Unique clubs, teams, coaches for filters
  const uniqueClubs = useMemo(() => {
    const map = new Map<string, string>();
    players.forEach((p) => { if (p.club_id && p.club_name) map.set(p.club_id, p.club_name); });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [players]);

  const uniqueTeams = useMemo(() => {
    const map = new Map<string, string>();
    players.forEach((p) => {
      if (clubFilter !== "all" && p.club_id !== clubFilter) return;
      p.teams.forEach((t) => map.set(t.id, t.name));
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [players, clubFilter]);

  const uniqueCoaches = useMemo(() => {
    const map = new Map<string, string>();
    players.forEach((p) => {
      if (clubFilter !== "all" && p.club_id !== clubFilter) return;
      if (teamFilter !== "all" && !p.teams.some((t) => t.id === teamFilter)) return;
      p.coaches.forEach((c) => map.set(c.id, c.name));
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [players, clubFilter, teamFilter]);

  // Reset cascading filters
  useEffect(() => { setTeamFilter("all"); setCoachFilter("all"); }, [clubFilter]);
  useEffect(() => { setCoachFilter("all"); }, [teamFilter]);

  const filteredPlayers = useMemo(() => {
    return players.filter((player) => {
      if (clubFilter !== "all" && player.club_id !== clubFilter) return false;
      if (teamFilter !== "all" && !player.teams.some((t) => t.id === teamFilter)) return false;
      if (coachFilter !== "all" && !player.coaches.some((c) => c.id === coachFilter)) return false;
      if (search.trim()) {
        const term = search.toLowerCase();
        return (
          player.first_name?.toLowerCase().includes(term) ||
          player.last_name?.toLowerCase().includes(term) ||
          player.nickname?.toLowerCase().includes(term) ||
          player.email.toLowerCase().includes(term) ||
          player.teams.some((t) => t.name.toLowerCase().includes(term))
        );
      }
      return true;
    });
  }, [players, clubFilter, teamFilter, coachFilter, search]);

  // Group by club for non-coach view
  const clubGroups = useMemo(() => {
    if (isCoach) return null;
    const groups: Record<string, { clubName: string; players: PlayerData[] }> = {};
    filteredPlayers.forEach((player) => {
      const key = player.club_id || "no-club";
      if (!groups[key]) {
        groups[key] = { clubName: player.club_name || "Sans club", players: [] };
      }
      groups[key].players.push(player);
    });
    return Object.values(groups).sort((a, b) => a.clubName.localeCompare(b.clubName));
  }, [filteredPlayers, isCoach]);

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
    return Object.entries(groups).sort((a, b) => a[1].teamName.localeCompare(b[1].teamName));
  }, [filteredPlayers, isCoach]);

  const getInitials = (firstName: string | null, lastName: string | null) => {
    const first = firstName?.charAt(0) || "";
    const last = lastName?.charAt(0) || "";
    return (first + last).toUpperCase() || "?";
  };

  const getDisplayName = (player: PlayerData) => {
    const fullName = [player.first_name, player.last_name].filter(Boolean).join(" ");
    return fullName || player.nickname || player.email;
  };

  const renderPlayerRow = (player: PlayerData, showTeams = true) => (
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
      {showTeams && (
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
      {(isAdmin || currentRole?.role === "club_admin") && (
        <TableCell className="text-right">
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.stopPropagation();
              setEditingPlayer(player);
            }}
          >
            <Pencil className="w-4 h-4" />
          </Button>
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
          {(isAdmin || currentRole?.role === "club_admin") && currentRole?.club_id && (
            <Button onClick={() => setShowCreatePlayer(true)} className="gap-2">
              <Plus className="w-4 h-4" />
              Ajouter un joueur
            </Button>
          )}
        </div>

        {/* Search & Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher un joueur..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={clubFilter} onValueChange={setClubFilter}>
            <SelectTrigger className="w-full sm:w-[200px]">
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
            <SelectTrigger className="w-full sm:w-[200px]">
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
            <SelectTrigger className="w-full sm:w-[200px]">
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

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredPlayers.length === 0 ? (
          <div className="rounded-lg border bg-card flex flex-col items-center justify-center py-12 text-center">
            <Users className="w-12 h-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold">
              {search || clubFilter !== "all" || teamFilter !== "all" || coachFilter !== "all"
                ? "Aucun joueur trouvé"
                : "Aucun joueur"}
            </h3>
            <p className="text-muted-foreground text-sm mt-1">
              {search || clubFilter !== "all" || teamFilter !== "all" || coachFilter !== "all"
                ? "Aucun joueur ne correspond aux filtres sélectionnés."
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
                            {(isAdmin || currentRole?.role === "club_admin") && (
                              <TableHead className="text-right">Actions</TableHead>
                            )}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {group.players.map((player) => renderPlayerRow(player, false))}
                        </TableBody>
                      </Table>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </div>
        ) : clubGroups ? (
          <div className="space-y-6">
            {clubGroups.map((group) => (
              <div key={group.clubName}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-2.5 h-2.5 rounded-full bg-primary" />
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{group.clubName}</h2>
                  <span className="text-xs text-muted-foreground">({group.players.length})</span>
                </div>
                <div className="rounded-lg border bg-card">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Joueur</TableHead>
                        <TableHead>Surnom</TableHead>
                        <TableHead>Équipe(s)</TableHead>
                        {(isAdmin || currentRole?.role === "club_admin") && (
                          <TableHead className="text-right">Actions</TableHead>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.players.map((player) => renderPlayerRow(player))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {/* Count */}
        {!loading && (
          <p className="text-sm text-muted-foreground">
            {filteredPlayers.length} joueur{filteredPlayers.length > 1 ? "s" : ""}
            {(search || clubFilter !== "all" || teamFilter !== "all" || coachFilter !== "all") && ` sur ${players.length}`}
          </p>
        )}
      </div>
      {currentRole?.club_id && (
        <CreatePlayerModal
          open={showCreatePlayer}
          onOpenChange={setShowCreatePlayer}
          clubId={currentRole.club_id}
          onSuccess={fetchPlayers}
        />
      )}
      {editingPlayer && (
        <EditPlayerModal
          open={!!editingPlayer}
          onOpenChange={(open) => { if (!open) setEditingPlayer(null); }}
          player={editingPlayer}
          onSuccess={fetchPlayers}
        />
      )}
    </AppLayout>
  );
};

export default Players;
