/**
 * @component ProtectedRoute
 * @description Garde de routes (HOC) qui vérifie l'authentification et,
 *              optionnellement, le contrôle d'accès basé sur les rôles (RBAC).
 *              Affiche un loader pendant la vérification de session, redirige
 *              vers /auth si non connecté, ou vers /dashboard si rôle invalide.
 * @props
 *  - children: ReactNode — page protégée à rendre si accès autorisé
 *  - allowedRoles?: Array<app_role> — liste des rôles autorisés (undefined = tous)
 * @access Wrapper utilisé par App.tsx autour des routes privées
 * @features
 *  - Loader spinner pendant vérification session Supabase
 *  - Redirection /auth si pas de user
 *  - Vérification any-role : l'utilisateur passe si AU MOINS un de ses rôles est autorisé
 *  - Redirection /dashboard (puis DashboardRedirect → bon profil) si rôle insuffisant
 * @maintenance
 *  - Stratégie RBAC complète : mem://security/route-protection-rbac
 *  - Liste des rôles : enum app_role dans types.ts
 *  - Pour route publique : NE PAS encapsuler dans ProtectedRoute
 */
import { ReactNode, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

const RouteLoader = () => (
  <div className="flex h-screen items-center justify-center">
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
  </div>
);

interface ProtectedRouteProps {
  children: ReactNode;
  allowedRoles?: Array<"admin" | "club_admin" | "coach" | "player" | "supporter">;
}

export const ProtectedRoute = ({ children, allowedRoles }: ProtectedRouteProps) => {
  const { user, profile, roles, currentRole, loading, setCurrentRole } = useAuth();

  // F-???: Garde-fou anti-takeover. Un utilisateur dont l'email n'a pas été
  // confirmé ne doit JAMAIS pouvoir accéder à une route protégée — même si
  // une session JWT a été émise (auto-confirm activé par erreur, mailcatcher
  // de dev, etc.). Sinon, un attaquant pourrait signer up avec l'email d'un
  // tiers, atterrir sur /pending-approval avec une session valide, et obtenir
  // un rôle via la procédure d'approbation. On force le signOut côté client.
  useEffect(() => {
    if (loading) return;
    if (!user) return;
    // Les comptes créés via OAuth (Google, Apple) reçoivent toujours
    // email_confirmed_at au moment de la liaison. Ce check protège uniquement
    // les flux signup email/password ou magic link interrompus.
    if (!user.email_confirmed_at) {
      toast({
        variant: "destructive",
        title: "Email non confirmé",
        description:
          "Vous devez confirmer votre adresse email avant d'accéder à l'application. Vérifiez votre boîte de réception.",
      });
      void supabase.auth.signOut();
    }
  }, [user, loading]);

  // Auto-align currentRole avec la route si désync détectée :
  // user navigue à /admin/* en étant currentRole=coach → bascule sur le rôle admin
  // pour que la sidebar et l'UI s'alignent automatiquement.
  useEffect(() => {
    if (!allowedRoles || allowedRoles.length === 0) return;
    if (currentRole && allowedRoles.includes(currentRole.role)) return;
    const compatible = roles.find((r) => allowedRoles.includes(r.role));
    if (compatible) setCurrentRole(compatible);
  }, [allowedRoles, currentRole, roles, setCurrentRole]);

  if (loading) {
    return <RouteLoader />;
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Email non confirmé : on bloque immédiatement le rendu (le useEffect
  // ci-dessus déclenche le signOut, mais on évite tout flash de contenu
  // protégé pendant que la déconnexion s'effectue).
  if (!user.email_confirmed_at) {
    return <Navigate to="/auth" replace />;
  }

  // I8-003 : gate is_active. Un compte inactif (mineur < 15 sans consentement
  // parental valide, ou ré-suspendu après révocation art. 7§3) est redirigé
  // vers l'écran d'attente. La protection AUTORITAIRE est au niveau RLS
  // (current_account_active()) ; ce check est la couche UX qui empêche le
  // rendu de l'app et explique au mineur ce qui se passe. profile peut être
  // null le temps du fetch — on attend, on ne bloque pas tant qu'on n'a pas
  // lu is_active explicitement.
  if (profile && profile.is_active === false) {
    return <Navigate to="/pending-minor-consent" replace />;
  }

  if (allowedRoles && allowedRoles.length > 0) {
    const compatibleRole = roles.find((r) => allowedRoles.includes(r.role));
    if (!compatibleRole) {
      return <Navigate to="/dashboard" replace />;
    }

    // Multi-rôles : après un choix de profil, ne jamais rendre la page cible
    // tant que currentRole n'est pas aligné. Cela évite les redirections en
    // boucle / écrans blancs causés par les pages qui lisent currentRole dès
    // leur premier render.
    if (!currentRole || !allowedRoles.includes(currentRole.role)) {
      return <RouteLoader />;
    }
  }

  return <>{children}</>;
};
