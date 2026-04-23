/**
 * @page SupporterEvaluation
 * @route /supporter/evaluation/:requestId
 *
 * Création d'un débrief Supporter sur invitation d'un coach.
 *
 * @description
 * Cible un lien envoyé par RequestSupporterEvaluationModal. Le supporter
 * remplit le SupporterEvaluationForm. La requête `supporter_evaluation_requests`
 * passe à "completed" à la soumission.
 *
 * @validation
 * - L'invitation doit exister et ne pas être expirée
 * - Le supporter doit être lié au joueur (supporters_link)
 * - Une seule réponse possible par invitation
 *
 * @access Supporter destinataire de l'invitation
 *
 * @maintenance
 * - `evaluation_type = "supporter"` et `evaluator_id = supporter.id`
 * - Compté dans `max_supporter_evals_per_player` du plan
 */
import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ClipboardList, Heart, AlertTriangle, Play, Lock } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [alreadyEvaluated, setAlreadyEvaluated] = useState(false);
  const [showAlreadyEvaluated, setShowAlreadyEvaluated] = useState(false);
  const startCardRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);

  const handleBack = () => {
    if (hasUnsavedChanges) {
      setShowLeaveConfirm(true);
    } else {
      navigate(-1);
    }
  };

  const handleStart = () => {
    setHasStarted(true);
    setTimeout(() => {
      headerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  };

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
        .eq("is_archived", false)
        .maybeSingle();

      if (frameworkError) throw frameworkError;

      if (!framework) {
        toast.error("Aucun référentiel configuré pour cette équipe");
        return;
      }

      setFrameworkId(framework.id);

      // Check if this supporter already submitted an evaluation for this player
      const { data: existingEvals } = await supabase
        .from("evaluations")
        .select("id")
        .eq("player_id", reqData.player_id)
        .eq("evaluator_id", user.id)
        .eq("type", "supporter" as any)
        .is("deleted_at", null)
        .limit(1);

      if (existingEvals && existingEvals.length > 0) {
        setAlreadyEvaluated(true);
        setShowAlreadyEvaluated(true);
      }

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
      <Button variant="ghost" className="mb-6 -ml-2" onClick={handleBack}>
        <ArrowLeft className="w-4 h-4 mr-2" />
        Retour
      </Button>

      {/* Header */}
      <div ref={headerRef} className="glass-card p-6 mb-8 bg-gradient-to-r from-orange-500/10 to-amber-500/10 border-orange-500/30 scroll-mt-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold text-lg shrink-0">
            {getPlayerName().slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-display font-bold text-foreground">
                Débrief de {getPlayerName()}
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
          <div className="w-14 h-14 rounded-xl bg-orange-500/20 flex items-center justify-center shrink-0">
            <Heart className="w-7 h-7 text-orange-500" />
          </div>
        </div>
      </div>

      {/* Start card – between header and form */}
      {!hasStarted && (
        <div
          ref={startCardRef}
          className="glass-card p-8 mb-8 text-center border-2 border-dashed border-warning/40 bg-warning/5 scroll-mt-4"
        >
          <Play className="w-10 h-10 mx-auto mb-3 text-warning" />
          <h3 className="text-lg font-display font-semibold mb-2">
            Prêt(e) à partager votre perception ?
          </h3>
          <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
            Cliquez sur le bouton ci-dessous pour démarrer le débrief. Vos
            réponses ne seront enregistrées qu'après validation finale.
          </p>
          <Button
            size="lg"
            onClick={handleStart}
            disabled={alreadyEvaluated}
            className="gap-2 bg-warning hover:bg-warning/90 text-warning-foreground"
          >
            <Play className="w-4 h-4" />
            Démarrer le débrief
          </Button>
        </div>
      )}

      {/* Evaluation Form */}
      <SupporterEvaluationForm
        playerId={request.player_id}
        playerName={getPlayerName()}
        teamId={request.team?.id || ""}
        frameworkId={frameworkId}
        themes={themes}
        requestId={requestId}
        hasStarted={hasStarted}
        onUnsavedChangesChange={setHasUnsavedChanges}
        onSaved={() => {
          navigate("/supporter/dashboard");
        }}
      />

      <AlertDialog open={showLeaveConfirm} onOpenChange={setShowLeaveConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Arrêter la saisie ?</AlertDialogTitle>
            <AlertDialogDescription>
              Si vous quittez sans enregistrer, vos réponses seront perdues et
              le coach n'y aura pas accès. Êtes-vous sûr(e) de vouloir arrêter ?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuer à modifier</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { setShowLeaveConfirm(false); navigate(-1); }}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              Arrêter la saisie
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Already-evaluated warning (Pro upgrade required) */}
      <AlertDialog open={showAlreadyEvaluated} onOpenChange={setShowAlreadyEvaluated}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-warning" />
              Avis déjà donné
            </AlertDialogTitle>
            <AlertDialogDescription>
              Attention : vous avez déjà donné votre avis une fois pour ce
              joueur. Pour pouvoir le donner à nouveau, le club doit passer
              en formule Pro.
              <br /><br />
              <span className="text-xs">
                Cette décision revient au club, pas au supporter.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              onClick={() => {
                setShowAlreadyEvaluated(false);
                navigate("/supporter/dashboard");
              }}
            >
              J'ai compris
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
