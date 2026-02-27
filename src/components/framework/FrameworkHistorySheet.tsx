import { useState, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { History, RotateCcw, Layers, BookOpen } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ArchivedFramework {
  id: string;
  name: string;
  archived_at: string | null;
  created_at: string;
  theme_count: number;
  skill_count: number;
}

interface FrameworkHistorySheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** club_id or team_id to scope the history */
  entityId: string;
  /** Whether this is for a club or team */
  entityType: "club" | "team";
  /** The currently active framework id */
  activeFrameworkId: string | null;
  /** Called after a successful restore */
  onRestored: () => void;
}

export function FrameworkHistorySheet({
  open,
  onOpenChange,
  entityId,
  entityType,
  activeFrameworkId,
  onRestored,
}: FrameworkHistorySheetProps) {
  const [archived, setArchived] = useState<ArchivedFramework[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  useEffect(() => {
    if (open) fetchArchived();
  }, [open, entityId]);

  const fetchArchived = async () => {
    setLoading(true);
    try {
      const col = entityType === "club" ? "club_id" : "team_id";
      const { data, error } = await supabase
        .from("competence_frameworks")
        .select("id, name, archived_at, created_at")
        .eq(col, entityId)
        .eq("is_archived", true)
        .order("archived_at", { ascending: false });

      if (error) throw error;

      // Fetch theme/skill counts for each archived framework
      const enriched: ArchivedFramework[] = [];
      for (const fw of data || []) {
        const { count: themeCount } = await supabase
          .from("themes")
          .select("id", { count: "exact", head: true })
          .eq("framework_id", fw.id);

        const { data: themeIds } = await supabase
          .from("themes")
          .select("id")
          .eq("framework_id", fw.id);

        let skillCount = 0;
        if (themeIds && themeIds.length > 0) {
          const { count } = await supabase
            .from("skills")
            .select("id", { count: "exact", head: true })
            .in("theme_id", themeIds.map(t => t.id));
          skillCount = count || 0;
        }

        enriched.push({
          ...fw,
          theme_count: themeCount || 0,
          skill_count: skillCount,
        });
      }
      setArchived(enriched);
    } catch (error) {
      console.error("Error fetching archived frameworks:", error);
      toast.error("Erreur lors du chargement de l'historique");
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async (archivedId: string) => {
    setRestoring(true);
    try {
      // 1. Archive the currently active framework
      if (activeFrameworkId) {
        const { error: archiveError } = await supabase
          .from("competence_frameworks")
          .update({ is_archived: true, archived_at: new Date().toISOString() })
          .eq("id", activeFrameworkId);
        if (archiveError) throw archiveError;
      }

      // 2. Restore the selected one
      const { error: restoreError } = await supabase
        .from("competence_frameworks")
        .update({ is_archived: false, archived_at: null })
        .eq("id", archivedId);
      if (restoreError) throw restoreError;

      toast.success("Référentiel restauré avec succès");
      setConfirmId(null);
      onOpenChange(false);
      onRestored();
    } catch (error) {
      console.error("Error restoring framework:", error);
      toast.error("Erreur lors de la restauration");
    } finally {
      setRestoring(false);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <History className="w-5 h-5 text-primary" />
              Historique des référentiels
            </SheetTitle>
          </SheetHeader>

          <div className="mt-6 space-y-3">
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              </div>
            ) : archived.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-center">
                <BookOpen className="w-10 h-10 text-muted-foreground/40 mb-3" />
                <p className="text-sm text-muted-foreground">
                  Aucun référentiel archivé
                </p>
              </div>
            ) : (
              archived.map((fw) => (
                <div
                  key={fw.id}
                  className="border border-border rounded-lg p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{fw.name}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Archivé le {formatDate(fw.archived_at || fw.created_at)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="gap-1 text-xs">
                      <Layers className="w-3 h-3" />
                      {fw.theme_count} thématiques
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {fw.skill_count} compétences
                    </Badge>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => setConfirmId(fw.id)}
                    disabled={restoring}
                  >
                    <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                    Restaurer
                  </Button>
                </div>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!confirmId} onOpenChange={(o) => !o && setConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restaurer ce référentiel ?</AlertDialogTitle>
            <AlertDialogDescription>
              Attention, restaurer ce référentiel remplacera le référentiel actuellement actif. 
              Le référentiel actuel sera archivé et pourra être restauré ultérieurement.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoring}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmId && handleRestore(confirmId)}
              disabled={restoring}
            >
              {restoring ? "Restauration..." : "Restaurer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
