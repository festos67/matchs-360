/**
 * @page ChildAccessCode
 * @route /code-acces (publique)
 *
 * Un joueur sans adresse e-mail utilise le code d'accès remis par son coach
 * (ou son club) pour choisir son propre mot de passe, puis il est connecté.
 * Vérifications (code à usage unique, 5 essais, expiration, anti-spam) : côté
 * serveur, fonction child-access (action « redeem »).
 */
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { RadarPulseLogo } from "@/components/shared/RadarPulseLogo";
import { PASSWORD_HELP_TEXT, USER_MIN_LENGTH, validateUserPassword } from "@/lib/password-policy";
import { resolveLoginEmail } from "@/lib/technical-identity";

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_CODE: "Identifiant ou code incorrect, ou code expiré. Vérifie ta saisie.",
  CODE_LOCKED: "Trop d'essais : ce code est bloqué. Demande un nouveau code à ton coach.",
  PASSWORD_POLICY: `Mot de passe refusé : il doit contenir au moins ${USER_MIN_LENGTH} caractères.`,
  RATE_LIMITED: "Trop de tentatives. Réessaie dans une heure.",
  UPDATE_FAILED: "Le mot de passe n'a pas pu être enregistré. Réessaie.",
};

export default function ChildAccessCode() {
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passwordError = password
    ? validateUserPassword(password) ??
      (confirmation && password !== confirmation ? "Les deux mots de passe ne correspondent pas." : null)
    : null;
  const canSubmit =
    identifier.trim().length > 0 &&
    !identifier.includes("@") &&
    code.trim().length > 0 &&
    !!password &&
    password === confirmation &&
    !passwordError &&
    !submitting;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("child-access", {
        body: { action: "redeem", identifier: identifier.trim(), code, password },
      });
      if (fnErr) throw fnErr;
      const result = (data ?? {}) as { ok?: boolean; error?: string };
      if (!result.ok) {
        setError(ERROR_MESSAGES[result.error ?? ""] ?? "Une erreur est survenue. Réessaie.");
        return;
      }
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: resolveLoginEmail(identifier),
        password,
      });
      if (signInErr) {
        // Le mot de passe est enregistré : il suffit de se connecter.
        navigate("/auth", { replace: true });
        return;
      }
      navigate("/dashboard", { replace: true });
    } catch (err) {
      console.error("child-access redeem failed", err);
      setError("Service momentanément indisponible. Réessaie dans quelques instants.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <RadarPulseLogo size={48} />
          <div>
            <p className="font-display text-2xl font-bold">MATCHS360</p>
            <p className="text-sm text-muted-foreground">J'ai un code d'accès</p>
          </div>
        </div>

        <form onSubmit={submit} className="bg-card border rounded-xl p-6 sm:p-8 space-y-5">
          <div className="flex items-start gap-3">
            <KeyRound className="w-5 h-5 text-primary mt-0.5 shrink-0" />
            <p className="text-sm text-muted-foreground">
              Tape ton identifiant et le code que ton coach t'a donné, puis choisis ton mot de passe.
              Garde-le pour toi.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="identifier">Identifiant</Label>
            <Input
              id="identifier"
              autoComplete="username"
              autoCapitalize="none"
              placeholder="prenom.nom"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
            />
            {identifier.includes("@") && (
              <p className="text-xs text-muted-foreground">
                Avec une adresse e-mail, utilise « Mot de passe oublié » sur la page de connexion.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="code">Code d'accès</Label>
            <Input
              id="code"
              autoComplete="one-time-code"
              autoCapitalize="none"
              placeholder="lune-velo-tigre-47"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="font-mono"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-password">Nouveau mot de passe</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              minLength={USER_MIN_LENGTH}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{PASSWORD_HELP_TEXT}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-password-confirm">Confirmation</Label>
            <Input
              id="new-password-confirm"
              type="password"
              autoComplete="new-password"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
            />
            {passwordError && <p className="text-xs text-destructive">{passwordError}</p>}
          </div>

          {error && (
            <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              {error}
            </p>
          )}

          <Button type="submit" className="w-full h-11" disabled={!canSubmit}>
            {submitting ? "Enregistrement..." : "Choisir mon mot de passe"}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            Tu te souviens de ton mot de passe ?{" "}
            <Link to="/auth" className="text-primary hover:underline">
              Se connecter
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
