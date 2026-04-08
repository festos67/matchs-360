import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Club { id: string; name: string; }
interface Team { id: string; name: string; club_id: string; }
interface Player { id: string; name: string; }

export interface UserRole {
  id: string;
  role: string;
  club_id: string | null;
  club_name: string | null;
}

export interface TeamMembership {
  id: string;
  team_id: string;
  team_name: string;
  club_name: string;
  member_type: string;
  coach_role: string | null;
  is_active: boolean;
}

export interface SupporterLink {
  id: string;
  player_id: string;
  player_name: string;
}

export interface AdminUser {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
  photo_url: string | null;
  club_id: string | null;
  status: "Actif" | "Invité" | "Suspendu";
  roles: UserRole[];
  team_memberships: TeamMembership[];
  supporter_links: SupporterLink[];
}

export function useEditUser(user: AdminUser, onUpdate: () => void) {
  const [firstName, setFirstName] = useState(user.first_name || "");
  const [lastName, setLastName] = useState(user.last_name || "");
  const [nickname, setNickname] = useState(user.nickname || "");
  const [saving, setSaving] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(user.photo_url || null);
  const [removePhoto, setRemovePhoto] = useState(false);

  const [showAddRole, setShowAddRole] = useState(false);
  const [newRole, setNewRole] = useState("");
  const [selectedClub, setSelectedClub] = useState("");
  const [selectedTeam, setSelectedTeam] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState("");
  const [coachRole, setCoachRole] = useState<"referent" | "assistant">("assistant");

  const [clubs, setClubs] = useState<Club[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);

  useEffect(() => { fetchClubs(); }, []);
  useEffect(() => { if (selectedClub) fetchTeams(selectedClub); else setTeams([]); }, [selectedClub]);
  useEffect(() => { if (newRole === "supporter") fetchPlayers(); }, [newRole]);

  const fetchClubs = async () => {
    const { data } = await supabase.from("clubs").select("id, name").is("deleted_at", null).order("name");
    setClubs(data || []);
  };

  const fetchTeams = async (clubId: string) => {
    const { data } = await supabase.from("teams").select("id, name, club_id").eq("club_id", clubId).is("deleted_at", null).order("name");
    setTeams(data || []);
  };

  const fetchPlayers = async () => {
    const { data: teamMembers } = await supabase.from("team_members").select("user_id, profiles!team_members_user_id_fkey(id, first_name, last_name, nickname)").eq("member_type", "player").eq("is_active", true);
    const playerList: Player[] = (teamMembers || []).map((tm) => {
      const profile = tm.profiles as { id: string; first_name: string | null; last_name: string | null; nickname: string | null } | null;
      return { id: profile?.id || tm.user_id, name: profile?.nickname || `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim() || "Joueur inconnu" };
    });
    setPlayers(playerList.filter((p, i, self) => self.findIndex(x => x.id === p.id) === i));
  };

  const callAdminAction = async (action: string, payload: Record<string, unknown>) => {
    const { data: { session } } = await supabase.auth.getSession();
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-users`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session?.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...payload }),
    });
    if (!response.ok) { const error = await response.json(); throw new Error(error.error || "Action failed"); }
    return response.json();
  };

  const uploadPhoto = async (): Promise<string | null> => {
    if (!photoFile) return null;
    const ext = photoFile.name.split(".").pop() || "png";
    const path = `${user.id}/photo.${ext}`;
    const { error } = await supabase.storage.from("user-photos").upload(path, photoFile, { upsert: true });
    if (error) throw error;
    const { data: urlData } = supabase.storage.from("user-photos").getPublicUrl(path);
    return `${urlData.publicUrl}?t=${Date.now()}`;
  };

  const getInitials = () => {
    const first = firstName?.charAt(0) || "";
    const last = lastName?.charAt(0) || "";
    return (first + last).toUpperCase() || "?";
  };

  const handleSaveProfile = async () => {
    try {
      setSaving(true);
      let photoUrl: string | null | undefined = undefined;
      if (photoFile) photoUrl = await uploadPhoto();
      else if (removePhoto) photoUrl = null;

      const payload: Record<string, unknown> = { userId: user.id, firstName, lastName, nickname };
      if (photoUrl !== undefined) payload.photoUrl = photoUrl;

      await callAdminAction("update-profile", payload);
      toast.success("Profil mis à jour");
      onUpdate();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Erreur lors de la mise à jour");
    } finally { setSaving(false); }
  };

  const handleAddRole = async () => {
    try {
      setSaving(true);
      const payload: Record<string, unknown> = { userId: user.id, role: newRole };
      if (newRole === "club_admin" || newRole === "coach" || newRole === "player") payload.clubId = selectedClub;
      if (newRole === "coach" || newRole === "player") { payload.teamId = selectedTeam; if (newRole === "coach") payload.coachRole = coachRole; }
      if (newRole === "supporter") payload.playerId = selectedPlayer;

      await callAdminAction("add-role", payload);
      toast.success("Rôle ajouté");
      setShowAddRole(false); setNewRole(""); setSelectedClub(""); setSelectedTeam(""); setSelectedPlayer("");
      onUpdate();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Erreur lors de l'ajout du rôle");
    } finally { setSaving(false); }
  };

  const handleRemoveRole = async (roleId: string) => {
    try { await callAdminAction("remove-role", { roleId }); toast.success("Rôle supprimé"); onUpdate(); }
    catch (error: unknown) { toast.error(error instanceof Error ? error.message : "Erreur lors de la suppression"); }
  };

  const handleRemoveTeamMembership = async (membershipId: string) => {
    try { await callAdminAction("remove-role", { teamMembershipId: membershipId }); toast.success("Appartenance équipe supprimée"); onUpdate(); }
    catch (error: unknown) { toast.error(error instanceof Error ? error.message : "Erreur lors de la suppression"); }
  };

  const handleRemoveSupporterLink = async (linkId: string) => {
    try { await callAdminAction("remove-role", { supporterLinkId: linkId }); toast.success("Lien supporter supprimé"); onUpdate(); }
    catch (error: unknown) { toast.error(error instanceof Error ? error.message : "Erreur lors de la suppression"); }
  };

  const handleForceValidate = async () => {
    try { await callAdminAction("force-validate", { userId: user.id }); toast.success("Email validé"); onUpdate(); }
    catch (error: unknown) { toast.error(error instanceof Error ? error.message : "Erreur lors de la validation"); }
  };

  const handleRestore = async () => {
    try { await callAdminAction("restore", { userId: user.id }); toast.success("Utilisateur réactivé"); onUpdate(); }
    catch (error: unknown) { toast.error(error instanceof Error ? error.message : "Erreur lors de la réactivation"); }
  };

  const handleResendInvitation = async () => {
    try {
      const result = await callAdminAction("resend-invitation", { userId: user.id, email: user.email, clubId: user.club_id });
      if (result.emailSent) toast.success(`Invitation renvoyée à ${user.email}`);
      else toast.warning("Invitation générée mais l'email n'a pas pu être envoyé");
      onUpdate();
    } catch (error: unknown) { toast.error(error instanceof Error ? error.message : "Erreur lors du renvoi de l'invitation"); }
  };

  const needsClubSelection = newRole === "club_admin" || newRole === "coach" || newRole === "player";
  const needsTeamSelection = newRole === "coach" || newRole === "player";
  const needsPlayerSelection = newRole === "supporter";

  return {
    firstName, setFirstName, lastName, setLastName, nickname, setNickname,
    saving, photoFile, setPhotoFile, photoPreview, setPhotoPreview, removePhoto, setRemovePhoto,
    showAddRole, setShowAddRole, newRole, setNewRole,
    selectedClub, setSelectedClub, selectedTeam, setSelectedTeam, selectedPlayer, setSelectedPlayer,
    coachRole, setCoachRole, clubs, teams, players,
    needsClubSelection, needsTeamSelection, needsPlayerSelection,
    getInitials, handleSaveProfile, handleAddRole, handleRemoveRole,
    handleRemoveTeamMembership, handleRemoveSupporterLink,
    handleForceValidate, handleRestore, handleResendInvitation,
  };
}
