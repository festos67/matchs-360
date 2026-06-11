/**
 * @component TemplatePreviewDialog
 * @description Bouton "Aperçu" + dialog affichant les thématiques et compétences
 *              (sans définitions) d'un référentiel modèle.
 */
import { useState } from "react";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { loadFrameworkThemes, type FrameworkTheme } from "@/lib/framework-loader";

interface Props {
  frameworkId: string;
  templateTitle: string;
}

export function TemplatePreviewDialog({ frameworkId, templateTitle }: Props) {
  const [open, setOpen] = useState(false);
  const [themes, setThemes] = useState<FrameworkTheme[]>([]);
  const [loading, setLoading] = useState(false);

  const handleOpen = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(true);
    if (themes.length === 0) {
      setLoading(true);
      const { themes: t } = await loadFrameworkThemes(frameworkId);
      setThemes(t);
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 h-8"
        onClick={handleOpen}
      >
        <Eye className="w-3.5 h-3.5" />
        Aperçu
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{templateTitle}</DialogTitle>
            <DialogDescription>
              Aperçu synthétique des thématiques et compétences du modèle
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="flex-1 pr-4 -mr-4">
            {loading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                Chargement...
              </div>
            ) : (
              <div className="space-y-4">
                {themes.map((theme) => (
                  <div key={theme.id} className="rounded-lg border border-border overflow-hidden">
                    <div
                      className="px-3 py-2 font-semibold text-sm"
                      style={{
                        backgroundColor: theme.color ? `${theme.color}20` : undefined,
                        color: theme.color || undefined,
                        borderLeft: `4px solid ${theme.color || "hsl(var(--primary))"}`,
                      }}
                    >
                      {theme.name}
                      <span className="ml-2 text-xs font-normal opacity-70">
                        ({theme.skills.length})
                      </span>
                    </div>
                    <ul className="divide-y divide-border">
                      {theme.skills.map((skill) => (
                        <li key={skill.id} className="px-3 py-1.5 text-sm">
                          {skill.name}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                {themes.length === 0 && (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    Aucune compétence
                  </div>
                )}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}