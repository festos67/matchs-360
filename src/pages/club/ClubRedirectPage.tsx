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
