/**
 * @modal EditTeamModal
 * @description Modale d'édition d'une équipe existante : nom, initiales, saison,
 *              couleur, et gestion du Coach Référent. Inclut une zone de
 *              soft-delete (archivage) accessible aux Super Admins.
 * @access Super Admin, Responsable Club, Coach Référent (édition partielle)
 * @features
 *  - Édition métadonnées équipe avec validation
 *  - Réassignation du Coach Référent (réactive team_members existant si possible)
 *  - Bouton de suppression (soft delete via deleted_at)
 *  - AlertDialog de confirmation pour archivage
 * @maintenance
 *  - Coach Référent intégrité : mem://logic/coach-role-integrity
 *  - Soft delete : mem://technical/soft-delete-strategy
 *  - Édition flow rôles : mem://features/user-role-management/edit-flow
 */
import { useState, useEffect } from "react";
import { Users, ShieldCheck, Trash2, UserPlus } from "lucide-react";
import { ColorPickerButton } from "@/components/shared/ColorPickerButton";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
    description?: string | null;
  };
  onSuccess: () => void;
}

export function EditTeamModal({ open, onOpenChange, team, onSuccess }: EditTeamModalProps) {
  const [name, setName] = useState(team.name);
  const [shortName, setShortName] = useState(team.short_name || "");
  const [color, setColor] = useState(team.color || "#3B82F6");
  const [season, setSeason] = useState(team.season || "2024-2025");
  const [description, setDescription] = useState(team.description || "");
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [availableCoaches, setAvailableCoaches] = useState<AvailableCoach[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);

  useEffect(() => {
    if (open) {
      setName(team.name);
      setShortName(team.short_name || "");
      setColor(team.color || "#3B82F6");
      setSeason(team.season || "2024-2025");
      setDescription(team.description || "");
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
      onSuccess();
    } catch (error: any) {
      console.error("Error removing coach:", error);
      toast.error("Erreur lors du retrait du coach");
    }
  };

  const handleAddCoach = async (coachId: string) => {
    try {
      const { data: existing } = await supabase
        .from("team_members")
        .select("id")
        .eq("team_id", team.id)
        .eq("user_id", coachId)
        .eq("member_type", "coach")
        .eq("is_active", false)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("team_members")
          .update({ is_active: true, left_at: null, coach_role: "assistant" })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
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
          description: description.trim() || null,
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
    <>
      <Dialog
        open={open}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setCancelConfirmOpen(true);
          } else {
            onOpenChange(true);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Users className="w-5 h-5 text-primary" />
              </div>
              Paramètres de l'équipe
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 mt-4 max-h-[70vh] overflow-y-auto pr-1">
            {/* Name + Short Name */}
            <div className="grid grid-cols-[1fr,auto] gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-team-name">Nom de l'équipe</Label>
                <Input
                  id="edit-team-name"
                  placeholder="U15 A, Seniors B..."
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-team-short">Initiales</Label>
                <Input
                  id="edit-team-short"
                  placeholder="DR1"
                  maxLength={3}
                  className="w-20 text-center uppercase font-bold"
                  value={shortName}
                  onChange={(e) => setShortName(e.target.value.slice(0, 3))}
                />
              </div>
            </div>

            {/* Season + Color */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-team-season">Saison</Label>
                <Input
                  id="edit-team-season"
                  placeholder="2024-2025"
                  value={season}
                  onChange={(e) => setSeason(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Couleur</Label>
                <ColorPickerButton value={color} onChange={setColor} />
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="edit-team-desc">Description (optionnel)</Label>
              <Textarea
                id="edit-team-desc"
                placeholder="Notes sur l'équipe..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>

            {/* Coach Management */}
            <div className="space-y-3 pt-2 border-t border-border">
              <Label className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-500" />
                Staff de l'équipe
              </Label>

              {loading ? (
                <div className="flex items-center justify-center h-20">
                  <div className="w-5 h-5 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                </div>
              ) : (
                <>
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
                              className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-medium shrink-0"
                              style={{ backgroundColor: color }}
                            >
                              {getCoachName(coach).slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <p className="font-medium text-sm">{getCoachName(coach)}</p>
                              {coach.coachRole === "referent" && (
                                <Badge variant="secondary" className="text-xs gap-1 mt-0.5">
                                  <ShieldCheck className="w-3 h-3 text-blue-500" />
                                  Référent
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <div className="flex rounded-md border overflow-hidden">
                              <button
                                type="button"
                                className={`px-2 py-1 text-xs transition-colors ${
                                  coach.coachRole === "referent"
                                    ? "bg-primary text-primary-foreground"
                                    : hasReferent
                                    ? "bg-muted text-muted-foreground cursor-not-allowed"
                                    : "hover:bg-muted"
                                }`}
                                onClick={() => handleRoleChange(coach, "referent")}
                                disabled={hasReferent && coach.coachRole !== "referent"}
                              >
                                Réf.
                              </button>
                              <button
                                type="button"
                                className={`px-2 py-1 text-xs transition-colors ${
                                  coach.coachRole === "assistant"
                                    ? "bg-primary text-primary-foreground"
                                    : "hover:bg-muted"
                                }`}
                                onClick={() => handleRoleChange(coach, "assistant")}
                              >
                                Asst.
                              </button>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => handleRemoveCoach(coach)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {availableCoaches.length > 0 && (
                    <div className="space-y-2 pt-2">
                      <p className="text-xs text-muted-foreground">Ajouter un coach</p>
                      {availableCoaches.map((coach) => (
                        <div
                          key={coach.id}
                          className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full flex items-center justify-center text-foreground/50 bg-muted font-medium text-sm shrink-0">
                              {getCoachName(coach).slice(0, 2).toUpperCase()}
                            </div>
                            <p className="font-medium text-sm">{getCoachName(coach)}</p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1 h-8"
                            onClick={() => handleAddCoach(coach.id)}
                          >
                            <UserPlus className="w-3.5 h-3.5" />
                            Ajouter
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Preview */}
            <div className="flex items-center gap-4 p-4 rounded-lg bg-muted/30">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold shrink-0"
                style={{
                  background: `linear-gradient(135deg, ${color} 0%, ${color}88 100%)`,
                  color: "white",
                }}
              >
                {shortName?.toUpperCase() || name?.slice(0, 2).toUpperCase() || "EQ"}
              </div>
              <div>
                <p className="font-medium">{name || "Équipe"}</p>
                <p className="text-sm text-muted-foreground">{season}</p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCancelConfirmOpen(true)}
            >
              Annuler
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              ) : (
                "Enregistrer"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Cancel Confirmation */}
      <AlertDialog open={cancelConfirmOpen} onOpenChange={setCancelConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Annuler les modifications ?</AlertDialogTitle>
            <AlertDialogDescription>
              Les modifications non enregistrées seront perdues. Voulez-vous vraiment annuler ?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button onClick={() => setCancelConfirmOpen(false)}>
              Continuer la saisie
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setCancelConfirmOpen(false);
                onOpenChange(false);
              }}
            >
              Confirmer l'annulation
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
