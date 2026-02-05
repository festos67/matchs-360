import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ClipboardList, Heart, AlertTriangle } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SupporterEvaluationForm } from "@/components/evaluation/SupporterEvaluationForm";
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

interface RequestDetails {
  id: string;
  player_id: string;
  status: string;
  player: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    nickname: string | null;
  };
  team: {
    id: string;
    name: string;
    club: {
      name: string;
      primary_color: string;
    };
  } | null;
}

export default function SupporterEvaluation() {
  const { requestId } = useParams<{ requestId: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading, currentRole } = useAuth();

  const [request, setRequest] = useState<RequestDetails | null>(null);
  const [frameworkId, setFrameworkId] = useState<string | null>(null);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [loading, setLoading] = useState(true);

  // Redirect if not supporter
  useEffect(() => {
    if (!authLoading && (!user || currentRole?.role !== "supporter")) {
      navigate("/dashboard", { replace: true });
    }
  }, [user, authLoading, currentRole, navigate]);

  useEffect(() => {
    if (user && requestId) {
      fetchData();
    }
  }, [user, requestId]);

  const fetchData = async () => {
    if (!user || !requestId) return;

    try {
      // Fetch request details
      const { data: reqData, error: reqError } = await supabase
        .from("supporter_evaluation_requests")
        .select(`
          id,
          player_id,
          status,
          profiles:player_id (
            id,
            first_name,
            last_name,
            nickname
          )
        `)
        .eq("id", requestId)
        .eq("supporter_id", user.id)
        .single();

      if (reqError) throw reqError;

      if (!reqData) {
        toast.error("Demande non trouvée");
        navigate("/supporter/dashboard");
        return;
      }

      if (reqData.status !== "pending") {
        toast.error("Cette demande a déjà été traitée");
        navigate("/supporter/dashboard");
        return;
      }

      // Fetch player's team
      const { data: memberData, error: memberError } = await supabase
        .from("team_members")
        .select(`
          team_id,
          teams (
            id,
            name,
            clubs (name, primary_color)
          )
        `)
        .eq("user_id", reqData.player_id)
        .eq("member_type", "player")
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

      if (memberError) throw memberError;

      const team = memberData?.teams as any;
      
      setRequest({
        ...reqData,
        player: reqData.profiles as any,
        team: team ? {
          id: team.id,
          name: team.name,
          club: team.clubs,
        } : null,
      });

      if (!team) {
        toast.error("Le joueur n'est pas associé à une équipe");
        return;
      }

      // Fetch framework
      const { data: framework, error: frameworkError } = await supabase
        .from("competence_frameworks")
        .select("id")
        .eq("team_id", team.id)
        .maybeSingle();

      if (frameworkError) throw frameworkError;

      if (!framework) {
        toast.error("Aucun référentiel configuré pour cette équipe");
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

  const getPlayerName = () => {
    if (!request?.player) return "Joueur";
    const { nickname, first_name, last_name } = request.player;
    if (nickname) return nickname;
    if (first_name && last_name) return `${first_name} ${last_name}`;
    return first_name || "Joueur";
  };

  if (!request || !frameworkId || themes.length === 0) {
    return (
      <AppLayout>
        <Button variant="ghost" className="mb-6 -ml-2" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Retour
        </Button>
        <div className="glass-card p-12 text-center">
          <AlertTriangle className="w-16 h-16 mx-auto text-warning/50 mb-4" />
          <h3 className="text-lg font-medium text-muted-foreground">
            Débrief non disponible
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Cette demande de débrief n'est plus accessible ou le référentiel n'est pas configuré.
          </p>
          <Button className="mt-4" onClick={() => navigate("/supporter/dashboard")}>
            Retour au tableau de bord
          </Button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      {/* Back Button */}
      <Button variant="ghost" className="mb-6 -ml-2" onClick={() => navigate(-1)}>
        <ArrowLeft className="w-4 h-4 mr-2" />
        Retour
      </Button>

      {/* Header */}
      <div className="glass-card p-6 mb-8 bg-gradient-to-r from-orange-500/10 to-amber-500/10 border-orange-500/30">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl bg-orange-500/20 flex items-center justify-center">
            <Heart className="w-7 h-7 text-orange-500" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-display font-bold text-foreground">
                Évaluation de {getPlayerName()}
              </h1>
              <Badge variant="outline" className="bg-orange-500/20 text-orange-600 border-orange-500/30">
                Point de vue Supporter
              </Badge>
            </div>
            <p className="text-muted-foreground">
              Partagez votre perception des compétences du joueur.
            </p>
            {request.team && (
              <p className="text-sm text-muted-foreground mt-1">
                <span 
                  className="inline-block w-2 h-2 rounded-full mr-2" 
                  style={{ backgroundColor: request.team.club?.primary_color || "#3B82F6" }}
                />
                {request.team.name} - {request.team.club?.name}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Evaluation Form */}
      <SupporterEvaluationForm
        playerId={request.player_id}
        playerName={getPlayerName()}
        teamId={request.team?.id || ""}
        frameworkId={frameworkId}
        themes={themes}
        requestId={requestId}
        onSaved={() => {
          toast.success("Merci pour votre contribution !");
          navigate("/supporter/dashboard");
        }}
      />
    </AppLayout>
  );
}
