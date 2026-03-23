import { useState, useEffect, useCallback } from "react";
import { FileText, Users, FileQuestion, ArrowRight, BookOpen, History } from "lucide-react";
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

interface ArchivedFramework {
  id: string;
  name: string;
  archived_at: string;
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
  const [archivedFrameworks, setArchivedFrameworks] = useState<ArchivedFramework[]>([]);
  const [selectedArchivedId, setSelectedArchivedId] = useState<string>("");
  const [standardStats, setStandardStats] = useState<{ themes: number; skills: number } | null>(null);

  const fetchFrameworkStats = useCallback(async (frameworkId: string) => {
    const { data: themes } = await supabase
      .from("themes")
      .select("id, skills(count)")
      .eq("framework_id", frameworkId);
    
    if (themes) {
      const totalSkills = themes.reduce((sum: number, t: any) => sum + (t.skills?.[0]?.count || 0), 0);
      return { themes: themes.length, skills: totalSkills };
    }
    return null;
  }, []);

  const fetchTeamsWithFrameworks = async () => {
    setLoadingTeams(true);
    try {
      const { data: teamsData } = await supabase
        .from("teams")
        .select("id, name")
        .eq("club_id", clubId)
        .is("deleted_at", null)
        .order("name");

      if (teamsData && teamsData.length > 0) {
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

  const fetchArchivedFrameworks = async () => {
    const { data } = await supabase
      .from("competence_frameworks")
      .select("id, name, archived_at")
      .eq("club_id", clubId)
      .eq("is_archived", true)
      .order("archived_at", { ascending: false });

    if (data) {
      setArchivedFrameworks(data.map(f => ({
        id: f.id,
        name: f.name,
        archived_at: f.archived_at || "",
      })));
    }
  };

  const teamsWithFrameworks = teams.filter(t => t.hasFramework);

  const formatDate = (dateStr: string) => {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  };

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
      } else if (selectedOption === "history" && selectedArchivedId) {
        // Restore archived framework
        const { error } = await supabase
          .from("competence_frameworks")
          .update({ is_archived: false, archived_at: null })
          .eq("id", selectedArchivedId);

        if (error) throw error;
        toast.success("Référentiel restauré depuis l'historique");
        onSuccess();
        onOpenChange(false);
        return;
      } else if (selectedOption === "empty") {
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
      id: "history",
      icon: History,
      title: "Depuis l'historique",
      description: archivedFrameworks.length > 0
        ? `${archivedFrameworks.length} version${archivedFrameworks.length > 1 ? "s" : ""} archivée${archivedFrameworks.length > 1 ? "s" : ""} disponible${archivedFrameworks.length > 1 ? "s" : ""}`
        : "Aucune version archivée disponible",
      color: "text-accent-foreground",
      bgColor: "bg-accent",
      disabled: archivedFrameworks.length === 0,
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

          {/* Archived framework selector when "history" is selected */}
          {selectedOption === "history" && archivedFrameworks.length > 0 && (
            <div className="p-4 rounded-lg border border-border bg-muted/30">
              <label className="text-sm font-medium mb-2 block">
                Sélectionner la version à restaurer
              </label>
              <Select value={selectedArchivedId} onValueChange={setSelectedArchivedId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choisir une version..." />
                </SelectTrigger>
                <SelectContent>
                  {archivedFrameworks.map((fw) => (
                    <SelectItem key={fw.id} value={fw.id}>
                      {fw.name} — {formatDate(fw.archived_at)}
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
              disabled={!selectedOption || loading || (selectedOption === "team" && !selectedTeamId) || (selectedOption === "history" && !selectedArchivedId)}
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