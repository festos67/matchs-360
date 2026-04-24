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

interface ProtectedRouteProps {
  children: ReactNode;
  allowedRoles?: Array<"admin" | "club_admin" | "coach" | "player" | "supporter">;
}

export const ProtectedRoute = ({ children, allowedRoles }: ProtectedRouteProps) => {
  const { user, roles, currentRole, loading, setCurrentRole } = useAuth();

  // Auto-align currentRole avec la route si désync détectée :
  // user navigue à /admin/* en étant currentRole=coach → bascule sur le rôle admin
  // pour que la sidebar et l'UI s'alignent automatiquement.
  useEffect(() => {
    if (!allowedRoles || allowedRoles.length === 0) return;
    if (!currentRole) return;
    if (allowedRoles.includes(currentRole.role)) return;
    const compatible = roles.find((r) => allowedRoles.includes(r.role));
    if (compatible) setCurrentRole(compatible);
  }, [allowedRoles, currentRole, roles, setCurrentRole]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (allowedRoles && allowedRoles.length > 0) {
    const hasAccess = roles.some((r) => allowedRoles.includes(r.role));
    if (!hasAccess) {
      return <Navigate to="/dashboard" replace />;
    }
  }

  return <>{children}</>;
};
