import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Plus, Users, Settings, Edit, UserCog, Heart } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { CircleAvatar } from "@/components/shared/CircleAvatar";
import { Button } from "@/components/ui/button";
import { CreateTeamModal } from "@/components/modals/CreateTeamModal";
import { CreateCoachModal } from "@/components/modals/CreateCoachModal";
import { CreateSupporterModal } from "@/components/modals/CreateSupporterModal";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Club {
  id: string;
  name: string;
  primary_color: string;
  secondary_color: string | null;
  logo_url: string | null;
  referent_name: string | null;
  referent_email: string | null;
}

interface Team {
  id: string;
  name: string;
  season: string | null;
  color: string | null;
}

export default function ClubDetail() {
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading, isAdmin, roles } = useAuth();
  const navigate = useNavigate();
  const [club, setClub] = useState<Club | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [showCoachModal, setShowCoachModal] = useState(false);
  const [showSupporterModal, setShowSupporterModal] = useState(false);

  const isClubAdmin = roles.some(r => r.role === "club_admin" && r.club_id === id);
  const canManageClub = isAdmin || isClubAdmin;

  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user && id) {
      fetchClubData();
    }
  }, [user, id]);

  const fetchClubData = async () => {
    try {
      const { data: clubData, error: clubError } = await supabase.from("clubs").select("*").eq("id", id).maybeSingle();
      if (clubError) throw clubError;
      if (!clubData) {
        toast.error("Club non trouvé");
        navigate("/clubs");
        return;
      }
      setClub(clubData);

      const { data: teamsData, error: teamsError } = await supabase.from("teams").select("*").eq("club_id", id).order("name");
      if (teamsError) throw teamsError;
      setTeams(teamsData || []);
    } catch (error: any) {
      console.error("Error fetching club:", error);
      toast.error("Erreur lors du chargement du club");
    } finally {
      setLoading(false);
    }
  };

  if (authLoading || loading) {
    return <AppLayout><div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /></div></AppLayout>;
  }

  if (!club) return null;

  return (
    <AppLayout>
      <Button variant="ghost" className="mb-6 -ml-2" onClick={() => navigate("/clubs")}>
        <ArrowLeft className="w-4 h-4 mr-2" />Retour aux clubs
      </Button>

      <div className="glass-card p-8 mb-8">
        <div className="flex items-center gap-8">
          <div className="w-24 h-24 rounded-2xl flex items-center justify-center text-3xl font-display font-bold" style={{ background: club.logo_url ? `url(${club.logo_url}) center/cover` : `linear-gradient(135deg, ${club.primary_color} 0%, ${club.primary_color}88 100%)`, color: "white", boxShadow: `0 4px 24px -4px ${club.primary_color}40` }}>
            {!club.logo_url && club.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-1">
            <h1 className="text-3xl font-display font-bold">{club.name}</h1>
            <div className="flex items-center gap-4 mt-2 text-muted-foreground">
              <span className="flex items-center gap-2"><Users className="w-4 h-4" />{teams.length} équipe{teams.length > 1 ? "s" : ""}</span>
              {club.referent_name && <span>• Référent: {club.referent_name}</span>}
            </div>
          </div>
          {canManageClub && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="gap-2" onClick={() => setShowCoachModal(true)}><UserCog className="w-4 h-4" />Coach</Button>
              <Button variant="outline" size="sm" className="gap-2" onClick={() => setShowSupporterModal(true)}><Heart className="w-4 h-4" />Supporter</Button>
              <Button variant="outline" size="icon"><Settings className="w-4 h-4" /></Button>
              <Button variant="outline" size="icon"><Edit className="w-4 h-4" /></Button>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-display font-semibold">Équipes</h2>
        {canManageClub && <Button className="gap-2" onClick={() => setShowTeamModal(true)}><Plus className="w-4 h-4" />Nouvelle équipe</Button>}
      </div>

      {teams.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-8">
          {teams.map((team, index) => (
            <div key={team.id} className="animate-fade-in-up opacity-0" style={{ animationDelay: `${index * 0.1}s` }}>
              <CircleAvatar name={team.name} subtitle={team.season || ""} color={team.color || club.primary_color} size="lg" onClick={() => navigate(`/teams/${team.id}`)} />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center h-48 glass-card">
          <Users className="w-12 h-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium text-muted-foreground">Aucune équipe</h3>
          <p className="text-sm text-muted-foreground mt-1">Créez votre première équipe</p>
          {canManageClub && <Button className="mt-4 gap-2" onClick={() => setShowTeamModal(true)}><Plus className="w-4 h-4" />Créer une équipe</Button>}
        </div>
      )}

      <CreateTeamModal open={showTeamModal} onOpenChange={setShowTeamModal} clubId={club.id} clubColor={club.primary_color} onSuccess={fetchClubData} />
      <CreateCoachModal open={showCoachModal} onOpenChange={setShowCoachModal} clubId={club.id} teams={teams} onSuccess={fetchClubData} />
      <CreateSupporterModal open={showSupporterModal} onOpenChange={setShowSupporterModal} clubId={club.id} onSuccess={fetchClubData} />
    </AppLayout>
  );
}