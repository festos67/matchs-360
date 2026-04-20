import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getEdgeFunctionErrorMessage } from "@/lib/edge-function-errors";
import { usePlanLimitHandler } from "@/hooks/usePlanLimitHandler";

const playerSchema = z.object({
  firstName: z.string().min(1, "Prénom requis").max(50),
  lastName: z.string().min(1, "Nom requis").max(50),
  nickname: z.string().max(50).optional(),
  email: z.string().email("Email invalide").max(255),
  teamId: z.string().min(1, "Équipe requise"),
});

export type PlayerFormData = z.infer<typeof playerSchema>;

export interface Team { id: string; name: string; }

export interface TransferablePlayer {
  id: string;
  firstName: string | null;
  lastName: string | null;
  nickname: string | null;
  teamId: string;
  teamName: string;
}

export function useCreatePlayer(
  clubId: string,
  open: boolean,
  defaultTeamId?: string,
  propTeams?: Team[],
  onSuccess?: () => void,
  onClose?: () => void,
) {
  const [loading, setLoading] = useState(false);
  const [teams, setTeams] = useState<Team[]>(propTeams || []);
  const [showMutationAlert, setShowMutationAlert] = useState(false);
  const [pendingSubmit, setPendingSubmit] = useState<PlayerFormData | null>(null);
  const [activeTab, setActiveTab] = useState("create");
  const [transferablePlayers, setTransferablePlayers] = useState<TransferablePlayer[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<TransferablePlayer | null>(null);
  const [playerSelectOpen, setPlayerSelectOpen] = useState(false);
  const [loadingPlayers, setLoadingPlayers] = useState(false);
  const [teamSelectOpen, setTeamSelectOpen] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const form = useForm<PlayerFormData>({
    resolver: zodResolver(playerSchema),
    defaultValues: { teamId: defaultTeamId || "" },
  });

  useEffect(() => { if (!propTeams && open && clubId) fetchTeams(); }, [open, clubId, propTeams]);
  useEffect(() => { if (defaultTeamId) form.setValue("teamId", defaultTeamId); }, [defaultTeamId]);
  useEffect(() => { if (open && clubId && defaultTeamId) fetchTransferablePlayers(); }, [open, clubId, defaultTeamId]);
  useEffect(() => {
    if (!open) { setActiveTab("create"); setSelectedPlayer(null); setPhotoFile(null); setPhotoPreview(null); form.reset(); }
  }, [open]);

  const fetchTeams = async () => {
    const { data } = await supabase.from("teams").select("id, name").eq("club_id", clubId).is("deleted_at", null).order("name");
    if (data) setTeams(data);
  };

  const fetchTransferablePlayers = async () => {
    if (!defaultTeamId) return;
    setLoadingPlayers(true);
    try {
      const { data, error } = await supabase
        .from("team_members")
        .select("user_id, team_id, teams!inner(id, name, club_id), profiles!inner(id, first_name, last_name, nickname, deleted_at)")
        .eq("member_type", "player").eq("is_active", true).eq("teams.club_id", clubId).neq("team_id", defaultTeamId).is("profiles.deleted_at", null);
      if (error) throw error;
      setTransferablePlayers((data || []).map((item: any) => ({
        id: item.profiles.id, firstName: item.profiles.first_name, lastName: item.profiles.last_name,
        nickname: item.profiles.nickname, teamId: item.team_id, teamName: item.teams.name,
      })));
    } catch (error) { console.error("Error fetching transferable players:", error); }
    finally { setLoadingPlayers(false); }
  };

  const uploadPhotoForUser = async (userId: string): Promise<string | null> => {
    if (!photoFile) return null;
    const ext = photoFile.name.split(".").pop() || "png";
    const path = `${userId}/photo.${ext}`;
    const { error } = await supabase.storage.from("user-photos").upload(path, photoFile, { upsert: true });
    if (error) { console.error("Photo upload error:", error); return null; }
    const { data: urlData } = supabase.storage.from("user-photos").getPublicUrl(path);
    return `${urlData.publicUrl}?t=${Date.now()}`;
  };

  const onSubmit = async (data: PlayerFormData, force = false) => {
    setLoading(true);
    try {
      const { data: result, error } = await supabase.functions.invoke("send-invitation", {
        body: { email: data.email, firstName: data.firstName, lastName: data.lastName, clubId, intendedRole: "player", teamId: data.teamId },
      });
      if (error) throw error;
      if (result?.error) throw new Error(result.error);

      if (photoFile && result?.userId) {
        const photoUrl = await uploadPhotoForUser(result.userId);
        if (photoUrl) {
          const { error: photoErr } = await supabase.from("profiles").update({ photo_url: photoUrl }).eq("id", result.userId);
          if (photoErr) console.warn("Could not update photo:", photoErr);
        }
      }

      toast.success(`Joueur invité avec succès !`, { description: `Une invitation a été envoyée à ${data.email}` });
      form.reset(); setPhotoFile(null); setPhotoPreview(null);
      onClose?.(); onSuccess?.();
    } catch (error: unknown) {
      console.error("Error inviting player:", error);
      const errorMessage = await getEdgeFunctionErrorMessage(error);
      if (errorMessage.includes("déjà dans une équipe") && !force) {
        setPendingSubmit(data); setShowMutationAlert(true); setLoading(false); return;
      }
      toast.error("Erreur lors de l'invitation", { description: errorMessage });
    } finally { setLoading(false); }
  };

  const handleTransfer = async () => {
    if (!selectedPlayer || !defaultTeamId) return;
    setLoading(true);
    try {
      const { error: restoreErr } = await supabase.from("profiles").update({ deleted_at: null, updated_at: new Date().toISOString() }).eq("id", selectedPlayer.id).not("deleted_at", "is", null);
      if (restoreErr) throw restoreErr;
      const { error: archiveError } = await supabase.from("team_members").update({ is_active: false, left_at: new Date().toISOString(), archived_reason: "Mutation vers une autre équipe" }).eq("user_id", selectedPlayer.id).eq("team_id", selectedPlayer.teamId).eq("is_active", true);
      if (archiveError) throw archiveError;

      const { data: existingMembership } = await supabase.from("team_members").select("id").eq("user_id", selectedPlayer.id).eq("team_id", defaultTeamId).eq("member_type", "player").eq("is_active", false).maybeSingle();

      if (existingMembership) {
        const { error } = await supabase.from("team_members").update({ is_active: true, left_at: null, archived_reason: null, joined_at: new Date().toISOString() }).eq("id", existingMembership.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("team_members").insert({ user_id: selectedPlayer.id, team_id: defaultTeamId, member_type: "player", is_active: true, joined_at: new Date().toISOString() });
        if (error) throw error;
      }

      const playerName = selectedPlayer.nickname || `${selectedPlayer.firstName} ${selectedPlayer.lastName}`;
      toast.success("Transfert effectué !", { description: `${playerName} a été transféré depuis ${selectedPlayer.teamName}` });
      onClose?.(); onSuccess?.();
    } catch (error: any) {
      console.error("Error transferring player:", error);
      toast.error("Erreur lors du transfert", { description: error.message });
    } finally { setLoading(false); }
  };

  const handleMutationConfirm = () => {
    if (pendingSubmit) onSubmit(pendingSubmit, true);
    setShowMutationAlert(false); setPendingSubmit(null);
  };

  const getPlayerDisplayName = (player: TransferablePlayer) => {
    const name = player.nickname || `${player.firstName || ""} ${player.lastName || ""}`.trim();
    return `${name} (${player.teamName})`;
  };

  return {
    form, loading, teams, activeTab, setActiveTab,
    transferablePlayers, selectedPlayer, setSelectedPlayer,
    playerSelectOpen, setPlayerSelectOpen, loadingPlayers,
    teamSelectOpen, setTeamSelectOpen,
    photoFile, setPhotoFile, photoPreview, setPhotoPreview,
    showMutationAlert, setShowMutationAlert,
    onSubmit, handleTransfer, handleMutationConfirm, getPlayerDisplayName,
  };
}
