/**
 * @hook useSupporterInvitations
 * @description Invitations « supporter » en attente de l'utilisateur connecté
 *              (RPC get_my_supporter_invitations) et réponse
 *              (respond_supporter_invitation). Tant qu'une invitation n'est
 *              pas acceptée, le supporter n'a aucun accès au joueur.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface SupporterInvitation {
  id: string;
  player_name: string;
  club_name: string | null;
  team_name: string | null;
  invited_by_name: string | null;
  invited_at: string;
}

export function useSupporterInvitations() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["supporter-invitations", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_my_supporter_invitations" as never);
      if (error) throw error;
      return (data ?? []) as unknown as SupporterInvitation[];
    },
    enabled: !!user,
    staleTime: 30_000,
  });

  const respond = useMutation({
    mutationFn: async ({ linkId, accept }: { linkId: string; accept: boolean }) => {
      const { data, error } = await supabase.rpc(
        "respond_supporter_invitation" as never,
        { _link_id: linkId, _accept: accept } as never,
      );
      if (error) throw error;
      return data as unknown as string;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["supporter-invitations"] });
      // Un lien accepté ouvre l'accès : listes du supporter à rafraîchir.
      queryClient.invalidateQueries({ queryKey: ["supporter-linked-players-enriched"] });
      queryClient.invalidateQueries({ queryKey: ["supporter-debrief-players"] });
      queryClient.invalidateQueries({ queryKey: ["my-team-redirect"] });
    },
  });

  return { invitations: query.data ?? [], isLoading: query.isLoading, respond };
}
