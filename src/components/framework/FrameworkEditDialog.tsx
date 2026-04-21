/**
 * @component FrameworkEditDialog
 * @description Éditeur plein écran de référentiel de compétences avec drag-and-drop
 *              (@dnd-kit). Permet d'ajouter/réordonner thèmes et compétences,
 *              éditer définitions et couleurs.
 * @access Responsable Club (modèle club), Coach Référent (référentiel équipe), Super Admin
 * @features
 *  - DndContext avec PointerSensor + KeyboardSensor pour accessibilité
 *  - SortableTheme + SortableSkill (réorganisation drag-and-drop)
 *  - Édition inline des noms via Input, définitions via Textarea
 *  - Color picker 10-couleurs pour thèmes (mem://style/ui-patterns/color-picker)
 *  - Persistence atomique sur close (transaction batch)
 *  - Création snapshot JSONB lors de chaque save
 * @maintenance
 *  - Permissions édition : mem://logic/gestion-referentiels-permissions
 *  - Snapshot system : mem://technical/framework-snapshot-system
 *  - Cycle de vie : mem://features/framework-lifecycle-management
 *  - Interaction définitions : mem://features/framework-editor-interaction
 */
import { useState, useRef, useEffect, useCallback } from "react";
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
import { Save, Plus, Undo2, X, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SortableTheme } from "@/components/framework/SortableTheme";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
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

interface FrameworkEditDialogProps {
  open: boolean;
  themes: Theme[];
  frameworkName: string;
  saving: boolean;
  onSave: (themes: Theme[]) => void;
  onCancel: () => void;
}

export const FrameworkEditDialog = ({
  open,
  themes: initialThemes,
  frameworkName,
  saving,
  onSave,
  onCancel,
}: FrameworkEditDialogProps) => {
  const [themes, setThemes] = useState<Theme[]>([]);
  const [history, setHistory] = useState<Theme[][]>([]);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const newThemeInputRef = useRef<HTMLInputElement>(null);
  const newSkillInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});
  const overlayRef = useRef<HTMLDivElement>(null);

  const hasChanges = history.length > 0;

  // Initialize themes when dialog opens
  useEffect(() => {
    if (open) {
      const snapshot = JSON.parse(JSON.stringify(initialThemes));
      setThemes(snapshot);
      setHistory([]);
    }
  }, [open, initialThemes]);

  // Push current state to history before each mutation
  const pushHistory = useCallback(() => {
    setHistory(prev => [...prev, JSON.parse(JSON.stringify(themes))]);
  }, [themes]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = themes.findIndex(t => t.id === active.id);
    const newIndex = themes.findIndex(t => t.id === over.id);
    if (oldIndex !== -1 && newIndex !== -1) {
      pushHistory();
      setThemes(prev => arrayMove(prev, oldIndex, newIndex).map((t, i) => ({ ...t, order_index: i })));
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
    pushHistory();
    setThemes(prev => [...prev, newTheme]);
    setTimeout(() => newThemeInputRef.current?.focus(), 100);
  };

  const handleUpdateTheme = (themeId: string, updates: Partial<Theme>) => {
    pushHistory();
    setThemes(prev => prev.map(t => t.id === themeId ? { ...t, ...updates } : t));
  };

  const handleDeleteTheme = (themeId: string) => {
    pushHistory();
    setThemes(prev => prev.filter(t => t.id !== themeId));
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
    pushHistory();
    setThemes(prev => prev.map(t =>
      t.id === themeId ? { ...t, skills: [...t.skills, newSkill] } : t
    ));
    setTimeout(() => newSkillInputRefs.current[newSkill.id]?.focus(), 100);
  };

  const handleUpdateSkill = (themeId: string, skillId: string, updates: Partial<Skill>) => {
    pushHistory();
    setThemes(prev => prev.map(t =>
      t.id === themeId
        ? { ...t, skills: t.skills.map(s => s.id === skillId ? { ...s, ...updates } : s) }
        : t
    ));
  };

  const handleDeleteSkill = (themeId: string, skillId: string) => {
    pushHistory();
    setThemes(prev => prev.map(t =>
      t.id === themeId ? { ...t, skills: t.skills.filter(s => s.id !== skillId) } : t
    ));
  };

  const handleReorderSkills = (themeId: string, oldIndex: number, newIndex: number) => {
    pushHistory();
    setThemes(prev => prev.map(t => {
      if (t.id !== themeId) return t;
      const newSkills = arrayMove(t.skills, oldIndex, newIndex).map((s, i) => ({ ...s, order_index: i }));
      return { ...t, skills: newSkills };
    }));
  };

  const handleUndo = () => {
    if (history.length === 0) return;
    const previousState = history[history.length - 1];
    setThemes(previousState);
    setHistory(prev => prev.slice(0, -1));
  };

  const handleRequestClose = useCallback(() => {
    if (hasChanges) {
      setShowExitConfirm(true);
    } else {
      onCancel();
    }
  }, [hasChanges, onCancel]);

  const handleSaveAndClose = () => {
    setShowExitConfirm(false);
    onSave(themes);
  };

  const handleDiscardAndClose = () => {
    setShowExitConfirm(false);
    onCancel();
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) {
      handleRequestClose();
    }
  };

  if (!open) return null;

  return (
    <>
      {/* Full-screen overlay */}
      <div
        ref={overlayRef}
        className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm"
        onClick={handleOverlayClick}
      >
        <div className="fixed inset-4 md:inset-8 lg:inset-12 z-50 bg-background border border-border rounded-xl shadow-2xl flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/30">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              <div>
                <h2 className="text-lg font-display font-bold">Mode modification</h2>
                <p className="text-sm text-muted-foreground">{frameworkName}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleUndo}
                disabled={!hasChanges || saving}
              >
                <Undo2 className="w-4 h-4 mr-2" />
                Annuler dernière modification
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRequestClose}
                disabled={saving}
              >
                <X className="w-4 h-4 mr-2" />
                Annuler
              </Button>
              <Button
                size="sm"
                onClick={() => onSave(themes)}
                disabled={saving || themes.length === 0}
              >
                {saving ? (
                  <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin mr-2" />
                ) : (
                  <Save className="w-4 h-4 mr-2" />
                )}
                Sauvegarder
              </Button>
            </div>
          </div>

          {/* Stats bar - sticky */}
          <div className="px-6 py-2 border-b border-border bg-muted/20 flex items-center gap-4 text-sm text-muted-foreground shrink-0">
            <span><strong className="text-foreground">{themes.length}</strong> thématique{themes.length > 1 ? "s" : ""}</span>
            <span>•</span>
            <span><strong className="text-foreground">{themes.reduce((acc, t) => acc + t.skills.length, 0)}</strong> compétence{themes.reduce((acc, t) => acc + t.skills.length, 0) > 1 ? "s" : ""}</span>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={themes.map(t => t.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-4 max-w-4xl mx-auto">
                  {themes.map((theme, index) => (
                    <SortableTheme
                      key={theme.id}
                      theme={theme}
                      canEdit={true}
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

            <div className="max-w-4xl mx-auto">
              <Button
                variant="outline"
                className="w-full mt-6 h-14 border-dashed"
                onClick={handleAddTheme}
              >
                <Plus className="w-5 h-5 mr-2" />
                Ajouter une Thématique
              </Button>
            </div>
          </div>

          {/* Sticky bottom status bar */}
          <div className="border-t border-border bg-muted/30 px-6 py-3">
            <p className="text-sm text-muted-foreground">
              {hasChanges ? (
                <span className="text-amber-500 font-medium">● Modifications non sauvegardées</span>
              ) : (
                <span className="text-emerald-500">● Aucune modification</span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Exit confirmation dialog */}
      <AlertDialog open={showExitConfirm} onOpenChange={setShowExitConfirm}>
        <AlertDialogContent className="z-[60]">
          <AlertDialogHeader>
            <AlertDialogTitle>Modifications non sauvegardées</AlertDialogTitle>
            <AlertDialogDescription>
              Vous avez des modifications en cours. Que souhaitez-vous faire ?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex gap-2 sm:gap-0">
            <AlertDialogCancel onClick={() => setShowExitConfirm(false)}>
              Continuer l'édition
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDiscardAndClose}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Quitter sans sauvegarder
            </AlertDialogAction>
            <AlertDialogAction onClick={handleSaveAndClose}>
              Sauvegarder et quitter
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
