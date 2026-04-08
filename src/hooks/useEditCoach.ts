import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import type { TeamAssignmentItem } from "@/components/modals/shared/TeamAssignmentMatrix";

export interface Team {
  id: string;
  name: string;
  season: string | null;
  hasReferent: boolean;
  referentName?: string;
}

export interface CoachData {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  photo_url: string | null;
  club_id: string | null;
  assignments: { team_id: string; team_name: string; coach_role: "referent" | "assistant" }[];
}

export function useEditCoach(coach: CoachData, open: boolean, onSuccess?: () => void, onClose?: () => void) {
  const { hasAdminRole: isAdmin, currentRole } = useAuth();
  const [loading, setLoading] = useState(false);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [teamAssignments, setTeamAssignments] = useState<TeamAssignmentItem[]>([]);
  const [firstName, setFirstName] = useState(coach.first_name || "");
  const [lastName, setLastName] = useState(coach.last_name || "");
  const [activeTab, setActiveTab] = useState("profile");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(coach.photo_url || null);
  const [removePhoto, setRemovePhoto] = useState(false);

  useEffect(() => {
    if (open) {
      setFirstName(coach.first_name || "");
      setLastName(coach.last_name || "");
      setPhotoPreview(coach.photo_url || null);
      setPhotoFile(null); setRemovePhoto(false);
      fetchTeams();
    }
  }, [open, coach]);

  const fetchTeams = async () => {
    setLoadingTeams(true);
    try {
      const clubId = coach.club_id || currentRole?.club_id;
      if (!clubId && !isAdmin) { setTeams([]); setTeamAssignments([]); return; }

      let query = supabase.from("teams").select("id, name, season").is("deleted_at", null).order("name");
      if (clubId) query = query.eq("club_id", clubId);
      const { data: teamsData, error } = await query;
      if (error) throw error;

      const teamIds = (teamsData || []).map(t => t.id);
      let referentsMap: Record<string, string> = {};
      if (teamIds.length > 0) {
        const { data: referents } = await supabase.from("team_members")
          .select("team_id, profiles:user_id (first_name, last_name)")
          .in("team_id", teamIds).eq("member_type", "coach").eq("coach_role", "referent").eq("is_active", true).neq("user_id", coach.id);
        if (referents) referents.forEach(r => {
          const profile = r.profiles as any;
          if (profile) referentsMap[r.team_id] = `${profile.first_name || ""} ${profile.last_name || ""}`.trim() || "Un autre coach";
        });
      }

      const teamsWithReferents: Team[] = (teamsData || []).map(t => ({ ...t, hasReferent: !!referentsMap[t.id], referentName: referentsMap[t.id] }));
      setTeams(teamsWithReferents);

      setTeamAssignments(teamsWithReferents.map(team => {
        const existing = coach.assignments.find(a => a.team_id === team.id);
        return {
          teamId: team.id, assigned: !!existing, role: existing?.coach_role || "assistant",
          originalAssigned: !!existing, originalRole: existing?.coach_role || null,
        };
      }));
    } catch (error) { console.error("Error fetching teams:", error); }
    finally { setLoadingTeams(false); }
  };

  const toggleTeamAssignment = (teamId: string) => {
    setTeamAssignments(prev => prev.map(a => a.teamId === teamId ? { ...a, assigned: !a.assigned } : a));
  };

  const setTeamRole = (teamId: string, role: "referent" | "assistant") => {
    setTeamAssignments(prev => prev.map(a => a.teamId === teamId ? { ...a, role } : a));
  };

  const handleRemovePhoto = () => { setPhotoFile(null); setPhotoPreview(null); setRemovePhoto(true); };

  const uploadPhoto = async (): Promise<string | null> => {
    if (!photoFile) return null;
    const ext = photoFile.name.split(".").pop() || "png";
    const path = `${coach.id}/photo.${ext}`;
    const { error } = await supabase.storage.from("user-photos").upload(path, photoFile, { upsert: true });
    if (error) throw error;
    const { data: urlData } = supabase.storage.from("user-photos").getPublicUrl(path);
    return `${urlData.publicUrl}?t=${Date.now()}`;
  };

  const getInitials = () => {
    const first = firstName?.charAt(0) || coach.first_name?.charAt(0) || "";
    const last = lastName?.charAt(0) || coach.last_name?.charAt(0) || "";
    return (first + last).toUpperCase() || "?";
  };

  const changesCount = teamAssignments.filter(a => a.assigned !== a.originalAssigned || (a.assigned && a.originalAssigned && a.role !== a.originalRole)).length;

  const handleSave = async () => {
    setLoading(true);
    try {
      let photoUrl: string | null | undefined = undefined;
      if (photoFile) photoUrl = await uploadPhoto();
      else if (removePhoto) photoUrl = null;

      const updateData: Record<string, unknown> = { first_name: firstName, last_name: lastName };
      if (photoUrl !== undefined) updateData.photo_url = photoUrl;

      const { error: profileError } = await supabase.from("profiles").update(updateData).eq("id", coach.id);
      if (profileError) throw profileError;

      const toAdd = teamAssignments.filter(a => a.assigned && !a.originalAssigned);
      const toRemove = teamAssignments.filter(a => !a.assigned && a.originalAssigned);
      const toUpdate = teamAssignments.filter(a => a.assigned && a.originalAssigned && a.role !== a.originalRole);

      for (const assignment of toRemove) {
        const { error } = await supabase.from("team_members").update({ is_active: false, left_at: new Date().toISOString() }).eq("user_id", coach.id).eq("team_id", assignment.teamId).eq("member_type", "coach");
        if (error) throw error;
      }

      for (const assignment of toAdd) {
        const { data: existing } = await supabase.from("team_members").select("id").eq("user_id", coach.id).eq("team_id", assignment.teamId).eq("member_type", "coach").maybeSingle();
        if (existing) {
          const { error } = await supabase.from("team_members").update({ is_active: true, coach_role: assignment.role, left_at: null, joined_at: new Date().toISOString() }).eq("id", existing.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("team_members").insert({ user_id: coach.id, team_id: assignment.teamId, member_type: "coach", coach_role: assignment.role, is_active: true });
          if (error) throw error;
        }
      }

      for (const assignment of toUpdate) {
        const { error } = await supabase.from("team_members").update({ coach_role: assignment.role }).eq("user_id", coach.id).eq("team_id", assignment.teamId).eq("member_type", "coach").eq("is_active", true);
        if (error) throw error;
      }

      toast.success("Coach mis à jour avec succès !");
      onClose?.(); onSuccess?.();
    } catch (error: any) {
      console.error("Error updating coach:", error);
      toast.error("Erreur lors de la mise à jour", { description: error.message || "Une erreur est survenue" });
    } finally { setLoading(false); }
  };

  return {
    loading, teams, loadingTeams, teamAssignments,
    firstName, setFirstName, lastName, setLastName,
    activeTab, setActiveTab,
    photoFile, setPhotoFile, photoPreview, setPhotoPreview, removePhoto,
    handleRemovePhoto, getInitials, changesCount,
    toggleTeamAssignment, setTeamRole, handleSave,
    isAdmin, coach,
  };
}
