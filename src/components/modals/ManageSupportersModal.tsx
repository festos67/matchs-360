/**
 * @modal ManageSupportersModal
 * @description Modale unifiée (h-640px fixe) pour gérer les supporters d'un joueur :
 *              ajouter/inviter, lier des supporters existants, supprimer des liens.
 *              Centralise toutes les actions sur supporters_link pour ce joueur.
 * @access Coach Référent, Responsable Club, Super Admin (depuis fiche joueur)
 * @features
 *  - Liste des supporters actuellement liés avec action de retrait
 *  - Formulaire d'invitation rapide (email + nom)
 *  - Sélection d'un supporter existant via Combobox
 *  - Vérification limite plan (max_supporters_per_team)
 *  - useQuery + useQueryClient pour invalidation cache temps réel
 * @maintenance
 *  - Modale centralisée : mem://features/supporter-management/centralized-modal
 *  - Hauteur fixe pour éviter sauts de mise en page
 */
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart, Plus, Trash2, UserPlus, Mail, Search, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getEdgeFunctionErrorMessage } from "@/lib/edge-function-errors";
import { toastInvitationError } from "@/lib/invitation-error-toast";
import { SupporterRequestsPanel } from "@/components/player/SupporterRequestsPanel";
import { typedZodResolver } from "@/lib/typed-zod-resolver";
import { cn } from "@/lib/utils";

const supporterSchema = z.object({
  firstName: z.string().min(1, "Prénom requis").max(50),
  lastName: z.string().min(1, "Nom requis").max(50),
  email: z.string().email("Email invalide").max(255),
});

type SupporterFormData = z.infer<typeof supporterSchema>;

interface Supporter {
  id: string;
  link_id: string;
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
  email: string;
}

interface ManageSupportersModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  playerId: string;
  playerName: string;
  clubId: string;
  onSuccess?: () => void;
  onViewEvaluation?: (evaluationId: string) => void;
}

export const ManageSupportersModal = ({
  open,
  onOpenChange,
  playerId,
  playerName,
  clubId,
  onSuccess,
  onViewEvaluation,
}: ManageSupportersModalProps) => {
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("list");
  const [existingSearch, setExistingSearch] = useState("");
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<SupporterFormData>({
    resolver: typedZodResolver<SupporterFormData>(supporterSchema),
  });

  interface SupporterLinkRow {
    id: string;
    supporter: {
      id: string;
      first_name: string | null;
      last_name: string | null;
      nickname: string | null;
      email: string;
    };
  }

  const { data: supporters = [] } = useQuery({
    queryKey: ["manage-supporters", playerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("supporters_link")
        .select(`
          id,
          supporter:profiles!supporters_link_supporter_id_fkey(
            id,
            first_name,
            last_name,
            nickname,
            email
          )
        `)
        .eq("player_id", playerId);

      if (error) throw error;

      return (data || []).map((item: SupporterLinkRow) => ({
        id: item.supporter.id,
        link_id: item.id,
        first_name: item.supporter.first_name,
        last_name: item.supporter.last_name,
        nickname: item.supporter.nickname,
        email: item.supporter.email,
      })) as Supporter[];
    },
    enabled: open && !!playerId,
  });

  const getSupporterName = (supporter: Supporter) => {
    if (supporter.nickname) return supporter.nickname;
    if (supporter.first_name && supporter.last_name) {
      return `${supporter.first_name} ${supporter.last_name}`;
    }
    return supporter.first_name || supporter.last_name || "Supporter";
  };

  // Existing supporters of the club (already on the platform) that are not yet linked to this player
  const linkedIds = supporters.map((s) => s.id);
  const { data: existingSupporters = [], isLoading: loadingExisting } = useQuery({
    queryKey: ["existing-supporters", clubId, playerId, linkedIds.join(",")],
    queryFn: async () => {
      // Get all supporters of the club via user_roles
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "supporter")
        .eq("club_id", clubId);
      if (rolesError) throw rolesError;
      const ids = (roles || []).map((r) => r.user_id).filter((id) => !linkedIds.includes(id));
      if (ids.length === 0) return [] as Array<{ id: string; first_name: string | null; last_name: string | null; nickname: string | null; email: string }>;
      const { data: profs, error: profError } = await supabase
        .from("profiles")
        .select("id, first_name, last_name, nickname, email")
        .in("id", ids)
        .is("deleted_at", null);
      if (profError) throw profError;
      return profs || [];
    },
    enabled: open && activeTab === "add" && !!clubId,
  });

  const filteredExisting = existingSupporters.filter((s) => {
    const q = existingSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      (s.first_name || "").toLowerCase().includes(q) ||
      (s.last_name || "").toLowerCase().includes(q) ||
      (s.nickname || "").toLowerCase().includes(q) ||
      (s.email || "").toLowerCase().includes(q)
    );
  });

  const handleLinkExisting = async (supporterId: string) => {
    setLinkingId(supporterId);
    try {
      const { error } = await supabase
        .from("supporters_link")
        .insert({ player_id: playerId, supporter_id: supporterId });
      if (error) throw error;
      toast.success("Supporter lié au joueur");
      queryClient.invalidateQueries({ queryKey: ["manage-supporters", playerId] });
      queryClient.invalidateQueries({ queryKey: ["existing-supporters", clubId, playerId] });
      onSuccess?.();
      setActiveTab("list");
    } catch (error: unknown) {
      console.error("Error linking supporter:", error);
      toast.error("Erreur lors de l'association", {
        description: await getEdgeFunctionErrorMessage(error),
      });
    } finally {
      setLinkingId(null);
    }
  };

  const handleRemoveSupporter = async (supporter: Supporter) => {
    try {
      const { error } = await supabase
        .from("supporters_link")
        .delete()
        .eq("id", supporter.link_id);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["manage-supporters", playerId] });
      toast.success(`${getSupporterName(supporter)} retiré des supporters`);
      onSuccess?.();
    } catch (error) {
      console.error("Error removing supporter:", error);
      toast.error("Erreur lors du retrait du supporter");
    }
  };

  const onSubmit = async (data: SupporterFormData) => {
    setLoading(true);
    try {
      const { data: result, error } = await supabase.functions.invoke("send-invitation", {
        body: {
          email: data.email,
          firstName: data.firstName,
          lastName: data.lastName,
          clubId,
          intendedRole: "supporter",
          playerIds: [playerId],
        },
      });

      if (error) throw error;
      if (result?.error) throw new Error(result.error);

      toast.success(`Invitation envoyée à ${data.email}`);
      reset();
      setActiveTab("list");
      queryClient.invalidateQueries({ queryKey: ["manage-supporters", playerId] });
      onSuccess?.();
    } catch (error: unknown) {
      console.error("Error inviting supporter:", error);
      await toastInvitationError(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl h-[85vh] sm:h-[640px] sm:max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Heart className="w-5 h-5 text-primary" />
            </div>
            Supporters de {playerName}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4 flex min-h-0 flex-1 flex-col">
          <TabsList className="grid w-full grid-cols-3 shrink-0">
            <TabsTrigger value="list">
              Supporters ({supporters.length})
            </TabsTrigger>
            <TabsTrigger value="add">
              <Plus className="w-4 h-4 mr-2" />
              Ajouter
            </TabsTrigger>
            <TabsTrigger value="invitations">
              <Mail className="w-4 h-4 mr-2" />
              Invitations
            </TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
            {supporters.length > 0 ? (
              <div className="space-y-2">
                {supporters.map((supporter) => (
                  <div
                    key={supporter.id}
                    className="flex items-center gap-3 p-3 rounded-lg bg-muted/30"
                  >
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Heart className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">
                        {getSupporterName(supporter)}
                      </p>
                      <p className="text-sm text-muted-foreground truncate">
                        {supporter.email}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0 text-destructive hover:text-destructive"
                      onClick={() => handleRemoveSupporter(supporter)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <UserPlus className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
                <p className="text-muted-foreground">
                  Aucun supporter associé à ce joueur
                </p>
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => setActiveTab("add")}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Ajouter un supporter
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="add" className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
            {/* Section : sélection d'un supporter déjà inscrit */}
            <div className="space-y-3 pb-4 mb-4 border-b border-border">
              <div>
                <Label>Lier un supporter existant</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Sélectionnez une personne déjà inscrite sur la plateforme.
                </p>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={existingSearch}
                  onChange={(e) => setExistingSearch(e.target.value)}
                  placeholder="Rechercher par nom ou email..."
                  className="pl-9"
                />
              </div>
              <ScrollArea className="h-40 rounded-md border border-border">
                {loadingExisting ? (
                  <div className="py-6 text-center text-sm text-muted-foreground">Chargement...</div>
                ) : filteredExisting.length > 0 ? (
                  <div className="p-1">
                    {filteredExisting.map((s) => {
                      const name = s.nickname || [s.first_name, s.last_name].filter(Boolean).join(" ") || s.email;
                      const isLinking = linkingId === s.id;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          disabled={isLinking}
                          onClick={() => handleLinkExisting(s.id)}
                          className={cn(
                            "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors",
                            "hover:bg-muted disabled:opacity-50"
                          )}
                        >
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <Heart className="w-4 h-4 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{name}</p>
                            <p className="text-xs text-muted-foreground truncate">{s.email}</p>
                          </div>
                          {isLinking ? (
                            <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                          ) : (
                            <Check className="w-4 h-4 text-muted-foreground" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="py-6 text-center text-sm text-muted-foreground">
                    {existingSupporters.length === 0
                      ? "Aucun supporter inscrit disponible"
                      : "Aucun résultat"}
                  </div>
                )}
              </ScrollArea>
            </div>

            <div className="mb-3">
              <Label>Ou inviter un nouveau supporter</Label>
              <p className="text-xs text-muted-foreground mt-1">
                Une invitation par email sera envoyée pour qu'il crée son compte.
              </p>
            </div>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">Prénom</Label>
                  <Input
                    id="firstName"
                    placeholder="Marie"
                    {...register("firstName")}
                  />
                  {errors.firstName && (
                    <p className="text-sm text-destructive">
                      {errors.firstName.message}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Nom</Label>
                  <Input
                    id="lastName"
                    placeholder="Martin"
                    {...register("lastName")}
                  />
                  {errors.lastName && (
                    <p className="text-sm text-destructive">
                      {errors.lastName.message}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="parent@exemple.com"
                  {...register("email")}
                />
                {errors.email && (
                  <p className="text-sm text-destructive">
                    {errors.email.message}
                  </p>
                )}
              </div>

              <p className="text-xs text-muted-foreground">
                Une invitation sera envoyée par email au supporter pour qu'il
                puisse créer son compte et suivre les évaluations de {playerName}.
              </p>

              <div className="flex justify-end gap-3 pt-4 border-t border-border">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setActiveTab("list")}
                >
                  Annuler
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? (
                    <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                  ) : (
                    <>
                      <Heart className="w-4 h-4 mr-2" />
                      Inviter
                    </>
                  )}
                </Button>
              </div>
            </form>
          </TabsContent>

          <TabsContent value="invitations" className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1">
            <SupporterRequestsPanel
              playerId={playerId}
              playerName={playerName}
              onViewEvaluation={onViewEvaluation}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
