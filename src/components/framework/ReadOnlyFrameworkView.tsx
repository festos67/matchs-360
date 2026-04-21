/**
 * @component ReadOnlyFrameworkView
 * @description Vue en lecture seule d'un référentiel : thèmes pliables avec
 *              compétences et définitions. Utilisée par les joueurs, supporters,
 *              et comme vue par défaut sur les pages de gestion.
 * @access Tous rôles authentifiés (avec restrictions RLS sur le framework)
 * @features
 *  - Collapsible par thème (fermé par défaut pour vue compacte)
 *  - Affichage des définitions sous chaque compétence
 *  - Couleur de thème en accent visuel
 *  - Pas d'actions d'édition (utiliser FrameworkEditDialog)
 * @maintenance
 *  - Visibilité joueur : mem://features/player-framework-visibility
 *  - Accès supporter : mem://logic/supporter-data-access
 *  - Vue par défaut gestion club : mem://features/club-framework-management
 */
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
                className="p-3 rounded-lg bg-muted/30 space-y-1"
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
