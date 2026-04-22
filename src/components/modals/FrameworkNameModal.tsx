/**
 * @modal FrameworkNameModal
 * @description Sous-modale légère utilisée pour saisir le nom d'une nouvelle
 *              version de référentiel avant création/duplication. Appelée par
 *              CreateClubFrameworkModal et le bouton "Réinitialiser" du référentiel.
 * @access Responsable Club, Super Admin, Coach Référent
 * @features
 *  - Champ unique (nom du référentiel) avec validation non-vide
 *  - Suggestion de nom par défaut basée sur la saison ou la date
 *  - Confirmation par Enter
 * @maintenance
 *  - Lié au système de versioning : mem://features/framework-lifecycle-management
 */
import { useState, useEffect } from "react";
import { FileText, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface FrameworkNameModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentName: string;
  onConfirm: (name: string) => void;
  saving?: boolean;
}

export function FrameworkNameModal({
  open,
  onOpenChange,
  currentName,
  onConfirm,
  saving = false,
}: FrameworkNameModalProps) {
  const [name, setName] = useState(currentName);

  useEffect(() => {
    if (open) {
      setName(currentName);
    }
  }, [open, currentName]);

  const handleConfirm = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    onConfirm(trimmed);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <DialogTitle>Confirmer la sauvegarde</DialogTitle>
              <DialogDescription>
                Vérifiez le titre du référentiel. Vous pouvez encore le modifier avant de sauvegarder.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="py-4">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nom du référentiel"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") handleConfirm();
            }}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Annuler
          </Button>
          <Button onClick={handleConfirm} disabled={!name.trim() || saving}>
            {saving ? (
              <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
            ) : (
              "Sauvegarder"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
