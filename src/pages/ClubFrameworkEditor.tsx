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
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  BookOpen,
  FileQuestion,
  History,
  RotateCcw,
  Printer,
  Pencil,
  Plus,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  AUDIENCE_OPTIONS,
  audienceFromSelect,
  audienceLabel,
  audienceToSelect,
  type FrameworkAudience,
} from "@/lib/framework-audience";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ClubTemplateSelector } from "@/components/framework/ClubTemplateSelector";
import { FrameworkHistorySheet } from "@/components/framework/FrameworkHistorySheet";
import { ProFeatureLock } from "@/components/subscription/ProFeatureLock";
import { usePlan } from "@/hooks/usePlan";
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
  model_key: string;
  audience: string | null;
}

/** Ouverture du sélecteur de source : nouveau modèle ou réinitialisation. */
interface SelectorState {
  targetModelKey?: string;
  audience: FrameworkAudience;
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
  const { canDo, loading: planLoading } = usePlan();
  const canVersionFramework = planLoading ? true : canDo("can_version_framework");

  const [searchParams, setSearchParams] = useSearchParams();
  const selectedModelKey = searchParams.get("model");
  const [club, setClub] = useState<Club | null>(null);
  // Un club peut avoir plusieurs modèles (adultes, jeunes…) : version active de chacun.
  const [models, setModels] = useState<Framework[]>([]);
  const [framework, setFramework] = useState<Framework | null>(null);
  const [selector, setSelector] = useState<SelectorState | null>(null);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [frameworkName, setFrameworkName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
  }, [user, clubId, selectedModelKey]);

  const selectModel = (modelKey: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (modelKey) next.set("model", modelKey);
    else next.delete("model");
    setSearchParams(next, { replace: true });
  };

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

      const { data: modelsData, error: modelsError } = await supabase
        .from("competence_frameworks")
        .select("id, name, club_id, is_template, model_key, audience")
        .eq("club_id", clubId)
        .is("team_id", null)
        .eq("is_template", true)
        .eq("is_archived", false)
        .order("created_at", { ascending: true });
      if (modelsError) throw modelsError;
      const activeModels = (modelsData ?? []) as Framework[];
      setModels(activeModels);

      const frameworkData =
        activeModels.find((m) => m.model_key === selectedModelKey) ?? activeModels[0] ?? null;

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
        setFramework(null);
        setThemes([]);
        setSelector({ audience: null });
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

    // Ne sauvegarder/versionner que si l'utilisateur a réellement modifié
    const stripThemes = (ts: Theme[]) =>
      JSON.stringify(
        ts.map(({ isNew, skills, ...t }) => ({
          ...t,
          skills: skills.map(({ isNew: _i, ...s }) => s),
        }))
      );
    const themesUnchanged = stripThemes(pendingEditThemes) === stripThemes(themes);
    const nameUnchanged = confirmedName.trim() === frameworkName.trim();
    if (themesUnchanged && nameUnchanged) {
      toast.info("Aucune modification à enregistrer");
      setPendingEditThemes(null);
      return;
    }

    setSaving(true);

    try {
      // The RPC archives the current framework and creates a fresh active version.
      const saved = await saveFrameworkChanges(framework.id, confirmedName, pendingEditThemes);

      toast.success("Référentiel sauvegardé avec succès");
      setPendingEditThemes(null);
      if (saved) {
        const { themes: savedThemes, ...savedFramework } = saved;
        const savedModel = savedFramework as unknown as Framework;
        setFramework(savedModel);
        // Nouvelle version active du même modèle : nouvel id dans la liste.
        setModels((prev) => prev.map((m) => (m.model_key === savedModel.model_key ? savedModel : m)));
        setFrameworkName(savedFramework.name);
        setThemes(savedThemes as Theme[]);
      } else {
        setFrameworkName(confirmedName);
        await fetchData();
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error: unknown) {
      console.error("Error saving framework:", error);
      toast.error("Erreur lors de la sauvegarde");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteFramework = async () => {
    if (!framework) return;
    try {
      const { error } = await supabase
        .from("competence_frameworks")
        .update({ is_archived: true, archived_at: new Date().toISOString() })
        .eq("id", framework.id);

      if (error) throw error;

      toast.success("Modèle archivé — récupérable via l'historique");
      const remaining = models.filter((m) => m.id !== framework.id);
      if (remaining.length > 0) {
        // Un autre modèle reste actif : on l'affiche.
        selectModel(remaining[0].model_key);
        if (remaining[0].model_key === selectedModelKey) await fetchData();
      } else {
        setFramework(null);
        setThemes([]);
        setModels([]);
        setSelector({ audience: null });
      }
    } catch (error: unknown) {
      console.error("Error archiving framework:", error);
      toast.error("Erreur lors de la suppression");
    }
  };

  const handleAudienceChange = async (value: string) => {
    if (!framework) return;
    const audience = audienceFromSelect(value);
    const { error } = await supabase
      .from("competence_frameworks")
      .update({ audience })
      .eq("id", framework.id);
    if (error) {
      toast.error("Le public visé n'a pas pu être enregistré");
      return;
    }
    setFramework({ ...framework, audience });
    setModels((prev) => prev.map((m) => (m.id === framework.id ? { ...m, audience } : m)));
  };

  const handleTemplateSelected = async (frameworkId?: string) => {
    setSelector(null);
    toast.success("Référentiel importé avec succès");
    let key: string | null = null;
    if (frameworkId) {
      const { data } = await supabase
        .from("competence_frameworks")
        .select("model_key")
        .eq("id", frameworkId)
        .maybeSingle();
      key = data?.model_key ?? null;
    }
    if (key && key !== selectedModelKey) selectModel(key);
    else await fetchData();
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

  if (selector && canEdit) {
    return (
      <AppLayout>
        <ClubTemplateSelector
          clubId={clubId!}
          onSelected={handleTemplateSelected}
          onCancel={() => (framework ? setSelector(null) : navigate(`/clubs/${clubId}`))}
          targetModelKey={selector.targetModelKey}
          initialAudience={selector.audience}
          hasOtherModels={models.length > 0}
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
                {club.name} • Modèle du club
                {framework ? ` (${audienceLabel(framework.audience).toLowerCase()})` : ""} • {themes.length} thématique{themes.length > 1 ? "s" : ""} • {themes.reduce((acc, t) => acc + t.skills.length, 0)} compétence{themes.reduce((acc, t) => acc + t.skills.length, 0) > 1 ? "s" : ""}
              </p>
            </div>
            {framework && (
              <Button variant="outline" size="sm" onClick={() => handlePrint()} className="flex-shrink-0">
                <Printer className="w-4 h-4 mr-2 text-orange-500" />
                Imprimer
              </Button>
            )}
          </div>

          {/* Modèles du club : un par public (adultes, jeunes…) */}
          {(models.length > 1 || canEdit) && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {models.map((m) => (
                <Button
                  key={m.id}
                  variant={m.id === framework?.id ? "default" : "outline"}
                  size="sm"
                  className="max-w-full"
                  onClick={() => selectModel(m.model_key)}
                >
                  <span className="truncate">{m.name}</span>
                  <Badge variant="secondary" className="ml-2 shrink-0">
                    {audienceLabel(m.audience)}
                  </Badge>
                </Button>
              ))}
              {canEdit && (
                <Button variant="outline" size="sm" onClick={() => setSelector({ audience: null })}>
                  <Plus className="w-4 h-4 mr-1" />
                  Nouveau modèle
                </Button>
              )}
            </div>
          )}

          {framework && canEdit && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">Public visé :</span>
              <Select value={audienceToSelect(framework.audience)} onValueChange={handleAudienceChange}>
                <SelectTrigger className="h-8 w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AUDIENCE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {framework && canEdit && (
            <div className="mt-4 rounded-lg border border-border bg-muted/30 px-3 py-2 inline-flex max-w-full">
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowEditConfirm(true)}>
                  <Pencil className="w-4 h-4 mr-2 text-orange-500" />
                  Modifier
                </Button>
                <ProFeatureLock
                  locked={!canVersionFramework}
                  label="Historique des versions réservé au plan Pro"
                >
                  <Button variant="outline" size="sm" onClick={() => setShowHistory(true)}>
                    <History className="w-4 h-4 mr-2 text-orange-500" />
                    Historique
                  </Button>
                </ProFeatureLock>
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
                        <AlertDialogTitle>Supprimer ce modèle de référentiel ?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Le référentiel <strong>{frameworkName}</strong> et ses{" "}
                          <strong>{themes.length} thématique{themes.length > 1 ? "s" : ""}</strong>{" "}
                          /{" "}
                          <strong>
                            {themes.reduce((acc, t) => acc + t.skills.length, 0)} compétence
                            {themes.reduce((acc, t) => acc + t.skills.length, 0) > 1 ? "s" : ""}
                          </strong>{" "}
                          seront archivés. Les référentiels déjà copiés dans les équipes ne changent pas.
                          Vous pourrez le restaurer depuis la fiche du club (« Nouveau modèle » ›
                          « Restaurer depuis l'historique »).
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
        modelKey={framework?.model_key ?? null}
        activeFrameworkId={framework?.id || null}
        onRestored={() => fetchData()}
      />

      {/* Hidden printable component */}
      <div style={{ position: "fixed", left: "-9999px", top: 0 }}>
        <PrintableFramework
          ref={printRef}
          frameworkName={frameworkName}
          teamName={`Modèle du club — ${audienceLabel(framework?.audience)}`}
          clubName={club?.name || ""}
          clubLogoUrl={club?.logo_url}
          themes={themes}
        />
      </div>
    </AppLayout>
  );
}
