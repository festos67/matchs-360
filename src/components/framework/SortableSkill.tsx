import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface Skill {
  id: string;
  name: string;
  definition: string | null;
  order_index: number;
  isNew?: boolean;
}

interface SortableSkillProps {
  skill: Skill;
  canEdit: boolean;
  inputRef?: (el: HTMLInputElement | null) => void;
  onUpdate: (updates: Partial<Skill>) => void;
  onDelete: () => void;
}

export const SortableSkill = ({
  skill,
  canEdit,
  inputRef,
  onUpdate,
  onDelete,
}: SortableSkillProps) => {
  const [editingDefinition, setEditingDefinition] = useState(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: skill.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="grid grid-cols-[auto_1fr_1.5fr_auto] gap-3 p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors group items-start"
    >
      {/* Drag handle */}
      {canEdit ? (
        <button
          className="cursor-grab active:cursor-grabbing p-1 rounded hover:bg-muted text-muted-foreground transition-opacity touch-none mt-1"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="w-3 h-3 text-muted-foreground" />
        </button>
      ) : (
        <div className="w-5" />
      )}

      {/* Skill name */}
      {canEdit ? (
        <Input
          ref={inputRef}
          value={skill.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          placeholder="Nom de la compétence..."
          className="h-8 text-sm border-transparent bg-transparent focus:bg-background"
        />
      ) : (
        <span className="text-sm mt-1">{skill.name}</span>
      )}

      {/* Definition box */}
      {canEdit ? (
        editingDefinition ? (
          <Textarea
            autoFocus
            value={skill.definition || ""}
            onChange={(e) => onUpdate({ definition: e.target.value })}
            onBlur={() => setEditingDefinition(false)}
            placeholder="Décrivez cette compétence..."
            rows={2}
            className="text-sm min-h-[2rem]"
          />
        ) : (
          <div
            className="text-sm px-2 py-1 rounded border border-transparent hover:border-border cursor-text min-h-[2rem] text-muted-foreground"
            onClick={() => setEditingDefinition(true)}
          >
            {skill.definition || (
              <span className="italic text-muted-foreground/50">Cliquer pour ajouter une définition…</span>
            )}
          </div>
        )
      ) : (
        <span className="text-sm text-muted-foreground mt-1">
          {skill.definition || <span className="italic text-muted-foreground/50">Aucune définition</span>}
        </span>
      )}

      {/* Delete */}
      {canEdit ? (
        <button
          className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all mt-0.5"
          onClick={onDelete}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      ) : (
        <div className="w-7" />
      )}
    </div>
  );
};
