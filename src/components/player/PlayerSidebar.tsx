/**
 * @component PlayerSidebar
 * @description Carte latérale (sidebar) de la fiche joueur affichant identité,
 *              équipe, et toutes les actions de gestion (modales, exports, mutations).
 *              Actions alignées à droite et masquées pour le joueur lui-même.
 * @access Coachs, Responsables Club, Super Admin (actions). Joueur (vue identité).
 * @features
 *  - Avatar, nom, surnom, équipe et club
 *  - Bouton "Nouveau débrief" (Plus) — selon permissions
 *  - Bouton "Auto-débrief" (Star) pour le joueur uniquement
 *  - Modale ManageSupporters (Heart)
 *  - Modale RequestSupporterEvaluation (Heart orange)
 *  - Modale PlayerMutation (ArrowRightLeft)
 *  - Modale EditPlayer (Edit bleu)
 *  - Bouton Export PDF (Printer)
 *  - Bouton Soft Delete (Trash2) — Super Admin uniquement
 *  - Lock icon si pas d'équipe assignée (débrief impossible)
 * @maintenance
 *  - Layout actions : mem://features/player/management-actions-layout
 *  - Restrictions joueur : mem://features/player/interface-restrictions
 *  - Disponibilité débrief : mem://logic/player-debrief-availability
 *  - Permissions joueur : mem://logic/permissions-joueurs
 *  - Edit icon bleu : mem://style/ui-patterns/management-actions
 */
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { ArrowLeft, ArrowRightLeft, Award, ClipboardList, Edit, Heart, Lock, Plus, Printer, Star, Trash2, Users } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatAverage } from "@/lib/evaluation-utils";
import { usePlan } from "@/hooks/usePlan";
import type { Player, TeamMembership, ReferentCoach, Evaluation } from "@/hooks/usePlayerData";
import { getPlayerName } from "@/hooks/usePlayerData";

interface PlayerSidebarProps {
  player: Player;
  teamMembership: TeamMembership | null;
  referentCoach: ReferentCoach | null;
  overallAverage: number | null;
  evaluations: Evaluation[];
  canEvaluate: boolean;
  canMutate: boolean;
  isAdmin: boolean;
  isPlayerViewingOwnProfile: boolean;
  isViewingHistory: boolean;
  hasDraftEvaluation: boolean;
  hasSelectedEvaluation: boolean;
  progressionData: { percent: number | null };
  onNewEvaluation: (resume: boolean) => void;
  onRequestSelfEval: () => void;
  onRequestSupporterEval: () => void;
  onEditPlayer: () => void;
  onTransferPlayer: () => void;
  onManageSupporters: () => void;
  onPrint: () => void;
  onCreateCertificate?: () => void;
}

export function PlayerSidebar({
  player,
  teamMembership,
  referentCoach,
  overallAverage,
  evaluations,
  canEvaluate,
  canMutate,
  isAdmin,
  isPlayerViewingOwnProfile,
  isViewingHistory,
  hasDraftEvaluation,
  hasSelectedEvaluation,
  progressionData,
  onNewEvaluation,
  onRequestSelfEval,
  onRequestSupporterEval,
  onEditPlayer,
  onTransferPlayer,
  onManageSupporters,
  onPrint,
  onCreateCertificate,
}: PlayerSidebarProps) {
  const navigate = useNavigate();
  const teamColor = teamMembership?.team?.club?.primary_color || "hsl(var(--primary))";
  const playerName = getPlayerName(player);
  const coachEvalCount = evaluations.filter(e => e.type === "coach" && !e.deleted_at).length;

  const fullName = `${player.first_name || ""} ${player.last_name || ""}`.trim();
  const displayName = fullName || player.nickname || "Joueur";
  const initials = (fullName || player.nickname || "J")
    .split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();

  return (
    <aside className="lg:w-[240px] lg:flex-shrink-0 lg:border border-border lg:bg-card lg:rounded-2xl lg:mx-3 lg:mb-3 lg:mt-2 p-4 lg:max-h-[calc(100vh-1rem)] lg:sticky lg:top-2 lg:overflow-y-auto custom-scrollbar">
      {/* Bouton retour — masqué quand le joueur consulte son propre profil (page de menu) */}
      {!isPlayerViewingOwnProfile && (
        <Button
          variant="ghost"
          size="sm"
          className="mb-3 -ml-2 text-[12px] text-muted-foreground"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />Retour
        </Button>
      )}

      {/* Card profil */}
      <div className="bg-card border border-border rounded-2xl p-4 flex flex-col items-center text-center mb-3">
        {/* Avatar cercle */}
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-display font-extrabold overflow-hidden mb-3"
          style={{
            background: player.photo_url
              ? `url(${player.photo_url}) center/cover`
              : `linear-gradient(135deg, ${teamColor} 0%, ${teamColor}88 100%)`,
            color: "white",
          }}
        >
          {!player.photo_url && initials}
        </div>

        <h1 className="font-display text-[16px] font-extrabold text-card-foreground tracking-tight leading-tight">
          {displayName}
        </h1>
        {player.nickname && fullName && (
          <p className="text-[11px] text-muted-foreground italic mt-0.5">{player.nickname}</p>
        )}
        {teamMembership && (
          <div className="text-[11px] text-muted-foreground mt-1.5 leading-snug">
            <div className="font-medium">{teamMembership.team.name}</div>
            <div className="opacity-75">{teamMembership.team.club?.name}</div>
            {referentCoach && (
              <div className="opacity-75 mt-0.5">
                Coach {referentCoach.first_name} {referentCoach.last_name}
              </div>
            )}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-1 w-full mt-3 pt-3 border-t border-border">
          <div>
            <p className="font-display text-[16px] font-extrabold text-primary leading-none">
              {formatAverage(overallAverage)}
            </p>
            <p className="text-[9px] text-muted-foreground mt-0.5 uppercase tracking-wide">Score</p>
          </div>
          <div>
            <p className="font-display text-[16px] font-extrabold text-foreground leading-none">{coachEvalCount}</p>
            <p className="text-[9px] text-muted-foreground mt-0.5 uppercase tracking-wide">Débriefs</p>
          </div>
          <div>
            {progressionData.percent !== null ? (
              <p className={`font-display text-[16px] font-extrabold leading-none ${progressionData.percent >= 0 ? "text-success" : "text-destructive"}`}>
                {progressionData.percent >= 0 ? "+" : ""}{progressionData.percent.toFixed(0)}%
              </p>
            ) : (
              <p className="font-display text-[16px] font-extrabold text-muted-foreground leading-none">-</p>
            )}
            <p className="text-[9px] text-muted-foreground mt-0.5 uppercase tracking-wide">Progr.</p>
          </div>
        </div>
      </div>

      {/* Débriefs bloc */}
      {!isPlayerViewingOwnProfile && canEvaluate && teamMembership && (
        <div className="bg-card border border-border rounded-xl p-3 mb-3">
          <p className="text-[10px] font-bold text-muted-foreground mb-2 uppercase tracking-wide">Débriefs</p>
          <div className="flex flex-col gap-1.5">
            {!isViewingHistory && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full gap-2 justify-start h-9 text-[11px] font-semibold px-2.5 text-foreground border-orange-500/50 hover:bg-secondary hover:border-orange-500"
                  >
                    <Plus className="w-4 h-4 text-orange-500 shrink-0" aria-hidden="true" />
                    <span className="flex-1 text-left truncate">Nouveau débrief</span>
                    <ClipboardList className="w-4 h-4 text-orange-500 shrink-0" aria-hidden="true" />
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
                <Button variant="outline" size="sm" className="w-full gap-1.5 justify-start text-[11px] h-9 px-2.5 font-semibold text-primary">
                  <Star className="w-3.5 h-3.5 text-accent" />Auto-débrief joueur
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Demande d'auto-débrief</AlertDialogTitle>
                  <AlertDialogDescription>Envoyer une demande d'auto-débrief à {playerName} ?</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annuler</AlertDialogCancel>
                  <AlertDialogAction className="bg-accent text-accent-foreground hover:bg-accent/90" onClick={onRequestSelfEval}>
                    Envoyer la demande
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button variant="outline" size="sm" className="w-full gap-1.5 justify-start text-[11px] h-9 px-2.5 font-semibold text-primary" onClick={onRequestSupporterEval}>
              <Heart className="w-3.5 h-3.5 text-accent" />Avis supporter
            </Button>
            {hasSelectedEvaluation && (
              <PrintResultButton onPrint={onPrint} />
            )}
          </div>
        </div>
      )}

      {/* Bloc joueur : impression de son propre résultat */}
      {isPlayerViewingOwnProfile && hasSelectedEvaluation && (
        <div className="bg-card border border-border rounded-xl p-3 mb-3">
          <p className="text-[10px] font-bold text-muted-foreground mb-2 uppercase tracking-wide">Mon débrief</p>
          <div className="flex flex-col gap-1.5">
            <PrintResultButton onPrint={onPrint} />
          </div>
        </div>
      )}

      {/* Gestion joueur */}
      {!isPlayerViewingOwnProfile && (canMutate || canEvaluate || isAdmin) && (
        <div className="bg-card border border-border rounded-xl p-3 mb-3">
          <p className="text-[10px] font-bold text-muted-foreground mb-2 uppercase tracking-wide">Gestion</p>
          <div className="flex flex-col gap-1.5">
            {canMutate && (
              <Button variant="outline" size="sm" className="w-full gap-1.5 justify-start text-[11px] h-9 px-2.5 font-semibold text-primary" onClick={onEditPlayer}>
                <Edit className="w-3.5 h-3.5 text-accent" />Modifier joueur
              </Button>
            )}
            {canMutate && teamMembership && (
              <Button variant="outline" size="sm" className="w-full gap-1.5 justify-start text-[11px] h-9 px-2.5 font-semibold text-primary" onClick={onTransferPlayer}>
                <ArrowRightLeft className="w-3.5 h-3.5 text-accent" />Transférer joueur
              </Button>
            )}
            {canEvaluate && teamMembership && (
              <Button variant="outline" size="sm" className="w-full gap-1.5 justify-start text-[11px] h-9 px-2.5 font-semibold text-primary" onClick={onManageSupporters}>
                <Users className="w-3.5 h-3.5 text-accent" />Invitation supporters
              </Button>
            )}
            {isAdmin && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full gap-1.5 justify-start text-[11px] h-9 px-2.5 font-semibold text-destructive hover:bg-destructive/10 border-destructive/30">
                    <Trash2 className="w-3.5 h-3.5" />Supprimer joueur
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

      {/* Attestation de compétences (Coach / Club Admin uniquement) */}
      {!isPlayerViewingOwnProfile && (canEvaluate || canMutate) && onCreateCertificate && (
        <div className="bg-card border border-border rounded-xl p-3 mb-3">
          <p className="text-[10px] font-bold text-muted-foreground mb-2 uppercase tracking-wide">Attestation</p>
          <Button
            variant="outline"
            className="w-full gap-2 justify-start h-9 text-[11px] font-semibold px-2.5 text-foreground border-green-500/50 hover:bg-secondary hover:border-green-500"
            onClick={onCreateCertificate}
          >
            <Plus className="w-4 h-4 text-green-600 shrink-0" aria-hidden="true" />
            <span className="flex-1 text-left truncate">Attestation de compétences</span>
            <Award className="w-4 h-4 text-green-600 shrink-0" aria-hidden="true" />
          </Button>
        </div>
      )}

    </aside>
  );
}

function PrintResultButton({ onPrint }: { onPrint: () => void }) {
  const navigate = useNavigate();
  const { isPro, isTrial } = usePlan();
  const canPrint = isPro || isTrial;
  const [open, setOpen] = useState(false);

  if (canPrint) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="w-full gap-1.5 justify-start text-[11px] h-9 px-2.5 font-semibold text-primary"
        onClick={onPrint}
      >
        <Printer className="w-3.5 h-3.5 text-accent" />Imprimer résultat
      </Button>
    );
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="w-full gap-1.5 justify-start text-[11px] h-9 px-2.5 font-semibold text-primary"
        >
          <Lock className="w-3.5 h-3.5 text-accent" />Imprimer résultat
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-primary" />
            L'export PDF est une fonctionnalité Pro
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <span className="block">
              L'export PDF des fiches joueur, avec le radar, le détail des compétences
              et les objectifs, est disponible avec le plan Pro.
            </span>
            <span className="block text-xs text-muted-foreground italic">
              Aperçu flouté ci-dessous — passez en Pro pour le débloquer.
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="relative h-32 rounded-lg border border-border overflow-hidden bg-muted/30 blur-sm opacity-60 pointer-events-none">
          <div className="p-3 space-y-2">
            <div className="h-3 bg-primary/30 rounded w-1/2" />
            <div className="h-2 bg-muted-foreground/30 rounded w-3/4" />
            <div className="h-2 bg-muted-foreground/30 rounded w-2/3" />
            <div className="mt-3 flex gap-2">
              <div className="w-16 h-16 rounded-full bg-primary/20" />
              <div className="flex-1 space-y-1">
                <div className="h-2 bg-muted-foreground/30 rounded w-full" />
                <div className="h-2 bg-muted-foreground/30 rounded w-5/6" />
                <div className="h-2 bg-muted-foreground/30 rounded w-4/6" />
              </div>
            </div>
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Plus tard</AlertDialogCancel>
          <AlertDialogAction onClick={() => navigate("/pricing")}>
            Passer en Pro
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}