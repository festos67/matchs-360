/**
 * @hook useCreateCoach
 * @description Hook centralisant toute la logique métier de création d'un coach.
 *              Encapsule la gestion du formulaire (react-hook-form + Zod), les
 *              modes Nouveau/Existant, l'upload photo, l'affectation multi-équipes
 *              et les appels Edge Functions (admin-users / send-invitation).
 * @param clubId — club cible auquel rattacher le coach
 * @param open — état d'ouverture de la modale (pour reset auto)
 * @param onSuccess — callback succès (rafraîchissement parent)
 * @param onClose — callback fermeture après succès
 * @returns Bundle de state, handlers et form pour CreateCoachModal
 * @features
 *  - Validation Zod (email format, nom requis)
 *  - Mode "Nouveau" : invitation par Edge Function send-invitation
 *  - Mode "Existant" : ajout du rôle via insertion user_roles
 *  - TeamAssignmentMatrix : toggle équipes + sélection rôle Référent/Assistant
 *  - Upload photo orchestré (local → create user → upload → update profile)
 *  - Vérification limites plan via usePlanLimitHandler (PlanLimitAlert)
 *  - Gestion erreurs Edge Functions via getEdgeFunctionErrorMessage
 * @maintenance
 *  - Workflow d'affectation : mem://logic/coach-assignment-workflow
 *  - Multi-équipes & rôles : mem://features/coach-team-workflow
 *  - Mode promotion : mem://features/user-role-management/promotion-mode
 *  - Sync photo invitation : mem://technical/user-invitation-photo-sync
 *  - Coach Référent intégrité : mem://logic/coach-role-integrity
 */
import { useState, useEffect, useCallback } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getEdgeFunctionErrorInfo } from "@/lib/edge-function-errors";
import { toastInvitationError } from "@/lib/invitation-error-toast";
import { usePlanLimitHandler } from "@/hooks/usePlanLimitHandler";
import type { TeamAssignmentItem } from "@/components/modals/shared/TeamAssignmentMatrix";
import { typedZodResolver } from "@/lib/typed-zod-resolver";

const coachSchema = z.object({
  firstName: z.string().min(1, "Prénom requis").max(50),
  lastName: z.string().min(1, "Nom requis").max(50),
  email: z.string().email("Email invalide").max(255),
});

export type CoachFormData = z.infer<typeof coachSchema>;

export interface Team {
  id: string;
  name: string;
  season: string | null;
}

export interface ExistingUser {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  photo_url: string | null;
  roles: string[];
}

export function useCreateCoach(clubId: string, open: boolean, onSuccess?: () => void, onClose?: () => void) {
  const [loading, setLoading] = useState(false);
  const { handle: handlePlanLimit, dialog: planLimitDialog } = usePlanLimitHandler();
  const [teams, setTeams] = useState<Team[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [teamAssignments, setTeamAssignments] = useState<TeamAssignmentItem[]>([]);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [existingUsers, setExistingUsers] = useState<ExistingUser[]>([]);
  const [selectedExistingUser, setSelectedExistingUser] = useState<ExistingUser | null>(null);
  const [loadingUsers, setLoadingUsers] = useState(false);

  const form = useForm<CoachFormData>({
    resolver: typedZodResolver<CoachFormData>(coachSchema),
  });

  useEffect(() => {
    if (open && clubId) {
      fetchTeams();
      fetchExistingUsers();
    }
    if (!open) {
      form.reset({ firstName: "", lastName: "", email: "" });
      setMode("new");
      setSelectedExistingUser(null);
      setPhotoFile(null);
      setPhotoPreview(null);
      setTeamAssignments([]);
      setExistingUsers([]);
    }
  }, [open, clubId]);

  useEffect(() => {
    if (teams.length > 0) {
      setTeamAssignments(teams.map(t => ({ teamId: t.id, assigned: false, role: "assistant" as const })));
    }
  }, [teams]);

  const fetchTeams = async () => {
    setLoadingTeams(true);
    try {
      const { data, error } = await supabase.from("teams").select("id, name, season").eq("club_id", clubId).is("deleted_at", null).order("name");
      if (error) throw error;
      setTeams(data || []);
    } catch (error) {
      console.error("Error fetching teams:", error);
    } finally {
      setLoadingTeams(false);
    }
  };

  const fetchExistingUsers = async () => {
    setLoadingUsers(true);
    try {
      const { data: clubProfiles, error: profilesError } = await supabase.from("profiles").select("id, first_name, last_name, email, photo_url").eq("club_id", clubId).is("deleted_at", null);
      if (profilesError) throw profilesError;

      const userIds = (clubProfiles || []).map(p => p.id);
      if (userIds.length === 0) { setExistingUsers([]); setLoadingUsers(false); return; }

      const { data: roles, error: rolesError } = await supabase.from("user_roles").select("user_id, role").eq("club_id", clubId).in("user_id", userIds);
      if (rolesError) throw rolesError;

      const rolesByUser: Record<string, string[]> = {};
      (roles || []).forEach(r => { if (!rolesByUser[r.user_id]) rolesByUser[r.user_id] = []; rolesByUser[r.user_id].push(r.role); });

      setExistingUsers(
        (clubProfiles || []).filter(p => !(rolesByUser[p.id] || []).includes("coach")).map(p => ({ ...p, roles: rolesByUser[p.id] || [] }))
      );
    } catch (error) {
      console.error("Error fetching existing users:", error);
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleSelectExistingUser = (user: ExistingUser) => {
    setSelectedExistingUser(user);
    form.setValue("firstName", user.first_name || "");
    form.setValue("lastName", user.last_name || "");
    form.setValue("email", user.email);
    setPhotoPreview(user.photo_url || null);
    setPhotoFile(null);
  };

  const handleClearExistingUser = () => {
    setSelectedExistingUser(null);
    form.reset();
    setPhotoPreview(null);
    setPhotoFile(null);
  };

  const toggleTeamAssignment = (teamId: string) => {
    setTeamAssignments(prev => prev.map(a => a.teamId === teamId ? { ...a, assigned: !a.assigned } : a));
  };

  const setTeamRole = (teamId: string, role: "referent" | "assistant") => {
    setTeamAssignments(prev => prev.map(a => a.teamId === teamId ? { ...a, role } : a));
  };

  const getAssignedTeams = () => teamAssignments.filter(a => a.assigned);

  const uploadPhotoForUser = async (userId: string): Promise<string | null> => {
    if (!photoFile) return null;
    let validated;
    try {
      validated = (await import("@/lib/upload-validation")).validateUpload(photoFile, "image");
    } catch (e) {
      console.error("Photo validation failed:", e);
      return null;
    }
    const path = `${userId}/photo.${validated.safeExt}`;
    const { error } = await supabase.storage
      .from("user-photos")
      .upload(path, photoFile, { upsert: true, contentType: validated.contentType });
    if (error) { console.error("Photo upload error:", error); return null; }
    const { data: urlData } = supabase.storage.from("user-photos").getPublicUrl(path);
    return `${urlData.publicUrl}?t=${Date.now()}`;
  };

  const resetAndClose = () => {
    form.reset();
    setTeamAssignments([]);
    setPhotoFile(null);
    setPhotoPreview(null);
    setSelectedExistingUser(null);
    setMode("new");
    onClose?.();
    onSuccess?.();
  };

  const onSubmit = async (data: CoachFormData) => {
    if (selectedExistingUser) {
      await addCoachRoleToExistingUser(data);
    } else {
      await inviteNewCoach(data);
    }
  };

  const addCoachRoleToExistingUser = async (data: CoachFormData) => {
    if (!selectedExistingUser) return;
    setLoading(true);
    try {
      const assignedTeams = getAssignedTeams();
      const { error: roleError } = await supabase.from("user_roles").insert({ user_id: selectedExistingUser.id, role: "coach" as any, club_id: clubId });
      if (roleError) throw roleError;

      for (const assignment of assignedTeams) {
        const { data: existing } = await supabase.from("team_members").select("id, is_active, member_type").eq("user_id", selectedExistingUser.id).eq("team_id", assignment.teamId).maybeSingle();
        if (existing) {
          if (existing.member_type === "coach") {
            const { error: updateErr } = await supabase.from("team_members").update({ is_active: true, left_at: null, coach_role: assignment.role, joined_at: new Date().toISOString() }).eq("id", existing.id);
            if (updateErr) throw updateErr;
          } else {
            const { error: insertErr } = await supabase.from("team_members").insert({ user_id: selectedExistingUser.id, team_id: assignment.teamId, member_type: "coach", coach_role: assignment.role, is_active: true });
            if (insertErr) console.warn("Could not insert team_member:", insertErr);
          }
        } else {
          const { error: insertErr } = await supabase.from("team_members").insert({ user_id: selectedExistingUser.id, team_id: assignment.teamId, member_type: "coach", coach_role: assignment.role, is_active: true });
          if (insertErr) throw insertErr;
        }
      }

      if (photoFile) {
        const photoUrl = await uploadPhotoForUser(selectedExistingUser.id);
        if (photoUrl) {
          const { error: photoErr } = await supabase.from("profiles").update({ photo_url: photoUrl }).eq("id", selectedExistingUser.id);
          if (photoErr) console.warn("Could not update photo:", photoErr);
        }
      }

      const assignedTeamNames = assignedTeams.map(a => teams.find(t => t.id === a.teamId)?.name).filter(Boolean);
      toast.success(`Rôle Coach ajouté à ${data.firstName} ${data.lastName}`, {
        description: assignedTeamNames.length > 0 ? `Rattaché à : ${assignedTeamNames.join(", ")}` : `Le coach pourra être rattaché à une équipe ultérieurement.`,
      });
      resetAndClose();
    } catch (error: any) {
      console.error("Error adding coach role:", error);
      if (handlePlanLimit(error, "coaches_per_team")) {
        setLoading(false);
        return;
      }
      if (error.message?.includes("duplicate") || error.code === "23505") {
        toast.error("Cet utilisateur est déjà coach dans ce club.");
      } else {
        toast.error("Erreur lors de l'ajout du rôle coach", { description: error.message });
      }
    } finally {
      setLoading(false);
    }
  };

  const inviteNewCoach = async (data: CoachFormData) => {
    setLoading(true);
    try {
      const assignedTeams = getAssignedTeams();
      const payload: any = { email: data.email, firstName: data.firstName, lastName: data.lastName, clubId, intendedRole: "coach" };
      if (assignedTeams.length > 0) {
        payload.teamAssignments = assignedTeams.map(a => ({ teamId: a.teamId, coachRole: a.role }));
        payload.teamId = assignedTeams[0].teamId;
        payload.coachRole = assignedTeams[0].role;
      }

      const { data: result, error } = await supabase.functions.invoke("send-invitation", { body: payload });
      if (error) throw error;
      if (result?.error) throw new Error(result.error);

      if (photoFile && result?.userId) {
        const photoUrl = await uploadPhotoForUser(result.userId);
        if (photoUrl) {
          const { error: photoErr } = await supabase.from("profiles").update({ photo_url: photoUrl }).eq("id", result.userId);
          if (photoErr) console.warn("Could not update photo:", photoErr);
        }
      }

      const assignedTeamNames = assignedTeams.map(a => teams.find(t => t.id === a.teamId)?.name).filter(Boolean);
      toast.success(`Coach invité avec succès !`, {
        description: assignedTeamNames.length > 0 ? `Une invitation a été envoyée à ${data.email}. Le coach sera rattaché à : ${assignedTeamNames.join(", ")}.` : `Une invitation a été envoyée à ${data.email}.`,
      });
      resetAndClose();
    } catch (error: unknown) {
      console.error("Error inviting coach:", error);
      const errorInfo = await getEdgeFunctionErrorInfo(error);
      if (errorInfo.code === "USER_ALREADY_HAS_ROLE_IN_CLUB") {
        toast.error("Coach déjà existant", {
          description: "Cet utilisateur est déjà coach dans ce club.",
        });
      } else {
        await toastInvitationError(error);
      }
    } finally {
      setLoading(false);
    }
  };

  return {
    form,
    loading,
    planLimitDialog,
    teams,
    loadingTeams,
    teamAssignments,
    photoFile,
    photoPreview,
    mode,
    setMode,
    existingUsers,
    selectedExistingUser,
    loadingUsers,
    setPhotoFile,
    setPhotoPreview,
    handleSelectExistingUser,
    handleClearExistingUser,
    toggleTeamAssignment,
    setTeamRole,
    getAssignedTeams,
    onSubmit,
    resetAndClose,
  };
}
