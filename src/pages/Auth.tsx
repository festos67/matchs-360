import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Activity, Mail, Lock, User, ArrowRight, Shield, Users, Dumbbell, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { z } from "zod";
import { cn } from "@/lib/utils";

const authSchema = z.object({
  email: z.string().email("Email invalide"),
  password: z.string().min(6, "Le mot de passe doit contenir au moins 6 caractères"),
});

const signUpSchema = authSchema.extend({
  firstName: z.string().min(1, "Prénom requis"),
  lastName: z.string().min(1, "Nom requis"),
  requestedRole: z.enum(["club_admin", "coach", "player", "supporter"], {
    required_error: "Veuillez choisir un rôle",
  }),
});

type RequestedRole = "club_admin" | "coach" | "player" | "supporter";

const roleOptions: { value: RequestedRole; label: string; description: string; icon: React.ElementType }[] = [
  { value: "club_admin", label: "Admin Club", description: "Gérer un club et ses équipes", icon: Shield },
  { value: "coach", label: "Coach", description: "Évaluer et suivre les joueurs", icon: Dumbbell },
  { value: "player", label: "Joueur", description: "Consulter mes évaluations", icon: Users },
  { value: "supporter", label: "Supporter", description: "Suivre un joueur (parent, etc.)", icon: Heart },
];

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [requestedRole, setRequestedRole] = useState<RequestedRole | null>(null);
  const navigate = useNavigate();

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast.error("Veuillez entrer votre email");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth?reset=true`,
      });

      if (error) {
        toast.error(error.message);
        return;
      }

      toast.success("Un email de réinitialisation a été envoyé !", { duration: 5000 });
      setIsForgotPassword(false);
    } catch (err) {
      toast.error("Une erreur est survenue");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        // Validate login
        authSchema.parse({ email, password });

        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          if (error.message === "Invalid login credentials") {
            toast.error("Email ou mot de passe incorrect");
          } else {
            toast.error(error.message);
          }
          return;
        }

        toast.success("Connexion réussie !");
        navigate("/dashboard");
      } else {
        // Validate signup
        signUpSchema.parse({ email, password, firstName, lastName, requestedRole });

        const redirectUrl = `${window.location.origin}/dashboard`;

        const { data: signUpData, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: redirectUrl,
            data: {
              first_name: firstName,
              last_name: lastName,
              requested_role: requestedRole,
            },
          },
        });

        if (error) {
          if (error.message.includes("already registered")) {
            toast.error("Cet email est déjà utilisé");
          } else {
            toast.error(error.message);
          }
          return;
        }

        // Create role request after signup
        if (signUpData.user && requestedRole) {
          const { error: roleRequestError } = await supabase
            .from("role_requests")
            .insert({
              user_id: signUpData.user.id,
              requested_role: requestedRole,
            });

          if (roleRequestError) {
            console.error("Error creating role request:", roleRequestError);
          }
        }

        toast.success(
          "Compte créé ! Votre demande de rôle est en attente de validation par un administrateur.",
          { duration: 6000 }
        );
        navigate("/pending-approval");
      }
    } catch (err) {
      if (err instanceof z.ZodError) {
        toast.error(err.errors[0].message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left Panel - Form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
              <Activity className="w-7 h-7 text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold">MATCHS360</h1>
              <p className="text-sm text-muted-foreground">Sports Analytics Platform</p>
            </div>
          </div>

          {/* Title */}
          <div className="mb-8">
            <h2 className="text-3xl font-display font-bold">
              {isLogin ? "Bienvenue" : "Créer un compte"}
            </h2>
            <p className="text-muted-foreground mt-2">
              {isLogin
                ? "Connectez-vous pour accéder à votre espace"
                : "Rejoignez la plateforme d'évaluation sportive"}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {!isLogin && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">Prénom</Label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="firstName"
                        placeholder="Jean"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Nom</Label>
                    <Input
                      id="lastName"
                      placeholder="Dupont"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                    />
                  </div>
                </div>

                {/* Role selection */}
                <div className="space-y-3">
                  <Label>Je m'inscris en tant que</Label>
                  <div className="grid grid-cols-2 gap-3">
                    {roleOptions.map((role) => {
                      const Icon = role.icon;
                      const isSelected = requestedRole === role.value;
                      return (
                        <button
                          key={role.value}
                          type="button"
                          onClick={() => setRequestedRole(role.value)}
                          className={cn(
                            "flex flex-col items-start gap-1 p-3 rounded-lg border-2 transition-all text-left",
                            isSelected
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-primary/50"
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <Icon className={cn("w-4 h-4", isSelected ? "text-primary" : "text-muted-foreground")} />
                            <span className={cn("font-medium text-sm", isSelected && "text-primary")}>
                              {role.label}
                            </span>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {role.description}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="vous@exemple.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Mot de passe</Label>
                {isLogin && (
                  <button
                    type="button"
                    onClick={() => setIsForgotPassword(true)}
                    className="text-xs text-primary hover:underline"
                  >
                    Mot de passe oublié ?
                  </button>
                )}
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-12 text-base font-medium"
              disabled={loading}
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              ) : (
                <>
                  {isLogin ? "Se connecter" : "Créer mon compte"}
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          </form>

          {/* Toggle */}
          <div className="mt-6 text-center">
            <p className="text-muted-foreground">
              {isLogin ? "Pas encore de compte ?" : "Déjà un compte ?"}
              <button
                type="button"
                onClick={() => setIsLogin(!isLogin)}
                className="text-primary font-medium ml-2 hover:underline"
              >
                {isLogin ? "S'inscrire" : "Se connecter"}
              </button>
            </p>
          </div>
        </div>
      </div>

      {/* Right Panel - Visual */}
      <div className="hidden lg:flex flex-1 bg-gradient-to-br from-primary/20 via-background to-background items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 bg-grid opacity-30" />
        
        {/* Decorative circles */}
        <div className="absolute top-1/4 left-1/4 w-64 h-64 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-48 h-48 rounded-full bg-accent/10 blur-3xl" />
        
        <div className="relative z-10 text-center max-w-md px-8">
          <div className="mb-8">
            <div className="w-32 h-32 mx-auto rounded-full bg-primary/20 flex items-center justify-center animate-pulse-glow">
              <Activity className="w-16 h-16 text-primary" />
            </div>
          </div>
          <h3 className="text-2xl font-display font-bold mb-4">
            Évaluez. Analysez. Progressez.
          </h3>
          <p className="text-muted-foreground">
            La plateforme complète pour suivre le développement des compétences
            sportives, mentales et sociales de vos joueurs.
          </p>
        </div>
      </div>
    </div>
  );
}
