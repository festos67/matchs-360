/**
 * @page FrameworkEditor
 * @route /teams/:teamId/framework
 *
 * Éditeur du référentiel d'une équipe avec drag-drop des thèmes/compétences.
 * (mem://features/framework-editor-interaction)
 *
 * @description
 * Permet de réorganiser, ajouter, modifier ou supprimer thèmes et compétences
 * d'un framework d'équipe. Le drag-drop est géré par dnd-kit et persiste
 * `order_index` à la BD.
 *
 * @features
 * - DnD thèmes (SortableTheme) et compétences (SortableSkill)
 * - Tooltip pour la définition d'une compétence
 * - Popover d'édition rapide (nom + définition)
 * - Color picker grille 10 couleurs pour les thèmes
 *   (mem://style/ui-patterns/color-picker)
 * - Sauvegarde explicite + génération de snapshot
 *
 * @access
 * - Coach Référent / Club Admin / Admin : édition complète
 * - Coach Assistant / Joueur / Supporter : lecture seule (page bloquée)
 *
 * @maintenance
 * - Les snapshots sont créés à chaque save pour préserver l'historique des
 *   évaluations passées (mem://technical/framework-snapshot-system)
 * - Les anciennes versions de framework sont en lecture seule
 *   (mem://features/framework-lifecycle-management)
 */
import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
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
} from "@dnd-kit/sortable";
import {
  ArrowLeft,
  Save,
  RotateCcw,
  Plus,
  FileText,
  BookOpen,
  Building2,
  Users,
  FileQuestion,
  History,
  Printer,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { SortableTheme } from "@/components/framework/SortableTheme";
import { TemplateSelector } from "@/components/framework/TemplateSelector";
import { FrameworkHistorySheet } from "@/components/framework/FrameworkHistorySheet";
import { snapshotFramework } from "@/lib/framework-snapshot";
import { saveFrameworkChanges } from "@/lib/framework-save";
import { FrameworkNameModal } from "@/components/modals/FrameworkNameModal";
import { PrintableFramework } from "@/components/framework/PrintableFramework";
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
  team_id: string | null;
  is_template: boolean;
}

interface Team {
  id: string;
  name: string;
  club_id: string;
  club?: { name: string; logo_url?: string | null };
}

export default function FrameworkEditor() {
  const { teamId } = useParams<{ teamId: string }>();
  const { user, loading: authLoading, hasAdminRole: isAdmin, roles } = useAuth();
  const navigate = useNavigate();

  const [team, setTeam] = useState<Team | null>(null);
  const [framework, setFramework] = useState<Framework | null>(null);
  const [themes, setThemes] = useState<Theme[]>([]);
  const [frameworkName, setFrameworkName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showNameModal, setShowNameModal] = useState(false);

  const newThemeInputRef = useRef<HTMLInputElement>(null);
  const printRef = useRef<HTMLDivElement>(null);
  const newSkillInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

  // Check permissions
  const isClubAdmin = team ? roles.some(r => r.role === "club_admin" && r.club_id === team.club_id) : false;
  const isReferentCoach = false; // Will be checked from team_members
  const [canEdit, setCanEdit] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user && teamId) {
      fetchData();
      checkPermissions();
    }
  }, [user, teamId]);

  const checkPermissions = async () => {
    if (!teamId || !user) return;
    
    // Check if user is referent coach
    const { data: membership } = await supabase
      .from("team_members")
      .select("coach_role")
      .eq("team_id", teamId)
      .eq("user_id", user.id)
      .eq("member_type", "coach")
      .eq("is_active", true)
      .maybeSingle();

    const isReferent = membership?.coach_role === "referent";
    setCanEdit(isAdmin || isClubAdmin || isReferent);
  };

  const fetchData = async () => {
    try {
      // Fetch team
      const { data: teamData, error: teamError } = await supabase
        .from("teams")
        .select("*, club:clubs(name)")
        .eq("id", teamId)
        .maybeSingle();

      if (teamError) throw teamError;
      if (!teamData) {
        toast.error("Équipe non trouvée");
        navigate("/clubs");
        return;
      }
      setTeam(teamData);

      // Fetch active framework (not archived)
      const { data: frameworkData } = await supabase
        .from("competence_frameworks")
        .select("*")
        .eq("team_id", teamId)
        .eq("is_archived", false)
        .maybeSingle();

      if (frameworkData) {
        setFramework(frameworkData);
        setFrameworkName(frameworkData.name);
        // Fetch themes with skills
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
    } catch (error: any) {
      console.error("Error fetching data:", error);
      toast.error("Erreur lors du chargement");
    } finally {
      setLoading(false);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = themes.findIndex(t => t.id === active.id);
    const newIndex = themes.findIndex(t => t.id === over.id);

    if (oldIndex !== -1 && newIndex !== -1) {
      const newThemes = arrayMove(themes, oldIndex, newIndex).map((t, i) => ({
        ...t,
        order_index: i,
      }));
      setThemes(newThemes);
      setHasChanges(true);
    }
  };

  const handleAddTheme = () => {
    const newTheme: Theme = {
      id: `new-${Date.now()}`,
      name: "",
      color: "#3B82F6",
      order_index: themes.length,
      skills: [],
      isNew: true,
    };
    setThemes([...themes, newTheme]);
    setHasChanges(true);
    
    setTimeout(() => {
      newThemeInputRef.current?.focus();
    }, 100);
  };

  const handleUpdateTheme = (themeId: string, updates: Partial<Theme>) => {
    setThemes(themes.map(t => t.id === themeId ? { ...t, ...updates } : t));
    setHasChanges(true);
  };

  const handleDeleteTheme = (themeId: string) => {
    setThemes(themes.filter(t => t.id !== themeId));
    setHasChanges(true);
  };

  const handleAddSkill = (themeId: string) => {
    const theme = themes.find(t => t.id === themeId);
    if (!theme) return;

    const newSkill: Skill = {
      id: `new-skill-${Date.now()}`,
      name: "",
      definition: null,
      order_index: theme.skills.length,
      isNew: true,
    };

    setThemes(themes.map(t => 
      t.id === themeId 
        ? { ...t, skills: [...t.skills, newSkill] }
        : t
    ));
    setHasChanges(true);

    setTimeout(() => {
      newSkillInputRefs.current[newSkill.id]?.focus();
    }, 100);
  };

  const handleUpdateSkill = (themeId: string, skillId: string, updates: Partial<Skill>) => {
    setThemes(themes.map(t => 
      t.id === themeId 
        ? { ...t, skills: t.skills.map(s => s.id === skillId ? { ...s, ...updates } : s) }
        : t
    ));
    setHasChanges(true);
  };

  const handleDeleteSkill = (themeId: string, skillId: string) => {
    setThemes(themes.map(t => 
      t.id === themeId 
        ? { ...t, skills: t.skills.filter(s => s.id !== skillId) }
        : t
    ));
    setHasChanges(true);
  };

  const handleReorderSkills = (themeId: string, oldIndex: number, newIndex: number) => {
    setThemes(themes.map(t => {
      if (t.id !== themeId) return t;
      const newSkills = arrayMove(t.skills, oldIndex, newIndex).map((s, i) => ({
        ...s,
        order_index: i,
      }));
      return { ...t, skills: newSkills };
    }));
    setHasChanges(true);
  };

  const handleSave = async (confirmedName: string) => {
    if (!framework) return;
    setFrameworkName(confirmedName);
    setShowNameModal(false);
    setSaving(true);

    try {
      // Snapshot current state before saving changes (non-blocking)
      try {
        await snapshotFramework(framework.id);
      } catch (snapError) {
        console.warn("Snapshot failed, continuing save:", snapError);
      }

      // Update framework name
      const { error: fwError } = await supabase
        .from("competence_frameworks")
        .update({ name: confirmedName })
        .eq("id", framework.id);

      if (fwError) throw fwError;

      // Track all persisted theme IDs (existing + newly created) for cleanup
      const allPersistedThemeIds: string[] = [];

      // Save themes
      for (const theme of themes) {
        if (theme.isNew) {
          // Create new theme
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

          // Create skills for new theme
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

          // Update existing theme
          const { error: themeError } = await supabase
            .from("themes")
            .update({
              name: theme.name,
              color: theme.color,
              order_index: theme.order_index,
            })
            .eq("id", theme.id);

          if (themeError) throw themeError;

          // Handle skills
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

          // Delete removed skills from this theme
          if (persistedSkillIds.length > 0) {
            await supabase
              .from("skills")
              .delete()
              .eq("theme_id", theme.id)
              .not("id", "in", `(${persistedSkillIds.join(",")})`);
          } else {
            // If none exist, delete all existing skills for this theme
            await supabase
              .from("skills")
              .delete()
              .eq("theme_id", theme.id);
          }
        }
      }

      // Delete removed themes - uses ALL persisted IDs (existing + new)
      if (allPersistedThemeIds.length > 0) {
        await supabase
          .from("themes")
          .delete()
          .eq("framework_id", framework.id)
          .not("id", "in", `(${allPersistedThemeIds.join(",")})`);
      }

      toast.success("Référentiel sauvegardé avec succès");
      setHasChanges(false);
      fetchData(); // Refresh to get actual IDs
    } catch (error: any) {
      console.error("Error saving framework:", error);
      toast.error("Erreur lors de la sauvegarde");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (framework) {
      await snapshotFramework(framework.id);
      await supabase
        .from("themes")
        .delete()
        .eq("framework_id", framework.id);
      await supabase
        .from("competence_frameworks")
        .delete()
        .eq("id", framework.id);
    }
    setShowTemplateSelector(true);
  };

  const handleTemplateSelected = async () => {
    toast.success("Référentiel importé avec succès");
    // Redirect back to team detail and open the edit dialog for review
    navigate(`/teams/${teamId}?tab=indicateurs&editFramework=true`);
  };

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: frameworkName || "Référentiel",
  });

  if (authLoading || loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      </AppLayout>
    );
  }

  if (!team) return null;

  if (showTemplateSelector) {
    return (
      <AppLayout>
        <Button variant="ghost" className="mb-6 -ml-2" onClick={() => navigate(`/teams/${teamId}`)}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Retour à l'équipe
        </Button>

        <TemplateSelector
          teamId={teamId!}
          clubId={team.club_id}
          onSelected={handleTemplateSelected}
          onCancel={() => framework ? setShowTemplateSelector(false) : navigate(`/teams/${teamId}`)}
        />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="pb-20">
        <Button variant="ghost" className="-ml-2 mb-4" onClick={() => navigate(`/teams/${teamId}`)}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Retour
        </Button>

        {/* Header card (titre + sous-titre + bandeau d'actions à gauche) */}
        <div className="mb-6 rounded-xl border border-border bg-card px-4 sm:px-6 py-5 shadow-sm">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-12 h-12 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0">
              <FileText className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              {canEdit ? (
                <Input
                  value={frameworkName}
                  onChange={(e) => { setFrameworkName(e.target.value); setHasChanges(true); }}
                  placeholder="Nom du référentiel"
                  className="!text-2xl font-display font-bold h-auto py-1 border-transparent hover:border-input focus:border-input bg-transparent"
                />
              ) : (
                <h1 className="!text-2xl font-display font-bold truncate">{frameworkName || "Référentiel"}</h1>
              )}
              <p className="text-muted-foreground text-sm mt-1">
                {team.name} • {team.club?.name} • {themes.length} thématique{themes.length > 1 ? "s" : ""} • {themes.reduce((acc, t) => acc + t.skills.length, 0)} compétence{themes.reduce((acc, t) => acc + t.skills.length, 0) > 1 ? "s" : ""}
              </p>
            </div>
          </div>

          {framework && (
            <div className="mt-4 rounded-lg border border-border bg-muted/30 px-3 py-2 inline-flex max-w-full">
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={handlePrint}>
                  <Printer className="w-4 h-4 mr-2 text-orange-500" />
                  Imprimer
                </Button>
                {canEdit && (
                  <Button variant="outline" size="sm" onClick={() => setShowHistory(true)}>
                    <History className="w-4 h-4 mr-2 text-orange-500" />
                    Historique
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="glass-card p-4">
            <p className="text-3xl font-display font-bold text-primary">{themes.length}</p>
            <p className="text-sm text-muted-foreground">Thématiques</p>
          </div>
          <div className="glass-card p-4">
            <p className="text-3xl font-display font-bold">
              {themes.reduce((acc, t) => acc + t.skills.length, 0)}
            </p>
            <p className="text-sm text-muted-foreground">Compétences</p>
          </div>
          <div className="glass-card p-4">
            <p className="text-3xl font-display font-bold text-success">
              {hasChanges ? "Non sauvegardé" : "À jour"}
            </p>
            <p className="text-sm text-muted-foreground">Statut</p>
          </div>
        </div>

        {/* Themes List */}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={themes.map(t => t.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-4">
              {themes.map((theme, index) => (
                <SortableTheme
                  key={theme.id}
                  theme={theme}
                  canEdit={canEdit}
                  isLast={index === themes.length - 1}
                  inputRef={theme.isNew ? newThemeInputRef : undefined}
                  skillInputRefs={newSkillInputRefs}
                  onUpdate={(updates) => handleUpdateTheme(theme.id, updates)}
                  onDelete={() => handleDeleteTheme(theme.id)}
                  onAddSkill={() => handleAddSkill(theme.id)}
                  onUpdateSkill={(skillId, updates) => handleUpdateSkill(theme.id, skillId, updates)}
                  onDeleteSkill={(skillId) => handleDeleteSkill(theme.id, skillId)}
                  onReorderSkills={(oldIndex, newIndex) => handleReorderSkills(theme.id, oldIndex, newIndex)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        {/* Add Theme Button */}
        {canEdit && (
          <Button
            variant="outline"
            className="w-full mt-6 h-14 border-dashed"
            onClick={handleAddTheme}
          >
            <Plus className="w-5 h-5 mr-2" />
            Ajouter une Thématique
          </Button>
        )}

        {themes.length === 0 && !canEdit && (
          <div className="flex flex-col items-center justify-center h-48 glass-card">
            <FileQuestion className="w-12 h-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium text-muted-foreground">Référentiel vide</h3>
            <p className="text-sm text-muted-foreground">
              Le coach référent doit configurer le référentiel
            </p>
          </div>
        )}
      </div>

      {/* Sticky Footer */}
      {canEdit && (
        <div className="fixed bottom-0 left-64 right-0 bg-background/95 backdrop-blur-sm border-t border-border shadow-lg z-40 max-md:left-0">
          <div className="max-w-4xl mx-auto px-4 py-3 flex gap-3 justify-end">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" disabled={saving}>
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Réinitialiser
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Réinitialiser le référentiel ?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Le référentiel actuel sera archivé et pourra être restauré depuis l'historique des versions. Vous pourrez ensuite choisir un nouveau modèle.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annuler</AlertDialogCancel>
                  <AlertDialogAction onClick={handleReset}>
                    Réinitialiser
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button onClick={() => setShowNameModal(true)} disabled={saving || themes.length === 0}>
              {saving ? (
                <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin mr-2" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Sauvegarder
            </Button>
          </div>
        </div>
      )}

      <FrameworkNameModal
        open={showNameModal}
        onOpenChange={setShowNameModal}
        currentName={frameworkName}
        onConfirm={handleSave}
        saving={saving}
      />

      <FrameworkHistorySheet
        open={showHistory}
        onOpenChange={setShowHistory}
        entityId={teamId!}
        entityType="team"
        activeFrameworkId={framework?.id || null}
        onRestored={() => fetchData()}
      />

      {/* Hidden printable component */}
      <div style={{ position: "fixed", left: "-9999px", top: 0 }}>
        <PrintableFramework
          ref={printRef}
          frameworkName={frameworkName}
          teamName={team?.name || ""}
          clubName={team?.club?.name || ""}
          clubLogoUrl={team?.club?.logo_url}
          themes={themes}
        />
      </div>
    </AppLayout>
  );
}