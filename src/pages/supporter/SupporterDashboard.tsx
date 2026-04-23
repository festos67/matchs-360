/**
 * @page SupporterDashboard
 * @route /supporter/dashboard
 *
 * Tableau de bord d'accueil du Supporter.
 *
 * @description
 * Vue lecture seule des joueurs liés (via supporters_link). Affiche les
 * invitations en attente de débrief (supporter_evaluation_requests).
 *
 * @access Supporter — voit uniquement ses joueurs liés
 *   (mem://logic/supporter-data-access)
 *
 * @maintenance
 * Les supporters ne voient PAS les auto-débriefs des joueurs (privacy).
 */
import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { StatsCard } from "@/components/shared/StatsCard";
import { Heart, ClipboardList, Clock, Star, CheckCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { CircleAvatar } from "@/components/shared/CircleAvatar";

interface LinkedPlayerEnriched {
  id: string;
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
  photo_url: string | null;
  teamName: string | null;
  teamId: string | null;
  teamColor: string | null;
  clubName: string | null;
  coachName: string | null;
  evalCount: number;
}

interface EvaluationRequest {
  id: string;
  player_id: string;
  status: string;
  created_at: string;
  expires_at: string;
  playerName: string;
  coachName: string;
}

const SupporterDashboard = () => {
  const navigate = useNavigate();
  const { user, loading, currentRole, profile } = useAuth();
  const queryClient = useQueryClient();
  const [requestToDelete, setRequestToDelete] = useState<EvaluationRequest | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteRequest = async () => {
    if (!requestToDelete) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from("supporter_evaluation_requests")
        .delete()
        .eq("id", requestToDelete.id);
      if (error) throw error;
      toast.success("Demande supprimée. Le coach a été notifié.");
      queryClient.invalidateQueries({ queryKey: ["supporter-pending-requests-enriched", user?.id] });
      setRequestToDelete(null);
    } catch (e: any) {
      console.error("Error deleting request", e);
      toast.error("Erreur lors de la suppression");
    } finally {
      setIsDeleting(false);
    }
  };

  useEffect(() => {
    if (!loading && (!user || currentRole?.role !== "supporter")) {
      navigate("/dashboard", { replace: true });
    }
  }, [user, loading, currentRole, navigate]);

  // Fetch enriched linked players
  const { data: linkedPlayers, isLoading: loadingPlayers } = useQuery({
    queryKey: ["supporter-linked-players-enriched", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data: links, error } = await supabase
        .from("supporters_link")
        .select("player_id")
        .eq("supporter_id", user.id);
      if (error) throw error;
      if (!links || links.length === 0) return [];

      const playerIds = links.map(l => l.player_id);

      // Fetch profiles
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, nickname, photo_url")
        .in("id", playerIds);

      // Fetch team memberships for players
      const { data: memberships } = await supabase
        .from("team_members")
        .select("user_id, team_id, member_type")
        .in("user_id", playerIds)
        .eq("member_type", "player")
        .eq("is_active", true)
        .is("deleted_at", null);

      const teamIds = [...new Set((memberships || []).map(m => m.team_id))];

      // Fetch teams with clubs
      const teamsResult = teamIds.length > 0
        ? await supabase.from("teams").select("id, name, color, club_id, club:clubs(name)").in("id", teamIds)
        : { data: [] as any[] };
      const teams = teamsResult.data || [];

      // Fetch coaches for those teams
      const coachResult = teamIds.length > 0
        ? await supabase
            .from("team_members")
            .select("team_id, coach_role, profile:profiles!inner(first_name, last_name)")
            .in("team_id", teamIds)
            .eq("member_type", "coach")
            .eq("is_active", true)
            .is("deleted_at", null)
        : { data: [] as any[] };
      const coachMembers = coachResult.data || [];

      // Fetch eval counts per player (coach type only)
      const { data: evalCounts } = await supabase
        .from("evaluations")
        .select("player_id")
        .in("player_id", playerIds)
        .eq("type", "coach" as any)
        .is("deleted_at", null);

      const evalCountMap = new Map<string, number>();
      (evalCounts || []).forEach(e => {
        evalCountMap.set(e.player_id, (evalCountMap.get(e.player_id) || 0) + 1);
      });

      const teamsMap = new Map((teams || []).map(t => [t.id, t]));
      const membershipMap = new Map((memberships || []).map(m => [m.user_id, m]));

      // Build coach map: team_id -> referent coach name (or first coach)
      const coachMap = new Map<string, string>();
      (coachMembers || []).forEach((cm: any) => {
        const name = cm.profile?.first_name && cm.profile?.last_name
          ? `${cm.profile.first_name} ${cm.profile.last_name}`
          : cm.profile?.first_name || "Coach";
        if (cm.coach_role === "referent" || !coachMap.has(cm.team_id)) {
          coachMap.set(cm.team_id, name);
        }
      });

      return (profiles || []).map(p => {
        const membership = membershipMap.get(p.id);
        const team = membership ? teamsMap.get(membership.team_id) : null;
        const clubName = team?.club ? (team.club as any).name : null;

        return {
          id: p.id,
          first_name: p.first_name,
          last_name: p.last_name,
          nickname: p.nickname,
          photo_url: p.photo_url,
          teamName: team?.name || null,
          teamId: team?.id || null,
          teamColor: team?.color || null,
          clubName,
          coachName: membership ? coachMap.get(membership.team_id) || null : null,
          evalCount: evalCountMap.get(p.id) || 0,
        } as LinkedPlayerEnriched;
      });
    },
    enabled: !!user,
  });

  // Fetch pending evaluation requests with coach name
  const { data: pendingRequests, isLoading: loadingRequests } = useQuery({
    queryKey: ["supporter-pending-requests-enriched", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("supporter_evaluation_requests")
        .select("id, player_id, status, created_at, expires_at, requested_by")
        .eq("supporter_id", user.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      if (error) throw error;
      if (!data || data.length === 0) return [];

      const playerIds = [...new Set(data.map(r => r.player_id))];
      const coachIds = [...new Set(data.map(r => r.requested_by))];
      const allIds = [...new Set([...playerIds, ...coachIds])];

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, nickname")
        .in("id", allIds);

      const profilesMap = new Map((profiles || []).map(p => [p.id, p]));

      const getName = (p: any) => {
        if (!p) return "Inconnu";
        if (p.nickname) return p.nickname;
        if (p.first_name && p.last_name) return `${p.first_name} ${p.last_name}`;
        return p.first_name || "Inconnu";
      };

      return data.map(r => ({
        id: r.id,
        player_id: r.player_id,
        status: r.status,
        created_at: r.created_at,
        expires_at: r.expires_at,
        playerName: getName(profilesMap.get(r.player_id)),
        coachName: getName(profilesMap.get(r.requested_by)),
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
        .eq("evaluator_id", user.id)
        .eq("type", "supporter" as any)
        .is("deleted_at", null);
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

  const getPlayerName = (p: LinkedPlayerEnriched) => {
    if (p.nickname) return p.nickname;
    if (p.first_name && p.last_name) return `${p.first_name} ${p.last_name}`;
    return p.first_name || "Joueur";
  };

  const getPlayerFullName = (p: LinkedPlayerEnriched) => {
    if (p.first_name && p.last_name) return `${p.first_name} ${p.last_name}`;
    return p.nickname || p.first_name || "Joueur";
  };

  return (
    <AppLayout>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-display font-bold text-foreground flex items-center gap-3">
            Bonjour {profile?.first_name || "Supporter"}
            <Heart className="w-7 h-7 text-pink-500" />
          </h1>
          <p className="text-muted-foreground mt-1">Mes joueurs</p>
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
                      {request.playerName.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium">{request.playerName}</p>
                      <p className="text-xs text-muted-foreground">
                        Le coach <span className="font-semibold text-foreground">{request.coachName}</span> vous demande votre avis
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Demandé le {format(new Date(request.created_at), "d MMM yyyy", { locale: fr })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button asChild className="gap-2 bg-orange-500 hover:bg-orange-600">
                      <Link to={`/supporter/evaluate/${request.id}`}>
                        <ClipboardList className="w-4 h-4" />
                        Débriefer
                      </Link>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => setRequestToDelete(request)}
                      title="Supprimer la demande"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Linked Players as circles */}
        <div>
          <h2 className="text-xl font-display font-semibold mb-6">Mes Joueurs</h2>
          {loadingPlayers ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex flex-col items-center gap-2">
                  <Skeleton className="w-24 h-24 rounded-full" />
                  <Skeleton className="h-4 w-20" />
                </div>
              ))}
            </div>
          ) : linkedPlayers && linkedPlayers.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8">
              {linkedPlayers.map((player, index) => (
                <div
                  key={player.id}
                  className="flex flex-col items-center text-center animate-fade-in-up opacity-0"
                  style={{ animationDelay: `${index * 0.08}s` }}
                >
                  <CircleAvatar
                    shape="circle"
                    name={getPlayerName(player)}
                    imageUrl={player.photo_url}
                    color={player.teamColor || "#3B82F6"}
                    size="md"
                    onClick={() => navigate(`/players/${player.id}`)}
                    showName={false}
                  />
                  <button
                    onClick={() => navigate(`/players/${player.id}`)}
                    className="mt-2 font-medium text-foreground hover:text-primary transition-colors text-sm"
                  >
                    {getPlayerFullName(player)}
                  </button>
                  {player.clubName && (
                    <p className="text-xs text-muted-foreground">{player.clubName}</p>
                  )}
                  {player.teamName && player.teamId && (
                    <button
                      onClick={() => navigate(`/teams/${player.teamId}`)}
                      className="text-xs text-primary hover:underline"
                    >
                      {player.teamName}
                    </button>
                  )}
                  {player.coachName && (
                    <p className="text-xs text-muted-foreground">Coach : {player.coachName}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {player.evalCount} débrief{player.evalCount > 1 ? "s" : ""} officiel{player.evalCount > 1 ? "s" : ""}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-48 glass-card">
              <Heart className="w-12 h-12 text-muted-foreground/50 mb-3" />
              <p className="text-muted-foreground">Aucun joueur lié à votre compte</p>
            </div>
          )}
        </div>
      </div>

      <AlertDialog open={!!requestToDelete} onOpenChange={(o) => !o && setRequestToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer la demande de débrief ?</AlertDialogTitle>
            <AlertDialogDescription>
              Vous êtes sur le point de supprimer la demande pour{" "}
              <strong>{requestToDelete?.playerName}</strong>. Le coach{" "}
              <strong>{requestToDelete?.coachName}</strong> sera notifié de votre refus.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDeleteRequest(); }}
              disabled={isDeleting}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              {isDeleting ? "Suppression..." : "Supprimer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
};

export default SupporterDashboard;
