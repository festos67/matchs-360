import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Activity, Lock, Check, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { z } from "zod";

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
    const checkSession = async () => {
      try {
        // First, check if there's a hash fragment with tokens (from Supabase email link)
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");
        const type = hashParams.get("type");

        // If we have tokens in the URL hash, set the session
        if (accessToken && refreshToken) {
          console.log("Found tokens in URL hash, setting session...");
          const { data: sessionData, error: setSessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (setSessionError) {
            console.error("Set session error:", setSessionError);
            setError("Lien d'invitation invalide ou expiré");
            setChecking(false);
            return;
          }

          // Clear the hash from URL for security
          window.history.replaceState(null, "", window.location.pathname);

          // Check if password already set
          if (sessionData?.user?.user_metadata?.password_set) {
            navigate("/dashboard");
            return;
          }

          setChecking(false);
          return;
        }

        // Check for error in hash (e.g., expired link)
        const errorDescription = hashParams.get("error_description");
        if (errorDescription) {
          console.error("Auth error from URL:", errorDescription);
          setError(errorDescription);
          setChecking(false);
          return;
        }

        // Check if we have an existing session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        
        if (sessionError) {
          console.error("Session error:", sessionError);
          setError("Lien d'invitation invalide ou expiré");
          setChecking(false);
          return;
        }

        if (!session) {
          // No session means the invite link might be invalid or expired
          setError("Lien d'invitation invalide ou expiré. Veuillez demander une nouvelle invitation.");
          setChecking(false);
          return;
        }

        // Check if user already has a password set (they might have used this link already)
        // If they do, redirect to dashboard
        const { data: userData } = await supabase.auth.getUser();
        if (userData?.user?.user_metadata?.password_set) {
          navigate("/dashboard");
          return;
        }

        setChecking(false);
      } catch (err) {
        console.error("Error checking session:", err);
        setError("Une erreur est survenue");
        setChecking(false);
      }
    };

    checkSession();
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Validate passwords
      passwordSchema.parse({ password, confirmPassword });

      // Update user password
      const { error: updateError } = await supabase.auth.updateUser({
        password,
        data: {
          password_set: true,
        },
      });

      if (updateError) {
        toast.error(updateError.message);
        return;
      }

      setSuccess(true);
      toast.success("Mot de passe défini avec succès !");

      // Redirect to dashboard after a short delay
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
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
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
        {/* Logo */}
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
            <Activity className="w-7 h-7 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold">MATCHS360</h1>
            <p className="text-sm text-muted-foreground">Sports Analytics Platform</p>
          </div>
        </div>

        {/* Card */}
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
              <p className="text-xs text-muted-foreground">
                Minimum 8 caractères
              </p>
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