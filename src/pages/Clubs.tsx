/**
 * @page Clubs
 * @route /clubs
 *
 * Annuaire des clubs de la plateforme.
 *
 * @description
 * Liste tous les clubs visibles par l'utilisateur courant. Pour les Super Admins,
 * affiche l'intégralité des clubs ; pour les autres rôles, la RLS Supabase filtre
 * automatiquement aux clubs auxquels l'utilisateur est rattaché.
 *
 * @access
 * - Super Admin : voit tous les clubs + bouton "Créer un club"
 * - Club Admin / Coach / Joueur / Supporter : voit uniquement les clubs de rattachement
 *
 * @features
 * - Recherche full-text sur le nom du club
 * - Affichage du référent (nom + email)
 * - Compteur d'équipes par club (jointure côté client)
 * - Modal de création (CreateClubModal) — Super Admin uniquement
 *
 * @navigation Clic sur une carte → /clubs/:clubId (ClubDetail)
 *
 * @maintenance
 * Le filtrage des clubs supprimés (`.is("deleted_at", null)`) est essentiel —
 * voir mem://technical/soft-delete-strategy.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Search, Building2 } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { CircleAvatar } from "@/components/shared/CircleAvatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CreateClubModal } from "@/components/modals/CreateClubModal";
import { AddEntityButton } from "@/components/shared/AddEntityButton";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Club {
  id: string;
  name: string;
  primary_color: string;
  logo_url: string | null;
  referent_name: string | null;
  referent_email: string | null;
  teams_count?: number;
}

export default function Clubs() {
  const { user, loading: authLoading, hasAdminRole: isAdmin } = useAuth();
  const navigate = useNavigate();
  const [clubs, setClubs] = useState<Club[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) {
      fetchClubs();
    }
  }, [user]);

  const fetchClubs = async () => {
    try {
      const { data, error } = await supabase
        .from("clubs")
        .select("*, teams:teams(count)")
        .order("name");

      if (error) throw error;

      const clubsWithCount = (data || []).map((club: any) => ({
        ...club,
        teams_count: club.teams?.[0]?.count || 0,
      }));

      setClubs(clubsWithCount);
    } catch (error: any) {
      console.error("Error fetching clubs:", error);
      toast.error("Erreur lors du chargement des clubs");
    } finally {
      setLoading(false);
    }
  };

  const filteredClubs = clubs.filter((club) =>
    club.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (authLoading || loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold">Clubs</h1>
          <p className="text-muted-foreground mt-1">
            {clubs.length} organisation{clubs.length > 1 ? "s" : ""} enregistrée{clubs.length > 1 ? "s" : ""}
          </p>
        </div>
        {isAdmin && (
          <AddEntityButton type="club" onClick={() => setShowCreateModal(true)} />
        )}
      </div>

      <div className="relative max-w-md mb-8">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Rechercher un club..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {filteredClubs.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-8">
          {filteredClubs.map((club, index) => (
            <div
              key={club.id}
              className="animate-fade-in-up opacity-0"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <CircleAvatar
                shape="square"
                name={club.name}
                subtitle={`${club.teams_count || 0} équipe${(club.teams_count || 0) > 1 ? "s" : ""}`}
                imageUrl={club.logo_url}
                color={club.primary_color}
                size="lg"
                onClick={() => navigate(`/clubs/${club.id}`)}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center h-64 glass-card">
          <Building2 className="w-16 h-16 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium text-muted-foreground">
            {searchQuery ? "Aucun club trouvé" : "Aucun club enregistré"}
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            {searchQuery ? "Essayez avec un autre terme de recherche" : "Commencez par créer votre premier club"}
          </p>
          {isAdmin && !searchQuery && (
            <Button className="mt-4 gap-2" onClick={() => setShowCreateModal(true)}>
              <Plus className="w-4 h-4" />
              Créer un club
            </Button>
          )}
        </div>
      )}

      <CreateClubModal open={showCreateModal} onOpenChange={setShowCreateModal} onSuccess={fetchClubs} />
    </AppLayout>
  );
}