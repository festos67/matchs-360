import { useState, useEffect } from "react";
import { FileText, BookOpen, Building2, Users, FileQuestion, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";


interface Template {
  id: string;
  name: string;
  is_template: boolean;
  team_id: string | null;
  club_id: string | null;
  themes_count?: number;
  skills_count?: number;
}

interface Team {
  id: string;
  name: string;
}

interface TemplateSelectorProps {
  teamId: string;
  clubId: string;
  onSelected: () => void;
  onCancel: () => void;
}

const STANDARD_TEMPLATE_ID = "00000000-0000-0000-0000-000000000001";

export const TemplateSelector = ({ teamId, clubId, onSelected, onCancel }: TemplateSelectorProps) => {
  const [loading, setLoading] = useState(false);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [clubTemplates, setClubTemplates] = useState<Template[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamsWithFramework, setTeamsWithFramework] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const [standardStats, setStandardStats] = useState<{ themes: number; skills: number } | null>(null);
  const [defaultName, setDefaultName] = useState("");

  useEffect(() => {
    fetchClubTemplates();
    fetchTeams();
    fetchStandardStats();
  }, [clubId]);

  const fetchClubTemplates = async () => {
    const { data } = await supabase
      .from("competence_frameworks")
      .select("*, themes:themes(id, skills(count))")
      .eq("club_id", clubId)
      .eq("is_template", true)
      .eq("is_archived", false)
      .order("updated_at", { ascending: false })
      .limit(1);
    
    if (data) {
      setClubTemplates(data.map((t: any) => {
        const themes = t.themes || [];
        const skillsCount = themes.reduce((sum: number, th: any) => sum + (th.skills?.[0]?.count || 0), 0);
        return { ...t, themes_count: themes.length, skills_count: skillsCount };
      }));
    }
  };

  const fetchTeams = async () => {
    const { data } = await supabase
      .from("teams")
      .select("id, name")
      .eq("club_id", clubId)
      .neq("id", teamId);
    
    if (data) {
      setTeams(data);
      // Check which teams have a framework
      const { data: frameworks } = await supabase
        .from("competence_frameworks")
        .select("team_id")
        .eq("is_archived", false)
        .in("team_id", data.map(t => t.id));
      
      const teamIdsWithFw = new Set((frameworks || []).map(f => f.team_id));
      setTeamsWithFramework(data.filter(t => teamIdsWithFw.has(t.id)));
    }
  };

  const fetchStandardStats = async () => {
    const { data: themes } = await supabase
      .from("themes")
      .select("id, skills(count)")
      .eq("framework_id", STANDARD_TEMPLATE_ID);
    
    if (themes) {
      const totalSkills = themes.reduce((sum: number, t: any) => sum + (t.skills?.[0]?.count || 0), 0);
      setStandardStats({ themes: themes.length, skills: totalSkills });
    }
  };

  const getDefaultName = () => {
    if (selectedOption === "standard") return "Référentiel Standard";
    if (selectedOption === "club" && clubTemplates.length > 0) return clubTemplates[0].name;
    if (selectedOption === "team" && selectedTeamId) {
      const team = teams.find(t => t.id === selectedTeamId);
      return `Référentiel basé sur ${team?.name || "équipe"}`;
    }
    if (selectedOption === "empty") return "Référentiel de compétences";
    return "Référentiel de compétences";
  };

  const handleContinue = () => {
    if (!selectedOption) return;
    // Import directly with default name — renaming happens at save time
    handleImport(getDefaultName());
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
      } else if (selectedOption === "club" && clubTemplates.length > 0) {
        sourceFrameworkId = clubTemplates[0].id;
      } else if (selectedOption === "team" && selectedTeamId) {
        // Get the framework from the selected team
        const { data: teamFramework } = await supabase
          .from("competence_frameworks")
          .select("id")
          .eq("team_id", selectedTeamId)
          .maybeSingle();
        
        if (teamFramework) {
          sourceFrameworkId = teamFramework.id;
        }
      } else if (selectedOption === "empty") {
        // Create empty framework
        const { error } = await supabase.from("competence_frameworks").insert({
          team_id: teamId,
          name: frameworkName,
          is_template: false,
        });
        
        if (error) throw error;
        onSelected();
        return;
      }

      if (sourceFrameworkId) {
        const { data, error } = await supabase.functions.invoke("import-framework", {
          body: {
            sourceFrameworkId,
            targetTeamId: teamId,
            frameworkName,
          },
        });

        if (error) throw error;
        if (data?.error) throw new Error(data.error);
      }

      onSelected();
    } catch (error: any) {
      console.error("Error importing framework:", error);
      toast.error("Erreur lors de l'import");
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
      id: "club",
      icon: Building2,
      title: "Modèle du Club",
      description: clubTemplates.length > 0 
        ? `Utiliser le référentiel du club\n${clubTemplates[0].themes_count} thématiques et ${clubTemplates[0].skills_count} compétences` 
        : "Aucun modèle de club disponible",
      color: "text-success",
      bgColor: "bg-success/10",
      disabled: clubTemplates.length === 0,
    },
    {
      id: "team",
      icon: Users,
      title: "Copier une équipe",
      description: teamsWithFramework.length > 0 
        ? "Dupliquer le référentiel d'une autre équipe" 
        : "Aucune équipe n'a encore paramétré son référentiel",
      color: "text-warning",
      bgColor: "bg-warning/10",
      disabled: teamsWithFramework.length === 0,
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
        <h1 className="text-3xl font-display font-bold">Initialiser le référentiel</h1>
        <p className="text-muted-foreground mt-2">
          Choisissez comment démarrer le référentiel de compétences de cette équipe
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
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
      {selectedOption === "team" && teamsWithFramework.length > 0 && (
        <div className="glass-card p-4 mb-8">
          <label className="text-sm font-medium mb-2 block">
            Sélectionner l'équipe source
          </label>
          <Select value={selectedTeamId} onValueChange={setSelectedTeamId}>
            <SelectTrigger>
              <SelectValue placeholder="Choisir une équipe..." />
            </SelectTrigger>
            <SelectContent>
              {teamsWithFramework.map((team) => (
                <SelectItem key={team.id} value={team.id}>
                  {team.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Club template selector */}
      {selectedOption === "club" && clubTemplates.length > 1 && (
        <div className="glass-card p-4 mb-8">
          <label className="text-sm font-medium mb-2 block">
            Sélectionner le modèle
          </label>
          <Select>
            <SelectTrigger>
              <SelectValue placeholder="Choisir un modèle..." />
            </SelectTrigger>
            <SelectContent>
              {clubTemplates.map((template) => (
                <SelectItem key={template.id} value={template.id}>
                  {template.name} ({template.themes_count} thématiques)
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

    </div>
  );
};