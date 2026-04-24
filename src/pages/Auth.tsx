/**
 * @page Auth
 * @route /auth
 *
 * Page d'authentification (signup + login + reset password + Google OAuth).
 *
 * @description
 * Point d'entrée non authentifié de l'application. Gère plusieurs flux :
 * - Inscription email/mot de passe avec choix de rôle (Coach, Joueur, Supporter)
 * - Connexion email/mot de passe
 * - Connexion Google OAuth
 * - Demande de réinitialisation du mot de passe
 *
 * @validation
 * - Schéma Zod : email valide + mot de passe ≥ 6 caractères
 * - Vérification du domaine email côté serveur
 *
 * @flows (mem://auth/invitation-system)
 * - Si l'URL contient un token d'invitation dans le hash, redirige vers
 *   /invite-accept avant de proposer le signup
 * - Reset password : envoie un email via notify.match360.com
 *
 * @maintenance
 * - Ne JAMAIS utiliser signup anonyme — toujours email/password
 * - L'auto-confirm email doit rester désactivé en production
 * - Les nouveaux comptes créés sans approbation préalable atterrissent sur
 *   /pending-approval (mem://auth/super-admin)
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Activity, Mail, Lock, User, ArrowRight, Users, Dumbbell, Heart, Eye, EyeOff, HelpCircle, CheckCircle2, KeyRound, UserCheck, MailQuestion, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { z } from "zod";
import { cn } from "@/lib/utils";
import { RadarPulseLogo } from "@/components/shared/RadarPulseLogo";
import { USER_MIN_LENGTH, PASSWORD_HELP_TEXT, userPasswordSchema } from "@/lib/password-policy";

const authSchema = z.object({
  email: z.string().email("Email invalide"),
  password: userPasswordSchema,
});

const signUpSchema = authSchema.extend({
  firstName: z.string().min(1, "Prénom requis"),
  lastName: z.string().min(1, "Nom requis"),
  // 'club_admin' retiré du signup public (cycle 3 — escalade privileged role).
  // Un club_admin ne peut être créé que via invitation par un admin existant
  // ou via le flow d'onboarding club (service_role).
  // KEEP IN SYNC avec migration extend_privileged_role_defense + RoleApprovals PRIVILEGED_ROLES.
  requestedRole: z.enum(["coach", "player", "supporter"], {
    required_error: "Veuillez choisir un rôle",
  }),
});

type RequestedRole = "coach" | "player" | "supporter";

const roleOptions: { value: RequestedRole; label: string; description: string; icon: React.ElementType }[] = [
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
  const [showPassword, setShowPassword] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [requestedRole, setRequestedRole] = useState<RequestedRole | null>(null);
  const [showHelpDialog, setShowHelpDialog] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [sendingHelp, setSendingHelp] = useState(false);
  const navigate = useNavigate();

  const handleContactAdmin = async () => {
    setSendingHelp(true);
    try {
      const { data: adminRoles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "admin");

      if (adminRoles && adminRoles.length > 0) {
        const notifications = adminRoles.map((role) => ({
          user_id: role.user_id,
          title: "Demande d'aide à la connexion",
          message: `Un utilisateur (${email || "email non renseigné"}) rencontre un problème de connexion et demande de l'aide.`,
          type: "help_request",
        }));

        await supabase.from("notifications").insert(notifications);
      }

      setShowHelpDialog(false);
      setShowConfirmDialog(true);
    } catch (err) {
      toast.error("Une erreur est survenue lors de l'envoi de la demande");
    } finally {
      setSendingHelp(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast.error("Veuillez entrer votre email");
      return;
    }

    setLoading(true);
    try {
      // F-302: Anti-énumération — on déclenche la demande mais on n'expose
      // jamais le résultat (existence du compte, rate-limit Supabase, etc.).
      // La réponse utilisateur est toujours identique, qu'un compte existe ou non.
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      // Message volontairement générique — ne confirme pas l'existence du compte.
      toast.success(
        "Si un compte est associé à cet email, un lien de réinitialisation vient d'être envoyé.",
        { duration: 6000 }
      );
      setIsForgotPassword(false);
    } catch {
      // Même message en cas d'erreur réseau pour ne pas créer d'oracle.
      toast.success(
        "Si un compte est associé à cet email, un lien de réinitialisation vient d'être envoyé.",
        { duration: 6000 }
      );
      setIsForgotPassword(false);
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
            <RadarPulseLogo size={56} />
            <div>
              <h1 className="font-display text-3xl font-bold">
                MATCHS<span className="text-accent">360</span>
              </h1>
              <p className="text-sm text-muted-foreground">Donnez vie à vos actions socio-sportives</p>
            </div>
          </div>

          {/* Title */}
          <div className="mb-8">
            <h2 className="text-3xl font-display font-bold">
              {isForgotPassword
                ? "Mot de passe oublié"
                : isLogin
                ? "Bienvenue"
                : "Créer un compte"}
            </h2>
            <p className="text-muted-foreground mt-2">
              {isForgotPassword
                ? "Entrez votre email pour recevoir un lien de réinitialisation"
                : isLogin
                ? "Connectez-vous pour accéder à votre espace"
                : "Rejoignez la plateforme d'évaluation sportive"}
            </p>
          </div>

          {/* Form */}
          {isForgotPassword ? (
            <form onSubmit={handleForgotPassword} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="reset-email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="reset-email"
                    type="email"
                    placeholder="vous@exemple.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
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
                    Envoyer le lien
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </>
                )}
              </Button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => {
                    setIsForgotPassword(false);
                  }}
                  className="text-primary font-medium hover:underline"
                >
                  Retour à la connexion
                </button>
              </div>
            </form>
          ) : (
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
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
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
          )}

          {/* Help link */}
          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => setShowHelpDialog(true)}
              className="text-sm text-primary font-medium hover:underline transition-colors inline-flex items-center gap-1.5"
            >
              <HelpCircle className="w-4 h-4 text-accent" />
              Vous rencontrez un problème de connexion ?
            </button>
          </div>

          {/* Help Dialog */}
          <Dialog open={showHelpDialog} onOpenChange={setShowHelpDialog}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <HelpCircle className="w-5 h-5 text-primary" />
                  Aide à la connexion
                </DialogTitle>
                <DialogDescription>
                  Avant de nous contacter, vérifiez les points suivants :
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                  <KeyRound className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium text-sm">Vérifiez votre mot de passe</p>
                    <p className="text-xs text-muted-foreground">Assurez-vous que votre mot de passe est correct. Utilisez « Mot de passe oublié ? » pour le réinitialiser.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                  <MailQuestion className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium text-sm">Vérifiez votre adresse email</p>
                    <p className="text-xs text-muted-foreground">Utilisez l'adresse email que votre responsable de club a renseignée lors de la création de votre compte.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                  <UserCheck className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium text-sm">Contactez votre responsable de club</p>
                    <p className="text-xs text-muted-foreground">Votre compte a été créé par votre responsable de club. Rapprochez-vous de lui pour vérifier vos identifiants de connexion.</p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                  <Mail className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium text-sm">Consultez vos emails</p>
                    <p className="text-xs text-muted-foreground">Vérifiez vos spams pour un éventuel email d'invitation ou de confirmation de compte.</p>
                  </div>
                </div>
              </div>

              <Button
                onClick={handleContactAdmin}
                disabled={sendingHelp}
                className="w-full mt-2"
              >
                {sendingHelp ? (
                  <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Vous avez tout vérifié ? Contactez-nous
                  </>
                )}
              </Button>
            </DialogContent>
          </Dialog>

          {/* Confirmation Dialog */}
          <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
            <DialogContent className="max-w-sm text-center">
              <div className="flex flex-col items-center gap-4 py-4">
                <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                  <CheckCircle2 className="w-8 h-8 text-green-600" />
                </div>
                <DialogHeader>
                  <DialogTitle className="text-center">Demande envoyée !</DialogTitle>
                  <DialogDescription className="text-center">
                    Votre message a bien été transmis aux administrateurs de la plateforme. Ils vont examiner votre situation et tenter de résoudre votre problème de connexion dans les meilleurs délais.
                  </DialogDescription>
                </DialogHeader>
                <Button onClick={() => setShowConfirmDialog(false)} className="w-full">
                  Compris
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Right Panel - Visual */}
      <div className="hidden lg:flex flex-1 bg-gradient-to-br from-primary/20 via-background to-background items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 bg-grid opacity-30" />
        
        {/* Decorative circles */}
        <div className="absolute top-1/4 left-1/4 w-64 h-64 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-48 h-48 rounded-full bg-accent/10 blur-3xl" />
        
        <div className="relative z-10 text-center max-w-md px-8">
          <div className="mb-10">
            <div className="mx-auto w-48 h-48 flex items-center justify-center">
              <RadarPulseLogo size={192} />
            </div>
          </div>
          <h3 className="text-3xl font-display font-bold mb-4 whitespace-nowrap">
            Révéler – Progresser – Valoriser
          </h3>
          <p className="text-lg text-muted-foreground">
            Révèle en chaque joueur le champion de sa propre vie ! 
          </p>
        </div>
      </div>
    </div>
  );
}
