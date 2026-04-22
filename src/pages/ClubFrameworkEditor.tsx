/**
 * @page ClubFrameworkEditor
 * @route /clubs/:clubId/framework
 *
 * Éditeur plein écran du référentiel modèle d'un club.
 * (mem://features/club-framework-management)
 *
 * @description
 * Vue par défaut en lecture seule (ReadOnlyFrameworkView). Le bouton "Modifier"
 * bascule en mode édition avec sauvegarde explicite. Inclut historique des
 * versions, export PDF et réinitialisation depuis un modèle.
 *
 * @features
 * - Lecture seule par défaut → bascule édition via Pencil
 * - Historique des snapshots (FrameworkHistorySheet)
 * - Reset depuis modèle standard (création d'un snapshot avant écrasement)
 * - Export PDF avec logo club en base64
 *
 * @access (mem://logic/gestion-referentiels-permissions)
 * - Club Admin du club : édition complète
 * - Coach Référent d'une équipe du club : édition
 * - Autres : lecture seule
 *
 * @maintenance
 * Toute modification crée un snapshot dans `framework_snapshots`
 * (mem://technical/framework-snapshot-system).
 */
import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  BookOpen,
  FileQuestion,
  History,
  RotateCcw,
  Printer,
  Pencil,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ClubTemplateSelector } from "@/components/framework/ClubTemplateSelector";
import { FrameworkHistorySheet } from "@/components/framework/FrameworkHistorySheet";
import { snapshotFramework } from "@/lib/framework-snapshot";
import { saveFrameworkChanges } from "@/lib/framework-save";
import { FrameworkNameModal } from "@/components/modals/FrameworkNameModal";
import { PrintableFramework } from "@/components/framework/PrintableFramework";
import { ReadOnlyFrameworkView } from "@/components/framework/ReadOnlyFrameworkView";
import { FrameworkEditDialog } from "@/components/framework/FrameworkEditDialog";
import { useReactToPrint } from "react-to-print";
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

interface Skill {
  id: string;
  name: string;
  definition: string | null;
  order_index: number;
  isNew?: boolean;
}

interface Theme {
  id: string;
  name: string;
  color: string | null;
  order_index: number;
  skills: Skill[];
  isNew?: boolean;
}

interface Framework {
  id: string;
  name: string;
  club_id: string | null;
  is_template: boolean;
}

interface Club {
  id: string;
  name: string;
  primary_color: string;
  logo_url?: string | null;
}

export default function ClubFrameworkEditor() {
  const { clubId } = useParams<{ clubId: string }>();
  const { user, loading: authLoading, hasAdminRole: isAdmin, roles, currentRole } = useAuth();
  const navigate = useNavigate();

  const [club, setClub] = useState<Club | null>(null);
  const [framework, setFramework] = useState<Framework | null>(null);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [frameworkName, setFrameworkName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showNameModal, setShowNameModal] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showEditConfirm, setShowEditConfirm] = useState(false);
  const [pendingEditThemes, setPendingEditThemes] = useState<Theme[] | null>(null);
  const [pendingEditName, setPendingEditName] = useState<string>("");
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: frameworkName || "Référentiel du Club",
  });

  const isClubAdmin = club ? roles.some(r => r.role === "club_admin" && r.club_id === club.id) : false;
  // Respect the currently active role: a user acting as coach must not see edit buttons,
  // even if they also hold an admin/club_admin role on another tab.
  const actingAsPrivileged = currentRole?.role === "admin" || currentRole?.role === "club_admin";
  const canEdit = !authLoading && actingAsPrivileged && (isAdmin || isClubAdmin);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user && clubId) fetchData();
  }, [user, clubId]);

  const fetchData = async () => {
    try {
      const { data: clubData, error: clubError } = await supabase
        .from("clubs")
        .select("id, name, primary_color")
        .eq("id", clubId)
        .maybeSingle();

      if (clubError) throw clubError;
      if (!clubData) {
        toast.error("Club non trouvé");
        navigate("/clubs");
        return;
      }
      setClub(clubData);

      const { data: frameworkData } = await supabase
        .from("competence_frameworks")
        .select("*")
        .eq("club_id", clubId)
        .eq("is_template", true)
        .eq("is_archived", false)
        .maybeSingle();

      if (frameworkData) {
        setFramework(frameworkData);
        setFrameworkName(frameworkData.name);
        const { data: themesData } = await supabase
          .from("themes")
          .select("*, skills(*)")
          .eq("framework_id", frameworkData.id)
          .order("order_index");

        if (themesData) {
          const sortedThemes = themesData.map(theme => ({
            ...theme,
            skills: (theme.skills || []).sort((a: Skill, b: Skill) => a.order_index - b.order_index)
          }));
          setThemes(sortedThemes);
        }
      } else {
        setShowTemplateSelector(true);
      }
    } catch (error: unknown) {
      console.error("Error fetching data:", error);
      toast.error("Erreur lors du chargement");
    } finally {
      setLoading(false);
    }
  };

  // Called from FrameworkEditDialog with the edited themes and (possibly) modified name
  const handleEditSave = (editedThemes: Theme[], editedName: string) => {
    setPendingEditThemes(editedThemes);
    setPendingEditName(editedName);
    setShowEditDialog(false);
    setShowNameModal(true);
  };

  const handleSave = async (confirmedName: string) => {
    if (!framework || !pendingEditThemes) return;
    setShowNameModal(false);
    setSaving(true);

    try {
      // Snapshot in background — don't block the save
      snapshotFramework(framework.id).catch((snapError) => {
        console.warn("Snapshot failed (background):", snapError);
      });

      // Optimized parallel + batched save
      await saveFrameworkChanges(framework.id, confirmedName, pendingEditThemes);

      toast.success("Référentiel sauvegardé avec succès");
      setPendingEditThemes(null);
      setFrameworkName(confirmedName);
      await fetchData();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error: unknown) {
      console.error("Error saving framework:", error);
      toast.error("Erreur lors de la sauvegarde");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (framework) {
      await snapshotFramework(framework.id);
      await supabase.from("themes").delete().eq("framework_id", framework.id);
      await supabase.from("competence_frameworks").delete().eq("id", framework.id);
    }
    setShowTemplateSelector(true);
  };

  const handleDeleteFramework = async () => {
    if (!framework) return;
    try {
      await snapshotFramework(framework.id);
      const { error } = await supabase
        .from("competence_frameworks")
        .update({ is_archived: true, archived_at: new Date().toISOString() })
        .eq("id", framework.id);

      if (error) throw error;

      setFramework(null);
      setThemes([]);
      setShowTemplateSelector(true);
      toast.success("Référentiel archivé — récupérable via l'historique");
    } catch (error: unknown) {
      console.error("Error archiving framework:", error);
      toast.error("Erreur lors de la suppression");
    }
  };

  const handleTemplateSelected = async () => {
    setShowTemplateSelector(false);
    toast.success("Référentiel importé avec succès");
    await fetchData();
    // Prevent fetchData from re-showing the selector if data isn't ready yet
    setShowTemplateSelector(false);
  };

  if (authLoading || loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      </AppLayout>
    );
  }

  if (!club) return null;

  if (showTemplateSelector) {
    return (
      <AppLayout>
        <ClubTemplateSelector
          clubId={clubId!}
          onSelected={handleTemplateSelected}
          onCancel={() => framework ? setShowTemplateSelector(false) : navigate(`/clubs/${clubId}`)}
        />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="pb-8">
        {/* Header card (titre + sous-titre + bandeau d'actions à gauche) */}
        <div className="mb-8 rounded-xl border border-border bg-card px-4 sm:px-6 py-5 shadow-sm">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-12 h-12 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0">
              <BookOpen className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="!text-2xl font-display font-bold truncate">{frameworkName || "Référentiel du Club"}</h1>
              <p className="text-muted-foreground mt-1 text-sm">
                {club.name} • Modèle du club • {themes.length} thématique{themes.length > 1 ? "s" : ""} • {themes.reduce((acc, t) => acc + t.skills.length, 0)} compétence{themes.reduce((acc, t) => acc + t.skills.length, 0) > 1 ? "s" : ""}
              </p>
            </div>
            {framework && (
              <Button variant="outline" size="sm" onClick={() => handlePrint()} className="flex-shrink-0">
                <Printer className="w-4 h-4 mr-2 text-orange-500" />
                Imprimer
              </Button>
            )}
          </div>

          {framework && canEdit && (
            <div className="mt-4 rounded-lg border border-border bg-muted/30 px-3 py-2 inline-flex max-w-full">
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowEditConfirm(true)}>
                  <Pencil className="w-4 h-4 mr-2 text-orange-500" />
                  Modifier
                </Button>
                <Button variant="outline" size="sm" onClick={() => setShowHistory(true)}>
                  <History className="w-4 h-4 mr-2 text-orange-500" />
                  Historique
                </Button>
                {true && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
                        <RotateCcw className="w-4 h-4 mr-2 text-destructive" />
                        Supprimer
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Supprimer le référentiel du club ?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Le référentiel actuel sera archivé et pourra être restauré depuis l'historique des versions.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Annuler</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteFramework} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                          Supprimer
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Read-only Framework View */}
        {themes.length > 0 ? (
          <ReadOnlyFrameworkView themes={themes} />
        ) : (
          <div className="flex flex-col items-center justify-center h-48 glass-card">
            <FileQuestion className="w-12 h-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium text-muted-foreground">Référentiel vide</h3>
            <p className="text-sm text-muted-foreground">
              {canEdit ? "Cliquez sur « Modifier » pour configurer le référentiel" : "L'administrateur doit configurer le référentiel"}
            </p>
          </div>
        )}
      </div>

      {/* Edit confirmation dialog */}
      <AlertDialog open={showEditConfirm} onOpenChange={setShowEditConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Modifier le référentiel ?</AlertDialogTitle>
            <AlertDialogDescription>
              Vous allez entrer en mode modification. Les changements ne seront appliqués qu'après sauvegarde.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setShowEditConfirm(false); setShowEditDialog(true); }}>
              Commencer la modification
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Dialog */}
      <FrameworkEditDialog
        open={showEditDialog}
        themes={themes}
        frameworkName={frameworkName}
        saving={saving}
        onSave={handleEditSave}
        onCancel={() => setShowEditDialog(false)}
      />

      <FrameworkNameModal
        open={showNameModal}
        onOpenChange={(open) => {
          setShowNameModal(open);
          if (!open && pendingEditThemes) {
            // User cancelled the name modal, reopen edit dialog
            setShowEditDialog(true);
            setPendingEditThemes(null);
          }
        }}
        currentName={pendingEditName || frameworkName}
        onConfirm={handleSave}
        saving={saving}
      />

      <FrameworkHistorySheet
        open={showHistory}
        onOpenChange={setShowHistory}
        entityId={clubId!}
        entityType="club"
        activeFrameworkId={framework?.id || null}
        onRestored={() => fetchData()}
      />

      {/* Hidden printable component */}
      <div style={{ position: "fixed", left: "-9999px", top: 0 }}>
        <PrintableFramework
          ref={printRef}
          frameworkName={frameworkName}
          teamName="Modèle du club"
          clubName={club?.name || ""}
          clubLogoUrl={club?.logo_url}
          themes={themes}
        />
      </div>
    </AppLayout>
  );
}
