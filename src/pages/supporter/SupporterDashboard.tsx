import { useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { StatsCard } from "@/components/shared/StatsCard";
import { Heart, ClipboardList, Clock, Eye, Star, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

interface LinkedPlayer {
  id: string;
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
}

interface EvaluationRequest {
  id: string;
  player_id: string;
  status: string;
  created_at: string;
  expires_at: string;
  player: LinkedPlayer;
}

const SupporterDashboard = () => {
  const navigate = useNavigate();
  const { user, loading, currentRole, profile } = useAuth();

  // Redirect if not supporter
  useEffect(() => {
    if (!loading && (!user || currentRole?.role !== "supporter")) {
      navigate("/dashboard", { replace: true });
    }
  }, [user, loading, currentRole, navigate]);

  // Fetch linked players
  const { data: linkedPlayers, isLoading: loadingPlayers } = useQuery({
    queryKey: ["supporter-linked-players", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("supporters_link")
        .select("player_id")
        .eq("supporter_id", user.id);

      if (error) throw error;
      
      if (!data || data.length === 0) return [];
      
      // Fetch profiles separately
      const playerIds = data.map(d => d.player_id);
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, nickname")
        .in("id", playerIds);
      
      if (profilesError) throw profilesError;
      return (profiles || []) as LinkedPlayer[];
    },
    enabled: !!user,
  });

  // Fetch pending evaluation requests
  const { data: pendingRequests, isLoading: loadingRequests } = useQuery({
    queryKey: ["supporter-pending-requests", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("supporter_evaluation_requests")
        .select("id, player_id, status, created_at, expires_at")
        .eq("supporter_id", user.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (error) throw error;
      
      if (!data || data.length === 0) return [];
      
      // Fetch profiles separately
      const playerIds = [...new Set(data.map(r => r.player_id))];
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, nickname")
        .in("id", playerIds);
      
      if (profilesError) throw profilesError;
      
      const profilesMap = new Map((profiles || []).map(p => [p.id, p]));
      
      return data.map(r => ({
        ...r,
        player: profilesMap.get(r.player_id) as LinkedPlayer,
      })) as EvaluationRequest[];
    },
    enabled: !!user,
  });

  // Fetch completed evaluations count
  const { data: completedCount } = useQuery({
    queryKey: ["supporter-completed-evals", user?.id],
    queryFn: async () => {
      if (!user) return 0;
      const { count, error } = await supabase
        .from("evaluations")
        .select("id", { count: "exact", head: true })
        .eq("coach_id", user.id)
        .eq("type", "supporter_assessment" as any);

      if (error) throw error;
      return count || 0;
    },
    enabled: !!user,
  });

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </AppLayout>
    );
  }

  const getPlayerName = (player: LinkedPlayer) => {
    if (player.nickname) return player.nickname;
    if (player.first_name && player.last_name) {
      return `${player.first_name} ${player.last_name}`;
    }
    return player.first_name || "Joueur";
  };

  return (
    <AppLayout>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground">
            Bonjour {profile?.first_name || "Supporter"} 💛
          </h1>
          <p className="text-muted-foreground mt-1">
            Suivi de mes joueurs
          </p>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StatsCard
            title="Joueurs suivis"
            value={loadingPlayers ? "-" : String(linkedPlayers?.length || 0)}
            icon={Heart}
          />
          <StatsCard
            title="Demandes en attente"
            value={loadingRequests ? "-" : String(pendingRequests?.length || 0)}
            icon={Clock}
          />
          <StatsCard
            title="Débriefs soumis"
            value={String(completedCount || 0)}
            icon={CheckCircle}
          />
        </div>

        {/* Pending Requests */}
        {(pendingRequests?.length || 0) > 0 && (
          <div className="bg-gradient-to-r from-orange-500/10 to-amber-500/10 border border-orange-500/30 rounded-xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center">
                <Star className="w-5 h-5 text-orange-500" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">Demandes de débrief</h2>
                <p className="text-sm text-muted-foreground">
                  Le coach vous demande votre avis
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {pendingRequests?.map((request) => (
                <div
                  key={request.id}
                  className="flex items-center justify-between p-4 bg-background/80 rounded-lg border border-orange-500/20"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center text-orange-500 font-bold">
                      {getPlayerName(request.player).slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium">{getPlayerName(request.player)}</p>
                      <p className="text-xs text-muted-foreground">
                        Demandé le {format(new Date(request.created_at), "d MMM yyyy", { locale: fr })}
                      </p>
                    </div>
                  </div>
                  <Button asChild className="gap-2 bg-orange-500 hover:bg-orange-600">
                    <Link to={`/supporter/evaluate/${request.id}`}>
                      <ClipboardList className="w-4 h-4" />
                      Débriefer
                    </Link>
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Linked Players */}
        <div className="bg-card rounded-xl border border-border">
          <div className="p-6 border-b border-border">
            <h2 className="text-xl font-semibold text-foreground">Mes Joueurs</h2>
            <p className="text-sm text-muted-foreground">
              Joueurs que vous suivez
            </p>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Joueur</TableHead>
                  <TableHead className="w-[150px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingPlayers ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-20" /></TableCell>
                    </TableRow>
                  ))
                ) : linkedPlayers && linkedPlayers.length > 0 ? (
                  linkedPlayers.map((player) => (
                    <TableRow key={player.id} className="hover:bg-muted/50">
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm">
                            {getPlayerName(player).slice(0, 2).toUpperCase()}
                          </div>
                          {getPlayerName(player)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" asChild>
                          <Link to={`/players/${player.id}`}>
                            <Eye className="w-4 h-4 mr-1" />
                            Voir profil
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={2} className="text-center py-8 text-muted-foreground">
                      <Heart className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      Aucun joueur lié à votre compte
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </AppLayout>
  );
};

export default SupporterDashboard;
