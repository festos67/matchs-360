/**
 * @hook usePlayerData
 * @description Hook composite agrégeant toutes les données nécessaires à la fiche
 *              joueur : profil, équipe, club, référentiel actif, débriefs (3 types),
 *              objectifs, supporters liés, demandes en attente.
 * @param playerId — UUID du joueur cible
 * @returns Objet groupé { player, team, club, framework, evaluations, objectives, supporters, ... }
 * @features
 *  - useQuery (TanStack) : cache + refetch + invalidation
 *  - Chargement parallèle des sources (profile, team_members, evaluations, etc.)
 *  - Filtrage soft delete (.is("deleted_at", null)) systématique
 *  - Tri chronologique des débriefs (date desc)
 *  - Séparation par type d'évaluation (coach / self / supporter)
 *  - Chargement référentiel via framework-loader (snapshot ou actif)
 * @maintenance
 *  - Soft delete : mem://technical/soft-delete-strategy
 *  - Snapshot framework : mem://technical/framework-snapshot-system
 *  - Isolation débriefs consultatifs : mem://logic/assessment-data-isolation-rules
 *  - Source de vérité team_members : mem://logic/coach-role-integrity
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { loadFrameworkThemes } from "@/lib/framework-loader";

// ---- Types ----

export interface Player {
  id: string;
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
  photo_url: string | null;
  email: string;
}

export interface TeamMembership {
  team_id: string;
  team: {
    id: string;
    name: string;
    club_id: string;
    club: { name: string; primary_color: string; logo_url?: string | null };
  };
}

export interface Theme {
  id: string;
  name: string;
  color: string | null;
  order_index: number;
  skills: Skill[];
}

export interface Skill {
  id: string;
  name: string;
  definition: string | null;
  order_index: number;
}

export interface Evaluation {
  id: string;
  name: string;
  date: string;
  deleted_at: string | null;
  framework_id: string;
  type: "coach" | "self" | "supporter";
  evaluator_id?: string | null;
  coach: { first_name: string | null; last_name: string | null };
  scores: Array<{
    skill_id: string;
    score: number | null;
    is_not_observed: boolean;
    comment: string | null;
  }>;
  objectives: Array<{
    theme_id: string;
    content: string;
  }>;
}

export interface ReferentCoach {
  first_name: string | null;
  last_name: string | null;
}

// ---- Hook ----

export function usePlayerData(playerId: string | undefined) {
  const { user, hasAdminRole: isAdmin, roles, currentRole } = useAuth();

  // 1. Player profile
  const playerQuery = useQuery({
    queryKey: ["player-profile", playerId],
    queryFn: async (): Promise<Player> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", playerId!)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Joueur non trouvé");
      return data;
    },
    enabled: !!playerId && !!user,
  });

  // 2. Team membership
  const membershipQuery = useQuery({
    queryKey: ["player-membership", playerId],
    queryFn: async (): Promise<TeamMembership | null> => {
      const { data } = await supabase
        .from("team_members")
        .select("team_id, team:teams(id, name, club_id, club:clubs(name, primary_color, logo_url))")
        .eq("user_id", playerId!)
        .eq("member_type", "player")
        .eq("is_active", true)
        .is("deleted_at", null)
        .maybeSingle();
      return (data as unknown as TeamMembership) ?? null;
    },
    enabled: !!playerId && !!user,
  });

  const teamMembership = membershipQuery.data ?? null;

  // 3. Referent coach
  const referentCoachQuery = useQuery({
    queryKey: ["referent-coach", teamMembership?.team_id],
    queryFn: async (): Promise<ReferentCoach | null> => {
      const { data } = await supabase
        .from("team_members")
        .select("user:profiles!team_members_user_id_fkey(first_name, last_name)")
        .eq("team_id", teamMembership!.team_id)
        .eq("member_type", "coach")
        .eq("coach_role", "referent")
        .eq("is_active", true)
        .is("deleted_at", null)
        .maybeSingle();
      return (data?.user as ReferentCoach) ?? null;
    },
    enabled: !!teamMembership?.team_id,
  });

  // 4. Permissions
  const permissionsQuery = useQuery({
    queryKey: ["player-permissions", playerId, teamMembership?.team_id, user?.id],
    queryFn: async () => {
      if (!teamMembership) return { canEvaluate: false, canMutate: false };

      const { data: coachMembership } = await supabase
        .from("team_members")
        .select("coach_role")
        .eq("team_id", teamMembership.team_id)
        .eq("user_id", user!.id)
        .eq("member_type", "coach")
        .eq("is_active", true)
        .is("deleted_at", null)
        .maybeSingle();

      const clubId = teamMembership.team?.club_id;
      const isClubAdmin = roles.some(r => r.role === "club_admin" && r.club_id === clubId);
      const canEvaluate = isAdmin || isClubAdmin || !!coachMembership;
      const canMutate = isAdmin || isClubAdmin || !!coachMembership;

      return { canEvaluate, canMutate };
    },
    enabled: !!teamMembership && !!user,
  });

  // 5. Framework + themes
  const frameworkQuery = useQuery({
    queryKey: ["player-framework", teamMembership?.team_id],
    queryFn: async (): Promise<{ frameworkId: string; frameworkName: string; themes: Theme[] } | null> => {
      const { data: framework } = await supabase
        .from("competence_frameworks")
        .select("id, name")
        .eq("team_id", teamMembership!.team_id)
        .eq("is_archived", false)
        .maybeSingle();

      if (!framework) return null;

      const { data: themesData } = await supabase
        .from("themes")
        .select("*, skills(*)")
        .eq("framework_id", framework.id)
        .order("order_index");

      const sortedThemes: Theme[] = (themesData || []).map(theme => ({
        ...theme,
        skills: (theme.skills || []).sort((a: Skill, b: Skill) => a.order_index - b.order_index),
      }));

      return { frameworkId: framework.id, frameworkName: framework.name, themes: sortedThemes };
    },
    enabled: !!teamMembership?.team_id,
  });

  // 6. Evaluations
  const evaluationsQuery = useQuery({
    queryKey: ["player-evaluations", playerId],
    queryFn: async (): Promise<Evaluation[]> => {
      const { data, error } = await supabase
        .from("evaluations")
        .select(`
          id, name, date, deleted_at, framework_id, type,
          coach:profiles!evaluations_coach_id_fkey(first_name, last_name),
          scores:evaluation_scores(skill_id, score, is_not_observed, comment),
          objectives:evaluation_objectives(theme_id, content)
        `)
        .eq("player_id", playerId!)
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

      if (error) throw error;

      return (data as unknown as Evaluation[]) ?? [];
    },
    enabled: !!playerId && !!user,
  });

  const isPlayerViewingOwnProfile = (currentRole?.role === "player" && user?.id === playerId) || currentRole?.role === "supporter";

  const refetchAll = () => {
    playerQuery.refetch();
    membershipQuery.refetch();
    referentCoachQuery.refetch();
    permissionsQuery.refetch();
    frameworkQuery.refetch();
    evaluationsQuery.refetch();
  };

  return {
    // Data
    player: playerQuery.data ?? null,
    teamMembership,
    referentCoach: referentCoachQuery.data ?? null,
    frameworkId: frameworkQuery.data?.frameworkId ?? null,
    frameworkName: frameworkQuery.data?.frameworkName ?? "",
    themes: frameworkQuery.data?.themes ?? [],
    evaluations: evaluationsQuery.data ?? [],

    // Permissions
    canEvaluate: permissionsQuery.data?.canEvaluate ?? false,
    canMutate: permissionsQuery.data?.canMutate ?? false,
    isAdmin,
    isPlayerViewingOwnProfile,

    // States
    loading: playerQuery.isLoading || membershipQuery.isLoading,
    error: playerQuery.error || membershipQuery.error,

    // Actions
    refetchAll,
    refetchEvaluations: () => evaluationsQuery.refetch(),
    fetchThemesForFramework: loadFrameworkThemes,
  };
}

export function getPlayerName(player: Player | null): string {
  if (!player) return "";
  if (player.nickname) return player.nickname;
  if (player.first_name && player.last_name) return `${player.first_name} ${player.last_name}`;
  return player.first_name || player.last_name || "Joueur";
}
