import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Heart, Plus, Trash2, UserPlus } from "lucide-react";
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
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
}

export const ManageSupportersModal = ({
  open,
  onOpenChange,
  playerId,
  playerName,
  clubId,
  onSuccess,
}: ManageSupportersModalProps) => {
  const [loading, setLoading] = useState(false);
  const [supporters, setSupporters] = useState<Supporter[]>([]);
  const [activeTab, setActiveTab] = useState("list");

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<SupporterFormData>({
    resolver: zodResolver(supporterSchema),
  });

  useEffect(() => {
    if (open && playerId) {
      fetchSupporters();
    }
  }, [open, playerId]);

  const fetchSupporters = async () => {
    try {
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

      if (data) {
        const formattedSupporters: Supporter[] = data.map((item: any) => ({
          id: item.supporter.id,
          link_id: item.id,
          first_name: item.supporter.first_name,
          last_name: item.supporter.last_name,
          nickname: item.supporter.nickname,
          email: item.supporter.email,
        }));
        setSupporters(formattedSupporters);
      }
    } catch (error) {
      console.error("Error fetching supporters:", error);
      toast.error("Erreur lors du chargement des supporters");
    }
  };

  const getSupporterName = (supporter: Supporter) => {
    if (supporter.nickname) return supporter.nickname;
    if (supporter.first_name && supporter.last_name) {
      return `${supporter.first_name} ${supporter.last_name}`;
    }
    return supporter.first_name || supporter.last_name || "Supporter";
  };

  const handleRemoveSupporter = async (supporter: Supporter) => {
    try {
      const { error } = await supabase
        .from("supporters_link")
        .delete()
        .eq("id", supporter.link_id);

      if (error) throw error;

      setSupporters((prev) => prev.filter((s) => s.id !== supporter.id));
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
      fetchSupporters();
      onSuccess?.();
    } catch (error: any) {
      console.error("Error inviting supporter:", error);
      toast.error("Erreur lors de l'invitation", {
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Heart className="w-5 h-5 text-primary" />
            </div>
            Supporters de {playerName}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="list">
              Supporters ({supporters.length})
            </TabsTrigger>
            <TabsTrigger value="add">
              <Plus className="w-4 h-4 mr-2" />
              Ajouter
            </TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="mt-4">
            {supporters.length > 0 ? (
              <div className="space-y-2 max-h-64 overflow-y-auto">
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

          <TabsContent value="add" className="mt-4">
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
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
