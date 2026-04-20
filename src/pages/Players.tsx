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
import { ClubGroupHeader } from "@/components/shared/ClubGroupHeader";

interface PlayerData {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
  photo_url: string | null;
  club_id: string | null;
  club_name: string | null;
  club_short_name?: string | null;
  club_logo_url?: string | null;
  club_primary_color?: string | null;
  teams: {
    id: string;
    name: string;
    short_name?: string | null;
    club_id: string | null;
    club_name: string | null;
    club_short_name?: string | null;
    club_logo_url?: string | null;
    club_primary_color?: string | null;
    color?: string | null;
  }[];
  coaches: { id: string; name: string }[];
}

const STORAGE_KEY = "players-collapsed-teams";

const Players = () => {
  const { hasAdminRole: isAdmin, currentRole, user } = useAuth();
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
  const isClubAdmin = currentRole?.role === "club_admin";
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
          teams:team_id (id, name, short_name, color, club_id, clubs:club_id (id, name, short_name, logo_url, primary_color))
        `)
        .eq("is_active", true);

      if (error) throw error;

      let allMembers = teamMembers || [];
      
      // If logged in as coach, restrict to only the teams where this user is a coach
      if (currentRole?.role === "coach" && user) {
        const coachTeamIds = allMembers
          .filter((tm) => tm.member_type === "coach" && tm.user_id === user.id)
          .map((tm) => tm.team_id);
        allMembers = allMembers.filter((tm) => coachTeamIds.includes(tm.team_id));
      }
      
      const playerMembers = allMembers.filter((tm) => tm.member_type === "player");
      const coachMembers = allMembers.filter((tm) => tm.member_type === "coach");

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
          short_name: (tm.teams as any).short_name || null,
          club_id: (tm.teams as any).club_id || null,
          club_name: (tm.teams as any).clubs?.name || null,
          club_short_name: (tm.teams as any).clubs?.short_name || null,
          club_logo_url: (tm.teams as any).clubs?.logo_url || null,
          club_primary_color: (tm.teams as any).clubs?.primary_color || null,
          color: (tm.teams as any).color || null,
        }));

        // Find coaches for this player (coaches in the same teams)
        const playerTeamIds = memberEntries.map((tm) => tm.team_id);
        const playerCoaches = coachMembers
          .filter((cm) => playerTeamIds.includes(cm.team_id))
          .map((cm) => ({ id: cm.user_id, name: coachProfiles[cm.user_id] || "Coach" }));
        const uniqueCoaches = Array.from(new Map(playerCoaches.map((c) => [c.id, c])).values());

        const firstClub = memberEntries[0] ? (memberEntries[0].teams as any)?.clubs : null;
        const clubName = firstClub?.name || null;
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
          club_short_name: firstClub?.short_name || null,
          club_logo_url: firstClub?.logo_url || null,
          club_primary_color: firstClub?.primary_color || null,
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

  // Group by club for admin view only
  const clubGroups = useMemo(() => {
    const groups: Record<string, {
      clubId: string;
      clubName: string;
      clubShortName: string | null;
      clubLogoUrl: string | null;
      clubPrimaryColor: string | null;
      teams: Record<string, {
        teamId: string;
        teamName: string;
        teamShortName: string | null;
        teamColor: string | null;
        players: PlayerData[];
      }>;
      noTeamPlayers: PlayerData[];
      totalPlayers: number;
    }> = {};
    filteredPlayers.forEach((player) => {
      // Group by EACH club the player has teams in (multi-club safe)
      const clubsForPlayer = new Map<
        string,
        {
          name: string;
          short_name: string | null;
          logo_url: string | null;
          primary_color: string | null;
          teams: typeof player.teams;
        }
      >();
      player.teams.forEach((t) => {
        const k = t.club_id || "no-club";
        if (!clubsForPlayer.has(k)) {
          clubsForPlayer.set(k, {
            name: t.club_name || player.club_name || "Sans club",
            short_name: t.club_short_name || null,
            logo_url: t.club_logo_url || null,
            primary_color: t.club_primary_color || null,
            teams: [],
          });
        }
        clubsForPlayer.get(k)!.teams.push(t);
      });
      // Player without any team
      if (clubsForPlayer.size === 0) {
        const k = player.club_id || "no-club";
        if (!groups[k]) {
          groups[k] = {
            clubId: k,
            clubName: player.club_name || "Sans club",
            clubShortName: player.club_short_name || null,
            clubLogoUrl: player.club_logo_url || null,
            clubPrimaryColor: player.club_primary_color || null,
            teams: {},
            noTeamPlayers: [],
            totalPlayers: 0,
          };
        }
        groups[k].noTeamPlayers.push(player);
        groups[k].totalPlayers += 1;
        return;
      }
      clubsForPlayer.forEach((info, clubKey) => {
        if (!groups[clubKey]) {
          groups[clubKey] = {
            clubId: clubKey,
            clubName: info.name,
            clubShortName: info.short_name,
            clubLogoUrl: info.logo_url,
            clubPrimaryColor: info.primary_color,
            teams: {},
            noTeamPlayers: [],
            totalPlayers: 0,
          };
        }
        groups[clubKey].totalPlayers += 1;
        info.teams.forEach((t) => {
          if (!groups[clubKey].teams[t.id]) {
            groups[clubKey].teams[t.id] = {
              teamId: t.id,
              teamName: t.name,
              teamShortName: t.short_name || null,
              teamColor: t.color || null,
              players: [],
            };
          }
          if (!groups[clubKey].teams[t.id].players.find((p) => p.id === player.id)) {
            groups[clubKey].teams[t.id].players.push(player);
          }
        });
      });
    });
    return Object.values(groups)
      .map((g) => ({
        ...g,
        teamsList: Object.values(g.teams).sort((a, b) =>
          a.teamName.localeCompare(b.teamName)
        ),
      }))
      .sort((a, b) => a.clubName.localeCompare(b.clubName));
  }, [filteredPlayers]);

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
                <Badge
                  key={team.id}
                  variant="outline"
                  className="border-2 font-medium"
                  style={{
                    backgroundColor: `${team.color || "#3B82F6"}1A`,
                    borderColor: team.color || "#3B82F6",
                    color: team.color || "#3B82F6",
                  }}
                >
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
          {currentRole?.role === "club_admin" && currentRole?.club_id && (
            <Button variant="accent" onClick={() => setShowCreatePlayer(true)} className="gap-2">
              <Plus className="w-4 h-4" />
              Ajouter un joueur
            </Button>
          )}
          {currentRole?.role === "admin" && (
            <Button
              variant="accent"
              onClick={() => setShowCreatePlayer(true)}
              className="gap-2"
              disabled={clubFilter === "all"}
              title={clubFilter === "all" ? "Sélectionnez d'abord un club dans le filtre" : undefined}
            >
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
        ) : clubGroups ? (
          <div className="space-y-8">
            {clubGroups.map((group) => (
              <div key={group.clubId} className="space-y-3">
                <ClubGroupHeader
                  name={group.clubName}
                  shortName={group.clubShortName}
                  logoUrl={group.clubLogoUrl}
                  primaryColor={group.clubPrimaryColor}
                  count={group.totalPlayers}
                />
                <div className="space-y-3 pl-2">
                  {group.teamsList.map((team) => {
                    const teamKey = `${group.clubId}:${team.teamId}`;
                    const isOpen = collapsedTeams[teamKey] !== true;
                    const color = team.teamColor || "#3B82F6";
                    return (
                      <Collapsible
                        key={team.teamId}
                        open={isOpen}
                        onOpenChange={() => toggleTeam(teamKey)}
                      >
                        <CollapsibleTrigger
                          className="flex items-center gap-2 w-full p-3 rounded-lg bg-muted/60 hover:bg-muted transition-colors cursor-pointer"
                        >
                          <ChevronDown
                            className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? "" : "-rotate-90"}`}
                          />
                          <div
                            className="w-6 h-6 rounded flex items-center justify-center shrink-0 overflow-hidden"
                            style={{ backgroundColor: color }}
                          >
                            <span className="text-[9px] font-bold text-white leading-none">
                              {(team.teamShortName || team.teamName.slice(0, 2)).toUpperCase()}
                            </span>
                          </div>
                          <span className="font-display font-semibold text-sm" style={{ color }}>
                            {team.teamName}
                          </span>
                          <Badge variant="secondary" className="ml-auto text-xs">
                            {team.players.length}
                          </Badge>
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
                                {team.players.map((player) => renderPlayerRow(player, false))}
                              </TableBody>
                            </Table>
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    );
                  })}
                  {group.noTeamPlayers.length > 0 && (
                    <div className="rounded-lg border bg-card">
                      <div className="px-3 py-2 text-xs font-medium text-muted-foreground border-b">
                        Sans équipe ({group.noTeamPlayers.length})
                      </div>
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
                          {group.noTeamPlayers.map((player) => renderPlayerRow(player, false))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
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
      {isAdmin && clubFilter !== "all" && (
        <CreatePlayerModal
          open={showCreatePlayer}
          onOpenChange={setShowCreatePlayer}
          clubId={clubFilter}
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
