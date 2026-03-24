import { useState, useEffect } from "react";
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
import { Search, Users, Loader2 } from "lucide-react";

interface PlayerData {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
  photo_url: string | null;
  teams: { id: string; name: string; club_name: string | null }[];
}

const Players = () => {
  const { hasAdminRole: isAdmin, currentRole } = useAuth();
  const navigate = useNavigate();
  const [players, setPlayers] = useState<PlayerData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchPlayers();
  }, [isAdmin, currentRole]);

  const fetchPlayers = async () => {
    setLoading(true);
    try {
      // Get player team memberships with profile and team info
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

      // Sort alphabetically
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

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-display font-bold">Joueurs</h1>
            <p className="text-muted-foreground mt-1">
              {isAdmin
                ? "Tous les joueurs de la plateforme"
                : "Les joueurs de votre périmètre"}
            </p>
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

        {/* Table */}
        <div className="rounded-lg border bg-card">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredPlayers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
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
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Joueur</TableHead>
                  <TableHead>Surnom</TableHead>
                  <TableHead>Équipe(s)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPlayers.map((player) => (
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
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

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
