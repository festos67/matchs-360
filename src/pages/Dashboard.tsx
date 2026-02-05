import { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { Building2, Users, Trophy, TrendingUp, Calendar, Activity, Mail, Clock, FileText, ExternalLink } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { StatsCard } from "@/components/shared/StatsCard";
import { RadarChart } from "@/components/shared/RadarChart";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

// Mock data for demo
const mockRadarData = [
  { skill: "Technique", score: 4, fullMark: 5 },
  { skill: "Tactique", score: 3, fullMark: 5 },
  { skill: "Physique", score: 5, fullMark: 5 },
  { skill: "Mental", score: 4, fullMark: 5 },
  { skill: "Communication", score: 3, fullMark: 5 },
  { skill: "Leadership", score: 4, fullMark: 5 },
];

const recentEvaluations = [
  { player: "Thomas Martin", team: "U15 A", date: "Il y a 2 heures", score: 4.2 },
  { player: "Lucas Bernard", team: "U17 B", date: "Il y a 5 heures", score: 3.8 },
  { player: "Emma Dubois", team: "U15 A", date: "Hier", score: 4.5 },
];

export default function Dashboard() {
  const { user, profile, loading, roles, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isDemo = searchParams.get("demo") === "true";
  const [hasPendingRequest, setHasPendingRequest] = useState(false);

  const hasNoAccess = !isDemo && user && roles.length === 0;

  useEffect(() => {
    if (!loading && !user && !isDemo) {
      navigate("/auth");
    }
  }, [user, loading, navigate, isDemo]);

  // Check for pending role request
  useEffect(() => {
    const checkPendingRequest = async () => {
      if (!user || roles.length > 0) return;
      
      const { data } = await supabase
        .from("role_requests")
        .select("id, status")
        .eq("user_id", user.id)
        .eq("status", "pending")
        .maybeSingle();
      
      setHasPendingRequest(!!data);
    };
    
    checkPendingRequest();
  }, [user, roles]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  // Show waiting screen for users without any role
  if (hasNoAccess) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-6">
            <Clock className="w-10 h-10 text-primary" />
          </div>
          <h1 className="text-3xl font-display font-bold mb-4">
            {hasPendingRequest ? "Demande en cours de validation" : "En attente d'invitation"}
          </h1>
          <p className="text-muted-foreground max-w-md mb-8">
            {hasPendingRequest 
              ? "Votre demande de rôle est en attente de validation par un administrateur."
              : "Votre compte a été créé avec succès ! Pour accéder à l'application, vous devez être invité par un administrateur de club ou un coach."}
          </p>
          
          {hasPendingRequest ? (
            <Button asChild className="mb-4">
              <Link to="/pending-approval">
                <FileText className="w-4 h-4 mr-2" />
                Voir ma demande
              </Link>
            </Button>
          ) : (
            <div className="glass-card p-6 max-w-sm w-full mb-4">
              <div className="flex items-center gap-3 mb-4">
                <Mail className="w-5 h-5 text-primary" />
                <p className="font-medium">Vérifiez votre boîte email</p>
              </div>
              <p className="text-sm text-muted-foreground">
                Vous recevrez un email d'invitation lorsqu'un club vous ajoutera à son équipe.
              </p>
            </div>
          )}
          
          <p className="text-sm text-muted-foreground">
            Connecté en tant que: <span className="font-medium text-foreground">{profile?.email}</span>
          </p>
          <Button 
            variant="ghost" 
            className="mt-4"
            onClick={() => supabase.auth.signOut().then(() => navigate("/"))}
          >
            Se déconnecter
          </Button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      {/* Header */}
      <div className="mb-8">
        {isDemo && (
          <div className="mb-4 p-3 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-between">
            <p className="text-sm text-primary">
              🎯 Mode démo - Données fictives pour découvrir l'application
            </p>
            <Button size="sm" onClick={() => navigate("/auth")}>
              Créer un compte
            </Button>
          </div>
        )}
        <h1 className="text-3xl font-display font-bold">
          Bonjour, {isDemo ? "Visiteur" : (profile?.first_name || "Coach")} 👋
        </h1>
        <p className="text-muted-foreground mt-1">
          {isDemo ? "Découvrez les fonctionnalités de MATCHS360" : "Voici un aperçu de votre activité"}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatsCard
          title="Clubs"
          value="3"
          subtitle="Organisations actives"
          icon={Building2}
          color="primary"
        />
        <StatsCard
          title="Équipes"
          value="12"
          subtitle="Réparties sur 3 clubs"
          icon={Users}
          trend={{ value: 8, label: "ce mois" }}
          color="success"
        />
        <StatsCard
          title="Débriefs"
          value="156"
          subtitle="Total cette saison"
          icon={Trophy}
          trend={{ value: 23, label: "vs mois dernier" }}
          color="warning"
        />
        <StatsCard
          title="Progression"
          value="+18%"
          subtitle="Moyenne des joueurs"
          icon={TrendingUp}
          color="success"
        />
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Radar Chart */}
        <div className="lg:col-span-2 glass-card p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-display font-semibold">
                Analyse des compétences
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Moyenne de l'équipe U15 A
              </p>
            </div>
            <Button variant="outline" size="sm">
              <Calendar className="w-4 h-4 mr-2" />
              Cette saison
            </Button>
          </div>
          <RadarChart data={mockRadarData} />
        </div>

        {/* Recent Evaluations */}
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-display font-semibold">
              Débriefs récents
            </h2>
            <Button variant="ghost" size="sm" className="text-primary">
              Voir tout
            </Button>
          </div>
          
          <div className="space-y-4">
            {recentEvaluations.map((evaluation, index) => (
              <div
                key={index}
                className="flex items-center gap-4 p-4 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors cursor-pointer"
              >
                <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                  <Activity className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{evaluation.player}</p>
                  <p className="text-sm text-muted-foreground">
                    {evaluation.team} • {evaluation.date}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-display font-bold text-lg">
                    {evaluation.score}
                  </p>
                  <p className="text-xs text-muted-foreground">/5</p>
                </div>
              </div>
            ))}
          </div>

          <Button className="w-full mt-6" variant="outline">
            Nouvelle évaluation
          </Button>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
        <Button
          variant="outline"
          className="h-auto p-6 flex flex-col items-start gap-2 hover:border-primary/50"
          onClick={() => navigate("/clubs")}
        >
          <Building2 className="w-6 h-6 text-primary" />
          <div className="text-left">
            <p className="font-medium">Gérer les clubs</p>
            <p className="text-sm text-muted-foreground">
              Ajouter ou modifier vos organisations
            </p>
          </div>
        </Button>
        <Button
          variant="outline"
          className="h-auto p-6 flex flex-col items-start gap-2 hover:border-primary/50"
          onClick={() => navigate("/teams")}
        >
          <Users className="w-6 h-6 text-primary" />
          <div className="text-left">
            <p className="font-medium">Voir les équipes</p>
            <p className="text-sm text-muted-foreground">
              Accéder aux joueurs et coachs
            </p>
          </div>
        </Button>
        <Button
          variant="outline"
          className="h-auto p-6 flex flex-col items-start gap-2 hover:border-primary/50"
          onClick={() => navigate("/evaluations")}
        >
          <Trophy className="w-6 h-6 text-primary" />
          <div className="text-left">
            <p className="font-medium">Évaluer un joueur</p>
            <p className="text-sm text-muted-foreground">
              Créer une nouvelle évaluation
            </p>
          </div>
        </Button>
      </div>
    </AppLayout>
  );
}
