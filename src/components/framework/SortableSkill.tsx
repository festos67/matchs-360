import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Trash2, Info, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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
  const [showDefinition, setShowDefinition] = useState(false);

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
      className="flex items-center gap-2 p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors group"
    >
      {canEdit && (
        <button
          className="cursor-grab active:cursor-grabbing p-1 rounded hover:bg-muted text-muted-foreground transition-opacity touch-none"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="w-3 h-3 text-muted-foreground" />
        </button>
      )}

      {canEdit ? (
        <Input
          ref={inputRef}
          value={skill.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          placeholder="Nom de la compétence..."
          className="flex-1 h-8 text-sm border-transparent bg-transparent focus:bg-background"
        />
      ) : (
        <span className="flex-1 text-sm">{skill.name}</span>
      )}

      <Popover open={showDefinition} onOpenChange={setShowDefinition}>
        <PopoverTrigger asChild>
          <button
            className={`p-1.5 rounded hover:bg-muted transition-colors ${
              skill.definition ? "text-primary" : "text-muted-foreground"
            }`}
          >
            <Info className="w-4 h-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-80" align="end">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-sm">Définition</h4>
              <button
                className="p-1 rounded hover:bg-muted"
                onClick={() => setShowDefinition(false)}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {canEdit ? (
              <Textarea
                value={skill.definition || ""}
                onChange={(e) => onUpdate({ definition: e.target.value })}
                placeholder="Décrivez cette compétence..."
                rows={3}
                className="text-sm"
              />
            ) : skill.definition ? (
              <p className="text-sm text-muted-foreground">{skill.definition}</p>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                Aucune définition
              </p>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {canEdit && (
        <button
          className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-all"
          onClick={onDelete}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      )}
    </div>
  );
};