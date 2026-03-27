import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { CircleAvatar } from "@/components/shared/CircleAvatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
          <h1 className="text-2xl font-bold">Mes Supporters</h1>
          <p className="text-muted-foreground">
            Les personnes qui vous accompagnent dans votre progression
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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {supporters.map((supporter) => (
              <Card key={supporter.linkId}>
                <CardContent className="flex items-center gap-4 p-4">
                  <CircleAvatar
                    imageUrl={supporter.photo_url}
                    name={getDisplayName(supporter)}
                    size="md"
                  />
                  <div className="min-w-0">
                    <p className="font-medium truncate">
                      {getDisplayName(supporter)}
                    </p>
                    <p className="text-sm text-muted-foreground truncate">
                      {supporter.email}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
