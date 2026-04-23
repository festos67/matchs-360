/**
 * @page ResetPassword
 * @route /reset-password
 *
 * Définition d'un nouveau mot de passe via lien de récupération.
 * (mem://auth/password-reset-management)
 *
 * @description
 * Cible des emails de reset envoyés depuis /auth. Détecte une session de
 * récupération en vérifiant explicitement le hash URL (type=recovery), avec
 * fallback sur supabase.auth.getSession() si absent.
 *
 * @flow
 * 1. Récupération du token depuis le hash (#access_token=...)
 * 2. Établissement d'une session temporaire de récupération
 * 3. Saisie du nouveau mot de passe + confirmation
 * 4. Mise à jour via supabase.auth.updateUser
 * 5. Redirection vers /dashboard
 *
 * @maintenance
 * Le hash est nettoyé après usage (window.history.replaceState) pour empêcher
 * le rejeu de l'URL et éviter d'exposer le token dans les logs analytics.
 */
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { validateUserPassword, USER_MIN_LENGTH } from "@/lib/password-policy";
import { toast } from "sonner";
import { RadarPulseLogo } from "@/components/shared/RadarPulseLogo";
import { PasswordInput } from "@/components/shared/PasswordInput";

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    let pollId: ReturnType<typeof setInterval> | null = null;

    const markReady = () => {
      if (cancelled) return;
      setSessionReady(true);
      if (pollId) clearInterval(pollId);
      // Nettoyage du hash pour empêcher tout rejeu du token
      if (window.location.hash) {
        window.history.replaceState(
          null,
          "",
          window.location.pathname + window.location.search,
        );
      }
    };

    // 1. Listener temps réel (déclenché quand Supabase parse le hash)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
          markReady();
        }
      },
    );

    // 2. Vérification immédiate (cas où la session est déjà établie)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) markReady();
    });

    // 3. Polling de secours pendant 10s (le parsing du hash peut être lent
    //    selon l'ordre d'exécution Vite/StrictMode)
    let attempts = 0;
    pollId = setInterval(async () => {
      attempts += 1;
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        markReady();
      } else if (attempts >= 20) {
        // 20 * 500ms = 10s -> abandon
        if (pollId) clearInterval(pollId);
      }
    }, 500);

    return () => {
      cancelled = true;
      if (pollId) clearInterval(pollId);
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const pwdError = validateUserPassword(password);
    if (pwdError) {
      toast.error(pwdError);
      return;
    }

    if (password !== confirmPassword) {
      toast.error("Les mots de passe ne correspondent pas");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        toast.error(error.message || "Erreur lors de la mise à jour du mot de passe");
        return;
      }

      setSuccess(true);
      toast.success("Mot de passe mis à jour avec succès !");

      // Sign out and redirect to login after a short delay
      setTimeout(async () => {
        await supabase.auth.signOut();
        navigate("/auth");
      }, 2000);
    } catch {
      toast.error("Une erreur est survenue");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-8">
        <div className="w-full max-w-md text-center space-y-6">
          <div className="w-16 h-16 mx-auto rounded-full bg-green-500/20 flex items-center justify-center">
            <CheckCircle className="w-8 h-8 text-green-500" />
          </div>
          <h2 className="text-2xl font-display font-bold">Mot de passe mis à jour</h2>
          <p className="text-muted-foreground">
            Redirection vers la page de connexion...
          </p>
        </div>
      </div>
    );
  }

  if (!sessionReady) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-8">
        <div className="w-full max-w-md text-center space-y-6">
          <div className="w-10 h-10 mx-auto border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          <p className="text-muted-foreground">
            Vérification du lien de réinitialisation...
          </p>
          <button
            onClick={() => navigate("/auth")}
            className="text-primary text-sm hover:underline"
          >
            Retour à la connexion
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-8">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-8">
          <RadarPulseLogo size={48} />
          <div>
            <h1 className="font-display text-2xl font-bold">MATCHS360</h1>
            <p className="text-sm text-muted-foreground">Sports Analytics Platform</p>
          </div>
        </div>

        <div className="mb-8">
          <h2 className="text-3xl font-display font-bold">Nouveau mot de passe</h2>
          <p className="text-muted-foreground mt-2">
            Choisissez un nouveau mot de passe pour votre compte.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <PasswordInput
            id="new-password"
            label="Nouveau mot de passe"
            value={password}
            onChange={setPassword}
          />

          <div className="space-y-1">
            <PasswordInput
              id="confirm-password"
              label="Confirmer le mot de passe"
              value={confirmPassword}
              onChange={setConfirmPassword}
              showHelpText={false}
            />
            {confirmPassword && password !== confirmPassword && (
              <p className="text-sm text-destructive">Les mots de passe ne correspondent pas</p>
            )}
          </div>

          <Button
            type="submit"
            className="w-full h-12 text-base font-medium"
            disabled={
              loading ||
              password !== confirmPassword ||
              password.length < USER_MIN_LENGTH
            }
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
            ) : (
              <>
                Mettre à jour le mot de passe
                <ArrowRight className="w-4 h-4 ml-2" />
              </>
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
