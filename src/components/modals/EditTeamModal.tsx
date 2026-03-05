import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Settings, Users, Star, Trash2, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Coach {
  id: string;
  memberId: string;
  firstName: string | null;
  lastName: string | null;
  nickname: string | null;
  photoUrl: string | null;
  coachRole: "referent" | "assistant" | null;
}

interface AvailableCoach {
  id: string;
  firstName: string | null;
  lastName: string | null;
  nickname: string | null;
}

interface EditTeamModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  team: {
    id: string;
    name: string;
    short_name?: string | null;
    season: string | null;
    color: string | null;
    club_id: string;
  };
  onSuccess: () => void;
}

const TEAM_COLORS = [
  { name: "Bleu", value: "#3B82F6" },
  { name: "Rouge", value: "#EF4444" },
  { name: "Vert", value: "#22C55E" },
  { name: "Orange", value: "#F97316" },
  { name: "Violet", value: "#8B5CF6" },
  { name: "Rose", value: "#EC4899" },
  { name: "Jaune", value: "#EAB308" },
  { name: "Cyan", value: "#06B6D4" },
  { name: "Indigo", value: "#6366F1" },
  { name: "Lime", value: "#84CC16" },
];

const SEASONS = [
  "2024-2025",
  "2025-2026",
  "2026-2027",
];

export function EditTeamModal({ open, onOpenChange, team, onSuccess }: EditTeamModalProps) {
  const [name, setName] = useState(team.name);
  const [shortName, setShortName] = useState(team.short_name || "");
  const [color, setColor] = useState(team.color || "#3B82F6");
  const [season, setSeason] = useState(team.season || "2024-2025");
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [availableCoaches, setAvailableCoaches] = useState<AvailableCoach[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(team.name);
      setShortName(team.short_name || "");
      setColor(team.color || "#3B82F6");
      setSeason(team.season || "2024-2025");
      fetchCoaches();
      fetchAvailableCoaches();
    }
  }, [open, team]);

  const fetchCoaches = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("team_members")
        .select(`
          id,
          coach_role,
          profile:profiles!inner(id, first_name, last_name, nickname, photo_url)
        `)
        .eq("team_id", team.id)
        .eq("member_type", "coach")
        .eq("is_active", true);

      if (error) throw error;

      setCoaches(
        (data || []).map((m: any) => ({
          id: m.profile.id,
          memberId: m.id,
          firstName: m.profile.first_name,
          lastName: m.profile.last_name,
          nickname: m.profile.nickname,
          photoUrl: m.profile.photo_url,
          coachRole: m.coach_role,
        }))
      );
    } catch (error: any) {
      console.error("Error fetching coaches:", error);
      toast.error("Erreur lors du chargement des coachs");
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableCoaches = async () => {
    try {
      // Get all coaches in the club that are not already in this team
      const { data: clubCoaches, error } = await supabase
        .from("user_roles")
        .select(`
          user_id,
          profiles!inner(id, first_name, last_name, nickname, deleted_at)
        `)
        .eq("club_id", team.club_id)
        .eq("role", "coach")
        .is("profiles.deleted_at", null);

      if (error) throw error;

      // Get current team coaches
      const { data: teamCoaches } = await supabase
        .from("team_members")
        .select("user_id")
        .eq("team_id", team.id)
        .eq("member_type", "coach")
        .eq("is_active", true);

      const teamCoachIds = new Set((teamCoaches || []).map((c) => c.user_id));

      setAvailableCoaches(
        (clubCoaches || [])
          .filter((c: any) => !teamCoachIds.has(c.user_id))
          .map((c: any) => ({
            id: c.profiles.id,
            firstName: c.profiles.first_name,
            lastName: c.profiles.last_name,
            nickname: c.profiles.nickname,
          }))
      );
    } catch (error: any) {
      console.error("Error fetching available coaches:", error);
    }
  };

  const getCoachName = (coach: Coach | AvailableCoach) => {
    if (coach.nickname) return coach.nickname;
    if (coach.firstName && coach.lastName) return `${coach.firstName} ${coach.lastName}`;
    return coach.firstName || coach.lastName || "Coach";
  };

  const hasReferent = coaches.some((c) => c.coachRole === "referent");

  const handleRoleChange = async (coach: Coach, newRole: "referent" | "assistant") => {
    if (newRole === "referent" && hasReferent && coach.coachRole !== "referent") {
      toast.error("Il y a déjà un coach référent dans cette équipe");
      return;
    }

    try {
      const { error } = await supabase
        .from("team_members")
        .update({ coach_role: newRole })
        .eq("id", coach.memberId);

      if (error) throw error;

      setCoaches((prev) =>
        prev.map((c) => (c.id === coach.id ? { ...c, coachRole: newRole } : c))
      );
      toast.success("Rôle mis à jour");
      // Appeler onSuccess pour rafraîchir la page parente
      onSuccess();
    } catch (error: any) {
      console.error("Error updating role:", error);
      toast.error("Erreur lors de la mise à jour du rôle");
    }
  };

  const handleRemoveCoach = async (coach: Coach) => {
    try {
      const { error } = await supabase
        .from("team_members")
        .update({ is_active: false, left_at: new Date().toISOString() })
        .eq("id", coach.memberId);

      if (error) throw error;

      setCoaches((prev) => prev.filter((c) => c.id !== coach.id));
      setAvailableCoaches((prev) => [
        ...prev,
        { id: coach.id, firstName: coach.firstName, lastName: coach.lastName, nickname: coach.nickname },
      ]);
      toast.success("Coach retiré de l'équipe");
      // Appeler onSuccess pour rafraîchir la page parente immédiatement
      onSuccess();
    } catch (error: any) {
      console.error("Error removing coach:", error);
      toast.error("Erreur lors du retrait du coach");
    }
  };

  const handleAddCoach = async (coachId: string) => {
    try {
      // Check if there's an existing inactive membership
      const { data: existing } = await supabase
        .from("team_members")
        .select("id")
        .eq("team_id", team.id)
        .eq("user_id", coachId)
        .eq("member_type", "coach")
        .eq("is_active", false)
        .maybeSingle();

      if (existing) {
        // Reactivate existing membership
        const { error } = await supabase
          .from("team_members")
          .update({ is_active: true, left_at: null, coach_role: "assistant" })
          .eq("id", existing.id);

        if (error) throw error;
      } else {
        // Create new membership
        const { error } = await supabase.from("team_members").insert({
          team_id: team.id,
          user_id: coachId,
          member_type: "coach",
          coach_role: "assistant",
        });

        if (error) throw error;
      }

      await fetchCoaches();
      setAvailableCoaches((prev) => prev.filter((c) => c.id !== coachId));
      toast.success("Coach ajouté à l'équipe");
      // Appeler onSuccess pour rafraîchir la page parente
      onSuccess();
    } catch (error: any) {
      console.error("Error adding coach:", error);
      toast.error("Erreur lors de l'ajout du coach");
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Le nom de l'équipe est requis");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from("teams")
        .update({
          name: name.trim(),
          short_name: shortName.trim().toUpperCase() || null,
          color,
          season,
        })
        .eq("id", team.id);

      if (error) throw error;

      toast.success("Équipe mise à jour");
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error updating team:", error);
      toast.error("Erreur lors de la mise à jour");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Paramètres de l'équipe
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="general" className="mt-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="general" className="gap-2">
              <Settings className="w-4 h-4" />
              Général
            </TabsTrigger>
            <TabsTrigger value="staff" className="gap-2">
              <Users className="w-4 h-4" />
              Staff
            </TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-4 mt-4">
            <div className="grid grid-cols-[1fr,auto] gap-4">
              <div className="space-y-2">
                <Label htmlFor="team-name">Nom de l'équipe</Label>
                <Input
                  id="team-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: U13 Elite"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="team-short">Initiales</Label>
                <Input
                  id="team-short"
                  value={shortName}
                  onChange={(e) => setShortName(e.target.value.slice(0, 3))}
                  maxLength={3}
                  placeholder="DR1"
                  className="w-20 text-center uppercase font-bold"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="team-season">Saison</Label>
              <Select value={season} onValueChange={setSeason}>
                <SelectTrigger id="team-season">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SEASONS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Couleur de l'équipe</Label>
              <div className="grid grid-cols-5 gap-2">
                {TEAM_COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    className={`w-full aspect-square rounded-lg border-2 transition-all ${
                      color === c.value
                        ? "border-foreground scale-110 shadow-lg"
                        : "border-transparent hover:scale-105"
                    }`}
                    style={{ backgroundColor: c.value }}
                    onClick={() => setColor(c.value)}
                    title={c.name}
                  />
                ))}
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Enregistrement..." : "Enregistrer"}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="staff" className="space-y-4 mt-4">
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              </div>
            ) : (
              <>
                {/* Current coaches */}
                <div className="space-y-3">
                  <Label>Coachs de l'équipe</Label>
                  {coaches.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Aucun coach assigné</p>
                  ) : (
                    <div className="space-y-2">
                      {coaches.map((coach) => (
                        <div
                          key={coach.id}
                          className="flex items-center justify-between p-3 rounded-lg border bg-card"
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className="w-10 h-10 rounded-full flex items-center justify-center text-white font-medium"
                              style={{ backgroundColor: color }}
                            >
                              {getCoachName(coach).slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-medium">{getCoachName(coach)}</p>
                              <div className="flex items-center gap-1">
                                {coach.coachRole === "referent" && (
                                  <Badge variant="secondary" className="text-xs gap-1">
                                    <Star className="w-3 h-3" />
                                    Référent
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex rounded-md border overflow-hidden">
                              <button
                                type="button"
                                className={`px-3 py-1.5 text-xs transition-colors ${
                                  coach.coachRole === "referent"
                                    ? "bg-primary text-primary-foreground"
                                    : hasReferent
                                    ? "bg-muted text-muted-foreground cursor-not-allowed"
                                    : "hover:bg-muted"
                                }`}
                                onClick={() => handleRoleChange(coach, "referent")}
                                disabled={hasReferent && coach.coachRole !== "referent"}
                                title={
                                  hasReferent && coach.coachRole !== "referent"
                                    ? "Il y a déjà un coach référent"
                                    : ""
                                }
                              >
                                Référent
                              </button>
                              <button
                                type="button"
                                className={`px-3 py-1.5 text-xs transition-colors ${
                                  coach.coachRole === "assistant"
                                    ? "bg-primary text-primary-foreground"
                                    : "hover:bg-muted"
                                }`}
                                onClick={() => handleRoleChange(coach, "assistant")}
                              >
                                Assistant
                              </button>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive hover:text-destructive"
                              onClick={() => handleRemoveCoach(coach)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Add coach */}
                {availableCoaches.length > 0 && (
                  <div className="space-y-3 pt-4 border-t">
                    <Label>Ajouter un coach</Label>
                    <div className="space-y-2">
                      {availableCoaches.map((coach) => (
                        <div
                          key={coach.id}
                          className="flex items-center justify-between p-3 rounded-lg border bg-muted/50"
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className="w-10 h-10 rounded-full flex items-center justify-center text-white font-medium bg-muted-foreground/30"
                            >
                              {getCoachName(coach).slice(0, 2).toUpperCase()}
                            </div>
                            <p className="font-medium">{getCoachName(coach)}</p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            onClick={() => handleAddCoach(coach.id)}
                          >
                            <UserPlus className="w-4 h-4" />
                            Ajouter
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
