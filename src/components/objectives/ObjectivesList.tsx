import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Target, Paperclip, FileText, Image, Pencil, Trash2, GripVertical, Check, X, Copy, Star, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { ObjectiveModal } from "./ObjectiveModal";
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
  team_id: string;
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

interface ObjectivesListProps {
  teamId: string;
  canEdit: boolean;
}

function SortableObjectiveCard({
  obj,
  canEdit,
  onEdit,
  onDelete,
  onFinalize,
  onDuplicate,
  getFileUrl,
  getFileIcon,
}: {
  obj: Objective;
  canEdit: boolean;
  onEdit: (obj: Objective) => void;
  onDelete: (id: string) => void;
  onFinalize: (id: string, result: "succeeded" | "missed") => void;
  onDuplicate: (obj: Objective) => void;
  getFileUrl: (path: string) => string;
  getFileIcon: (type: string | null) => JSX.Element;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: obj.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div ref={setNodeRef} style={style} className={`glass-card p-3 transition-all ${obj.is_priority ? "border-l-4 border-l-amber-500" : ""}`}>
      {/* Header row: drag handle + title + actions */}
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
                <Star className="w-2.5 h-2.5" />
                Prioritaire
              </Badge>
            )}
          </div>
          {obj.description && (
            <p className="text-xs text-muted-foreground mt-1">{obj.description}</p>
          )}
          {/* Attachments - always visible */}
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
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {canEdit && (
            <>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-emerald-600 hover:bg-emerald-500/10"
                onClick={() => onFinalize(obj.id, "succeeded")} title="Réussi">
                <Check className="w-3.5 h-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10"
                onClick={() => onFinalize(obj.id, "missed")} title="Manqué">
                <X className="w-3.5 h-3.5" />
              </Button>
              <div className="w-px h-4 bg-border/50 mx-0.5" />
            </>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onDuplicate(obj)}>
            <Copy className="w-3 h-3" />
          </Button>
          {canEdit && (
            <>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onEdit(obj)}>
                <Pencil className="w-3 h-3" />
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive">
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Supprimer cet objectif ?</AlertDialogTitle>
                    <AlertDialogDescription>Cette action est irréversible.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annuler</AlertDialogCancel>
                    <AlertDialogAction onClick={() => onDelete(obj.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      Supprimer
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function ObjectivesList({ teamId, canEdit }: ObjectivesListProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [editingObjective, setEditingObjective] = useState<Objective | null>(null);
  

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const { data: objectives = [], isLoading } = useQuery({
    queryKey: ["team-objectives", teamId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("team_objectives")
        .select("*")
        .eq("team_id", teamId)
        .order("order_index", { ascending: true });
      if (error) throw error;

      const ids = (data || []).map((o: any) => o.id);
      let attachments: any[] = [];
      if (ids.length > 0) {
        const { data: att } = await (supabase as any)
          .from("objective_attachments")
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

  const activeObjectives = objectives.filter(o => o.status !== "succeeded" && o.status !== "missed");
  const finalizedObjectives = objectives.filter(o => o.status === "succeeded" || o.status === "missed");

  const finalizeMutation = useMutation({
    mutationFn: async ({ id, result }: { id: string; result: "succeeded" | "missed" }) => {
      const { error } = await (supabase as any)
        .from("team_objectives")
        .update({ status: result })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-objectives", teamId] });
      toast.success("Objectif finalisé");
    },
    onError: () => toast.error("Erreur lors de la mise à jour"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const obj = objectives.find(o => o.id === id);
      if (obj?.attachments?.length) {
        const paths = obj.attachments.map(a => a.file_path);
        await supabase.storage.from("objective-attachments").remove(paths);
        await (supabase as any).from("objective_attachments").delete().eq("objective_id", id);
      }
      const { error } = await (supabase as any).from("team_objectives").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-objectives", teamId] });
      toast.success("Objectif supprimé");
    },
    onError: () => toast.error("Erreur lors de la suppression"),
  });

  const duplicateMutation = useMutation({
    mutationFn: async (obj: Objective) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await (supabase as any)
        .from("team_objectives")
        .insert({
          team_id: teamId,
          title: obj.title,
          description: obj.description,
          status: "active",
          priority: obj.is_priority ? 1 : 2,
          is_priority: obj.is_priority,
          order_index: objectives.length,
          created_by: user.id,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-objectives", teamId] });
      toast.success("Objectif dupliqué");
    },
    onError: () => toast.error("Erreur lors de la duplication"),
  });

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = activeObjectives.findIndex(o => o.id === active.id);
    const newIndex = activeObjectives.findIndex(o => o.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(activeObjectives, oldIndex, newIndex);

    // Optimistic update
    queryClient.setQueryData(["team-objectives", teamId], [...reordered.map((o, i) => ({ ...o, order_index: i })), ...finalizedObjectives]);

    // Persist
    for (let i = 0; i < reordered.length; i++) {
      await (supabase as any)
        .from("team_objectives")
        .update({ order_index: i })
        .eq("id", reordered[i].id);
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {canEdit && (
        <div className="flex justify-end">
          <Button className="gap-2" onClick={() => { setEditingObjective(null); setShowModal(true); }}>
            <Plus className="w-4 h-4" />
            Nouvel objectif
          </Button>
        </div>
      )}

      {objectives.length === 0 ? (
        <div className="glass-card p-8 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Target className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-xl font-display font-semibold mb-2">Aucun objectif</h2>
          <p className="text-muted-foreground mb-4">
            {canEdit ? "Créez un premier objectif collectif pour votre équipe." : "Aucun objectif n'a encore été défini pour cette équipe."}
          </p>
          {canEdit && (
            <Button className="gap-2" onClick={() => { setEditingObjective(null); setShowModal(true); }}>
              <Plus className="w-4 h-4" />
              Créer un objectif
            </Button>
          )}
        </div>
      ) : (
        <>
          {/* Active objectives with drag-and-drop */}
          {activeObjectives.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Objectifs en cours</h3>
              {canEdit ? (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={activeObjectives.map(o => o.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-3">
                      {activeObjectives.map((obj) => (
                        <SortableObjectiveCard
                          key={obj.id}
                          obj={obj}
                          canEdit={canEdit}
                          onEdit={(o) => { setEditingObjective(o); setShowModal(true); }}
                          onDelete={(id) => deleteMutation.mutate(id)}
                          onFinalize={(id, result) => finalizeMutation.mutate({ id, result })}
                          onDuplicate={(o) => duplicateMutation.mutate(o)}
                          getFileUrl={getFileUrl}
                          getFileIcon={getFileIcon}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              ) : (
                <div className="space-y-3">
                  {activeObjectives.map((obj) => (
                    <ReadOnlyObjectiveCard
                      key={obj.id}
                      obj={obj}
                      onDuplicate={(o) => duplicateMutation.mutate(o)}
                      getFileUrl={getFileUrl}
                      getFileIcon={getFileIcon}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Finalized objectives */}
          {finalizedObjectives.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Objectifs finalisés</h3>
              <div className="space-y-2">
                {finalizedObjectives.map((obj) => (
                  <div key={obj.id} className={`glass-card p-3 transition-all border-l-4 ${obj.status === "succeeded" ? "border-l-emerald-500 bg-emerald-50/30 dark:bg-emerald-950/10" : "border-l-red-500 bg-red-50/30 dark:bg-red-950/10"}`}>
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-sm line-through text-muted-foreground">{obj.title}</h3>
                          <Badge className={`text-[10px] py-0 px-1.5 ${obj.status === "succeeded" ? "bg-emerald-500 text-white" : "bg-red-500 text-white"}`}>
                            {obj.status === "succeeded" ? "Réussi" : "Manqué"}
                          </Badge>
                          {obj.is_priority && (
                            <Badge className="text-[10px] bg-amber-500 text-white gap-0.5 py-0 px-1.5">
                              <Star className="w-2.5 h-2.5" />
                              Prioritaire
                            </Badge>
                          )}
                        </div>
                        {obj.description && <p className="text-xs text-muted-foreground mt-1">{obj.description}</p>}
                      </div>
                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        {canEdit && (
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            onClick={() => finalizeMutation.mutate({ id: obj.id, result: "active" as any })} title="Remettre en cours">
                            <RotateCcw className="w-3 h-3" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => duplicateMutation.mutate(obj)}>
                          <Copy className="w-3 h-3" />
                        </Button>
                        {canEdit && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive">
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Supprimer cet objectif ?</AlertDialogTitle>
                                <AlertDialogDescription>Cette action est irréversible.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Annuler</AlertDialogCancel>
                                <AlertDialogAction onClick={() => deleteMutation.mutate(obj.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                  Supprimer
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <ObjectiveModal
        open={showModal}
        onOpenChange={setShowModal}
        teamId={teamId}
        objective={editingObjective}
        nextOrderIndex={objectives.length}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["team-objectives", teamId] });
          setShowModal(false);
          setEditingObjective(null);
        }}
      />
    </div>
  );
}

function ReadOnlyObjectiveCard({
  obj,
  onDuplicate,
  getFileUrl,
  getFileIcon,
}: {
  obj: Objective;
  onDuplicate: (obj: Objective) => void;
  getFileUrl: (path: string) => string;
  getFileIcon: (type: string | null) => JSX.Element;
}) {
  return (
    <div className={`glass-card p-3 transition-all ${obj.is_priority ? "border-l-4 border-l-amber-500" : ""}`}>
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-sm">{obj.title}</h3>
            {obj.is_priority && (
              <Badge className="text-[10px] bg-amber-500 text-white gap-0.5 py-0 px-1.5">
                <Star className="w-2.5 h-2.5" />
                Prioritaire
              </Badge>
            )}
          </div>
          {obj.description && (
            <p className="text-xs text-muted-foreground mt-1">{obj.description}</p>
          )}
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
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onDuplicate(obj)}>
            <Copy className="w-3 h-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}
