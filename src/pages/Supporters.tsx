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
import { Search, Heart, Loader2, ChevronDown, Plus, Edit } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CreateSupporterModal } from "@/components/modals/CreateSupporterModal";
import { EditUserModal } from "@/components/modals/EditUserModal";

interface SupporterData {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  photo_url: string | null;
  players: { id: string; name: string; team_id: string | null; team_name: string | null }[];
}

const STORAGE_KEY = "supporters-collapsed-players";

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
        .select("user_id, team_id, teams:team_id (id, name)")
        .in("user_id", playerIds)
        .eq("member_type", "player")
        .eq("is_active", true);

      const playerMap = new Map<string, { name: string; team_id: string | null; team_name: string | null }>();
      (playerProfiles || []).forEach((p) => {
        const teamEntry = (playerTeams || []).find((t) => t.user_id === p.id);
        const teamId = teamEntry ? (teamEntry.teams as any)?.id || null : null;
        const teamName = teamEntry ? (teamEntry.teams as any)?.name || null : null;
        playerMap.set(p.id, {
          name: `${p.first_name || ""} ${p.last_name || ""}`.trim() || "Joueur",
          team_id: teamId,
          team_name: teamName,
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

  // Group by player
  const playerGroups = useMemo(() => {
    const groups: Record<string, { playerName: string; teamName: string | null; supporters: SupporterData[] }> = {};
    filteredSupporters.forEach((supporter) => {
      supporter.players.forEach((player) => {
        if (!groups[player.id]) {
          groups[player.id] = { playerName: player.name, teamName: player.team_name, supporters: [] };
        }
        if (!groups[player.id].supporters.find((s) => s.id === supporter.id)) {
          groups[player.id].supporters.push(supporter);
        }
      });
    });
    return Object.entries(groups).sort((a, b) => a[1].playerName.localeCompare(b[1].playerName));
  }, [filteredSupporters]);

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
            <Button variant="accent" onClick={() => setShowCreateSupporter(true)} className="gap-2">
              <Plus className="w-4 h-4" />
              Ajouter un supporter
            </Button>
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
            {playerGroups.map(([playerId, group]) => {
              const isOpen = collapsedPlayers[playerId] !== true;
              return (
                <Collapsible key={playerId} open={isOpen} onOpenChange={() => togglePlayer(playerId)}>
                  <CollapsibleTrigger className="flex items-center gap-2 w-full p-3 rounded-lg bg-muted/60 hover:bg-muted transition-colors cursor-pointer">
                    <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? "" : "-rotate-90"}`} />
                    <Heart className="w-4 h-4 text-primary" />
                    <span className="font-display font-semibold text-sm">{group.playerName}</span>
                    {group.teamName && (
                      <Badge variant="outline" className="text-xs">{group.teamName}</Badge>
                    )}
                    <Badge variant="secondary" className="ml-auto text-xs">
                      {group.supporters.length} supporter{group.supporters.length > 1 ? "s" : ""}
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
                            {canCreate && <TableHead className="w-[80px]">Actions</TableHead>}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {group.supporters.map((supporter) => (
                            <TableRow key={supporter.id}>
                              <TableCell>
                                <div className="flex items-center gap-3">
                                  <Avatar className="h-10 w-10">
                                    <AvatarImage src={supporter.photo_url || undefined} />
                                    <AvatarFallback className="bg-primary/10 text-primary font-medium">
                                      {getInitials(supporter.first_name, supporter.last_name)}
                                    </AvatarFallback>
                                  </Avatar>
                                  <span className="font-medium">{getDisplayName(supporter)}</span>
                                </div>
                              </TableCell>
                              <TableCell>
                                <span className="text-sm text-muted-foreground">{supporter.email}</span>
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1.5">
                                  {supporter.players.map((p) => (
                                    <Badge key={p.id} variant="secondary" className="text-xs">
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
                                    className="text-blue-500 hover:text-blue-700"
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
