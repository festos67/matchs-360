import { useNavigate } from "react-router-dom";
import { ArrowRightLeft, ClipboardList, Edit, Heart, Plus, Star, Trash2, Users } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatAverage } from "@/lib/evaluation-utils";
import type { Player, TeamMembership, ReferentCoach, Evaluation } from "@/hooks/usePlayerData";
import { getPlayerName } from "@/hooks/usePlayerData";

interface PlayerHeaderProps {
  player: Player;
  teamMembership: TeamMembership | null;
  referentCoach: ReferentCoach | null;
  overallAverage: number | null;
  evaluations: Evaluation[];
  frameworkId: string | null;
  canEvaluate: boolean;
  canMutate: boolean;
  isAdmin: boolean;
  isPlayerViewingOwnProfile: boolean;
  isViewingHistory: boolean;
  hasDraftEvaluation: boolean;
  progressionData: { percent: number | null };
  // Callbacks
  onNewEvaluation: (resume: boolean) => void;
  onRequestSelfEval: () => void;
  onRequestSupporterEval: () => void;
  onEditPlayer: () => void;
  onTransferPlayer: () => void;
  onManageSupporters: () => void;
  onRefresh: () => void;
}

export function PlayerHeader({
  player,
  teamMembership,
  referentCoach,
  overallAverage,
  evaluations,
  frameworkId,
  canEvaluate,
  canMutate,
  isAdmin,
  isPlayerViewingOwnProfile,
  isViewingHistory,
  hasDraftEvaluation,
  progressionData,
  onNewEvaluation,
  onRequestSelfEval,
  onRequestSupporterEval,
  onEditPlayer,
  onTransferPlayer,
  onManageSupporters,
  onRefresh,
}: PlayerHeaderProps) {
  const navigate = useNavigate();
  const teamColor = teamMembership?.team?.club?.primary_color || "#3B82F6";
  const playerName = getPlayerName(player);
  const coachEvalCount = evaluations.filter(e => e.type === "coach" && !e.deleted_at).length;

  return (
    <div className="glass-card p-8 mb-8">
      <div className="flex items-start gap-8">
        {/* Avatar */}
        <div
          className="w-32 h-32 rounded-2xl flex items-center justify-center text-4xl font-display font-bold shrink-0"
          style={{
            background: player.photo_url
              ? `url(${player.photo_url}) center/cover`
              : `linear-gradient(135deg, ${teamColor} 0%, ${teamColor}88 100%)`,
            color: "white",
          }}
        >
          {!player.photo_url && (() => {
            const fullName = `${player.first_name || ""} ${player.last_name || ""}`.trim();
            const initials = (fullName || player.nickname || "J").split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
            return initials;
          })()}
        </div>

        <div className="flex-1">
          <h1 className="text-3xl font-display font-bold mb-2">
            {player.first_name || player.last_name
              ? `${player.first_name || ""} ${player.last_name || ""}`.trim()
              : player.nickname || "Joueur"}
          </h1>
          {player.nickname && (player.first_name || player.last_name) && (
            <p className="text-muted-foreground italic">{player.nickname}</p>
          )}
          <p className="text-muted-foreground">{player.email}</p>
          {teamMembership && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground mt-1 flex-wrap">
              <span>{teamMembership.team.club?.name}</span>
              <span className="text-muted-foreground/50">·</span>
              <span>{teamMembership.team.name}</span>
              {referentCoach && (
                <>
                  <span className="text-muted-foreground/50">·</span>
                  <span>Coach {referentCoach.first_name} {referentCoach.last_name}</span>
                </>
              )}
            </div>
          )}

          {/* Stats */}
          <div className="flex gap-6 mt-6">
            <div className="text-center">
              <p className="text-3xl font-display font-bold text-primary">{formatAverage(overallAverage)}</p>
              <p className="text-sm text-muted-foreground">Score moyen</p>
            </div>
            <div className="w-px bg-border" />
            <div className="text-center">
              <p className="text-3xl font-display font-bold">{coachEvalCount}</p>
              <p className="text-sm text-muted-foreground">Débriefs officiels</p>
            </div>
            <div className="w-px bg-border" />
            <div className="text-center">
              {progressionData.percent !== null ? (
                <>
                  <p className={`text-3xl font-display font-bold ${progressionData.percent >= 0 ? "text-success" : "text-destructive"}`}>
                    {progressionData.percent >= 0 ? "+" : ""}{progressionData.percent.toFixed(0)}%
                  </p>
                  <p className="text-sm text-muted-foreground">Progression</p>
                </>
              ) : (
                <>
                  <p className="text-3xl font-display font-bold text-muted-foreground">-</p>
                  <p className="text-sm text-muted-foreground">Progression</p>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        {!isPlayerViewingOwnProfile && (
          <div className="flex items-start gap-3 ml-auto">
            {/* Débriefs bloc */}
            {canEvaluate && teamMembership && (
              <div className="border border-border rounded-xl p-3 min-w-[220px]">
                <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wide">Débriefs</p>
                <div className="flex flex-col gap-1.5">
                  {!isViewingHistory && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button className="w-full gap-2 justify-start bg-primary text-primary-foreground hover:bg-primary/90 h-11 text-base px-4">
                          <ClipboardList className="w-5 h-5" />Nouveau débrief coach
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{hasDraftEvaluation ? "Débrief en cours" : "Nouveau débrief"}</AlertDialogTitle>
                          <AlertDialogDescription>
                            {hasDraftEvaluation
                              ? "Un débrief a été sauvegardé en brouillon. Souhaitez-vous le poursuivre ou en démarrer un nouveau ?"
                              : `Voulez-vous créer un nouveau débrief pour ${playerName} ?`}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Annuler</AlertDialogCancel>
                          {hasDraftEvaluation ? (
                            <>
                              <AlertDialogAction onClick={() => onNewEvaluation(false)} className="bg-secondary text-secondary-foreground hover:bg-secondary/80">
                                Nouveau débrief
                              </AlertDialogAction>
                              <AlertDialogAction onClick={() => onNewEvaluation(true)}>
                                Poursuivre le débrief
                              </AlertDialogAction>
                            </>
                          ) : (
                            <AlertDialogAction onClick={() => onNewEvaluation(false)}>Confirmer</AlertDialogAction>
                          )}
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm" className="w-full gap-2 justify-start text-sm h-9 px-4">
                        <Star className="w-4 h-4 text-emerald-500" />Débrief joueur
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Demande d'auto-débrief</AlertDialogTitle>
                        <AlertDialogDescription>
                          Envoyer une demande d'auto-débrief à {playerName} ?
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Annuler</AlertDialogCancel>
                        <AlertDialogAction className="bg-emerald-500 text-white hover:bg-emerald-600" onClick={onRequestSelfEval}>
                          Envoyer la demande
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                  <Button variant="outline" size="sm" className="w-full gap-2 justify-start text-sm h-9 px-4" onClick={onRequestSupporterEval}>
                    <Heart className="w-4 h-4 text-warning" />Débrief supporter
                  </Button>
                </div>
              </div>
            )}

            {/* Gestion joueur */}
            <div className="flex flex-col gap-1.5 justify-center self-center min-w-[200px]">
              {canMutate && (
                <Button variant="outline" size="sm" className="w-full gap-2 justify-start text-sm h-9 px-4" onClick={onEditPlayer}>
                  <Edit className="w-4 h-4 text-blue-500" />Modifier joueur
                </Button>
              )}
              {canMutate && teamMembership && (
                <Button variant="outline" size="sm" className="w-full gap-2 justify-start text-sm h-9 px-4" onClick={onTransferPlayer}>
                  <ArrowRightLeft className="w-4 h-4 text-primary" />Transférer joueur
                </Button>
              )}
              {canEvaluate && teamMembership && (
                <Button variant="outline" size="sm" className="w-full gap-2 justify-start text-sm h-9 px-4" onClick={onManageSupporters}>
                  <Users className="w-4 h-4 text-primary" />Gestion des supporters
                </Button>
              )}
              {isAdmin && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" className="w-full gap-2 justify-start text-sm h-9 px-4 text-destructive hover:bg-destructive/10 border-destructive/30">
                      <Trash2 className="w-4 h-4" />Supprimer joueur
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Supprimer ce joueur ?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Cette action supprimera définitivement le joueur {playerName}. Cette action est irréversible.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel className="bg-primary text-primary-foreground hover:bg-primary/90">Annuler</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={async () => {
                          try {
                            const { error: profileError } = await supabase.from("profiles").update({ deleted_at: new Date().toISOString() }).eq("id", player.id);
                            if (profileError) throw profileError;
                            const { error: memberError } = await supabase.from("team_members").update({ is_active: false, left_at: new Date().toISOString() }).eq("user_id", player.id);
                            if (memberError) throw memberError;
                            toast.success("Joueur supprimé avec succès");
                            navigate(-1);
                          } catch (error) {
                            console.error("Error deleting player:", error);
                            toast.error("Erreur lors de la suppression");
                          }
                        }}
                        className="bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground border border-destructive/30"
                      >
                        Supprimer
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
