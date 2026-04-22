/**
 * @modal ObjectiveModal
 * @description Modale de création/édition d'un objectif (équipe ou joueur).
 *              Gère la saisie titre/description, la priorité, le statut et
 *              l'attachement de pièces jointes (objective_attachments).
 * @access Coach Référent, Responsable Club, Super Admin (créateurs)
 * @features
 *  - Mode dual : create / edit (préremplissage en édition)
 *  - Upload de fichiers via Supabase Storage (bucket objective-attachments)
 *  - Toggle priorité (is_priority) + statut (todo/in_progress/done)
 *  - Validation non-vide titre, deadline optionnelle
 *  - AlertDialog anti-annulation si modifications non sauvegardées
 * @maintenance
 *  - Notifications auto à la création : mem://features/team-objectives
 *  - Drag-drop priorisation : mem://features/player-objectives
 *  - Pièces jointes : table objective_attachments / player_objective_attachments
 */
import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Paperclip, X, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { usePlanLimitHandler } from "@/hooks/usePlanLimitHandler";

interface Attachment {
  id: string;
  file_name: string;
  file_path: string;
  file_type: string | null;
  file_size: number | null;
}

interface Objective {
  id: string;
  title: string;
  description: string | null;
  status: string;
  is_priority: boolean;
  attachments?: Attachment[];
}

interface ObjectiveModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamId: string;
  objective: Objective | null;
  nextOrderIndex: number;
  onSuccess: () => void;
}

export function ObjectiveModal({ open, onOpenChange, teamId, objective, nextOrderIndex, onSuccess }: ObjectiveModalProps) {
  const { user } = useAuth();
  const { handle: handlePlanLimit, dialog: planLimitDialog } = usePlanLimitHandler();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(objective?.title || "");
  const [description, setDescription] = useState(objective?.description || "");
  const [isPriority, setIsPriority] = useState(objective?.is_priority || false);
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [existingAttachments, setExistingAttachments] = useState<Attachment[]>(objective?.attachments || []);
  const [removedAttachmentIds, setRemovedAttachmentIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen) {
      setTitle(objective?.title || "");
      setDescription(objective?.description || "");
      setIsPriority(objective?.is_priority || false);
      setNewFiles([]);
      setExistingAttachments(objective?.attachments || []);
      setRemovedAttachmentIds([]);
    }
    onOpenChange(isOpen);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setNewFiles(prev => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const removeNewFile = (index: number) => {
    setNewFiles(prev => prev.filter((_, i) => i !== index));
  };

  const removeExistingAttachment = (att: Attachment) => {
    setExistingAttachments(prev => prev.filter(a => a.id !== att.id));
    setRemovedAttachmentIds(prev => [...prev, att.id]);
  };

  const handleSave = async () => {
    if (!title.trim()) {
      toast.error("Le titre est obligatoire");
      return;
    }
    if (!user) return;

    setSaving(true);
    try {
      let objectiveId = objective?.id;

      if (objective) {
        const { error } = await (supabase as any)
          .from("team_objectives")
          .update({
            title: title.trim(),
            description: description.trim() || null,
            is_priority: isPriority,
          })
          .eq("id", objective.id);
        if (error) throw error;
      } else {
        const { data, error } = await (supabase as any)
          .from("team_objectives")
          .insert({
            team_id: teamId,
            title: title.trim(),
            description: description.trim() || null,
            status: "active",
            priority: isPriority ? 1 : 2,
            is_priority: isPriority,
            order_index: nextOrderIndex,
            created_by: user.id,
          })
          .select("id")
          .single();
        if (error) throw error;
        objectiveId = data.id;
      }

      // Remove deleted attachments
      if (removedAttachmentIds.length > 0) {
        const toRemove = objective?.attachments?.filter(a => removedAttachmentIds.includes(a.id)) || [];
        if (toRemove.length > 0) {
          await supabase.storage.from("objective-attachments").remove(toRemove.map(a => a.file_path));
          await (supabase as any).from("objective_attachments").delete().in("id", removedAttachmentIds);
        }
      }

      // Upload new files
      for (const file of newFiles) {
        const { validateUpload } = await import("@/lib/upload-validation");
        const { contentType, safeExt } = validateUpload(file, "attachment");
        const filePath = `${teamId}/${objectiveId}/${crypto.randomUUID()}.${safeExt}`;
        const { error: uploadError } = await supabase.storage
          .from("objective-attachments")
          .upload(filePath, file, { contentType });
        if (uploadError) throw uploadError;

        const { error: insertError } = await (supabase as any)
          .from("objective_attachments")
          .insert({
            objective_id: objectiveId!,
            file_name: file.name,
            file_path: filePath,
            file_type: file.type,
            file_size: file.size,
          });
        if (insertError) throw insertError;
      }

      toast.success(objective ? "Objectif mis à jour" : "Objectif créé");
      onSuccess();
    } catch (error: any) {
      console.error("Error saving objective:", error);
      if (handlePlanLimit(error, "team_objectives")) { setSaving(false); return; }
      toast.error("Erreur lors de l'enregistrement");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{objective ? "Modifier l'objectif" : "Nouvel objectif"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="obj-title">Titre *</Label>
            <Input id="obj-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titre de l'objectif" />
          </div>

          <div>
            <Label htmlFor="obj-desc">Description</Label>
            <Textarea id="obj-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description de l'objectif" rows={3} />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox id="obj-priority" checked={isPriority} onCheckedChange={(checked) => setIsPriority(checked === true)} />
            <Label htmlFor="obj-priority" className="cursor-pointer font-medium">Objectif prioritaire</Label>
          </div>

          <div>
            <Label>Pièces jointes</Label>
            <div className="mt-1 space-y-2">
              {existingAttachments.map((att) => (
                <div key={att.id} className="flex items-center gap-2 text-sm bg-muted px-2.5 py-1.5 rounded-md">
                  <Paperclip className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="flex-1 truncate">{att.file_name}</span>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeExistingAttachment(att)}>
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ))}
              {newFiles.map((file, i) => (
                <div key={i} className="flex items-center gap-2 text-sm bg-muted px-2.5 py-1.5 rounded-md">
                  <Paperclip className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="flex-1 truncate">{file.name}</span>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeNewFile(i)}>
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ))}
              <input ref={fileInputRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.doc,.docx,.xls,.xlsx" className="hidden" onChange={handleFileChange} />
              <Button variant="outline" size="sm" className="gap-2" onClick={() => fileInputRef.current?.click()}>
                <Paperclip className="w-3.5 h-3.5" />
                Ajouter un fichier
              </Button>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => handleOpenChange(false)}>Annuler</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {objective ? "Enregistrer" : "Créer"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    {planLimitDialog}
    </>
  );
}
