import { useState, useEffect } from "react";
import { ArrowRight, AlertTriangle, History } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Team {
  id: string;
  name: string;
  club_id: string;
}

interface PlayerMutationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  playerId: string;
  playerName: string;
  currentTeamId: string;
  currentTeamName: string;
  clubId: string;
  onSuccess?: () => void;
}

export const PlayerMutationModal = ({
  open,
  onOpenChange,
  playerId,
  playerName,
  currentTeamId,
  currentTeamName,
  clubId,
  onSuccess,
}: PlayerMutationModalProps) => {
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && clubId) {
      fetchTeams();
    }
  }, [open, clubId]);

  const fetchTeams = async () => {
    const { data } = await supabase
      .from("teams")
      .select("id, name, club_id")
      .eq("club_id", clubId)
      .neq("id", currentTeamId)
      .is("deleted_at", null)
      .order("name");

    if (data) {
      setTeams(data);
    }
  };

  const handleMutation = async () => {
    if (!selectedTeamId) {
      toast.error("Veuillez sélectionner une équipe de destination");
      return;
    }

    setLoading(true);
    try {
      // 1. Reactivate profile if it was soft-deleted
      const { error: reactivateError } = await supabase
        .from("profiles")
        .update({
          deleted_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", playerId)
        .not("deleted_at", "is", null);

      if (reactivateError) {
        console.warn("Profile reactivation warning:", reactivateError);
        // Continue even if this fails (profile might not be deleted)
      }

      // 2. Archive current team membership (soft delete with reason)
      const { error: archiveError } = await supabase
        .from("team_members")
        .update({
          is_active: false,
          left_at: new Date().toISOString(),
          archived_reason: reason || `Mutation vers nouvelle équipe`,
        })
        .eq("user_id", playerId)
        .eq("team_id", currentTeamId)
        .eq("member_type", "player")
        .eq("is_active", true);

      if (archiveError) throw archiveError;

      // 3. Create new team membership
      const { error: createError } = await supabase
        .from("team_members")
        .insert({
          user_id: playerId,
          team_id: selectedTeamId,
          member_type: "player",
          is_active: true,
          joined_at: new Date().toISOString(),
        });

      if (createError) throw createError;

      const newTeam = teams.find((t) => t.id === selectedTeamId);
      toast.success(`${playerName} a été muté vers ${newTeam?.name}`, {
        description: "L'historique des évaluations est conservé.",
      });

      setSelectedTeamId("");
      setReason("");
      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      console.error("Mutation error:", error);
      toast.error("Erreur lors de la mutation", {
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const selectedTeam = teams.find((t) => t.id === selectedTeamId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-warning/10 flex items-center justify-center">
              <ArrowRight className="w-5 h-5 text-warning" />
            </div>
            Mutation de joueur
          </DialogTitle>
          <DialogDescription>
            Transférer <strong>{playerName}</strong> vers une autre équipe du club.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 mt-4">
          {/* Visual transfer indicator */}
          <div className="flex items-center justify-center gap-4 p-4 bg-muted/30 rounded-xl">
            <div className="text-center">
              <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center mx-auto mb-2">
                <span className="text-lg font-bold">{currentTeamName.slice(0, 2).toUpperCase()}</span>
              </div>
              <p className="text-sm font-medium">{currentTeamName}</p>
              <p className="text-xs text-muted-foreground">Équipe actuelle</p>
            </div>

            <ArrowRight className="w-6 h-6 text-primary" />

            <div className="text-center">
              <div
                className={`w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-2 ${
                  selectedTeam ? "bg-primary text-primary-foreground" : "bg-muted border-2 border-dashed border-border"
                }`}
              >
                {selectedTeam ? (
                  <span className="text-lg font-bold">{selectedTeam.name.slice(0, 2).toUpperCase()}</span>
                ) : (
                  <span className="text-muted-foreground">?</span>
                )}
              </div>
              <p className="text-sm font-medium">{selectedTeam?.name || "Nouvelle équipe"}</p>
              <p className="text-xs text-muted-foreground">Destination</p>
            </div>
          </div>

          {/* Team selector */}
          <div className="space-y-2">
            <Label>Équipe de destination</Label>
            <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner une équipe..." />
              </SelectTrigger>
              <SelectContent>
                {teams.map((team) => (
                  <SelectItem key={team.id} value={team.id}>
                    {team.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {teams.length === 0 && (
              <p className="text-sm text-muted-foreground">Aucune autre équipe disponible dans ce club.</p>
            )}
          </div>

          {/* Reason */}
          <div className="space-y-2">
            <Label>Motif de la mutation (optionnel)</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex: Changement de catégorie, réorganisation..."
              rows={2}
            />
          </div>

          {/* Info box */}
          <div className="flex items-start gap-3 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
            <History className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-blue-500">Conservation de l'historique</p>
              <p className="text-muted-foreground mt-1">
                Les évaluations passées seront conservées et resteront consultables. 
                Le joueur adoptera le référentiel de compétences de sa nouvelle équipe.
              </p>
            </div>
          </div>

          {/* Warning */}
          {selectedTeamId && (
            <div className="flex items-start gap-3 p-4 bg-warning/10 border border-warning/20 rounded-xl">
              <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-warning">Attention</p>
                <p className="text-muted-foreground mt-1">
                  Cette action est définitive. Le joueur sera évalué selon le référentiel de <strong>{selectedTeam?.name}</strong>.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-border">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={handleMutation} disabled={loading || !selectedTeamId}>
            {loading ? (
              <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
            ) : (
              "Confirmer la mutation"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
