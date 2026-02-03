import { useState, useEffect } from "react";
import { Heart, Send, Mail, Users } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface Supporter {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  hasPendingRequest: boolean;
}

interface RequestSupporterEvaluationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  playerId: string;
  playerName: string;
  onSuccess?: () => void;
}

export function RequestSupporterEvaluationModal({
  open,
  onOpenChange,
  playerId,
  playerName,
  onSuccess,
}: RequestSupporterEvaluationModalProps) {
  const { user } = useAuth();
  const [supporters, setSupporters] = useState<Supporter[]>([]);
  const [selectedSupporters, setSelectedSupporters] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (open && playerId) {
      fetchSupporters();
    }
  }, [open, playerId]);

  const fetchSupporters = async () => {
    setLoading(true);
    try {
      // Fetch supporters linked to the player
      const { data: links, error: linksError } = await supabase
        .from("supporters_link")
        .select(`
          supporter_id,
          profiles:supporter_id (
            id,
            first_name,
            last_name,
            email
          )
        `)
        .eq("player_id", playerId);

      if (linksError) throw linksError;

      // Fetch pending requests
      const { data: requests, error: reqError } = await supabase
        .from("supporter_evaluation_requests")
        .select("supporter_id")
        .eq("player_id", playerId)
        .eq("status", "pending");

      if (reqError) throw reqError;

      const pendingSupporterIds = new Set((requests || []).map(r => r.supporter_id));

      const supportersList: Supporter[] = (links || [])
        .filter(l => l.profiles)
        .map(l => ({
          id: (l.profiles as any).id,
          first_name: (l.profiles as any).first_name,
          last_name: (l.profiles as any).last_name,
          email: (l.profiles as any).email,
          hasPendingRequest: pendingSupporterIds.has((l.profiles as any).id),
        }));

      setSupporters(supportersList);
    } catch (error) {
      console.error("Error fetching supporters:", error);
      toast.error("Erreur lors du chargement des supporters");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSupporter = (supporterId: string) => {
    setSelectedSupporters(prev =>
      prev.includes(supporterId)
        ? prev.filter(id => id !== supporterId)
        : [...prev, supporterId]
    );
  };

  const handleSendRequests = async () => {
    if (!user || selectedSupporters.length === 0) return;

    setSending(true);
    try {
      // Create requests for each selected supporter
      const requestsData = selectedSupporters.map(supporterId => ({
        player_id: playerId,
        supporter_id: supporterId,
        requested_by: user.id,
        status: "pending",
      }));

      const { error } = await supabase
        .from("supporter_evaluation_requests")
        .insert(requestsData);

      if (error) throw error;

      toast.success(`Demande${selectedSupporters.length > 1 ? "s" : ""} envoyée${selectedSupporters.length > 1 ? "s" : ""} avec succès`);
      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      console.error("Error sending requests:", error);
      if (error.message?.includes("duplicate")) {
        toast.error("Une demande est déjà en attente pour ce supporter");
      } else {
        toast.error("Erreur lors de l'envoi des demandes");
      }
    } finally {
      setSending(false);
    }
  };

  const getSupporterName = (supporter: Supporter) => {
    if (supporter.first_name && supporter.last_name) {
      return `${supporter.first_name} ${supporter.last_name}`;
    }
    return supporter.first_name || supporter.email;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Heart className="w-5 h-5 text-orange-500" />
            Demander un avis au Supporter
          </DialogTitle>
          <DialogDescription>
            Invitez un ou plusieurs supporters de <strong>{playerName}</strong> à partager
            leur perception des compétences du joueur.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          ) : supporters.length === 0 ? (
            <div className="text-center py-8 bg-muted/30 rounded-lg">
              <Users className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-muted-foreground">
                Aucun supporter lié à ce joueur
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Ajoutez d'abord des supporters via le bouton "Supporters" sur la fiche joueur
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {supporters.map((supporter) => (
                <div
                  key={supporter.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border ${
                    supporter.hasPendingRequest
                      ? "bg-warning/10 border-warning/30"
                      : selectedSupporters.includes(supporter.id)
                      ? "bg-primary/10 border-primary/30"
                      : "bg-muted/30 border-transparent"
                  }`}
                >
                  <Checkbox
                    checked={selectedSupporters.includes(supporter.id)}
                    onCheckedChange={() => handleToggleSupporter(supporter.id)}
                    disabled={supporter.hasPendingRequest}
                  />
                  <div className="flex-1">
                    <p className="font-medium text-sm">
                      {getSupporterName(supporter)}
                    </p>
                    <p className="text-xs text-muted-foreground">{supporter.email}</p>
                  </div>
                  {supporter.hasPendingRequest && (
                    <Badge variant="outline" className="text-xs bg-warning/20 text-warning border-warning/30">
                      En attente
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            onClick={handleSendRequests}
            disabled={sending || selectedSupporters.length === 0}
            className="gap-2 bg-orange-500 hover:bg-orange-600"
          >
            <Send className="w-4 h-4" />
            {sending ? "Envoi..." : `Envoyer (${selectedSupporters.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
