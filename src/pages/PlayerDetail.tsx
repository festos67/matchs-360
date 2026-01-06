import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Calendar, TrendingUp, MessageSquare, Edit, Plus } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { RadarChart } from "@/components/shared/RadarChart";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Player {
  id: string;
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
  photo_url: string | null;
  email: string;
}

interface Evaluation {
  id: string;
  name: string;
  date: string;
  notes: string | null;
  coach: {
    first_name: string | null;
    last_name: string | null;
  };
  scores: {
    skill_id: string;
    score: number | null;
    is_not_observed: boolean;
    comment: string | null;
    skill: {
      name: string;
      theme: {
        name: string;
        color: string | null;
      };
    };
  }[];
}

// Mock radar data for demo
const mockRadarData = [
  { skill: "Technique", score: 4.2, previousScore: 3.8, fullMark: 5 },
  { skill: "Tactique", score: 3.5, previousScore: 3.2, fullMark: 5 },
  { skill: "Physique", score: 4.8, previousScore: 4.5, fullMark: 5 },
  { skill: "Mental", score: 4.0, previousScore: 3.5, fullMark: 5 },
  { skill: "Communication", score: 3.8, previousScore: 3.6, fullMark: 5 },
  { skill: "Leadership", score: 3.2, previousScore: 2.8, fullMark: 5 },
];

const mockObjectives = [
  {
    theme: "Technique",
    content: "Améliorer la précision des passes longues",
    deadline: "2025-03-15",
    progress: 60,
  },
  {
    theme: "Mental",
    content: "Travailler la gestion du stress en match",
    deadline: "2025-02-28",
    progress: 40,
  },
  {
    theme: "Leadership",
    content: "Prendre plus d'initiatives lors des entraînements",
    deadline: "2025-04-01",
    progress: 25,
  },
];

export default function PlayerDetail() {
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [player, setPlayer] = useState<Player | null>(null);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user && id) {
      fetchPlayerData();
    }
  }, [user, id]);

  const fetchPlayerData = async () => {
    try {
      // Fetch player profile
      const { data: playerData, error: playerError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (playerError) throw playerError;
      if (!playerData) {
        toast.error("Joueur non trouvé");
        navigate(-1);
        return;
      }

      setPlayer(playerData);

      // Fetch evaluations
      const { data: evalData, error: evalError } = await supabase
        .from("evaluations")
        .select(`
          id,
          name,
          date,
          notes,
          coach:profiles!evaluations_coach_id_fkey(first_name, last_name),
          scores:evaluation_scores(
            skill_id,
            score,
            is_not_observed,
            comment,
            skill:skills(
              name,
              theme:themes(name, color)
            )
          )
        `)
        .eq("player_id", id)
        .order("date", { ascending: false });

      if (evalError) throw evalError;
      setEvaluations(evalData as Evaluation[]);
    } catch (error: any) {
      console.error("Error fetching player:", error);
      toast.error("Erreur lors du chargement du joueur");
    } finally {
      setLoading(false);
    }
  };

  const getPlayerName = () => {
    if (!player) return "";
    if (player.nickname) return player.nickname;
    if (player.first_name && player.last_name) {
      return `${player.first_name} ${player.last_name}`;
    }
    return player.first_name || player.last_name || "Joueur";
  };

  const getAverageScore = () => {
    const scores = mockRadarData.map((d) => d.score);
    return (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1);
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

  if (!player) return null;

  return (
    <AppLayout>
      {/* Back Button */}
      <Button variant="ghost" className="mb-6 -ml-2" onClick={() => navigate(-1)}>
        <ArrowLeft className="w-4 h-4 mr-2" />
        Retour
      </Button>

      {/* Player Header */}
      <div className="glass-card p-8 mb-8">
        <div className="flex items-start gap-8">
          {/* Avatar */}
          <div
            className="w-32 h-32 rounded-2xl flex items-center justify-center text-4xl font-display font-bold shrink-0"
            style={{
              background: player.photo_url
                ? `url(${player.photo_url}) center/cover`
                : "linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--accent)) 100%)",
              color: "white",
            }}
          >
            {!player.photo_url &&
              getPlayerName()
                .split(" ")
                .map((n) => n[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()}
          </div>

          {/* Info */}
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-display font-bold">{getPlayerName()}</h1>
              <Badge variant="secondary">U15 A</Badge>
            </div>
            <p className="text-muted-foreground">{player.email}</p>

            {/* Quick Stats */}
            <div className="flex gap-6 mt-6">
              <div className="text-center">
                <p className="text-3xl font-display font-bold text-primary">
                  {getAverageScore()}
                </p>
                <p className="text-sm text-muted-foreground">Score moyen</p>
              </div>
              <div className="w-px bg-border" />
              <div className="text-center">
                <p className="text-3xl font-display font-bold">
                  {evaluations.length || 3}
                </p>
                <p className="text-sm text-muted-foreground">Évaluations</p>
              </div>
              <div className="w-px bg-border" />
              <div className="text-center">
                <p className="text-3xl font-display font-bold text-success">+18%</p>
                <p className="text-sm text-muted-foreground">Progression</p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Nouvelle évaluation
            </Button>
            <Button variant="outline" size="icon">
              <Edit className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Tabs Content */}
      <Tabs defaultValue="radar" className="space-y-6">
        <TabsList className="bg-muted/50">
          <TabsTrigger value="radar">Vue Radar</TabsTrigger>
          <TabsTrigger value="history">Historique</TabsTrigger>
          <TabsTrigger value="objectives">Objectifs</TabsTrigger>
          <TabsTrigger value="advice">Conseils</TabsTrigger>
        </TabsList>

        {/* Radar Tab */}
        <TabsContent value="radar" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 glass-card p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-display font-semibold">
                    Analyse des compétences
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Dernière évaluation vs précédente
                  </p>
                </div>
                <Button variant="outline" size="sm">
                  <Calendar className="w-4 h-4 mr-2" />
                  Comparer
                </Button>
              </div>
              <RadarChart data={mockRadarData} showComparison />
            </div>

            {/* Skills Breakdown */}
            <div className="glass-card p-6">
              <h3 className="font-display font-semibold mb-4">
                Détail par compétence
              </h3>
              <div className="space-y-4">
                {mockRadarData.map((item) => (
                  <div key={item.skill}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium">{item.skill}</span>
                      <span className="text-sm text-muted-foreground">
                        {item.score}/5
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all duration-500"
                        style={{ width: `${(item.score / 5) * 100}%` }}
                      />
                    </div>
                    {item.previousScore && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {item.score > item.previousScore ? (
                          <span className="text-success">
                            ↑ +{(item.score - item.previousScore).toFixed(1)}
                          </span>
                        ) : item.score < item.previousScore ? (
                          <span className="text-destructive">
                            ↓ {(item.score - item.previousScore).toFixed(1)}
                          </span>
                        ) : (
                          <span>= stable</span>
                        )}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history">
          <div className="glass-card p-6">
            <h2 className="text-xl font-display font-semibold mb-6">
              Historique des évaluations
            </h2>
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="flex items-center gap-4 p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer"
                >
                  <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center">
                    <TrendingUp className="w-6 h-6 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">MATCHS360-{getPlayerName()}-202{5 - i}</p>
                    <p className="text-sm text-muted-foreground">
                      Par Coach Martin • {i === 1 ? "Il y a 2 semaines" : i === 2 ? "Il y a 2 mois" : "Il y a 6 mois"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-display font-bold text-lg">
                      {(4.5 - i * 0.3).toFixed(1)}
                    </p>
                    <p className="text-xs text-muted-foreground">/5</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* Objectives Tab */}
        <TabsContent value="objectives">
          <div className="glass-card p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-display font-semibold">
                Objectifs de progression
              </h2>
              <Button size="sm" className="gap-2">
                <Plus className="w-4 h-4" />
                Nouvel objectif
              </Button>
            </div>
            <div className="space-y-4">
              {mockObjectives.map((objective, index) => (
                <div
                  key={index}
                  className="p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <Badge variant="outline" className="mb-2">
                        {objective.theme}
                      </Badge>
                      <p className="font-medium">{objective.content}</p>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      Échéance: {new Date(objective.deadline).toLocaleDateString("fr-FR")}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${objective.progress}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium">{objective.progress}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* Advice Tab */}
        <TabsContent value="advice">
          <div className="glass-card p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-display font-semibold">
                Conseils personnalisés
              </h2>
              <Button size="sm" variant="outline" className="gap-2">
                <MessageSquare className="w-4 h-4" />
                Générer des conseils
              </Button>
            </div>
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-success/10 border border-success/20">
                <h4 className="font-medium text-success mb-2">Point fort : Physique</h4>
                <p className="text-sm text-muted-foreground">
                  Excellent niveau physique, continue à maintenir cette qualité. 
                  Tu peux utiliser cet atout pour compenser dans les situations difficiles.
                </p>
              </div>
              <div className="p-4 rounded-lg bg-warning/10 border border-warning/20">
                <h4 className="font-medium text-warning mb-2">À travailler : Leadership</h4>
                <p className="text-sm text-muted-foreground">
                  Essaie de prendre plus la parole lors des séances d'entraînement. 
                  Commence par guider les exercices d'échauffement.
                </p>
              </div>
              <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
                <h4 className="font-medium text-primary mb-2">Conseil du coach</h4>
                <p className="text-sm text-muted-foreground">
                  "Thomas montre une belle progression cette saison. Il doit continuer 
                  à travailler sa communication avec ses coéquipiers pour devenir 
                  un vrai leader sur le terrain."
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  — Coach Martin, 15 janvier 2025
                </p>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
}
