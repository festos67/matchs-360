import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export interface TeamAssignmentItem {
  teamId: string;
  assigned: boolean;
  role: "referent" | "assistant";
  originalAssigned?: boolean;
  originalRole?: "referent" | "assistant" | null;
}

interface TeamInfo {
  id: string;
  name: string;
  season?: string | null;
  hasReferent?: boolean;
  referentName?: string;
}

interface TeamAssignmentMatrixProps {
  teams: TeamInfo[];
  assignments: TeamAssignmentItem[];
  loading?: boolean;
  onToggle: (teamId: string) => void;
  onRoleChange: (teamId: string, role: "referent" | "assistant") => void;
  showChanges?: boolean;
  helperText?: string;
}

export function TeamAssignmentMatrix({
  teams,
  assignments,
  loading,
  onToggle,
  onRoleChange,
  showChanges = false,
  helperText,
}: TeamAssignmentMatrixProps) {
  const assignedCount = assignments.filter(a => a.assigned).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Équipes du club</Label>
        {assignedCount > 0 && (
          <span className="text-xs text-muted-foreground">
            {assignedCount} équipe{assignedCount > 1 ? "s" : ""} sélectionnée{assignedCount > 1 ? "s" : ""}
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : teams.length === 0 ? (
        <div className="text-center py-6 text-muted-foreground text-sm border border-dashed rounded-lg">
          Aucune équipe disponible dans ce club
        </div>
      ) : (
        <div className="border rounded-lg divide-y">
          {teams.map((team) => {
            const assignment = assignments.find(a => a.teamId === team.id);
            const isAssigned = assignment?.assigned || false;
            const role = assignment?.role || "assistant";
            const hasChanged = showChanges && assignment && (
              assignment.assigned !== assignment.originalAssigned ||
              (assignment.assigned && assignment.originalAssigned && assignment.role !== assignment.originalRole)
            );

            return (
              <div
                key={team.id}
                className={cn(
                  "p-3 transition-colors",
                  isAssigned ? "bg-primary/5" : "bg-background",
                  hasChanged && "ring-1 ring-primary/30"
                )}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <Switch checked={isAssigned} onCheckedChange={() => onToggle(team.id)} />
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">
                        {team.name}
                        {hasChanged && <span className="ml-2 text-xs text-primary">(modifié)</span>}
                      </p>
                      {team.season && <p className="text-xs text-muted-foreground">{team.season}</p>}
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <div className={cn("flex rounded-lg border overflow-hidden transition-opacity", !isAssigned && "opacity-40 pointer-events-none")}>
                      <button
                        type="button"
                        onClick={() => onRoleChange(team.id, "assistant")}
                        className={cn("px-3 py-1.5 text-xs font-medium transition-colors", role === "assistant" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-muted")}
                      >
                        Assistant
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!team.hasReferent) onRoleChange(team.id, "referent");
                        }}
                        disabled={team.hasReferent && role !== "referent"}
                        title={team.hasReferent ? `Référent actuel : ${team.referentName}` : undefined}
                        className={cn(
                          "px-3 py-1.5 text-xs font-medium transition-colors border-l",
                          role === "referent" ? "bg-primary text-primary-foreground" : team.hasReferent ? "bg-muted text-muted-foreground cursor-not-allowed opacity-50" : "bg-background hover:bg-muted"
                        )}
                      >
                        Référent
                      </button>
                    </div>
                    {team.hasReferent && isAssigned && role === "assistant" && (
                      <span className="text-[10px] text-muted-foreground ml-1 whitespace-nowrap">
                        Réf: {team.referentName}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {helperText && <p className="text-xs text-muted-foreground">{helperText}</p>}
    </div>
  );
}
