import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Target, Paperclip, FileText, Image, ChevronDown, ChevronUp, Pencil, Trash2, Check, Clock, Circle, Trophy } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ObjectiveModal } from "./ObjectiveModal";
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
  priority: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  attachments?: Attachment[];
}

interface ObjectivesListProps {
  teamId: string;
  canEdit: boolean;
}

const priorityConfig: Record<number, { label: string; className: string }> = {
  1: { label: "Priorité 1", className: "bg-red-600 text-white" },
  2: { label: "Priorité 2", className: "bg-orange-400 text-white" },
  3: { label: "Priorité 3", className: "bg-yellow-200 text-yellow-800" },
};

const statusConfig: Record<string, { label: string; icon: typeof Check; className: string }> = {
  todo: { label: "À réaliser", icon: Circle, className: "text-muted-foreground" },
  in_progress: { label: "En cours", icon: Clock, className: "text-blue-600" },
  achieved: { label: "Atteint", icon: Check, className: "text-emerald-600" },
};

export function ObjectivesList({ teamId, canEdit }: ObjectivesListProps) {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editingObjective, setEditingObjective] = useState<Objective | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: objectives = [], isLoading } = useQuery({
    queryKey: ["team-objectives", teamId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("team_objectives")
        .select("*")
        .eq("team_id", teamId)
        .order("priority", { ascending: true })
        .order("created_at", { ascending: false });
      if (error) throw error;

      // Fetch attachments for all objectives
      const ids = (data || []).map((o: any) => o.id);
      let attachments: any[] = [];
      if (ids.length > 0) {
        const { data: att } = await (supabase as any)
          .from("objective_attachments")
          .select("*")
          .in("objective_id", ids);
        attachments = att || [];
      }

      const objectivesWithAtt = (data || []).map((o: any) => ({
        ...o,
        attachments: attachments.filter((a: any) => a.objective_id === o.id),
      }));

      // Sort: non-achieved by priority, then achieved at bottom
      const nonAchieved = objectivesWithAtt.filter((o: Objective) => o.status !== "achieved");
      const achieved = objectivesWithAtt.filter((o: Objective) => o.status === "achieved");
      return [...nonAchieved, ...achieved] as Objective[];
    },
  });

  const toggleAchievedMutation = useMutation({
    mutationFn: async ({ id, currentStatus }: { id: string; currentStatus: string }) => {
      const newStatus = currentStatus === "achieved" ? "todo" : "achieved";
      const { error } = await (supabase as any)
        .from("team_objectives")
        .update({ status: newStatus })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-objectives", teamId] });
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
    <div className="space-y-4">
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
            {canEdit
              ? "Créez un premier objectif collectif pour votre équipe."
              : "Aucun objectif n'a encore été défini pour cette équipe."}
          </p>
          {canEdit && (
            <Button className="gap-2" onClick={() => { setEditingObjective(null); setShowModal(true); }}>
              <Plus className="w-4 h-4" />
              Créer un objectif
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {objectives.map((obj) => {
            const isExpanded = expandedId === obj.id;
            const isAchieved = obj.status === "achieved";
            const StatusIcon = statusConfig[obj.status]?.icon || Circle;
            const pConfig = priorityConfig[obj.priority] || priorityConfig[2];

            return (
              <div
                key={obj.id}
                className={`glass-card p-4 transition-all ${isAchieved ? "border-l-4 border-l-emerald-500 bg-emerald-50/30 dark:bg-emerald-950/10" : ""}`}
              >
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 ${statusConfig[obj.status]?.className}`}>
                    <StatusIcon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className={`font-semibold ${isAchieved ? "line-through text-muted-foreground" : ""}`}>{obj.title}</h3>
                      <Badge className={`text-xs ${pConfig.className}`}>{pConfig.label}</Badge>
                      <Badge variant="outline" className={`text-xs ${statusConfig[obj.status]?.className}`}>
                        {statusConfig[obj.status]?.label}
                      </Badge>
                    </div>
                    {obj.description && (
                      <p className={`text-sm text-muted-foreground mt-1 ${!isExpanded ? "line-clamp-2" : ""}`}>
                        {obj.description}
                      </p>
                    )}
                    {isExpanded && obj.attachments && obj.attachments.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {obj.attachments.map((att) => (
                          <a
                            key={att.id}
                            href={getFileUrl(att.file_path)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-muted hover:bg-muted/80 text-xs transition-colors"
                          >
                            {getFileIcon(att.file_type)}
                            <span className="max-w-[150px] truncate">{att.file_name}</span>
                          </a>
                        ))}
                      </div>
                    )}
                    {!isExpanded && obj.attachments && obj.attachments.length > 0 && (
                      <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                        <Paperclip className="w-3 h-3" />
                        {obj.attachments.length} pièce{obj.attachments.length > 1 ? "s" : ""} jointe{obj.attachments.length > 1 ? "s" : ""}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {canEdit && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => { setEditingObjective(obj); setShowModal(true); }}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Supprimer cet objectif ?</AlertDialogTitle>
                              <AlertDialogDescription>Cette action est irréversible.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Annuler</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteMutation.mutate(obj.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Supprimer
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </>
                    )}
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setExpandedId(isExpanded ? null : obj.id)}>
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ObjectiveModal
        open={showModal}
        onOpenChange={setShowModal}
        teamId={teamId}
        objective={editingObjective}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["team-objectives", teamId] });
          setShowModal(false);
          setEditingObjective(null);
        }}
      />
    </div>
  );
}
