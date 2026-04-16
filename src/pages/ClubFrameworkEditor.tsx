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
}

export default function ClubFrameworkEditor() {
  const { clubId } = useParams<{ clubId: string }>();
  const { user, loading: authLoading, hasAdminRole: isAdmin, roles } = useAuth();
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
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: frameworkName || "Référentiel du Club",
  });

  const isClubAdmin = club ? roles.some(r => r.role === "club_admin" && r.club_id === club.id) : false;
  const canEdit = isAdmin || isClubAdmin;

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

  // Called from FrameworkEditDialog with the edited themes
  const handleEditSave = (editedThemes: Theme[]) => {
    setPendingEditThemes(editedThemes);
    setShowEditDialog(false);
    setShowNameModal(true);
  };

  const handleSave = async (confirmedName: string) => {
    if (!framework || !pendingEditThemes) return;
    setShowNameModal(false);
    setSaving(true);

    try {
      try {
        await snapshotFramework(framework.id);
      } catch (snapError) {
        console.warn("Snapshot failed, continuing save:", snapError);
      }

      const { error: fwError } = await supabase
        .from("competence_frameworks")
        .update({ name: confirmedName })
        .eq("id", framework.id);

      if (fwError) throw fwError;

      const allPersistedThemeIds: string[] = [];

      for (const theme of pendingEditThemes) {
        if (theme.isNew) {
          const { data: newTheme, error } = await supabase
            .from("themes")
            .insert({
              framework_id: framework.id,
              name: theme.name,
              color: theme.color,
              order_index: theme.order_index,
            })
            .select()
            .single();

          if (error) throw error;
          allPersistedThemeIds.push(newTheme.id);

          if (theme.skills.length > 0) {
            const skillsToInsert = theme.skills.map(s => ({
              theme_id: newTheme.id,
              name: s.name,
              definition: s.definition,
              order_index: s.order_index,
            }));
            const { error: skillsError } = await supabase.from("skills").insert(skillsToInsert);
            if (skillsError) throw skillsError;
          }
        } else {
          allPersistedThemeIds.push(theme.id);

          const { error: themeError } = await supabase
            .from("themes")
            .update({
              name: theme.name,
              color: theme.color,
              order_index: theme.order_index,
            })
            .eq("id", theme.id);

          if (themeError) throw themeError;

          const persistedSkillIds: string[] = [];

          for (const skill of theme.skills) {
            if (skill.isNew) {
              const { data: insertedSkill, error: insertError } = await supabase
                .from("skills")
                .insert({
                  theme_id: theme.id,
                  name: skill.name,
                  definition: skill.definition,
                  order_index: skill.order_index,
                })
                .select("id")
                .single();

              if (insertError) throw insertError;
              if (insertedSkill?.id) persistedSkillIds.push(insertedSkill.id);
            } else {
              const { error: updateError } = await supabase
                .from("skills")
                .update({
                  name: skill.name,
                  definition: skill.definition,
                  order_index: skill.order_index,
                })
                .eq("id", skill.id);

              if (updateError) throw updateError;
              persistedSkillIds.push(skill.id);
            }
          }

          if (persistedSkillIds.length > 0) {
            await supabase
              .from("skills")
              .delete()
              .eq("theme_id", theme.id)
              .not("id", "in", `(${persistedSkillIds.join(",")})`);
          } else {
            await supabase
              .from("skills")
              .delete()
              .eq("theme_id", theme.id);
          }
        }
      }

      if (allPersistedThemeIds.length > 0) {
        await supabase
          .from("themes")
          .delete()
          .eq("framework_id", framework.id)
          .not("id", "in", `(${allPersistedThemeIds.join(",")})`);
      }

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
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4 flex-1 min-w-0">
            <div className="w-12 h-12 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0">
              <BookOpen className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="!text-2xl font-display font-bold">{frameworkName || "Référentiel du Club"}</h1>
              <p className="text-muted-foreground mt-1">
                {club.name} • Modèle du club • {themes.length} thématique{themes.length > 1 ? "s" : ""} • {themes.reduce((acc, t) => acc + t.skills.length, 0)} compétence{themes.reduce((acc, t) => acc + t.skills.length, 0) > 1 ? "s" : ""}
              </p>
            </div>
          </div>
          {framework && (
            <div className="flex items-center gap-2">
              {canEdit && (
                <Button variant="outline" size="sm" onClick={() => setShowEditConfirm(true)}>
                  <Pencil className="w-4 h-4 mr-2" />
                  Modifier
                </Button>
              )}
              {canEdit && (
                <Button variant="outline" size="sm" onClick={() => setShowHistory(true)}>
                  <History className="w-4 h-4 mr-2" />
                  Historique
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => handlePrint()}>
                <Printer className="w-4 h-4 mr-2" />
                Imprimer
              </Button>
              {canEdit && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
                      <RotateCcw className="w-4 h-4 mr-2" />
                      Réinitialiser
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Réinitialiser le référentiel du club ?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Le référentiel actuel sera archivé et pourra être restauré depuis l'historique des versions.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Annuler</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDeleteFramework} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                        Réinitialiser
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
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
        currentName={frameworkName}
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
          themes={themes}
        />
      </div>
    </AppLayout>
  );
}
