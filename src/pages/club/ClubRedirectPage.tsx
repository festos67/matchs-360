/**
 * @page ClubRedirectPage
 * @route /club ou /my-club
 *
 * Redirection automatique vers la fiche du club du Club Admin courant.
 * (mem://navigation/club-admin-navigation)
 *
 * @description
 * Page tampon utilisée dans la sidebar des Club Admins. Récupère le `club_id`
 * de l'utilisateur via useAuth et redirige vers /clubs/:clubId.
 *
 * @access Club Admin
 *
 * @maintenance
 * Affiche un loader pendant la résolution. Si l'utilisateur n'a pas de club
 * (cas anormal), redirige vers /dashboard.
 */
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";

export default function ClubRedirectPage() {
  const { currentRole, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    const clubId = currentRole?.club_id;
    if (clubId) {
      navigate(`/clubs/${clubId}`, { replace: true });
    } else {
      navigate("/clubs", { replace: true });
    }
  }, [currentRole, loading, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );
}
