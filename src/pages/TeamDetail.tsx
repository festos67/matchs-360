import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Plus, User, Star, Settings, FileText, UserCog } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { CircleAvatar } from "@/components/shared/CircleAvatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CreatePlayerModal } from "@/components/modals/CreatePlayerModal";
import { CreateCoachModal } from "@/components/modals/CreateCoachModal";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Team {
  id: string;
  name: string;
  season: string | null;
  color: string | null;
  club_id: string;
  club?: { name: string; primary_color: string };
}

interface TeamMember {
  id: string;
  member_type: "coach" | "player";
  coach_role: "referent" | "assistant" | null;
  profile: { id: string; first_name: string | null; last_name: string | null; nickname: string | null; photo_url: string | null };
}

export default function TeamDetail() {
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading, isAdmin, roles } = useAuth();
  const navigate = useNavigate();
  const [team, setTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPlayerModal, setShowPlayerModal] = useState(false);
  const [showCoachModal, setShowCoachModal] = useState(false);

  const isClubAdmin = team ? roles.some(r => r.role === "club_admin" && r.club_id === team.club_id) : false;
  const isCoachOfTeam = members.some(m => m.member_type === "coach" && m.profile.id === user?.id);
  const canManageTeam = isAdmin || isClubAdmin || isCoachOfTeam;

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user && id) fetchTeamData();
  }, [user, id]);

  const fetchTeamData = async () => {
    try {
      const { data: teamData, error: teamError } = await supabase.from("teams").select("*, club:clubs(name, primary_color)").eq("id", id).maybeSingle();
      if (teamError) throw teamError;
      if (!teamData) { toast.error("Équipe non trouvée"); navigate("/clubs"); return; }
      setTeam(teamData);

      const { data: membersData, error: membersError } = await supabase.from("team_members").select("id, member_type, coach_role, profile:profiles(id, first_name, last_name, nickname, photo_url)").eq("team_id", id).eq("is_active", true);
      if (membersError) throw membersError;
      setMembers(membersData as TeamMember[]);
    } catch (error: any) {
      console.error("Error fetching team:", error);
      toast.error("Erreur lors du chargement");
    } finally {
      setLoading(false);
    }
  };

  const coaches = members.filter(m => m.member_type === "coach");
  const players = members.filter(m => m.member_type === "player");

  const getMemberName = (member: TeamMember) => {
    const { profile } = member;
    if (profile.nickname) return profile.nickname;
    if (profile.first_name && profile.last_name) return `${profile.first_name} ${profile.last_name}`;
    return profile.first_name || profile.last_name || "Utilisateur";
  };

  if (authLoading || loading) return <AppLayout><div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" /></div></AppLayout>;
  if (!team) return null;

  const teamColor = team.color || team.club?.primary_color || "#3B82F6";

  return (
    <AppLayout>
      <Button variant="ghost" className="mb-6 -ml-2" onClick={() => navigate(`/clubs/${team.club_id}`)}><ArrowLeft className="w-4 h-4 mr-2" />Retour au club</Button>

      <div className="glass-card p-8 mb-8">
        <div className="flex items-center gap-8">
          <div className="w-24 h-24 rounded-2xl flex items-center justify-center text-3xl font-display font-bold" style={{ background: `linear-gradient(135deg, ${teamColor} 0%, ${teamColor}88 100%)`, color: "white", boxShadow: `0 4px 24px -4px ${teamColor}40` }}>{team.name.slice(0, 2).toUpperCase()}</div>
          <div className="flex-1">
            <div className="flex items-center gap-3"><h1 className="text-3xl font-display font-bold">{team.name}</h1><Badge variant="secondary">{team.season}</Badge></div>
            <p className="text-muted-foreground mt-1">{team.club?.name} • {players.length} joueur{players.length > 1 ? "s" : ""} • {coaches.length} coach{coaches.length > 1 ? "es" : ""}</p>
          </div>
          <div className="flex gap-2"><Button variant="outline" className="gap-2"><FileText className="w-4 h-4" />Référentiel</Button><Button variant="outline" size="icon"><Settings className="w-4 h-4" /></Button></div>
        </div>
      </div>

      <div className="mb-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-display font-semibold">Staff technique</h2>
          {(isAdmin || isClubAdmin) && <Button variant="outline" size="sm" className="gap-2" onClick={() => setShowCoachModal(true)}><UserCog className="w-4 h-4" />Coach</Button>}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {coaches.map((coach, index) => (
            <div key={coach.id} className="animate-fade-in-up opacity-0" style={{ animationDelay: `${index * 0.1}s` }}>
              <CircleAvatar name={getMemberName(coach)} subtitle={coach.coach_role === "referent" ? "Coach Référent ★" : "Coach Assistant"} imageUrl={coach.profile.photo_url} color={teamColor} size="md" badge={coach.coach_role === "referent" ? <div className="w-6 h-6 rounded-full bg-warning flex items-center justify-center"><Star className="w-3 h-3 text-warning-foreground" /></div> : undefined} />
            </div>
          ))}
          {coaches.length === 0 && <div className="col-span-full flex flex-col items-center justify-center h-32 glass-card"><p className="text-muted-foreground">Aucun coach assigné</p></div>}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-display font-semibold">Joueurs ({players.length})</h2>
          {canManageTeam && <Button className="gap-2" onClick={() => setShowPlayerModal(true)}><Plus className="w-4 h-4" />Joueur</Button>}
        </div>
        {players.length > 0 ? (
          <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
            {players.map((player, index) => (
              <div key={player.id} className="animate-fade-in-up opacity-0" style={{ animationDelay: `${index * 0.05}s` }}>
                <CircleAvatar name={getMemberName(player)} imageUrl={player.profile.photo_url} color={teamColor} size="md" onClick={() => navigate(`/players/${player.profile.id}`)} />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-48 glass-card">
            <User className="w-12 h-12 text-muted-foreground/50 mb-4" /><h3 className="text-lg font-medium text-muted-foreground">Aucun joueur</h3>
            {canManageTeam && <Button className="mt-4 gap-2" onClick={() => setShowPlayerModal(true)}><Plus className="w-4 h-4" />Ajouter</Button>}
          </div>
        )}
      </div>

      <CreatePlayerModal open={showPlayerModal} onOpenChange={setShowPlayerModal} clubId={team.club_id} teams={[{ id: team.id, name: team.name }]} defaultTeamId={team.id} onSuccess={fetchTeamData} />
      <CreateCoachModal open={showCoachModal} onOpenChange={setShowCoachModal} clubId={team.club_id} teams={[{ id: team.id, name: team.name }]} onSuccess={fetchTeamData} />
    </AppLayout>
  );
}