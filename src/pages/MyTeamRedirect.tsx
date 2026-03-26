import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

export default function MyTeamRedirect() {
  const navigate = useNavigate();
  const { user, currentRole, loading } = useAuth();

  const { data: teamId, isLoading } = useQuery({
    queryKey: ["my-team-redirect", user?.id, currentRole?.id],
    queryFn: async () => {
      if (!user || !currentRole) return null;

      let playerId = user.id;

      if (currentRole.role === "supporter") {
        const { data } = await supabase
          .from("supporters_link")
          .select("player_id")
          .eq("supporter_id", user.id)
          .limit(1)
          .maybeSingle();

        if (!data?.player_id) return null;
        playerId = data.player_id;
      }

      const { data } = await supabase
        .from("team_members")
        .select("team_id")
        .eq("user_id", playerId)
        .eq("member_type", "player")
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

      return data?.team_id ?? null;
    },
    enabled: !!user && !!currentRole && (currentRole.role === "player" || currentRole.role === "supporter"),
    staleTime: 1000 * 60 * 5,
  });

  useEffect(() => {
    if (loading || isLoading) return;

    if (!user || !currentRole || (currentRole.role !== "player" && currentRole.role !== "supporter")) {
      navigate("/dashboard", { replace: true });
      return;
    }

    if (teamId) {
      navigate(`/teams/${teamId}`, { replace: true });
      return;
    }

    navigate("/player/dashboard", { replace: true });
  }, [currentRole, isLoading, loading, navigate, teamId, user]);

  return (
    <AppLayout>
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
      </div>
    </AppLayout>
  );
}
