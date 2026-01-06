import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { 
  Activity, 
  ArrowRight, 
  Users, 
  Trophy, 
  TrendingUp, 
  BarChart3,
  Shield,
  Zap 
} from "lucide-react";
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

const stats = [
  { value: "500+", label: "Clubs" },
  { value: "10K+", label: "Joueurs évalués" },
  { value: "50K+", label: "Évaluations" },
  { value: "98%", label: "Satisfaction" },
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
    <div className="min-h-screen bg-background overflow-hidden">
      {/* Background Effects */}
      <div className="fixed inset-0 pointer-events-none">
        {/* Grid */}
        <div className="absolute inset-0 bg-grid opacity-[0.02]" />
        
        {/* Glassmorphism blurred radar chart effect */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px]">
          <svg viewBox="0 0 400 400" className="w-full h-full opacity-[0.08]">
            {/* Radar grid lines */}
            {[1, 2, 3, 4, 5].map((i) => (
              <polygon
                key={i}
                points={Array.from({ length: 6 }, (_, j) => {
                  const angle = (Math.PI * 2 * j) / 6 - Math.PI / 2;
                  const r = (i / 5) * 150;
                  return `${200 + r * Math.cos(angle)},${200 + r * Math.sin(angle)}`;
                }).join(" ")}
                fill="none"
                stroke="hsl(var(--primary))"
                strokeWidth="1"
              />
            ))}
            {/* Radar axes */}
            {Array.from({ length: 6 }, (_, i) => {
              const angle = (Math.PI * 2 * i) / 6 - Math.PI / 2;
              return (
                <line
                  key={i}
                  x1="200"
                  y1="200"
                  x2={200 + 150 * Math.cos(angle)}
                  y2={200 + 150 * Math.sin(angle)}
                  stroke="hsl(var(--primary))"
                  strokeWidth="1"
                />
              );
            })}
            {/* Sample data polygon */}
            <polygon
              points="200,80 320,140 300,280 200,320 100,280 80,140"
              fill="hsl(var(--primary))"
              fillOpacity="0.2"
              stroke="hsl(var(--primary))"
              strokeWidth="2"
            />
          </svg>
        </div>

        {/* Gradient orbs */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-primary/10 blur-[100px]" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 rounded-full bg-accent/10 blur-[80px]" />
        <div className="absolute top-3/4 left-1/2 w-48 h-48 rounded-full bg-primary/5 blur-[60px]" />
      </div>

      {/* Content */}
      <div className="relative z-10">
        {/* Header */}
        <nav className="max-w-7xl mx-auto px-6 py-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center animate-pulse-glow">
              <Activity className="w-6 h-6 text-primary-foreground" />
            </div>
            <span className="font-display text-xl font-bold">MATCHS360</span>
          </div>
          <Button onClick={() => navigate("/auth")} className="gap-2">
            Connexion
            <ArrowRight className="w-4 h-4" />
          </Button>
        </nav>

        {/* Hero */}
        <section className="max-w-7xl mx-auto px-6 pt-20 pb-32">
          <div className="text-center max-w-4xl mx-auto">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-sm text-primary mb-8 animate-fade-in-up">
              <Zap className="w-4 h-4" />
              Plateforme SaaS pour organisations sportives
            </div>
            
            <h1 className="text-5xl md:text-7xl font-display font-bold leading-tight mb-6 animate-fade-in-up" style={{ animationDelay: "0.1s" }}>
              Évaluez. Analysez.{" "}
              <span className="text-gradient">Progressez.</span>
            </h1>
            
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-10 animate-fade-in-up opacity-0" style={{ animationDelay: "0.2s" }}>
              La plateforme complète pour suivre le développement des compétences
              sportives, mentales et sociales de vos joueurs avec des graphiques radar
              et conseils personnalisés.
            </p>
            
            <div className="flex items-center justify-center gap-4 animate-fade-in-up opacity-0" style={{ animationDelay: "0.3s" }}>
              <Button 
                size="lg" 
                className="h-14 px-8 text-lg gap-2" 
                onClick={() => navigate("/auth")}
              >
                Commencer
                <ArrowRight className="w-5 h-5" />
              </Button>
              <Button 
                size="lg" 
                variant="outline" 
                className="h-14 px-8 text-lg"
                onClick={() => navigate("/dashboard?demo=true")}
              >
                Voir la démo
              </Button>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-24 animate-fade-in-up opacity-0" style={{ animationDelay: "0.4s" }}>
            {stats.map((stat, index) => (
              <div key={index} className="text-center">
                <p className="text-4xl font-display font-bold text-gradient mb-1">
                  {stat.value}
                </p>
                <p className="text-muted-foreground">{stat.label}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Features */}
        <section className="max-w-7xl mx-auto px-6 pb-32">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">
              Tout ce dont vous avez besoin
            </h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Une suite complète d'outils pour gérer et analyser les performances
              de vos équipes
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, index) => (
              <div
                key={index}
                className="glass-card p-6 animate-fade-in-up opacity-0 hover:border-primary/30 transition-all duration-300 group"
                style={{ animationDelay: `${0.5 + index * 0.1}s` }}
              >
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
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
        </section>

        {/* CTA */}
        <section className="max-w-7xl mx-auto px-6 pb-32">
          <div className="glass-card p-12 text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-primary/5" />
            <div className="relative z-10">
              <Shield className="w-12 h-12 text-primary mx-auto mb-6" />
              <h2 className="text-3xl font-display font-bold mb-4">
                Prêt à transformer votre suivi sportif ?
              </h2>
              <p className="text-muted-foreground max-w-xl mx-auto mb-8">
                Rejoignez des centaines de clubs qui utilisent déjà MATCHS360
                pour développer le potentiel de leurs joueurs.
              </p>
              <Button 
                size="lg" 
                className="h-14 px-10 text-lg gap-2"
                onClick={() => navigate("/auth")}
              >
                Démarrer maintenant
                <ArrowRight className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-border py-12">
          <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <Activity className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="font-display font-bold">MATCHS360</span>
            </div>
            <p className="text-sm text-muted-foreground">
              © 2025 MATCHS360. Tous droits réservés.
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}
