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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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

  const colors = [
    "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6",
    "#EC4899", "#14B8A6", "#F97316", "#6366F1", "#84CC16",
  ];

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="glass-card overflow-hidden"
    >
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        {/* Header */}
        <div 
          className="flex items-center gap-3 p-4 border-b border-border"
          style={{ borderLeftWidth: 4, borderLeftColor: theme.color || "#3B82F6" }}
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
              <div className="relative">
                <button
                  className="p-2 rounded hover:bg-muted"
                  onClick={() => setShowColorPicker(!showColorPicker)}
                >
                  <Palette className="w-4 h-4" style={{ color: theme.color || "#3B82F6" }} />
                </button>
                {showColorPicker && (
                  <div className="absolute right-0 top-full mt-2 p-2 bg-popover border border-border rounded-lg shadow-lg z-50 grid grid-cols-5 gap-1">
                    {colors.map((color) => (
                      <button
                        key={color}
                        className="w-6 h-6 rounded-full border-2 border-transparent hover:border-foreground transition-colors"
                        style={{ backgroundColor: color }}
                        onClick={() => {
                          onUpdate({ color });
                          setShowColorPicker(false);
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
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