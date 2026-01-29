import { useState, useEffect } from "react";
import { FileText, Users, FileQuestion, ArrowRight, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Team {
  id: string;
  name: string;
  hasFramework: boolean;
}

interface CreateClubFrameworkModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clubId: string;
  onSuccess: () => void;
}

const STANDARD_TEMPLATE_ID = "00000000-0000-0000-0000-000000000001";

export function CreateClubFrameworkModal({
  open,
  onOpenChange,
  clubId,
  onSuccess,
}: CreateClubFrameworkModalProps) {
  const [loading, setLoading] = useState(false);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const [loadingTeams, setLoadingTeams] = useState(false);

  useEffect(() => {
    if (open) {
      fetchTeamsWithFrameworks();
      setSelectedOption(null);
      setSelectedTeamId("");
    }
  }, [open, clubId]);

  const fetchTeamsWithFrameworks = async () => {
    setLoadingTeams(true);
    try {
      // Get all teams for this club
      const { data: teamsData } = await supabase
        .from("teams")
        .select("id, name")
        .eq("club_id", clubId)
        .is("deleted_at", null)
        .order("name");

      if (teamsData && teamsData.length > 0) {
        // Get frameworks for these teams
        const { data: frameworks } = await supabase
          .from("competence_frameworks")
          .select("team_id")
          .in("team_id", teamsData.map(t => t.id));

        const frameworkTeamIds = new Set(frameworks?.map(f => f.team_id) || []);

        setTeams(teamsData.map(t => ({
          ...t,
          hasFramework: frameworkTeamIds.has(t.id),
        })));
      } else {
        setTeams([]);
      }
    } catch (error) {
      console.error("Error fetching teams:", error);
    } finally {
      setLoadingTeams(false);
    }
  };

  const teamsWithFrameworks = teams.filter(t => t.hasFramework);

  const handleCreate = async () => {
    if (!selectedOption) return;
    setLoading(true);

    try {
      let sourceFrameworkId: string | null = null;
      let frameworkName = "Référentiel du Club";

      if (selectedOption === "standard") {
        sourceFrameworkId = STANDARD_TEMPLATE_ID;
        frameworkName = "Référentiel Standard du Club";
      } else if (selectedOption === "team" && selectedTeamId) {
        // Get the framework from the selected team
        const { data: teamFramework } = await supabase
          .from("competence_frameworks")
          .select("id, name")
          .eq("team_id", selectedTeamId)
          .maybeSingle();

        if (teamFramework) {
          sourceFrameworkId = teamFramework.id;
          const selectedTeam = teams.find(t => t.id === selectedTeamId);
          frameworkName = `Référentiel basé sur ${selectedTeam?.name || "équipe"}`;
        } else {
          toast.error("Cette équipe n'a pas de référentiel");
          setLoading(false);
          return;
        }
      } else if (selectedOption === "empty") {
        // Create empty club framework
        const { error } = await supabase.from("competence_frameworks").insert({
          club_id: clubId,
          team_id: null,
          name: "Référentiel du Club",
          is_template: true,
        });

        if (error) throw error;
        toast.success("Référentiel vierge créé pour le club");
        onSuccess();
        onOpenChange(false);
        return;
      }

      if (sourceFrameworkId) {
        const { data, error } = await supabase.functions.invoke("import-framework", {
          body: {
            sourceFrameworkId,
            targetClubId: clubId,
            frameworkName,
          },
        });

        if (error) throw error;
        if (data?.error) throw new Error(data.error);
        
        toast.success("Référentiel du club créé avec succès");
      }

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error creating club framework:", error);
      toast.error("Erreur lors de la création du référentiel");
    } finally {
      setLoading(false);
    }
  };

  const options = [
    {
      id: "standard",
      icon: FileText,
      title: "Modèle Standard",
      description: "Le référentiel MATCHS360 complet avec 5 thématiques et 15 compétences",
      color: "text-primary",
      bgColor: "bg-primary/10",
      disabled: false,
    },
    {
      id: "team",
      icon: Users,
      title: "Copier une équipe",
      description: teamsWithFrameworks.length > 0
        ? `${teamsWithFrameworks.length} équipe(s) avec référentiel disponible`
        : "Aucune équipe avec référentiel",
      color: "text-warning",
      bgColor: "bg-warning/10",
      disabled: teamsWithFrameworks.length === 0,
    },
    {
      id: "empty",
      icon: FileQuestion,
      title: "Vierge",
      description: "Commencer avec un référentiel vide et tout créer manuellement",
      color: "text-muted-foreground",
      bgColor: "bg-muted",
      disabled: false,
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-primary" />
            </div>
            <div>
              <DialogTitle>Créer le référentiel du club</DialogTitle>
              <DialogDescription>
                Ce référentiel servira de modèle pour toutes les équipes du club
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Options Grid */}
          <div className="grid grid-cols-1 gap-3">
            {options.map((option) => (
              <Card
                key={option.id}
                className={`cursor-pointer transition-all duration-200 ${
                  selectedOption === option.id
                    ? "border-primary ring-2 ring-primary/20"
                    : "hover:border-primary/50"
                } ${option.disabled ? "opacity-50 cursor-not-allowed" : ""}`}
                onClick={() => !option.disabled && setSelectedOption(option.id)}
              >
                <CardHeader className="py-3 px-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg ${option.bgColor} flex items-center justify-center flex-shrink-0`}>
                      <option.icon className={`w-5 h-5 ${option.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base">{option.title}</CardTitle>
                      <CardDescription className="text-sm mt-0.5">{option.description}</CardDescription>
                    </div>
                    {selectedOption === option.id && (
                      <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                        <div className="w-2 h-2 rounded-full bg-primary-foreground" />
                      </div>
                    )}
                  </div>
                </CardHeader>
              </Card>
            ))}
          </div>

          {/* Team selector when "team" is selected */}
          {selectedOption === "team" && teamsWithFrameworks.length > 0 && (
            <div className="p-4 rounded-lg border border-border bg-muted/30">
              <label className="text-sm font-medium mb-2 block">
                Sélectionner l'équipe source
              </label>
              <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choisir une équipe..." />
                </SelectTrigger>
                <SelectContent>
                  {teamsWithFrameworks.map((team) => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!selectedOption || loading || (selectedOption === "team" && !selectedTeamId)}
              className="gap-2"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              ) : (
                <>
                  Créer le référentiel
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}