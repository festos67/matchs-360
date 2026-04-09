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
      setThemes(prev => arrayMove(prev, oldIndex, newIndex).map((t, i) => ({ ...t, order_index: i })));
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
    setThemes(prev => [...prev, newTheme]);
    setHasChanges(true);
    setTimeout(() => newThemeInputRef.current?.focus(), 100);
  };

  const handleUpdateTheme = (themeId: string, updates: Partial<Theme>) => {
    setThemes(prev => prev.map(t => t.id === themeId ? { ...t, ...updates } : t));
    setHasChanges(true);
  };

  const handleDeleteTheme = (themeId: string) => {
    setThemes(prev => prev.filter(t => t.id !== themeId));
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
    setThemes(prev => prev.map(t =>
      t.id === themeId ? { ...t, skills: [...t.skills, newSkill] } : t
    ));
    setHasChanges(true);
    setTimeout(() => newSkillInputRefs.current[newSkill.id]?.focus(), 100);
  };

  const handleUpdateSkill = (themeId: string, skillId: string, updates: Partial<Skill>) => {
    setThemes(prev => prev.map(t =>
      t.id === themeId
        ? { ...t, skills: t.skills.map(s => s.id === skillId ? { ...s, ...updates } : s) }
        : t
    ));
    setHasChanges(true);
  };

  const handleDeleteSkill = (themeId: string, skillId: string) => {
    setThemes(prev => prev.map(t =>
      t.id === themeId ? { ...t, skills: t.skills.filter(s => s.id !== skillId) } : t
    ));
    setHasChanges(true);
  };

  const handleReorderSkills = (themeId: string, oldIndex: number, newIndex: number) => {
    setThemes(prev => prev.map(t => {
      if (t.id !== themeId) return t;
      const newSkills = arrayMove(t.skills, oldIndex, newIndex).map((s, i) => ({ ...s, order_index: i }));
      return { ...t, skills: newSkills };
    }));
    setHasChanges(true);
  };

  const handleUndo = () => {
    setThemes(JSON.parse(JSON.stringify(savedSnapshot)));
    setHasChanges(false);
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
                Annuler les modifications
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

          {/* Sticky bottom bar */}
          <div className="border-t border-border bg-muted/30 px-6 py-3 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {hasChanges ? (
                <span className="text-amber-500 font-medium">● Modifications non sauvegardées</span>
              ) : (
                <span className="text-emerald-500">● Aucune modification</span>
              )}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={handleRequestClose}
                disabled={saving}
              >
                Annuler
              </Button>
              <Button
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
