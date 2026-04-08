import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Coach {
  id: string; memberId: string; firstName: string | null; lastName: string | null;
  nickname: string | null; photoUrl: string | null; coachRole: "referent" | "assistant" | null;
}

interface AvailableCoach {
  id: string; firstName: string | null; lastName: string | null; nickname: string | null;
}

export function useEditTeam(
  team: { id: string; name: string; short_name?: string | null; season: string | null; color: string | null; club_id: string; description?: string | null },
  open: boolean,
  onSuccess: () => void,
  onClose?: () => void,
) {
  const [name, setName] = useState(team.name);
  const [shortName, setShortName] = useState(team.short_name || "");
  const [color, setColor] = useState(team.color || "#3B82F6");
  const [season, setSeason] = useState(team.season || "2024-2025");
  const [description, setDescription] = useState(team.description || "");
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [availableCoaches, setAvailableCoaches] = useState<AvailableCoach[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(team.name); setShortName(team.short_name || ""); setColor(team.color || "#3B82F6");
      setSeason(team.season || "2024-2025"); setDescription(team.description || "");
      fetchCoaches(); fetchAvailableCoaches();
    }
  }, [open, team]);

  const fetchCoaches = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from("team_members")
        .select("id, coach_role, profile:profiles!inner(id, first_name, last_name, nickname, photo_url)")
        .eq("team_id", team.id).eq("member_type", "coach").eq("is_active", true);
      if (error) throw error;
      setCoaches((data || []).map((m: any) => ({
        id: m.profile.id, memberId: m.id, firstName: m.profile.first_name, lastName: m.profile.last_name,
        nickname: m.profile.nickname, photoUrl: m.profile.photo_url, coachRole: m.coach_role,
      })));
    } catch (error) { console.error("Error fetching coaches:", error); toast.error("Erreur lors du chargement des coachs"); }
    finally { setLoading(false); }
  };

  const fetchAvailableCoaches = async () => {
    try {
      const { data: clubCoaches, error } = await supabase.from("user_roles")
        .select("user_id, profiles!inner(id, first_name, last_name, nickname, deleted_at)")
        .eq("club_id", team.club_id).eq("role", "coach").is("profiles.deleted_at", null);
      if (error) throw error;

      const { data: teamCoaches } = await supabase.from("team_members").select("user_id").eq("team_id", team.id).eq("member_type", "coach").eq("is_active", true);
      const teamCoachIds = new Set((teamCoaches || []).map(c => c.user_id));

      setAvailableCoaches(
        (clubCoaches || []).filter((c: any) => !teamCoachIds.has(c.user_id)).map((c: any) => ({
          id: c.profiles.id, firstName: c.profiles.first_name, lastName: c.profiles.last_name, nickname: c.profiles.nickname,
        }))
      );
    } catch (error) { console.error("Error fetching available coaches:", error); }
  };

  const getCoachName = (coach: Coach | AvailableCoach) => {
    if (coach.nickname) return coach.nickname;
    if (coach.firstName && coach.lastName) return `${coach.firstName} ${coach.lastName}`;
    return coach.firstName || coach.lastName || "Coach";
  };

  const hasReferent = coaches.some(c => c.coachRole === "referent");

  const handleRoleChange = async (coach: Coach, newRole: "referent" | "assistant") => {
    if (newRole === "referent" && hasReferent && coach.coachRole !== "referent") { toast.error("Il y a déjà un coach référent dans cette équipe"); return; }
    try {
      const { error } = await supabase.from("team_members").update({ coach_role: newRole }).eq("id", coach.memberId);
      if (error) throw error;
      setCoaches(prev => prev.map(c => c.id === coach.id ? { ...c, coachRole: newRole } : c));
      toast.success("Rôle mis à jour"); onSuccess();
    } catch (error) { console.error("Error updating role:", error); toast.error("Erreur lors de la mise à jour du rôle"); }
  };

  const handleRemoveCoach = async (coach: Coach) => {
    try {
      const { error } = await supabase.from("team_members").update({ is_active: false, left_at: new Date().toISOString() }).eq("id", coach.memberId);
      if (error) throw error;
      setCoaches(prev => prev.filter(c => c.id !== coach.id));
      setAvailableCoaches(prev => [...prev, { id: coach.id, firstName: coach.firstName, lastName: coach.lastName, nickname: coach.nickname }]);
      toast.success("Coach retiré de l'équipe"); onSuccess();
    } catch (error) { console.error("Error removing coach:", error); toast.error("Erreur lors du retrait du coach"); }
  };

  const handleAddCoach = async (coachId: string) => {
    try {
      const { data: existing } = await supabase.from("team_members").select("id").eq("team_id", team.id).eq("user_id", coachId).eq("member_type", "coach").eq("is_active", false).maybeSingle();
      if (existing) {
        const { error } = await supabase.from("team_members").update({ is_active: true, left_at: null, coach_role: "assistant" }).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("team_members").insert({ team_id: team.id, user_id: coachId, member_type: "coach", coach_role: "assistant" });
        if (error) throw error;
      }
      await fetchCoaches();
      setAvailableCoaches(prev => prev.filter(c => c.id !== coachId));
      toast.success("Coach ajouté à l'équipe"); onSuccess();
    } catch (error) { console.error("Error adding coach:", error); toast.error("Erreur lors de l'ajout du coach"); }
  };

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Le nom de l'équipe est requis"); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from("teams").update({ name: name.trim(), short_name: shortName.trim().toUpperCase() || null, color, season, description: description.trim() || null }).eq("id", team.id);
      if (error) throw error;
      toast.success("Équipe mise à jour"); onSuccess(); onClose?.();
    } catch (error: any) { console.error("Error updating team:", error); toast.error("Erreur lors de la mise à jour"); }
    finally { setSaving(false); }
  };

  return {
    name, setName, shortName, setShortName, color, setColor, season, setSeason, description, setDescription,
    coaches, availableCoaches, loading, saving, hasReferent,
    getCoachName, handleRoleChange, handleRemoveCoach, handleAddCoach, handleSave,
  };
}
