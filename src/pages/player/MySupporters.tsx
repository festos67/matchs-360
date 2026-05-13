/**
 * @page MySupporters
 * @route /player/my-supporters
 *
 * Liste des supporters liés au Joueur courant.
 *
 * @description
 * Vue lecture seule des supporters (parents, proches) qui ont un lien actif
 * dans `supporters_link`. Le joueur ne peut pas ajouter/retirer un supporter
 * lui-même — la gestion est déléguée au coach via ManageSupportersModal
 * (mem://features/supporter-management/centralized-modal).
 *
 * @access Joueur connecté (auto-scopé sur user.id)
 */
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { CircleAvatar } from "@/components/shared/CircleAvatar";
import { Card, CardContent } from "@/components/ui/card";
import { Heart } from "lucide-react";

interface SupporterProfile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
  photo_url: string | null;
  email: string;
}

export default function MySupporters() {
  const { user } = useAuth();

  const { data: supporters = [], isLoading } = useQuery({
    queryKey: ["my-supporters", user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from("supporters_link")
        .select("id, supporter_id, profiles!supporters_link_supporter_id_fkey(id, first_name, last_name, nickname, photo_url, email)")
        .eq("player_id", user.id);

      if (error) throw error;

      return (data || []).map((link) => {
        const profile = link.profiles as unknown as SupporterProfile;
        return {
          linkId: link.id,
          ...profile,
        };
      });
    },
    enabled: !!user,
  });

  const getDisplayName = (s: SupporterProfile) =>
    s.nickname || `${s.first_name || ""} ${s.last_name || ""}`.trim() || s.email;

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Heart className="h-6 w-6 text-pink-500" />
            Mes Supporters
          </h1>
          <p className="text-muted-foreground">
            Les personnes qui suivent votre progression
          </p>
        </div>

        {isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
          </div>
        ) : supporters.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Heart className="h-12 w-12 text-muted-foreground/40 mb-4" />
              <h3 className="text-lg font-medium">Aucun supporter</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Aucun supporter ne vous est encore rattaché.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="glass-card p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-display font-semibold">
                Supporters ({supporters.length})
              </h2>
            </div>
            <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
              {supporters.map((supporter, index) => (
                <div
                  key={supporter.linkId}
                  className="animate-fade-in-up opacity-0"
                  style={{ animationDelay: `${index * 0.05}s` }}
                >
                  <CircleAvatar
                    shape="circle"
                    imageUrl={supporter.photo_url}
                    name={getDisplayName(supporter)}
                    size="md"
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
