/**
 * @component PlayerObjectivesList
 * @description Liste des objectifs individuels d'un joueur (player_objectives).
 *              Variante de ObjectivesList scopée au joueur, avec gestion DnD,
 *              priorisation, copie depuis objectifs d'équipe et pièces jointes.
 * @access Coach Référent, Responsable Club (édition) / Joueur, Assistant (lecture)
 * @features
 *  - Identique ObjectivesList mais sur table player_objectives
 *  - Bouton "Copier depuis l'équipe" (Users icon) pour cloner team_objectives
 *  - DnD prioritisation par player_id + team_id
 *  - Pièces jointes via player_objective_attachments
 *  - Lecture seule pour le joueur lui-même (consultation)
 * @maintenance
 *  - Spec complète : mem://features/player-objectives
 *  - Restrictions interface joueur : mem://features/player/interface-restrictions
 *  - Permissions assistants : mem://features/coach-team-workflow
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Target, Paperclip, FileText, Image, Pencil, Trash2, GripVertical, Check, X, Copy, Star, RotateCcw, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { ObjectiveModal } from "./ObjectiveModal";
import { usePlanLimitHandler } from "@/hooks/usePlanLimitHandler";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

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
  order_index: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  attachments?: Attachment[];
}

interface PlayerObjectivesListProps {
  playerId: string;
  teamId: string;
  canEdit: boolean;
}

function SortableCard({
  obj, canEdit, onEdit, onDelete, onFinalize, onDuplicate, getFileUrl, getFileIcon,
}: {
  obj: Objective; canEdit: boolean;
  onEdit: (o: Objective) => void; onDelete: (id: string) => void;
  onFinalize: (id: string, r: "succeeded" | "missed") => void;
  onDuplicate: (o: Objective) => void;
  getFileUrl: (p: string) => string; getFileIcon: (t: string | null) => JSX.Element;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: obj.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div ref={setNodeRef} style={style} className={`glass-card p-3 transition-all ${obj.is_priority ? "border-l-4 border-l-amber-500" : ""}`}>
      <div className="flex items-start gap-2">
        {canEdit && (
          <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground mt-0.5">
            <GripVertical className="w-4 h-4" />
          </button>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-sm">{obj.title}</h3>
            {obj.is_priority && (
              <Badge className="text-[10px] bg-amber-500 text-white gap-0.5 py-0 px-1.5">
                <Star className="w-2.5 h-2.5" /> Prioritaire
              </Badge>
            )}
          </div>
          {obj.description && <p className="text-xs text-muted-foreground mt-1">{obj.description}</p>}
          {obj.attachments && obj.attachments.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {obj.attachments.map((att) => (
                <a key={att.id} href={getFileUrl(att.file_path)} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 px-2 py-1 rounded bg-muted hover:bg-muted/80 text-[11px] transition-colors">
                  {getFileIcon(att.file_type)}
                  <span className="max-w-[120px] truncate">{att.file_name}</span>
                </a>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          <div className="flex items-center gap-0.5">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onDuplicate(obj)}><Copy className="w-3 h-3" /></Button>
            {canEdit && (
              <>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(obj)}><Pencil className="w-3 h-3" /></Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"><Trash2 className="w-3 h-3" /></Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Supprimer cet objectif ?</AlertDialogTitle>
                      <AlertDialogDescription>Cette action est irréversible.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Annuler</AlertDialogCancel>
                      <AlertDialogAction onClick={() => onDelete(obj.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Supprimer</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}
          </div>
          {canEdit && (
            <div className="flex flex-col items-stretch gap-0.5 w-full">
              <Button variant="outline" size="sm" className="h-6 text-[11px] gap-1 px-2 text-emerald-600 border-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 justify-start"
                onClick={() => onFinalize(obj.id, "succeeded")}><Check className="w-3 h-3" /> Réussi</Button>
              <Button variant="outline" size="sm" className="h-6 text-[11px] gap-1 px-2 text-destructive border-red-300 hover:bg-red-50 dark:hover:bg-red-950/30 justify-start"
                onClick={() => onFinalize(obj.id, "missed")}><X className="w-3 h-3" /> Manqué</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function PlayerObjectivesList({ playerId, teamId, canEdit }: PlayerObjectivesListProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [editingObjective, setEditingObjective] = useState<Objective | null>(null);
  const { handle: handlePlanLimit, dialog: planLimitDialog } = usePlanLimitHandler();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Individual objectives
  const { data: individualObjectives = [], isLoading: loadingIndividual } = useQuery({
    queryKey: ["player-objectives", playerId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("player_objectives")
        .select("*")
        .eq("player_id", playerId)
        .order("order_index", { ascending: true });
      if (error) throw error;

      const ids = (data || []).map((o: any) => o.id);
      let attachments: any[] = [];
      if (ids.length > 0) {
        const { data: att } = await (supabase as any)
          .from("player_objective_attachments")
          .select("*")
          .in("objective_id", ids);
        attachments = att || [];
      }

      return (data || []).map((o: any) => ({
        ...o,
        is_priority: o.is_priority ?? false,
        order_index: o.order_index ?? 0,
        attachments: attachments.filter((a: any) => a.objective_id === o.id),
      })) as Objective[];
    },
  });

  // Team objectives (read-only)
  const { data: teamObjectives = [], isLoading: loadingTeam } = useQuery({
    queryKey: ["team-objectives-readonly", teamId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("team_objectives")
        .select("*")
        .eq("team_id", teamId)
        .in("status", ["active", "todo", "in_progress"])
        .order("order_index", { ascending: true });
      if (error) throw error;
      return (data || []).map((o: any) => ({
        ...o,
        is_priority: o.is_priority ?? false,
      })) as Objective[];
    },
  });

  const activeIndividual = individualObjectives.filter(o => o.status !== "succeeded" && o.status !== "missed");
  const finalizedIndividual = individualObjectives.filter(o => o.status === "succeeded" || o.status === "missed");

  const finalizeMutation = useMutation({
    mutationFn: async ({ id, result }: { id: string; result: string }) => {
      const { error } = await (supabase as any).from("player_objectives").update({ status: result }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["player-objectives", playerId] });
      toast.success("Objectif finalisé");
    },
    onError: () => toast.error("Erreur lors de la mise à jour"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const obj = individualObjectives.find(o => o.id === id);
      if (obj?.attachments?.length) {
        const paths = obj.attachments.map(a => a.file_path);
        await supabase.storage.from("objective-attachments").remove(paths);
        await (supabase as any).from("player_objective_attachments").delete().eq("objective_id", id);
      }
      const { error } = await (supabase as any).from("player_objectives").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["player-objectives", playerId] });
      toast.success("Objectif supprimé");
    },
    onError: () => toast.error("Erreur lors de la suppression"),
  });

  const duplicateMutation = useMutation({
    mutationFn: async (obj: Objective) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await (supabase as any).from("player_objectives").insert({
        player_id: playerId,
        team_id: teamId,
        title: obj.title,
        description: obj.description,
        status: "active",
        priority: obj.is_priority ? 1 : 2,
        is_priority: obj.is_priority,
        order_index: individualObjectives.length,
        created_by: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["player-objectives", playerId] });
      toast.success("Objectif dupliqué");
    },
    onError: (error: any) => {
      if (handlePlanLimit(error, "player_objectives")) return;
      toast.error("Erreur lors de la duplication");
    },
  });

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = activeIndividual.findIndex(o => o.id === active.id);
    const newIndex = activeIndividual.findIndex(o => o.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(activeIndividual, oldIndex, newIndex);
    queryClient.setQueryData(["player-objectives", playerId], [...reordered.map((o, i) => ({ ...o, order_index: i })), ...finalizedIndividual]);
    for (let i = 0; i < reordered.length; i++) {
      await (supabase as any).from("player_objectives").update({ order_index: i }).eq("id", reordered[i].id);
    }
  };

  const getFileUrl = (path: string) => {
    const { data } = supabase.storage.from("objective-attachments").getPublicUrl(path);
    return data.publicUrl;
  };

  const getFileIcon = (type: string | null) => {
    if (type?.startsWith("image/")) return <Image className="w-4 h-4" />;
    return <FileText className="w-4 h-4" />;
  };

  // For the modal: we reuse ObjectiveModal but adapt for player objectives
  const handleModalSuccess = () => {
    setShowModal(false);
    setEditingObjective(null);
    queryClient.invalidateQueries({ queryKey: ["player-objectives", playerId] });
  };

  const handleSaveObjective = async (objective: Objective | null, title: string, description: string, isPriority: boolean, newFiles: File[], removedAttachmentIds: string[]) => {
    if (!title.trim()) { toast.error("Le titre est obligatoire"); return; }
    if (!user) return;

    try {
      let objectiveId = objective?.id;

      if (objective) {
        const { error } = await (supabase as any).from("player_objectives")
          .update({ title: title.trim(), description: description.trim() || null, is_priority: isPriority })
          .eq("id", objective.id);
        if (error) throw error;
      } else {
        const { data, error } = await (supabase as any).from("player_objectives")
          .insert({
            player_id: playerId,
            team_id: teamId,
            title: title.trim(),
            description: description.trim() || null,
            status: "active",
            priority: isPriority ? 1 : 2,
            is_priority: isPriority,
            order_index: individualObjectives.length,
            created_by: user.id,
          })
          .select("id")
          .single();
        if (error) throw error;
        objectiveId = data.id;
      }

      if (removedAttachmentIds.length > 0) {
        const toRemove = objective?.attachments?.filter(a => removedAttachmentIds.includes(a.id)) || [];
        if (toRemove.length > 0) {
          await supabase.storage.from("objective-attachments").remove(toRemove.map(a => a.file_path));
          await (supabase as any).from("player_objective_attachments").delete().in("id", removedAttachmentIds);
        }
      }

      for (const file of newFiles) {
        const ext = file.name.split(".").pop();
        const filePath = `player/${playerId}/${objectiveId}/${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await supabase.storage.from("objective-attachments").upload(filePath, file);
        if (uploadError) throw uploadError;
        const { error: insertError } = await (supabase as any).from("player_objective_attachments").insert({
          objective_id: objectiveId!,
          file_name: file.name,
          file_path: filePath,
          file_type: file.type,
          file_size: file.size,
        });
        if (insertError) throw insertError;
      }

      toast.success(objective ? "Objectif mis à jour" : "Objectif créé");
      handleModalSuccess();
    } catch (error: any) {
      console.error("Error saving player objective:", error);
      if (handlePlanLimit(error, "player_objectives")) return;
      toast.error("Erreur lors de l'enregistrement");
    }
  };

  if (loadingIndividual || loadingTeam) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Individual objectives section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Target className="w-5 h-5 text-primary" />
            Objectifs individuels
          </h3>
          {canEdit && (
            <Button className="gap-2" onClick={() => { setEditingObjective(null); setShowModal(true); }}>
              <Plus className="w-4 h-4" /> Nouvel objectif
            </Button>
          )}
        </div>

        {individualObjectives.length === 0 ? (
          <div className="glass-card p-6 flex flex-col items-center justify-center text-center">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
              <Target className="w-6 h-6 text-primary" />
            </div>
            <p className="text-muted-foreground text-sm mb-3">
              {canEdit ? "Aucun objectif individuel. Créez-en un pour ce joueur." : "Aucun objectif individuel défini."}
            </p>
            {canEdit && (
              <Button size="sm" className="gap-2" onClick={() => { setEditingObjective(null); setShowModal(true); }}>
                <Plus className="w-4 h-4" /> Créer un objectif
              </Button>
            )}
          </div>
        ) : (
          <>
            {activeIndividual.length > 0 && (
              <div className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">En cours</p>
                {canEdit ? (
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={activeIndividual.map(o => o.id)} strategy={verticalListSortingStrategy}>
                      <div className="space-y-3">
                        {activeIndividual.map((obj) => (
                          <SortableCard key={obj.id} obj={obj} canEdit={canEdit}
                            onEdit={(o) => { setEditingObjective(o); setShowModal(true); }}
                            onDelete={(id) => deleteMutation.mutate(id)}
                            onFinalize={(id, r) => finalizeMutation.mutate({ id, result: r })}
                            onDuplicate={(o) => duplicateMutation.mutate(o)}
                            getFileUrl={getFileUrl} getFileIcon={getFileIcon} />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                ) : (
                  <div className="space-y-3">
                    {activeIndividual.map((obj) => (
                      <div key={obj.id} className={`glass-card p-3 ${obj.is_priority ? "border-l-4 border-l-amber-500" : ""}`}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-sm">{obj.title}</h3>
                          {obj.is_priority && (
                            <Badge className="text-[10px] bg-amber-500 text-white gap-0.5 py-0 px-1.5"><Star className="w-2.5 h-2.5" /> Prioritaire</Badge>
                          )}
                        </div>
                        {obj.description && <p className="text-xs text-muted-foreground mt-1">{obj.description}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {finalizedIndividual.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Finalisés</p>
                {finalizedIndividual.map((obj) => (
                  <div key={obj.id} className={`glass-card p-3 border-l-4 ${obj.status === "succeeded" ? "border-l-emerald-500 bg-emerald-50/30 dark:bg-emerald-950/10" : "border-l-red-500 bg-red-50/30 dark:bg-red-950/10"}`}>
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-sm text-muted-foreground">{obj.title}</h3>
                          <Badge className={`text-[10px] py-0 px-1.5 ${obj.status === "succeeded" ? "bg-emerald-500 text-white" : "bg-red-500 text-white"}`}>
                            {obj.status === "succeeded" ? "Réussi" : "Manqué"}
                          </Badge>
                        </div>
                        {obj.description && <p className="text-xs text-muted-foreground mt-1">{obj.description}</p>}
                      </div>
                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        {canEdit && (
                          <Button variant="ghost" size="icon" className="h-7 w-7"
                            onClick={() => finalizeMutation.mutate({ id: obj.id, result: "active" })} title="Remettre en cours">
                            <RotateCcw className="w-3 h-3" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => duplicateMutation.mutate(obj)}>
                          <Copy className="w-3 h-3" />
                        </Button>
                        {canEdit && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"><Trash2 className="w-3 h-3" /></Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Supprimer cet objectif ?</AlertDialogTitle>
                                <AlertDialogDescription>Cette action est irréversible.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Annuler</AlertDialogCancel>
                                <AlertDialogAction onClick={() => deleteMutation.mutate(obj.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Supprimer</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Team objectives section (read-only) */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Users className="w-5 h-5 text-muted-foreground" />
          Objectifs collectifs de l'équipe
        </h3>

        {teamObjectives.length === 0 ? (
          <div className="glass-card p-4 text-center">
            <p className="text-sm text-muted-foreground">Aucun objectif collectif en cours.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {teamObjectives.map((obj) => (
              <div key={obj.id} className={`glass-card p-3 ${obj.is_priority ? "border-l-4 border-l-amber-500" : ""}`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className="text-[10px] py-0 px-1.5">Collectif</Badge>
                  <h3 className="font-semibold text-sm">{obj.title}</h3>
                  {obj.is_priority && (
                    <Badge className="text-[10px] bg-amber-500 text-white gap-0.5 py-0 px-1.5"><Star className="w-2.5 h-2.5" /> Prioritaire</Badge>
                  )}
                </div>
                {obj.description && <p className="text-xs text-muted-foreground mt-1">{obj.description}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal for creating/editing individual objectives */}
      {showModal && (
        <PlayerObjectiveModal
          open={showModal}
          onOpenChange={(open) => { if (!open) { setShowModal(false); setEditingObjective(null); } }}
          objective={editingObjective}
          onSave={handleSaveObjective}
        />
      )}
      {planLimitDialog}
    </div>
  );
}

// Inline modal component adapted from ObjectiveModal for player objectives
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "lucide-react";
import { useRef } from "react";

function PlayerObjectiveModal({
  open, onOpenChange, objective, onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  objective: Objective | null;
  onSave: (objective: Objective | null, title: string, description: string, isPriority: boolean, newFiles: File[], removedAttachmentIds: string[]) => Promise<void>;
}) {
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

  const handleSave = async () => {
    setSaving(true);
    await onSave(objective, title, description, isPriority, newFiles, removedAttachmentIds);
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{objective ? "Modifier l'objectif" : "Nouvel objectif individuel"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="po-title">Titre *</Label>
            <Input id="po-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Titre de l'objectif" />
          </div>
          <div>
            <Label htmlFor="po-desc">Description</Label>
            <Textarea id="po-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" rows={3} />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="po-priority" checked={isPriority} onCheckedChange={(c) => setIsPriority(c === true)} />
            <Label htmlFor="po-priority" className="cursor-pointer font-medium">Objectif prioritaire</Label>
          </div>
          <div>
            <Label>Pièces jointes</Label>
            <div className="mt-1 space-y-2">
              {existingAttachments.map((att) => (
                <div key={att.id} className="flex items-center gap-2 text-sm bg-muted px-2.5 py-1.5 rounded-md">
                  <Paperclip className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="flex-1 truncate">{att.file_name}</span>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => {
                    setExistingAttachments(prev => prev.filter(a => a.id !== att.id));
                    setRemovedAttachmentIds(prev => [...prev, att.id]);
                  }}><X className="w-3 h-3" /></Button>
                </div>
              ))}
              {newFiles.map((file, i) => (
                <div key={i} className="flex items-center gap-2 text-sm bg-muted px-2.5 py-1.5 rounded-md">
                  <Paperclip className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="flex-1 truncate">{file.name}</span>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setNewFiles(prev => prev.filter((_, j) => j !== i))}><X className="w-3 h-3" /></Button>
                </div>
              ))}
              <input ref={fileInputRef} type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.doc,.docx,.xls,.xlsx" className="hidden"
                onChange={(e) => { if (e.target.files) setNewFiles(prev => [...prev, ...Array.from(e.target.files!)]); }} />
              <Button variant="outline" size="sm" className="gap-2" onClick={() => fileInputRef.current?.click()}>
                <Paperclip className="w-3.5 h-3.5" /> Ajouter un fichier
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
  );
}
