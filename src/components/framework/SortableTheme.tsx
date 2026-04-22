/**
 * @component SortableTheme
 * @description Conteneur de thème drag-and-drop incluant ses compétences (DndContext
 *              imbriqué). Gère le réordonnancement local des skills et la suppression
 *              du thème complet.
 * @props
 *  - theme: Theme + skills
 *  - onUpdate / onDelete / onAddSkill
 * @features
 *  - Drag handle pour réordonner les thèmes (parent DndContext dans FrameworkEditDialog)
 *  - DndContext interne pour réordonner les skills enfants
 *  - Color picker 10-couleurs (mem://style/ui-patterns/color-picker)
 *  - Bouton ajout compétence + suppression thème avec confirmation
 *  - Refs externes pour autoscroll vers nouvelle compétence
 * @maintenance
 *  - Utilisé dans FrameworkEditDialog
 *  - Couleurs de thème : palette HSL définie dans lib/theme-palette
 */
import { useState, RefObject, MutableRefObject } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
  GripVertical,
  ChevronDown,
  ChevronRight,
  Trash2,
  Plus,
  Palette,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { THEME_PALETTE, THEME_PALETTE_LABELS } from "@/lib/theme-palette";
import { SortableSkill } from "./SortableSkill";

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

interface SortableThemeProps {
  theme: Theme;
  canEdit: boolean;
  isLast: boolean;
  inputRef?: RefObject<HTMLInputElement>;
  skillInputRefs: MutableRefObject<{ [key: string]: HTMLInputElement | null }>;
  onUpdate: (updates: Partial<Theme>) => void;
  onDelete: () => void;
  onAddSkill: () => void;
  onUpdateSkill: (skillId: string, updates: Partial<Skill>) => void;
  onDeleteSkill: (skillId: string) => void;
  onReorderSkills: (oldIndex: number, newIndex: number) => void;
}

export const SortableTheme = ({
  theme,
  canEdit,
  isLast,
  inputRef,
  skillInputRefs,
  onUpdate,
  onDelete,
  onAddSkill,
  onUpdateSkill,
  onDeleteSkill,
  onReorderSkills,
}: SortableThemeProps) => {
  const [isOpen, setIsOpen] = useState(true);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const currentColor = (theme.color || "#3B82F6").toUpperCase();

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: theme.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleSkillDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = theme.skills.findIndex(s => s.id === active.id);
    const newIndex = theme.skills.findIndex(s => s.id === over.id);

    if (oldIndex !== -1 && newIndex !== -1) {
      onReorderSkills(oldIndex, newIndex);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        borderColor: `${theme.color || "#3B82F6"}55`,
      }}
      className="overflow-hidden rounded-xl border-2 bg-card"
    >
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        {/* Header */}
        <div
          className="flex items-center gap-3 p-4 border-b"
          style={{
            backgroundColor: `${theme.color || "#3B82F6"}33`, // ~20% alpha
            borderBottomColor: `${theme.color || "#3B82F6"}55`,
            borderLeftWidth: 4,
            borderLeftColor: theme.color || "#3B82F6",
          }}
        >
          {canEdit && (
            <button
              className="cursor-grab active:cursor-grabbing p-1 rounded hover:bg-muted"
              {...attributes}
              {...listeners}
            >
              <GripVertical className="w-4 h-4 text-muted-foreground" />
            </button>
          )}

          <CollapsibleTrigger asChild>
            <button className="p-1 rounded hover:bg-muted">
              {isOpen ? (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              )}
            </button>
          </CollapsibleTrigger>

          {canEdit ? (
            <Input
              ref={inputRef}
              value={theme.name}
              onChange={(e) => onUpdate({ name: e.target.value })}
              placeholder="Nom de la thématique..."
              className="flex-1 border-transparent bg-transparent font-medium text-lg focus:bg-muted"
            />
          ) : (
            <span className="flex-1 font-medium text-lg">{theme.name}</span>
          )}

          <span className="text-sm text-muted-foreground">
            {theme.skills.length} compétence{theme.skills.length > 1 ? "s" : ""}
          </span>

          {canEdit && (
            <div className="flex items-center gap-1">
              <Popover open={showColorPicker} onOpenChange={setShowColorPicker}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label="Choisir la couleur de la thématique"
                    className="flex items-center gap-1.5 p-1.5 rounded-md hover:bg-muted transition-colors"
                  >
                    <span
                      className="w-5 h-5 rounded-full border border-border shadow-sm"
                      style={{ backgroundColor: currentColor }}
                    />
                    <Palette className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-3" align="end" side="bottom">
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">
                      Couleur de la thématique
                    </p>
                    <div className="grid grid-cols-5 gap-1.5">
                      {THEME_PALETTE.map((color) => {
                        const isActive = color.toUpperCase() === currentColor;
                        return (
                          <button
                            key={color}
                            type="button"
                            title={THEME_PALETTE_LABELS[color] || color}
                            aria-label={THEME_PALETTE_LABELS[color] || color}
                            aria-pressed={isActive}
                            onClick={() => {
                              onUpdate({ color });
                              setShowColorPicker(false);
                            }}
                            className={`w-8 h-8 rounded-md flex items-center justify-center transition-all hover:scale-110 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 ${
                              isActive
                                ? "ring-2 ring-foreground ring-offset-2 ring-offset-popover"
                                : "ring-1 ring-border"
                            }`}
                            style={{ backgroundColor: color }}
                          >
                            {isActive && (
                              <Check className="w-4 h-4 text-white drop-shadow" strokeWidth={3} />
                            )}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[11px] text-muted-foreground pt-1 border-t border-border">
                      {THEME_PALETTE_LABELS[currentColor] || currentColor}
                    </p>
                  </div>
                </PopoverContent>
              </Popover>
              <button
                className="p-2 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                onClick={onDelete}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Content - Skills */}
        <CollapsibleContent>
          <div className="p-4">
            {/* Column headers */}
            <div className="grid grid-cols-[auto_1fr_1.5fr_auto] gap-3 px-2 pb-2 mb-2 border-b border-border/50">
              <div className="w-5" />
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Compétence</p>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Définition</p>
              <div className="w-7" />
            </div>

            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleSkillDragEnd}
            >
              <SortableContext
                items={theme.skills.map(s => s.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {theme.skills.map((skill) => (
                    <SortableSkill
                      key={skill.id}
                      skill={skill}
                      canEdit={canEdit}
                      themeColor={theme.color}
                      inputRef={skill.isNew ? (el) => skillInputRefs.current[skill.id] = el : undefined}
                      onUpdate={(updates) => onUpdateSkill(skill.id, updates)}
                      onDelete={() => onDeleteSkill(skill.id)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>

            {theme.skills.length === 0 && (
              <div className="text-center py-6 text-muted-foreground text-sm">
                Aucune compétence dans cette thématique
              </div>
            )}

            {canEdit && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full mt-3 text-muted-foreground hover:text-foreground"
                onClick={onAddSkill}
              >
                <Plus className="w-4 h-4 mr-2" />
                Ajouter une compétence
              </Button>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};