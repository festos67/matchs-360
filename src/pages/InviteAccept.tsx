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
 * Schéma Zod centralisé (`userPasswordSchema`) :
 * mot de passe ≥ USER_MIN_LENGTH caractères + confirmation identique.
 * Source unique de vérité : `src/lib/password-policy.ts`.
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
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Activity, Lock, Check, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { z } from "zod";
import { RadarPulseLogo } from "@/components/shared/RadarPulseLogo";
import {
  userPasswordSchema,
  validateUserPassword,
  USER_MIN_LENGTH,
  MAX_LENGTH,
  PASSWORD_HELP_TEXT,
} from "@/lib/password-policy";

const passwordSchema = z.object({
  password: userPasswordSchema,
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
  const [pwdError, setPwdError] = useState<string | null>(null);
  const navigate = useNavigate();
  // R3 (2026-04-27): garde-fou anti double-consommation. React StrictMode
  // exécute les useEffect deux fois en dev → setSession serait appelé
  // deux fois avec les mêmes tokens et lèverait une erreur.
  const consumedRef = useRef(false);

  useEffect(() => {
    // R3 (2026-04-27) — Refactor déterministe (élimine régression listener
    // partiellement permissif). Flow synchrone basé sur extraction du hash
    // + setSession explicite. Voir docs/auth-flows.md.
    if (consumedRef.current) return;
    consumedRef.current = true;

    let cancelled = false;

    (async () => {
      try {
        // ÉTAPE 1 — Extraire et valider le hash AVANT toute opération auth.
        const hash = window.location.hash || "";
        const hashParams = new URLSearchParams(
          hash.startsWith("#") ? hash.slice(1) : hash,
        );

        const errorDescription = hashParams.get("error_description");
        if (errorDescription) {
          if (!cancelled) {
            setError(errorDescription);
            setChecking(false);
          }
          return;
        }

        const tokenType = hashParams.get("type");
        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");

        if (tokenType !== "invite") {
          if (!cancelled) {
            setError(
              "Ce lien n'est pas une invitation valide. Veuillez ouvrir le lien reçu par email.",
            );
            setChecking(false);
          }
          return;
        }

        if (!accessToken || !refreshToken) {
          if (!cancelled) {
            setError(
              "Lien d'invitation incomplet. Veuillez demander une nouvelle invitation.",
            );
            setChecking(false);
          }
          return;
        }

        // ÉTAPE 2 — Purger TOUTE session pré-existante (scope global pour
        // révoquer les refresh tokens sur tous les devices). Empêche un
        // attaquant déjà connecté d'hériter de l'invitation d'autrui.
        await supabase.auth.signOut({ scope: "global" }).catch(() => {
          /* pas de session active = OK */
        });

        // ÉTAPE 3 — Nettoyer le hash AVANT setSession pour empêcher le SDK
        // Supabase d'auto-détecter le hash et de fire un SIGNED_IN parasite
        // intercepté par le listener global du useAuth.
        window.history.replaceState(
          null,
          "",
          window.location.pathname + window.location.search,
        );

        // ÉTAPE 4 — Établir explicitement la session invite.
        const { data: sessionData, error: sessionError } =
          await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

        if (sessionError || !sessionData?.session) {
          if (!cancelled) {
            setError(
              "Impossible d'établir la session d'invitation. Le lien est peut-être expiré.",
            );
            setChecking(false);
          }
          return;
        }

        // ÉTAPE 5 — Validation côté serveur : vérifier qu'une invitation
        // pending existe pour l'email de la session établie.
        const sessionEmail = sessionData.session.user.email
          ?.toLowerCase()
          .trim();
        if (!sessionEmail) {
          await supabase.auth.signOut({ scope: "global" }).catch(() => {});
          if (!cancelled) {
            setError("Session d'invitation sans email. Lien malformé.");
            setChecking(false);
          }
          return;
        }

        const { data: invitations, error: invError } = await supabase
          .from("invitations")
          .select("id, email, status, expires_at")
          .eq("status", "pending")
          .ilike("email", sessionEmail)
          .limit(1);

        if (invError) {
          // Lookup non bloquant (RLS peut filtrer pour utilisateur fraîchement
          // créé), on log et on continue avec la session Supabase valide.
          console.warn("Invite lookup failed (non-blocking):", invError);
        } else if (!invitations || invitations.length === 0) {
          await supabase.auth.signOut({ scope: "global" }).catch(() => {});
          if (!cancelled) {
            setError(
              "Aucune invitation active pour cet email. Veuillez demander une nouvelle invitation.",
            );
            setChecking(false);
          }
          return;
        }

        // Si l'utilisateur a déjà défini son mot de passe (ré-acceptation),
        // rediriger directement vers le dashboard.
        if (sessionData.session.user?.user_metadata?.password_set) {
          navigate("/dashboard");
          return;
        }

        if (!cancelled) setChecking(false);
      } catch (err) {
        console.error("InviteAccept fatal:", err);
        if (!cancelled) {
          setError("Une erreur inattendue est survenue. Veuillez réessayer.");
          setChecking(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Garde-fou côté client : protège contre tout bypass UI (ex: DevTools
    // qui réactiverait le bouton). La policy serveur HIBP + min length
    // s'applique en plus côté Supabase Auth.
    const pwdValidation = validateUserPassword(password);
    if (pwdValidation !== null) {
      setPwdError(pwdValidation);
      toast.error("Mot de passe non conforme", { description: pwdValidation });
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Les mots de passe ne correspondent pas");
      return;
    }

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
                  onChange={(e) => {
                    const v = e.target.value;
                    setPassword(v);
                    setPwdError(v.length === 0 ? null : validateUserPassword(v));
                  }}
                  className="pl-10"
                  minLength={USER_MIN_LENGTH}
                  maxLength={MAX_LENGTH}
                  autoComplete="new-password"
                  required
                />
              </div>
              <p className="text-xs text-muted-foreground">{PASSWORD_HELP_TEXT}</p>
              {pwdError && (
                <p className="text-xs text-destructive" role="alert">{pwdError}</p>
              )}
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
                  minLength={USER_MIN_LENGTH}
                  maxLength={MAX_LENGTH}
                  autoComplete="new-password"
                  required
                />
              </div>
              {confirmPassword.length > 0 && confirmPassword !== password && (
                <p className="text-xs text-destructive" role="alert">
                  Les mots de passe ne correspondent pas
                </p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full h-12 text-base font-medium"
              disabled={
                loading ||
                pwdError !== null ||
                validateUserPassword(password) !== null ||
                password !== confirmPassword
              }
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
