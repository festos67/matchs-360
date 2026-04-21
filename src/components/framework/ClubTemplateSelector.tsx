/**
 * @component ClubTemplateSelector
 * @description Sélecteur de modèle pour initialiser le référentiel d'une équipe.
 *              Restreint aux modèles actifs du club parent (règle métier).
 * @access Coach Référent, Responsable Club, Super Admin (depuis page équipe)
 * @features
 *  - Liste filtrée : référentiels du club non archivés uniquement
 *  - Aperçu (description, nombre de thèmes/compétences)
 *  - Sous-modale FrameworkNameModal pour nommer la copie
 *  - Création par clonage du modèle club
 * @maintenance
 *  - Restriction aux modèles club actifs : mem://logic/team-framework-initialization-rules
 *  - Gestion référentiel équipe : mem://features/team-framework-management
 */
import { useState, useEffect, useCallback } from "react";
import { FileText, BookOpen, Users, FileQuestion, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FrameworkNameModal } from "@/components/modals/FrameworkNameModal";

interface Team {
  id: string;
  name: string;
  hasFramework: boolean;
}

interface ClubTemplateSelectorProps {
  clubId: string;
  onSelected: () => void;
  onCancel: () => void;
}

const STANDARD_TEMPLATE_ID = "00000000-0000-0000-0000-000000000001";

export const ClubTemplateSelector = ({ clubId, onSelected, onCancel }: ClubTemplateSelectorProps) => {
  const [loading, setLoading] = useState(false);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const [standardStats, setStandardStats] = useState<{ themes: number; skills: number } | null>(null);
  const [selectedTeamStats, setSelectedTeamStats] = useState<{ themes: number; skills: number } | null>(null);
  const [showNameModal, setShowNameModal] = useState(false);
  const [defaultName, setDefaultName] = useState("");

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

  const fetchTeamsWithFrameworks = useCallback(async () => {
    const { data: teamsData } = await supabase
      .from("teams")
      .select("id, name")
      .eq("club_id", clubId)
      .is("deleted_at", null);

    if (!teamsData) return;

    const { data: frameworksData } = await supabase
      .from("competence_frameworks")
      .select("team_id")
      .eq("is_archived", false)
      .in("team_id", teamsData.map(t => t.id));

    const teamsWithFrameworkIds = new Set(frameworksData?.map(f => f.team_id) || []);

    const teamsWithInfo = teamsData.map(t => ({
      ...t,
      hasFramework: teamsWithFrameworkIds.has(t.id),
    })).filter(t => t.hasFramework);

    setTeams(teamsWithInfo);
  }, [clubId]);

  const fetchStandardStats = useCallback(async () => {
    const stats = await fetchFrameworkStats(STANDARD_TEMPLATE_ID);
    if (stats) setStandardStats(stats);
  }, [fetchFrameworkStats]);

  const fetchTeamStats = useCallback(async (teamId: string) => {
    const { data: framework } = await supabase
      .from("competence_frameworks")
      .select("id")
      .eq("team_id", teamId)
      .eq("is_archived", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    
    if (framework) {
      const stats = await fetchFrameworkStats(framework.id);
      setSelectedTeamStats(stats);
    }
  }, [fetchFrameworkStats]);

  useEffect(() => {
    fetchTeamsWithFrameworks();
    fetchStandardStats();
  }, [fetchTeamsWithFrameworks, fetchStandardStats]);

  useEffect(() => {
    if (selectedTeamId) {
      fetchTeamStats(selectedTeamId);
    } else {
      setSelectedTeamStats(null);
    }
  }, [selectedTeamId, fetchTeamStats]);

  const getDefaultName = () => {
    if (selectedOption === "standard") return "Référentiel Standard";
    if (selectedOption === "team" && selectedTeamId) {
      const team = teams.find(t => t.id === selectedTeamId);
      return `Référentiel basé sur ${team?.name || "équipe"}`;
    }
    if (selectedOption === "empty") return "Référentiel du Club";
    return "Référentiel du Club";
  };

  const handleContinue = () => {
    if (!selectedOption) return;
    setDefaultName(getDefaultName());
    setShowNameModal(true);
  };

  const handleImport = async (confirmedName: string) => {
    if (!selectedOption) return;
    setShowNameModal(false);
    setLoading(true);

    try {
      let sourceFrameworkId: string | null = null;
      const frameworkName = confirmedName;

      if (selectedOption === "standard") {
        sourceFrameworkId = STANDARD_TEMPLATE_ID;
      } else if (selectedOption === "team" && selectedTeamId) {
        const { data: teamFramework } = await supabase
          .from("competence_frameworks")
          .select("id, name")
          .eq("team_id", selectedTeamId)
          .eq("is_archived", false)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (teamFramework) {
          sourceFrameworkId = teamFramework.id;
        }
      } else if (selectedOption === "empty") {
        const { error } = await supabase.from("competence_frameworks").insert({
          club_id: clubId,
          name: frameworkName,
          is_template: true,
        });
        
        if (error) throw error;
        onSelected();
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
      }

      onSelected();
    } catch (error: any) {
      console.error("Error importing framework:", error);
      toast.error(error?.message || "Erreur lors de l'import");
    } finally {
      setLoading(false);
    }
  };

  const options = [
    {
      id: "standard",
      icon: FileText,
      title: "Modèle Standard MATCHS 360",
      description: standardStats 
        ? `Utiliser le modèle standard\n${standardStats.themes} thématiques et ${standardStats.skills} compétences`
        : "Chargement...",
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      id: "team",
      icon: Users,
      title: "Copier une équipe",
      description: teams.length > 0 
        ? selectedTeamStats 
          ? `Dupliquer le référentiel d'une équipe\n${selectedTeamStats.themes} thématiques et ${selectedTeamStats.skills} compétences`
          : "Dupliquer le référentiel d'une équipe du club" 
        : "Aucune équipe avec référentiel disponible",
      color: "text-warning",
      bgColor: "bg-warning/10",
      disabled: teams.length === 0,
    },
    {
      id: "empty",
      icon: FileQuestion,
      title: "Vierge",
      description: "Commencer avec un référentiel vide et tout créer manuellement",
      color: "text-muted-foreground",
      bgColor: "bg-muted",
    },
  ];

  return (
    <div className="max-w-4xl mx-auto">
      <div className="text-center mb-8">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <BookOpen className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-3xl font-display font-bold">Initialiser le référentiel du club</h1>
        <p className="text-muted-foreground mt-2">
          Ce référentiel servira de modèle pour les équipes du club
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
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
            <CardHeader className="pb-2">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-lg ${option.bgColor} flex items-center justify-center`}>
                  <option.icon className={`w-5 h-5 ${option.color}`} />
                </div>
                <div>
                  <CardTitle className="text-lg">{option.title}</CardTitle>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <CardDescription className="whitespace-pre-line">{option.description}</CardDescription>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Team selector when "team" is selected */}
      {selectedOption === "team" && teams.length > 0 && (
        <div className="glass-card p-4 mb-8">
          <label className="text-sm font-medium mb-2 block">
            Sélectionner l'équipe source
          </label>
          <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
            <SelectTrigger>
              <SelectValue placeholder="Choisir une équipe..." />
            </SelectTrigger>
            <SelectContent>
              {teams.map((team) => (
                <SelectItem key={team.id} value={team.id}>
                  {team.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="flex justify-center gap-4">
        <Button variant="outline" onClick={onCancel}>
          Annuler
        </Button>
        <Button 
          onClick={handleContinue} 
          disabled={!selectedOption || loading || (selectedOption === "team" && !selectedTeamId)}
          className="gap-2"
        >
          {loading ? (
            <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
          ) : (
            <>
              Continuer
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </Button>
      </div>

      <FrameworkNameModal
        open={showNameModal}
        onOpenChange={setShowNameModal}
        currentName={defaultName}
        onConfirm={handleImport}
        saving={loading}
      />
    </div>
  );
};
