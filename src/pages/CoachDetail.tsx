/**
 * @page CoachDetail
 * @route /coaches/:id
 * @description Fiche détaillée d'un coach : profil, équipes encadrées
 *              (Référent / Assistant), joueurs encadrés via les équipes, et
 *              actions Modifier / Archiver (soft-delete via `deleted_at`).
 * @access admin, club_admin (édition) ; coach lui-même (lecture).
 * @maintenance Réutilise EditCoachModal — ne PAS dupliquer la logique.
 *              Soft-delete profile via UPDATE deleted_at (cf. F2).
 */
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Pencil, Trash2, Mail, Loader2 } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { EditCoachModal } from "@/components/modals/EditCoachModal";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

interface Assignment {
  team_id: string;
  team_name: string;
  coach_role: "referent" | "assistant";
  season: string | null;
}

interface PlayerRow {
  id: string;
  name: string;
  team_id: string;
  team_name: string;
}

interface CoachData {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  photo_url: string | null;
  club_id: string | null;
  club_name: string | null;
  assignments: Assignment[];
  players: PlayerRow[];
}

export default function CoachDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { hasAdminRole, currentRole, user } = useAuth();

  const [coach, setCoach] = useState<CoachData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [archiveConfirmText, setArchiveConfirmText] = useState("");

  const canEdit = hasAdminRole || currentRole?.role === "club_admin";
  const isOwnProfile = user?.id === id;

  useEffect(() => {
    if (id) fetchCoach();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const fetchCoach = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const { data: profile, error: profileErr } = await supabase
        .from("profiles")
        .select("id, email, first_name, last_name, photo_url, club_id")
        .eq("id", id)
        .is("deleted_at", null)
        .maybeSingle();
      if (profileErr) throw profileErr;
      if (!profile) {
        toast.error("Coach introuvable");
        navigate("/coaches");
        return;
      }

      const { data: roles } = await supabase
        .from("user_roles")
        .select("role, club_id")
        .eq("user_id", id);
      const coachRoles = (roles || []).filter((r) => r.role === "coach");
      if (coachRoles.length === 0) {
        toast.error("Cet utilisateur n'est pas coach");
        navigate("/coaches");
        return;
      }

      const { data: teamMembers } = await supabase
        .from("team_members")
        .select(
          "team_id, coach_role, teams!inner(id, name, season, club_id, deleted_at)"
        )
        .eq("user_id", id)
        .eq("member_type", "coach")
        .eq("is_active", true)
        .is("teams.deleted_at", null);

      const assignments: Assignment[] = (teamMembers || []).map((tm: any) => ({
        team_id: tm.teams.id,
        team_name: tm.teams.name,
        coach_role: (tm.coach_role as "referent" | "assistant") ?? "assistant",
        season: tm.teams.season ?? null,
      }));

      const teamIds = assignments.map((a) => a.team_id);
      let players: PlayerRow[] = [];
      if (teamIds.length > 0) {
        const { data: playerMembers } = await supabase
          .from("team_members")
          .select(
            "user_id, team_id, profiles!inner(id, first_name, last_name, nickname, deleted_at), teams!inner(name)"
          )
          .in("team_id", teamIds)
          .eq("member_type", "player")
          .eq("is_active", true)
          .is("profiles.deleted_at", null);

        const dedup = new Map<string, PlayerRow>();
        (playerMembers || []).forEach((pm: any) => {
          const fullName =
            pm.profiles.nickname?.trim() ||
            `${pm.profiles.first_name || ""} ${pm.profiles.last_name || ""}`.trim() ||
            "(sans nom)";
          // Dedup by player id; keep first team encountered.
          if (!dedup.has(pm.profiles.id)) {
            dedup.set(pm.profiles.id, {
              id: pm.profiles.id,
              name: fullName,
              team_id: pm.team_id,
              team_name: pm.teams.name,
            });
          }
        });
        players = Array.from(dedup.values());
      }

      let clubName: string | null = null;
      const clubId = profile.club_id || coachRoles[0]?.club_id || null;
      if (clubId) {
        const { data: club } = await supabase
          .from("clubs")
          .select("name")
          .eq("id", clubId)
          .is("deleted_at", null)
          .maybeSingle();
        clubName = club?.name || null;
      }

      setCoach({
        id: profile.id,
        email: profile.email,
        first_name: profile.first_name,
        last_name: profile.last_name,
        photo_url: profile.photo_url,
        club_id: clubId,
        club_name: clubName,
        assignments,
        players,
      });
    } catch (err: any) {
      console.error("CoachDetail fetch error:", err);
      toast.error("Erreur de chargement", { description: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleArchive = async () => {
    if (!coach) return;
    const fullName = `${coach.first_name || ""} ${coach.last_name || ""}`.trim();
    if (
      archiveConfirmText.trim().toLowerCase() !== fullName.toLowerCase() ||
      !fullName
    ) {
      toast.error("Le nom saisi ne correspond pas");
      return;
    }
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", coach.id);
      if (error) throw error;
      toast.success(`Coach ${fullName} archivé`);
      navigate("/coaches");
    } catch (err: any) {
      toast.error("Échec archivage", { description: err.message });
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  if (!coach) return null;

  const fullName =
    `${coach.first_name || ""} ${coach.last_name || ""}`.trim() || coach.email;
  const initials =
    `${(coach.first_name || "")[0] || ""}${(coach.last_name || "")[0] || ""}`.toUpperCase() ||
    coach.email[0]?.toUpperCase() ||
    "?";

  return (
    <AppLayout>
      <div className="space-y-6">
        <Button
          variant="ghost"
          className="-ml-2"
          onClick={() => navigate("/coaches")}
        >
          <ArrowLeft className="w-4 h-4 mr-1" /> Retour aux coachs
        </Button>

        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row gap-6 items-start">
              <Avatar className="w-24 h-24">
                <AvatarImage src={coach.photo_url || undefined} alt={fullName} />
                <AvatarFallback className="bg-orange-500/10 text-orange-500 text-2xl font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
                  {fullName}
                </h1>
                <div className="mt-2 flex items-center gap-2 text-muted-foreground">
                  <Mail className="w-4 h-4 shrink-0" />
                  <span className="truncate">{coach.email}</span>
                </div>
                {coach.club_name && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {coach.club_name}
                  </p>
                )}
              </div>
              {canEdit && (
                <div className="flex flex-col sm:flex-row gap-2 shrink-0">
                  <Button
                    variant="outline"
                    onClick={() => setShowEditModal(true)}
                  >
                    <Pencil className="w-4 h-4 mr-1 text-blue-500" />
                    Modifier
                  </Button>
                  {!isOwnProfile && (
                    <Button
                      variant="outline"
                      onClick={() => setShowArchiveDialog(true)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4 mr-1" />
                      Archiver
                    </Button>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="teams">
          <TabsList className="h-12">
            <TabsTrigger value="teams" className="px-6">
              Équipes ({coach.assignments.length})
            </TabsTrigger>
            <TabsTrigger value="players" className="px-6">
              Joueurs ({coach.players.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="teams" className="mt-4">
            {coach.assignments.length === 0 ? (
              <p className="text-muted-foreground text-sm py-8 text-center">
                Ce coach n'est rattaché à aucune équipe.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {coach.assignments.map((a) => (
                  <Card
                    key={a.team_id}
                    className="cursor-pointer hover:border-primary/40 transition-colors"
                    onClick={() => navigate(`/teams/${a.team_id}`)}
                  >
                    <CardContent className="p-4 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{a.team_name}</p>
                        {a.season && (
                          <p className="text-xs text-muted-foreground">
                            Saison {a.season}
                          </p>
                        )}
                      </div>
                      <Badge
                        variant={
                          a.coach_role === "referent" ? "default" : "secondary"
                        }
                      >
                        {a.coach_role === "referent" ? "Référent" : "Assistant"}
                      </Badge>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="players" className="mt-4">
            {coach.players.length === 0 ? (
              <p className="text-muted-foreground text-sm py-8 text-center">
                Aucun joueur dans les équipes encadrées.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {coach.players.map((p) => (
                  <Card
                    key={p.id}
                    className="cursor-pointer hover:border-primary/40 transition-colors"
                    onClick={() => navigate(`/players/${p.id}`)}
                  >
                    <CardContent className="p-4 flex items-center justify-between gap-2">
                      <p className="font-medium truncate">{p.name}</p>
                      <Badge variant="outline" className="shrink-0">
                        {p.team_name}
                      </Badge>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {showEditModal && (
        <EditCoachModal
          key={coach.id}
          open={showEditModal}
          onOpenChange={(open) => {
            setShowEditModal(open);
            if (!open) fetchCoach();
          }}
          coach={{
            id: coach.id,
            email: coach.email,
            first_name: coach.first_name,
            last_name: coach.last_name,
            photo_url: coach.photo_url,
            club_id: coach.club_id,
            assignments: coach.assignments.map((a) => ({
              team_id: a.team_id,
              team_name: a.team_name,
              coach_role: a.coach_role,
            })),
          }}
          onSuccess={fetchCoach}
        />
      )}

      <AlertDialog
        open={showArchiveDialog}
        onOpenChange={(open) => {
          setShowArchiveDialog(open);
          if (!open) setArchiveConfirmText("");
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archiver le coach {fullName} ?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Cette action archive le profil du coach (soft-delete). Ses
                  affectations restent en base pour traçabilité.
                </p>
                <p>
                  Pour confirmer, tapez le nom complet :{" "}
                  <strong>{fullName}</strong>
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={archiveConfirmText}
            onChange={(e) => setArchiveConfirmText(e.target.value)}
            placeholder={fullName}
            autoComplete="off"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleArchive();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Archiver
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}