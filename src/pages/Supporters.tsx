/**
 * @page Supporters
 * @route /supporters
 *
 * Annuaire des supporters (parents, proches) liés à un ou plusieurs joueurs.
 *
 * @description
 * Vue tabulaire groupée par joueur. Les supporters disposent d'un accès lecture
 * seule au framework et peuvent créer des débriefs uniquement sur invitation.
 * (mem://logic/supporter-data-access)
 *
 * @features
 * - Recherche par nom/email
 * - Filtres cascadés (club → équipe → joueur)
 * - Création (CreateSupporterModal) avec liaison à un joueur
 * - Édition via EditUserModal
 *
 * @access
 * - Super Admin / Club Admin : tous supporters de leur scope
 * - Coach : supporters des joueurs de ses équipes
 *
 * @maintenance
 * Les liaisons supporter ↔ joueur sont gérées via `supporters_link`. La
 * gestion centralisée se fait via ManageSupportersModal
 * (mem://features/supporter-management/centralized-modal).
 */
import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { Search, Heart, Loader2, ChevronDown, Plus, Edit, UserCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CreateSupporterModal } from "@/components/modals/CreateSupporterModal";
import { EditUserModal } from "@/components/modals/EditUserModal";

interface SupporterData {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  photo_url: string | null;
  players: {
    id: string;
    name: string;
    team_id: string | null;
    team_name: string | null;
    team_color: string | null;
    team_short_name: string | null;
    club_id: string | null;
    club_name: string | null;
    club_logo_url: string | null;
    club_short_name: string | null;
    club_primary_color: string | null;
  }[];
}

const STORAGE_KEY = "supporters-collapsed-players";
const STORAGE_KEY_TEAMS = "supporters-collapsed-teams";
const STORAGE_KEY_CLUBS = "supporters-collapsed-clubs";
const NO_TEAM_KEY = "__no_team__";
const NO_CLUB_KEY = "__no_club__";

const Supporters = () => {
  const { hasAdminRole: isAdmin, currentRole } = useAuth();
  const navigate = useNavigate();
  const [supporters, setSupporters] = useState<SupporterData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [teamFilter, setTeamFilter] = useState("all");
  const [playerFilter, setPlayerFilter] = useState("all");
  const [showCreateSupporter, setShowCreateSupporter] = useState(false);
  const [editingSupporter, setEditingSupporter] = useState<any>(null);
  const [collapsedPlayers, setCollapsedPlayers] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });
  const [collapsedTeams, setCollapsedTeams] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_TEAMS);
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });
  const [collapsedClubs, setCollapsedClubs] = useState<Record<string, boolean>>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_CLUBS);
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    fetchSupporters();
  }, [isAdmin, currentRole]);

  const togglePlayer = (playerId: string) => {
    setCollapsedPlayers((prev) => {
      const next = { ...prev, [playerId]: !prev[playerId] };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const toggleTeam = (teamId: string) => {
    setCollapsedTeams((prev) => {
      const next = { ...prev, [teamId]: !prev[teamId] };
      localStorage.setItem(STORAGE_KEY_TEAMS, JSON.stringify(next));
      return next;
    });
  };

  const toggleClub = (clubId: string) => {
    setCollapsedClubs((prev) => {
      const next = { ...prev, [clubId]: !prev[clubId] };
      localStorage.setItem(STORAGE_KEY_CLUBS, JSON.stringify(next));
      return next;
    });
  };

  const fetchSupporters = async () => {
    setLoading(true);
    try {
      // Get all supporter links
      const { data: links, error: linksError } = await supabase
        .from("supporters_link")
        .select(`
          supporter_id,
          player_id
        `);

      if (linksError) throw linksError;
      if (!links || links.length === 0) {
        setSupporters([]);
        setLoading(false);
        return;
      }

      const supporterIds = [...new Set(links.map((l) => l.supporter_id))];
      const playerIds = [...new Set(links.map((l) => l.player_id))];

      // Fetch supporter profiles
      const { data: supporterProfiles } = await supabase
        .from("profiles")
        .select("id, email, first_name, last_name, photo_url")
        .in("id", supporterIds)
        .is("deleted_at", null);

      // Fetch player profiles + teams
      const { data: playerProfiles } = await supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .in("id", playerIds);

      // Fetch player team memberships
      const { data: playerTeams } = await supabase
        .from("team_members")
        .select(
          "user_id, team_id, teams:team_id (id, name, color, short_name, club_id, clubs:club_id (id, name, logo_url, short_name, primary_color))",
        )
        .in("user_id", playerIds)
        .eq("member_type", "player")
        .eq("is_active", true);

      const playerMap = new Map<
        string,
        {
          name: string;
          team_id: string | null;
          team_name: string | null;
          team_color: string | null;
          team_short_name: string | null;
          club_id: string | null;
          club_name: string | null;
          club_logo_url: string | null;
          club_short_name: string | null;
          club_primary_color: string | null;
        }
      >();
      (playerProfiles || []).forEach((p) => {
        const teamEntry = (playerTeams || []).find((t) => t.user_id === p.id);
        const team = teamEntry ? (teamEntry.teams as any) : null;
        const club = team?.clubs || null;
        playerMap.set(p.id, {
          name: `${p.first_name || ""} ${p.last_name || ""}`.trim() || "Joueur",
          team_id: team?.id || null,
          team_name: team?.name || null,
          team_color: team?.color || null,
          team_short_name: team?.short_name || null,
          club_id: club?.id || null,
          club_name: club?.name || null,
          club_logo_url: club?.logo_url || null,
          club_short_name: club?.short_name || null,
          club_primary_color: club?.primary_color || null,
        });
      });

      const supportersData: SupporterData[] = (supporterProfiles || []).map((profile) => {
        const playerLinks = links.filter((l) => l.supporter_id === profile.id);
        const players = playerLinks.map((l) => {
          const info = playerMap.get(l.player_id);
          return {
            id: l.player_id,
            name: info?.name || "Joueur",
            team_id: info?.team_id || null,
            team_name: info?.team_name || null,
            team_color: info?.team_color || null,
            team_short_name: info?.team_short_name || null,
            club_id: info?.club_id || null,
            club_name: info?.club_name || null,
            club_logo_url: info?.club_logo_url || null,
            club_short_name: info?.club_short_name || null,
            club_primary_color: info?.club_primary_color || null,
          };
        });

        return {
          id: profile.id,
          email: profile.email,
          first_name: profile.first_name,
          last_name: profile.last_name,
          photo_url: profile.photo_url,
          players,
        };
      });

      supportersData.sort((a, b) => {
        const nameA = `${a.last_name || ""} ${a.first_name || ""}`.trim().toLowerCase();
        const nameB = `${b.last_name || ""} ${b.first_name || ""}`.trim().toLowerCase();
        return nameA.localeCompare(nameB);
      });

      setSupporters(supportersData);
    } catch (error) {
      console.error("Error fetching supporters:", error);
    } finally {
      setLoading(false);
    }
  };

  // Unique teams and players for filters
  const uniqueTeams = useMemo(() => {
    const map = new Map<string, string>();
    supporters.forEach((s) => {
      s.players.forEach((p) => { if (p.team_id && p.team_name) map.set(p.team_id, p.team_name); });
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [supporters]);

  const uniquePlayers = useMemo(() => {
    const map = new Map<string, string>();
    supporters.forEach((s) => {
      s.players.forEach((p) => {
        if (teamFilter !== "all" && p.team_id !== teamFilter) return;
        map.set(p.id, p.name);
      });
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [supporters, teamFilter]);

  // Reset cascading filters
  useEffect(() => { setPlayerFilter("all"); }, [teamFilter]);

  const filteredSupporters = useMemo(() => {
    return supporters.filter((s) => {
      if (teamFilter !== "all" && !s.players.some((p) => p.team_id === teamFilter)) return false;
      if (playerFilter !== "all" && !s.players.some((p) => p.id === playerFilter)) return false;
      if (search.trim()) {
        const term = search.toLowerCase();
        return (
          s.first_name?.toLowerCase().includes(term) ||
          s.last_name?.toLowerCase().includes(term) ||
          s.email.toLowerCase().includes(term) ||
          s.players.some((p) => p.name.toLowerCase().includes(term))
        );
      }
      return true;
    });
  }, [supporters, teamFilter, playerFilter, search]);

  // Group by club → team → player
  const clubGroups = useMemo(() => {
    type TeamBucket = {
      teamName: string;
      teamColor: string | null;
      teamShortName: string | null;
      players: Record<string, { playerName: string; supporters: SupporterData[] }>;
    };
    type ClubBucket = {
      clubName: string;
      clubLogoUrl: string | null;
      clubShortName: string | null;
      clubPrimaryColor: string | null;
      teams: Record<string, TeamBucket>;
    };
    const clubs: Record<string, ClubBucket> = {};

    filteredSupporters.forEach((supporter) => {
      supporter.players.forEach((player) => {
        const clubKey = player.club_id || NO_CLUB_KEY;
        const teamKey = player.team_id || NO_TEAM_KEY;
        if (!clubs[clubKey]) {
          clubs[clubKey] = {
            clubName: player.club_name || "Sans club",
            clubLogoUrl: player.club_logo_url,
            clubShortName: player.club_short_name,
            clubPrimaryColor: player.club_primary_color,
            teams: {},
          };
        }
        if (!clubs[clubKey].teams[teamKey]) {
          clubs[clubKey].teams[teamKey] = {
            teamName: player.team_name || "Sans équipe",
            teamColor: player.team_color,
            teamShortName: player.team_short_name,
            players: {},
          };
        }
        const teamBucket = clubs[clubKey].teams[teamKey];
        if (!teamBucket.players[player.id]) {
          teamBucket.players[player.id] = { playerName: player.name, supporters: [] };
        }
        if (!teamBucket.players[player.id].supporters.find((s) => s.id === supporter.id)) {
          teamBucket.players[player.id].supporters.push(supporter);
        }
      });
    });

    return Object.entries(clubs)
      .sort((a, b) => {
        if (a[0] === NO_CLUB_KEY) return 1;
        if (b[0] === NO_CLUB_KEY) return -1;
        return a[1].clubName.localeCompare(b[1].clubName);
      })
      .map(([clubId, club]) => ({
        clubId,
        clubName: club.clubName,
        clubLogoUrl: club.clubLogoUrl,
        clubShortName: club.clubShortName,
        clubPrimaryColor: club.clubPrimaryColor,
        teams: Object.entries(club.teams)
          .sort((a, b) => {
            if (a[0] === NO_TEAM_KEY) return 1;
            if (b[0] === NO_TEAM_KEY) return -1;
            return a[1].teamName.localeCompare(b[1].teamName);
          })
          .map(([teamId, team]) => ({
            teamId,
            teamName: team.teamName,
            teamColor: team.teamColor,
            teamShortName: team.teamShortName,
            players: Object.entries(team.players).sort((a, b) =>
              a[1].playerName.localeCompare(b[1].playerName),
            ),
          })),
      }));
  }, [filteredSupporters]);

  const showClubLevel = clubGroups.length > 1;

  const getInitials = (firstName: string | null, lastName: string | null) => {
    const first = firstName?.charAt(0) || "";
    const last = lastName?.charAt(0) || "";
    return (first + last).toUpperCase() || "?";
  };

  const getDisplayName = (s: SupporterData) => {
    const fullName = [s.first_name, s.last_name].filter(Boolean).join(" ");
    return fullName || s.email;
  };

  const canCreate = isAdmin || currentRole?.role === "club_admin" || currentRole?.role === "coach";

  const openEditModal = async (supporter: SupporterData) => {
    // Build AdminUser object for EditUserModal
    const { data: roles } = await supabase
      .from("user_roles")
      .select("id, role, club_id, clubs:club_id(name)")
      .eq("user_id", supporter.id);

    const { data: memberships } = await supabase
      .from("team_members")
      .select("id, team_id, member_type, coach_role, is_active, teams:team_id(name, clubs:club_id(name))")
      .eq("user_id", supporter.id)
      .is("deleted_at", null);

    const { data: links } = await supabase
      .from("supporters_link")
      .select("id, player_id, profiles:player_id(first_name, last_name, nickname)")
      .eq("supporter_id", supporter.id);

    const adminUser = {
      id: supporter.id,
      email: supporter.email,
      first_name: supporter.first_name,
      last_name: supporter.last_name,
      nickname: null as string | null,
      photo_url: supporter.photo_url,
      club_id: currentRole?.club_id || null,
      status: "Actif" as const,
      roles: (roles || []).map((r: any) => ({
        id: r.id,
        role: r.role,
        club_id: r.club_id,
        club_name: r.clubs?.name || null,
      })),
      team_memberships: (memberships || []).map((m: any) => ({
        id: m.id,
        team_id: m.team_id,
        team_name: m.teams?.name || "",
        club_name: m.teams?.clubs?.name || "",
        member_type: m.member_type,
        coach_role: m.coach_role,
        is_active: m.is_active,
      })),
      supporter_links: (links || []).map((l: any) => ({
        id: l.id,
        player_id: l.player_id,
        player_name: l.profiles?.nickname || `${l.profiles?.first_name || ""} ${l.profiles?.last_name || ""}`.trim() || "Joueur",
      })),
    };

    setEditingSupporter(adminUser);
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold">Supporters</h1>
            <p className="text-muted-foreground mt-1">
              {isAdmin
                ? "Tous les supporters de la plateforme"
                : "Les supporters de votre périmètre"}
            </p>
          </div>
          {canCreate && currentRole?.club_id && (
            <AddEntityButton type="supporter" onClick={() => setShowCreateSupporter(true)} />
          )}
        </div>

        {/* Search & Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher un supporter..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
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
          <Select value={playerFilter} onValueChange={setPlayerFilter}>
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder="Tous les joueurs" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les joueurs</SelectItem>
              {uniquePlayers.map(([id, name]) => (
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
        ) : filteredSupporters.length === 0 ? (
          <div className="rounded-lg border bg-card flex flex-col items-center justify-center py-12 text-center">
            <Heart className="w-12 h-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold">
              {search ? "Aucun supporter trouvé" : "Aucun supporter"}
            </h3>
            <p className="text-muted-foreground text-sm mt-1">
              {search
                ? "Aucun supporter ne correspond à votre recherche."
                : "Aucun supporter n'a encore été ajouté."}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {clubGroups.map((club) => {
              const clubOpen = collapsedClubs[club.clubId] !== true;
              const renderTeams = (
                <div className={showClubLevel ? "space-y-4 mt-2 pl-4 border-l-2 border-primary/20" : "space-y-4"}>
                  {club.teams.map((team) => {
                    const teamOpen = collapsedTeams[team.teamId] !== true;
                    const totalSupporters = team.players.reduce(
                      (acc, [, p]) => acc + p.supporters.length,
                      0,
                    );
                    const teamColor = team.teamColor || "hsl(var(--primary))";
                    const teamInitials = (team.teamShortName || team.teamName.slice(0, 2)).toUpperCase();
                    return (
                <Collapsible
                  key={team.teamId}
                  open={teamOpen}
                  onOpenChange={() => toggleTeam(team.teamId)}
                >
                  <CollapsibleTrigger className="flex items-center gap-2 w-full p-3 rounded-lg bg-primary/10 hover:bg-primary/15 transition-colors cursor-pointer">
                    <ChevronDown
                      className={`w-4 h-4 text-muted-foreground transition-transform ${
                        teamOpen ? "" : "-rotate-90"
                      }`}
                    />
                    <div
                      className="w-5 h-5 rounded flex items-center justify-center shrink-0"
                      style={{ backgroundColor: teamColor }}
                    >
                      <span className="text-[9px] font-bold text-white leading-none">
                        {teamInitials}
                      </span>
                    </div>
                    <span className="font-display font-semibold text-sm uppercase tracking-wide">
                      {team.teamName}
                    </span>
                    <Badge variant="secondary" className="ml-auto text-xs">
                      {team.players.length} joueur{team.players.length > 1 ? "s" : ""} ·{" "}
                      {totalSupporters} supporter{totalSupporters > 1 ? "s" : ""}
                    </Badge>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="space-y-3 mt-2 pl-4 border-l-2 border-primary/20">
                      {team.players.map(([playerId, group]) => {
                        const isOpen = collapsedPlayers[playerId] !== true;
                        return (
                          <Collapsible
                            key={playerId}
                            open={isOpen}
                            onOpenChange={() => togglePlayer(playerId)}
                          >
                            <CollapsibleTrigger className="flex items-center gap-2 w-full p-3 rounded-lg bg-muted/60 hover:bg-muted transition-colors cursor-pointer">
                              <ChevronDown
                                className={`w-4 h-4 text-muted-foreground transition-transform ${
                                  isOpen ? "" : "-rotate-90"
                                }`}
                              />
                              <UserCircle className="w-4 h-4 text-success" />
                              <span className="font-display font-semibold text-sm">
                                {group.playerName}
                              </span>
                              <Badge variant="secondary" className="ml-auto text-xs">
                                {group.supporters.length} supporter
                                {group.supporters.length > 1 ? "s" : ""}
                              </Badge>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <div className="rounded-lg border bg-card mt-1">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Supporter</TableHead>
                                      <TableHead>Email</TableHead>
                                      <TableHead>Joueurs suivis</TableHead>
                                      {canCreate && (
                                        <TableHead className="w-[80px]">Actions</TableHead>
                                      )}
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {group.supporters.map((supporter) => (
                                      <TableRow key={supporter.id}>
                                        <TableCell>
                                          <div className="flex items-center gap-3">
                                            <Avatar className="h-10 w-10">
                                              <AvatarImage
                                                src={supporter.photo_url || undefined}
                                              />
                                              <AvatarFallback className="bg-primary/10 text-primary font-medium">
                                                {getInitials(
                                                  supporter.first_name,
                                                  supporter.last_name,
                                                )}
                                              </AvatarFallback>
                                            </Avatar>
                                            <span className="font-medium">
                                              {getDisplayName(supporter)}
                                            </span>
                                          </div>
                                        </TableCell>
                                        <TableCell>
                                          <span className="text-sm text-muted-foreground">
                                            {supporter.email}
                                          </span>
                                        </TableCell>
                                        <TableCell>
                                          <div className="flex flex-wrap gap-1.5">
                                            {supporter.players.map((p) => (
                                              <Badge
                                                key={p.id}
                                                variant="secondary"
                                                className="text-xs"
                                              >
                                                {p.name}
                                              </Badge>
                                            ))}
                                          </div>
                                        </TableCell>
                                        {canCreate && (
                                          <TableCell>
                                            <Button
                                              variant="ghost"
                                              size="icon"
                                              onClick={() => openEditModal(supporter)}
                                              className="text-blue-500 hover:text-blue-600"
                                            >
                                              <Edit className="w-4 h-4" />
                                            </Button>
                                          </TableCell>
                                        )}
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                            </CollapsibleContent>
                          </Collapsible>
                        );
                      })}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
                    );
                  })}
                </div>
              );

              if (!showClubLevel) {
                return <div key={club.clubId}>{renderTeams}</div>;
              }

              const clubInitials = (club.clubShortName || club.clubName.slice(0, 2)).toUpperCase();
              const clubColor = club.clubPrimaryColor || "hsl(var(--primary))";
              const totalTeams = club.teams.length;
              const totalSupportersClub = club.teams.reduce(
                (acc, t) => acc + t.players.reduce((a, [, p]) => a + p.supporters.length, 0),
                0,
              );
              return (
                <Collapsible
                  key={club.clubId}
                  open={clubOpen}
                  onOpenChange={() => toggleClub(club.clubId)}
                >
                  <CollapsibleTrigger className="flex items-center gap-2 w-full p-3 rounded-lg bg-accent/10 hover:bg-accent/15 transition-colors cursor-pointer">
                    <ChevronDown
                      className={`w-4 h-4 text-muted-foreground transition-transform ${
                        clubOpen ? "" : "-rotate-90"
                      }`}
                    />
                    <div
                      className="w-6 h-6 rounded flex items-center justify-center overflow-hidden shrink-0"
                      style={{ backgroundColor: club.clubLogoUrl ? "transparent" : clubColor }}
                    >
                      {club.clubLogoUrl ? (
                        <img src={club.clubLogoUrl} alt={club.clubName} className="w-full h-full object-contain" />
                      ) : (
                        <span className="text-[10px] font-bold text-white leading-none">
                          {clubInitials}
                        </span>
                      )}
                    </div>
                    <span className="font-display font-bold text-sm uppercase tracking-wider">
                      {club.clubName}
                    </span>
                    <Badge variant="secondary" className="ml-auto text-xs">
                      {totalTeams} équipe{totalTeams > 1 ? "s" : ""} · {totalSupportersClub} supporter{totalSupportersClub > 1 ? "s" : ""}
                    </Badge>
                  </CollapsibleTrigger>
                  <CollapsibleContent>{renderTeams}</CollapsibleContent>
                </Collapsible>
              );
            })}
          </div>
        )}
      </div>

      {currentRole?.club_id && (
        <CreateSupporterModal
          open={showCreateSupporter}
          onOpenChange={setShowCreateSupporter}
          clubId={currentRole.club_id}
          onSuccess={fetchSupporters}
        />
      )}

      {editingSupporter && (
        <EditUserModal
          user={editingSupporter}
          onClose={() => setEditingSupporter(null)}
          onUpdate={() => {
            setEditingSupporter(null);
            fetchSupporters();
          }}
        />
      )}
    </AppLayout>
  );
};

export default Supporters;
