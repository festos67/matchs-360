/**
 * @page SupporterInvitations
 * @route /supporter/invitations
 *
 * La personne choisie comme supporter d'un joueur donne (ou refuse) son
 * accord. Lien reçu par e-mail (« Répondre à l'invitation ») et par
 * notification. Tant qu'elle n'a pas accepté, elle n'a accès à rien.
 *
 * @access Tout utilisateur connecté (seules SES invitations sont listées).
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, Heart, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
import { useSupporterInvitations, type SupporterInvitation } from "@/hooks/useSupporterInvitations";
import { useAuth } from "@/hooks/useAuth";

const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });

export default function SupporterInvitations() {
  const { invitations, isLoading, respond } = useSupporterInvitations();
  const { roles } = useAuth();
  const [toDecline, setToDecline] = useState<SupporterInvitation | null>(null);
  const [acceptedCount, setAcceptedCount] = useState(0);

  const answer = async (inv: SupporterInvitation, accept: boolean) => {
    try {
      await respond.mutateAsync({ linkId: inv.id, accept });
      if (accept) {
        setAcceptedCount((n) => n + 1);
        toast.success(`Vous suivez désormais ${inv.player_name}`, {
          description: "Ses débriefs sont visibles dans votre espace supporter.",
        });
      } else {
        toast.success("Invitation refusée", { description: "Le club en est informé." });
      }
    } catch (e) {
      console.error("respond supporter invitation failed", e);
      toast.error("Votre réponse n'a pas pu être enregistrée. Réessayez.");
    }
  };

  const isSupporter = roles.some((r) => r.role === "supporter");

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-6 p-4 md:p-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Heart className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold">Invitations de supporter</h1>
            <p className="text-sm text-muted-foreground">
              Confirmez si vous souhaitez suivre ces joueurs. Rien n'est partagé avec vous avant votre accord.
            </p>
          </div>
        </div>

        {isLoading ? (
          <Skeleton className="h-28 w-full rounded-xl" />
        ) : invitations.length === 0 ? (
          <div className="rounded-xl border bg-card p-6 text-center space-y-3">
            <p className="text-muted-foreground">
              {acceptedCount > 0 ? "Merci, votre participation est confirmée." : "Aucune invitation en attente."}
            </p>
            {isSupporter && (
              <Button asChild variant="outline">
                <Link to="/supporter/dashboard">Aller à mon espace supporter</Link>
              </Button>
            )}
          </div>
        ) : (
          <ul className="space-y-3">
            {invitations.map((inv) => (
              <li key={inv.id} className="rounded-xl border bg-card p-4 space-y-3">
                <div>
                  <p className="font-semibold">{inv.player_name}</p>
                  <p className="text-sm text-muted-foreground">
                    {[inv.team_name, inv.club_name].filter(Boolean).join(" • ") || "Club"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Invitation envoyée le {fmt(inv.invited_at)}
                    {inv.invited_by_name ? ` par ${inv.invited_by_name}` : ""}
                  </p>
                </div>
                <p className="text-sm">
                  En acceptant, vous pourrez consulter les débriefs de {inv.player_name} et donner votre avis
                  lorsque son coach vous le demande. Vous pourrez demander au club de vous retirer à tout moment.
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button
                    className="gap-2 sm:flex-1"
                    disabled={respond.isPending}
                    onClick={() => answer(inv, true)}
                  >
                    {respond.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    J'accepte de suivre {inv.player_name}
                  </Button>
                  <Button
                    variant="outline"
                    className="gap-2"
                    disabled={respond.isPending}
                    onClick={() => setToDecline(inv)}
                  >
                    <X className="w-4 h-4" />
                    Je refuse
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <AlertDialog open={!!toDecline} onOpenChange={(o) => !o && setToDecline(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Refuser cette invitation ?</AlertDialogTitle>
            <AlertDialogDescription>
              Vous ne suivrez pas {toDecline?.player_name}. Le club sera informé de votre refus et
              pourra vous inviter à nouveau plus tard.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const inv = toDecline;
                setToDecline(null);
                if (inv) void answer(inv, false);
              }}
            >
              Refuser
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
