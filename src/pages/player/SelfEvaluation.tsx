import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ClipboardList, Star } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SelfEvaluationForm } from "@/components/evaluation/SelfEvaluationForm";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Theme {
  id: string;
  name: string;
  color: string | null;
  order_index: number;
  skills: Array<{
    id: string;
    name: string;
    definition: string | null;
    order_index: number;
  }>;
}

interface TeamInfo {
  id: string;
  name: string;
  color: string | null;
  club: { name: string; primary_color: string };
}

export default function SelfEvaluation() {
  const navigate = useNavigate();
  const { user, loading: authLoading, currentRole, profile } = useAuth();

  const [teamInfo, setTeamInfo] = useState<TeamInfo | null>(null);
  const [frameworkId, setFrameworkId] = useState<string | null>(null);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [loading, setLoading] = useState(true);

  // Redirect if not player
  useEffect(() => {
    if (!authLoading && (!user || (currentRole?.role !== "player" && currentRole?.role !== "supporter"))) {
      navigate("/dashboard", { replace: true });
    }
  }, [user, authLoading, currentRole, navigate]);

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  const fetchData = async () => {
    if (!user) return;

    try {
      // Fetch player's team
      const { data: membership, error: memberError } = await supabase
        .from("team_members")
        .select(`
          team_id,
          teams (
            id,
            name,
            color,
            clubs (name, primary_color)
          )
        `)
        .eq("user_id", user.id)
        .eq("member_type", "player")
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

      if (memberError) throw memberError;

      if (!membership) {
        toast.error("Vous n'êtes pas associé à une équipe");
        navigate("/player/dashboard");
        return;
      }

      const team = membership.teams as any;
      setTeamInfo({
        id: team.id,
        name: team.name,
        color: team.color,
        club: team.clubs,
      });

      // Fetch framework
      const { data: framework, error: frameworkError } = await supabase
        .from("competence_frameworks")
        .select("id")
        .eq("team_id", team.id)
        .maybeSingle();

      if (frameworkError) throw frameworkError;

      if (!framework) {
        toast.error("Aucun référentiel configuré pour votre équipe");
        navigate("/player/dashboard");
        return;
      }

      setFrameworkId(framework.id);

      // Fetch themes with skills
      const { data: themesData, error: themesError } = await supabase
        .from("themes")
        .select("*, skills(*)")
        .eq("framework_id", framework.id)
        .order("order_index");

      if (themesError) throw themesError;

      if (themesData) {
        const sortedThemes = themesData.map((theme) => ({
          ...theme,
          skills: (theme.skills || []).sort(
            (a: any, b: any) => a.order_index - b.order_index
          ),
        }));
        setThemes(sortedThemes);
      }
    } catch (error: any) {
      console.error("Error fetching data:", error);
      toast.error("Erreur lors du chargement des données");
    } finally {
      setLoading(false);
    }
  };

  if (authLoading || loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      </AppLayout>
    );
  }

  if (!teamInfo || !frameworkId || themes.length === 0) {
    return (
      <AppLayout>
        <Button variant="ghost" className="mb-6 -ml-2" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Retour
        </Button>
        <div className="glass-card p-12 text-center">
          <ClipboardList className="w-16 h-16 mx-auto text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium text-muted-foreground">
            Référentiel non disponible
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Votre équipe doit d'abord configurer son référentiel de compétences
          </p>
        </div>
      </AppLayout>
    );
  }

  const playerName = profile?.nickname || 
    (profile?.first_name && profile?.last_name 
      ? `${profile.first_name} ${profile.last_name}` 
      : profile?.first_name || "Joueur");

  return (
    <AppLayout>
      {/* Back Button */}
      <Button variant="ghost" className="mb-6 -ml-2" onClick={() => navigate(-1)}>
        <ArrowLeft className="w-4 h-4 mr-2" />
        Retour
      </Button>

      {/* Header */}
      <div className="glass-card p-6 mb-8 bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border-emerald-500/30">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl bg-emerald-500/20 flex items-center justify-center">
            <Star className="w-7 h-7 text-emerald-500" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-display font-bold text-foreground">
                Mon Auto-débrief
              </h1>
              <Badge variant="outline" className="bg-emerald-500/20 text-emerald-600 border-emerald-500/30">
                Perception personnelle
              </Badge>
            </div>
            <p className="text-muted-foreground">
              Comment percevez-vous vos compétences ? Auto-débriefez-vous sur le référentiel de votre équipe.
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              <span 
                className="inline-block w-2 h-2 rounded-full mr-2" 
                style={{ backgroundColor: teamInfo.club?.primary_color || "#3B82F6" }}
              />
              {teamInfo.name} - {teamInfo.club?.name}
            </p>
          </div>
        </div>
      </div>

      {/* Self Evaluation Form */}
      <SelfEvaluationForm
        playerId={user!.id}
        playerName={playerName}
        teamId={teamInfo.id}
        frameworkId={frameworkId}
        themes={themes}
        onSaved={() => {
          toast.success("Auto-débrief enregistré !");
          navigate("/player/dashboard");
        }}
      />
    </AppLayout>
  );
}
