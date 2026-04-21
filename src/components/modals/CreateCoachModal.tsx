/**
 * @modal CreateCoachModal
 * @description Modale d'invitation/ajout d'un coach à un club. Propose deux modes
 *              (Nouveau / Existant) et permet d'affecter immédiatement le coach
 *              à plusieurs équipes via une matrice avec choix du rôle.
 * @access Super Admin, Responsable Club
 * @features
 *  - Mode "Nouveau" : invitation par email + photo
 *  - Mode "Existant" : ajout du rôle coach à un utilisateur déjà inscrit
 *  - TeamAssignmentMatrix : sélection multi-équipes + rôle (Référent/Assistant)
 *  - Le coach peut être créé sans équipe (rattaché au club uniquement)
 *  - Vérification limite plan (max_coaches_per_team)
 *  - AlertDialog anti-annulation
 * @maintenance
 *  - Workflow d'affectation : mem://logic/coach-assignment-workflow
 *  - Référent vs Assistant : mem://features/coach-team-workflow
 *  - Hook useCreateCoach centralise la logique métier
 */
import { useState } from "react";
import { UserCog } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useCreateCoach } from "@/hooks/useCreateCoach";
import { CoachFormFields } from "@/components/modals/coach/CoachFormFields";
import { TeamAssignmentMatrix } from "@/components/modals/shared/TeamAssignmentMatrix";

interface CreateCoachModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clubId: string;
  onSuccess?: () => void;
}

export const CreateCoachModal = ({ open, onOpenChange, clubId, onSuccess }: CreateCoachModalProps) => {
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);

  const hook = useCreateCoach(clubId, open, onSuccess, () => onOpenChange(false));

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) { setCancelConfirmOpen(true); return; }
    onOpenChange(isOpen);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <UserCog className="w-5 h-5 text-primary" />
              </div>
              Ajouter un Coach
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={hook.form.handleSubmit(hook.onSubmit)} className="space-y-6 mt-2">
            <CoachFormFields
              form={hook.form}
              mode={hook.mode}
              setMode={hook.setMode}
              existingUsers={hook.existingUsers}
              selectedExistingUser={hook.selectedExistingUser}
              loadingUsers={hook.loadingUsers}
              photoPreview={hook.photoPreview}
              onSelectExistingUser={hook.handleSelectExistingUser}
              onClearExistingUser={hook.handleClearExistingUser}
              onPhotoSelected={(file, preview) => { hook.setPhotoFile(file); hook.setPhotoPreview(preview); }}
              onRemovePhoto={() => { hook.setPhotoFile(null); hook.setPhotoPreview(null); }}
            />

            <TeamAssignmentMatrix
              teams={hook.teams}
              assignments={hook.teamAssignments}
              loading={hook.loadingTeams}
              onToggle={hook.toggleTeamAssignment}
              onRoleChange={hook.setTeamRole}
              helperText="Activez les équipes auxquelles rattacher le coach et choisissez son rôle. Laissez tout désactivé pour rattacher ultérieurement."
            />

            <div className="flex justify-end gap-3 pt-4 border-t border-border">
              <Button type="button" variant="outline" onClick={() => setCancelConfirmOpen(true)}>Annuler</Button>
              <Button type="submit" disabled={hook.loading}>
                {hook.loading ? (
                  <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                ) : hook.selectedExistingUser ? "Ajouter le rôle Coach" : "Inviter le coach"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {hook.planLimitDialog}

      <AlertDialog open={cancelConfirmOpen} onOpenChange={setCancelConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Annuler la création ?</AlertDialogTitle>
            <AlertDialogDescription>Les informations saisies seront perdues. Voulez-vous vraiment annuler ?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button onClick={() => setCancelConfirmOpen(false)}>Continuer la saisie</Button>
            <Button variant="secondary" onClick={() => { setCancelConfirmOpen(false); hook.resetAndClose(); }}>Confirmer l'annulation</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
