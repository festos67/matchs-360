import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface Skill {
  id: string;
  name: string;
  definition: string | null;
  order_index: number;
}

interface Theme {
  id: string;
  name: string;
  color: string | null;
  order_index: number;
  skills: Skill[];
}

interface ReadOnlyFrameworkViewProps {
  themes: Theme[];
}

export const ReadOnlyFrameworkView = ({ themes }: ReadOnlyFrameworkViewProps) => {
  return (
    <div className="space-y-4">
      {themes.map((theme) => (
        <ReadOnlyTheme key={theme.id} theme={theme} />
      ))}
    </div>
  );
};

const ReadOnlyTheme = ({ theme }: { theme: Theme }) => {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="glass-card overflow-hidden">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <div
          className="flex items-center gap-3 p-4 border-b border-border"
          style={{ borderLeftWidth: 4, borderLeftColor: theme.color || "#3B82F6" }}
        >
          <CollapsibleTrigger asChild>
            <button className="p-1 rounded hover:bg-muted">
              {isOpen ? (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              )}
            </button>
          </CollapsibleTrigger>

          <span className="flex-1 font-medium text-lg">{theme.name}</span>

          <span className="text-sm text-muted-foreground">
            {theme.skills.length} compétence{theme.skills.length > 1 ? "s" : ""}
          </span>
        </div>

        <CollapsibleContent>
          <div className="p-4 space-y-3">
            {theme.skills.map((skill) => (
              <div
                key={skill.id}
                className="grid grid-cols-[minmax(200px,1fr)_2fr] gap-6 p-3 rounded-lg bg-muted/30 items-start"
              >
                <p className="text-base font-semibold">{skill.name}</p>
                {skill.definition ? (
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {skill.definition}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground/50 italic">Aucune définition</p>
                )}
              </div>
            ))}
            {theme.skills.length === 0 && (
              <div className="text-center py-6 text-muted-foreground text-sm">
                Aucune compétence dans cette thématique
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};
