/**
 * @page PlayerProfileRedirect
 * @route /player/profile
 *
 * Redirection automatique vers la fiche personnelle du Joueur courant.
 *
 * @description
 * Tampon : récupère user.id via useAuth et redirige vers /players/:userId
 * (PlayerDetail) en mode self-view (interface restreinte).
 *
 * @access Joueur connecté
 */
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/layout/AppLayout";

export default function PlayerProfileRedirect() {
  const navigate = useNavigate();
  const { user, loading, currentRole } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!user || currentRole?.role !== "player") {
      navigate("/dashboard", { replace: true });
      return;
    }
    navigate(`/players/${user.id}`, { replace: true });
  }, [user, loading, currentRole, navigate]);

  return (
    <AppLayout>
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
      </div>
    </AppLayout>
  );
}
