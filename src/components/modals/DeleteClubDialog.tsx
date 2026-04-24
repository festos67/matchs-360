/**
 * @modal DeleteClubDialog
 * @description Confirmation d'archivage (soft-delete) d'un club via la RPC
 *              sécurisée `soft_delete_club`. Cascade soft sur teams et
 *              team_members. Saisie du nom requise pour éviter les
 *              suppressions accidentelles.
 * @access Super Admin uniquement (vérification côté RPC).
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface DeleteClubDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  club: { id: string; name: string } | null;
  onSuccess?: () => void;
  redirectTo?: string;
}

export function DeleteClubDialog({
  open,
  onOpenChange,
  club,
  onSuccess,
  redirectTo,
}: DeleteClubDialogProps) {
  const [confirmText, setConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const navigate = useNavigate();

  const isMatch =
    !!club && confirmText.trim().toLowerCase() === club.name.toLowerCase();

  const handleDelete = async () => {
    if (!club || !isMatch) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase.rpc("soft_delete_club", {
        _club_id: club.id,
      });
      if (error) throw error;
      toast.success(`Club « ${club.name} » archivé`);
      setConfirmText("");
      onOpenChange(false);
      onSuccess?.();
      if (redirectTo) navigate(redirectTo);
    } catch (err: any) {
      console.error("Error archiving club:", err);
      toast.error(`Archivage refusé : ${err.message ?? "erreur inconnue"}`);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) setConfirmText("");
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Archiver le club « {club?.name} » ?
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3">
              <p>
                Cette action archive le club ainsi que toutes ses équipes et
                affiliations associées (soft-delete). Les profils utilisateurs
                ne sont pas supprimés. L'opération est traçable et peut être
                annulée par un administrateur.
              </p>
              <p>
                Pour confirmer, tapez le nom exact du club :{" "}
                <strong>{club?.name}</strong>
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <Label htmlFor="confirm-club-name" className="sr-only">
            Nom du club
          </Label>
          <Input
            id="confirm-club-name"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={club?.name ?? ""}
            autoComplete="off"
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>Annuler</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handleDelete();
            }}
            disabled={!isMatch || isDeleting}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDeleting ? "Archivage…" : "Archiver le club"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}