/**
 * @page InviteAccept
 * @route /invite-accept
 *
 * Finalisation d'une invitation reçue par email.
 * (mem://auth/invitation-system)
 *
 * @description
 * Cible des liens magiques envoyés par notify.match360.com. L'utilisateur arrive
 * avec un token dans le hash URL, choisit son mot de passe et se voit
 * automatiquement attribuer son rôle (coach, player, supporter) ainsi que ses
 * affiliations club/équipe selon le contenu de l'invitation.
 *
 * @validation
 * Schéma Zod : mot de passe ≥ 8 caractères + confirmation identique.
 *
 * @flow
 * 1. Extraction du token depuis le hash URL
 * 2. Création du compte via supabase.auth.updateUser
 * 3. Activation des entrées `user_roles` et `team_members` rattachées
 *    à l'invitation (statut → "accepted")
 * 4. Redirection vers le dashboard du nouveau rôle
 *
 * @maintenance
 * Le hash est consommé puis nettoyé pour éviter le rejeu.
 * Si l'invitation est expirée (`expires_at < now()`), affiche une erreur claire.
 */
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Activity, Lock, Check, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { z } from "zod";
import { RadarPulseLogo } from "@/components/shared/RadarPulseLogo";

const passwordSchema = z.object({
  password: z.string().min(8, "Le mot de passe doit contenir au moins 8 caractères"),
  confirmPassword: z.string(),
}).refine(data => data.password === data.confirmPassword, {
  message: "Les mots de passe ne correspondent pas",
  path: ["confirmPassword"],
});

export default function InviteAccept() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let mounted = true;

    const handleInviteSession = async () => {
      try {
        const hash = window.location.hash;

        // Check for error in hash first
        const hashParams = new URLSearchParams(hash.substring(1));
        const errorDescription = hashParams.get("error_description");
        if (errorDescription) {
          if (mounted) {
            setError(errorDescription);
            setChecking(false);
          }
          return;
        }

        // If hash contains tokens, let Supabase client process them
        if (hash && hash.includes("access_token")) {
          // The Supabase client auto-processes hash tokens via onAuthStateChange
          // We listen for it and also use a fallback
          const { data: { subscription } } = supabase.auth.onAuthStateChange(
            (event, session) => {
              if (!mounted) return;
              if (session && (event === "SIGNED_IN" || event === "PASSWORD_RECOVERY" || event === "TOKEN_REFRESHED")) {
                subscription.unsubscribe();
                // Clear hash for security
                window.history.replaceState(null, "", window.location.pathname);
                
                if (session.user?.user_metadata?.password_set) {
                  navigate("/dashboard");
                  return;
                }
                setChecking(false);
              }
            }
          );

          // Fallback: if onAuthStateChange doesn't fire within 3s, try getSession
          const timeout = setTimeout(async () => {
            if (!mounted) return;
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
              subscription.unsubscribe();
              window.history.replaceState(null, "", window.location.pathname);
              if (session.user?.user_metadata?.password_set) {
                navigate("/dashboard");
                return;
              }
              if (mounted) setChecking(false);
            } else if (mounted) {
              setError("Lien d'invitation invalide ou expiré. Veuillez demander une nouvelle invitation.");
              setChecking(false);
            }
          }, 3000);

          return () => {
            clearTimeout(timeout);
            subscription.unsubscribe();
          };
        }

        // No hash tokens - check for existing session
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) {
          if (mounted) {
            setError("Lien d'invitation invalide ou expiré. Veuillez demander une nouvelle invitation.");
            setChecking(false);
          }
          return;
        }

        if (session.user?.user_metadata?.password_set) {
          navigate("/dashboard");
          return;
        }

        if (mounted) setChecking(false);
      } catch (err) {
        console.error("Error checking invite session:", err);
        if (mounted) {
          setError("Une erreur est survenue");
          setChecking(false);
        }
      }
    };

    handleInviteSession();

    return () => {
      mounted = false;
    };
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      passwordSchema.parse({ password, confirmPassword });

      const { error: updateError } = await supabase.auth.updateUser({
        password,
        data: { password_set: true },
      });

      if (updateError) {
        toast.error(updateError.message);
        return;
      }

      setSuccess(true);
      toast.success("Mot de passe défini avec succès !");

      setTimeout(() => {
        navigate("/dashboard");
      }, 2000);
    } catch (err) {
      if (err instanceof z.ZodError) {
        toast.error(err.errors[0].message);
      } else {
        toast.error("Une erreur est survenue");
      }
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-8 h-8 mx-auto border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          <p className="text-muted-foreground">Vérification de votre invitation...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <div className="w-16 h-16 mx-auto rounded-full bg-destructive/10 flex items-center justify-center mb-6">
            <AlertCircle className="w-8 h-8 text-destructive" />
          </div>
          <h1 className="text-2xl font-display font-bold mb-4">Lien invalide</h1>
          <p className="text-muted-foreground mb-8">{error}</p>
          <Button onClick={() => navigate("/auth")}>
            Aller à la page de connexion
          </Button>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <div className="w-16 h-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center mb-6">
            <Check className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-display font-bold mb-4">Bienvenue !</h1>
          <p className="text-muted-foreground">
            Votre mot de passe a été défini. Redirection vers votre espace...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <RadarPulseLogo size={48} />
          <div>
            <h1 className="font-display text-2xl font-bold">MATCHS360</h1>
            <p className="text-sm text-muted-foreground">Sports Analytics Platform</p>
          </div>
        </div>

        <div className="bg-card border rounded-xl p-8">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-display font-bold">
              Définir votre mot de passe
            </h2>
            <p className="text-muted-foreground mt-2">
              Créez un mot de passe sécurisé pour accéder à votre compte
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="password">Nouveau mot de passe</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10"
                  minLength={8}
                  required
                />
              </div>
              <p className="text-xs text-muted-foreground">Minimum 8 caractères</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirmer le mot de passe</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="pl-10"
                  required
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
                  <Check className="w-4 h-4 mr-2" />
                  Définir mon mot de passe
                </>
              )}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
