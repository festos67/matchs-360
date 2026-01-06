import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Activity, ArrowRight, Users, Trophy, TrendingUp, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

const features = [
  {
    icon: Users,
    title: "Gestion des équipes",
    description: "Organisez vos clubs, équipes et joueurs en un seul endroit",
  },
  {
    icon: Trophy,
    title: "Évaluations complètes",
    description: "Référentiels personnalisés pour évaluer toutes les compétences",
  },
  {
    icon: BarChart3,
    title: "Visualisation radar",
    description: "Graphiques intuitifs pour analyser les performances",
  },
  {
    icon: TrendingUp,
    title: "Suivi de progression",
    description: "Comparez les évaluations et mesurez l'évolution",
  },
];

export default function Index() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) {
      navigate("/dashboard");
    }
  }, [user, loading, navigate]);

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-grid opacity-20" />
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 rounded-full bg-accent/10 blur-3xl" />

        <div className="relative max-w-7xl mx-auto px-6 py-24">
          {/* Header */}
          <nav className="flex items-center justify-between mb-20">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
                <Activity className="w-6 h-6 text-primary-foreground" />
              </div>
              <span className="font-display text-xl font-bold">MATCHS360</span>
            </div>
            <Button onClick={() => navigate("/auth")}>
              Se connecter
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </nav>

          {/* Hero Content */}
          <div className="text-center max-w-4xl mx-auto">
            <h1 className="text-5xl md:text-7xl font-display font-bold leading-tight mb-6">
              Évaluez. Analysez.{" "}
              <span className="text-gradient">Progressez.</span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-10">
              La plateforme complète pour suivre le développement des compétences
              sportives, mentales et sociales de vos joueurs.
            </p>
            <div className="flex items-center justify-center gap-4">
              <Button size="lg" className="h-14 px-8 text-lg" onClick={() => navigate("/auth")}>
                Commencer gratuitement
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
              <Button size="lg" variant="outline" className="h-14 px-8 text-lg">
                Voir la démo
              </Button>
            </div>
          </div>

          {/* Features Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-24">
            {features.map((feature, index) => (
              <div
                key={index}
                className="glass-card p-6 animate-fade-in-up opacity-0"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                  <feature.icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-display font-semibold text-lg mb-2">
                  {feature.title}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
