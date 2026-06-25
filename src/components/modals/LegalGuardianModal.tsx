/**
 * @modal LegalGuardianModal
 * @description Affiche le représentant légal désigné pour un joueur mineur
 *              (nom, prénom, email, lien avec l'enfant). Lecture seule.
 * @access Coach (référent/assistant), Responsable Club, Joueur lui-même.
 *         Supporters EXCLUS (policy RLS).
 */
import { useEffect, useState } from "react";
import { Loader2, Mail, Send, ShieldCheck, User } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface LegalGuardianModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  playerId: string;
  playerName: string;
  /**
   * Si vrai, affiche le bouton "Renvoyer la demande de consentement".
   * Réservé aux coachs et responsables club (jamais au joueur).
   */
  canResend?: boolean;
}

type GuardianDesignation = {
  guardian_email: string;
  guardian_first_name: string | null;
  guardian_last_name: string | null;
  relationship: "mere" | "pere" | "tuteur_legal" | "autre_titulaire";
  status: string;
};

const RELATIONSHIP_LABELS: Record<GuardianDesignation["relationship"], string> = {
  mere: "Mère",
  pere: "Père",
  tuteur_legal: "Tuteur légal",
  autre_titulaire: "Autre titulaire de l'autorité parentale",
};

export function LegalGuardianModal({
  open,
  onOpenChange,
  playerId,
  playerName,
  canResend = false,
}: LegalGuardianModalProps) {
  const [loading, setLoading] = useState(false);
  const [guardians, setGuardians] = useState<GuardianDesignation[]>([]);
  const [resending, setResending] = useState(false);

  const handleResend = async () => {
    setResending(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "resend-guardian-consent",
        { body: { playerId } },
      );
      if (error) {
        const msg = (data as { error?: string } | null)?.error
          || error.message
          || "Échec de l'envoi.";
        toast.error(msg);
      } else if ((data as { error?: string } | null)?.error) {
        toast.error((data as { error: string }).error);
      } else {
        toast.success("Demande de consentement renvoyée au représentant légal.");
      }
    } catch (e) {
      toast.error((e as Error)?.message ?? "Échec de l'envoi.");
    } finally {
      setResending(false);
    }
  };

  const hasPendingGuardian = guardians.some((g) => g.status !== "consented");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("guardian_designations")
        .select("guardian_email, guardian_first_name, guardian_last_name, relationship, status")
        .eq("minor_profile_id", playerId)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      if (error) {
        console.error("guardian designation fetch error", error);
        setGuardians([]);
      } else {
        setGuardians((data ?? []) as GuardianDesignation[]);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, playerId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-primary" />
            </div>
            Représentant légal
          </DialogTitle>
          <DialogDescription>
            Coordonnées du titulaire de l'autorité parentale désigné pour {playerName}.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-3">
          {loading && (
            <p className="text-sm text-muted-foreground">Chargement…</p>
          )}

          {!loading && guardians.length === 0 && (
            <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
              Aucun représentant légal n'a été désigné pour ce joueur.
            </div>
          )}

          {!loading &&
            guardians.map((g, idx) => {
              const fullName = [g.guardian_first_name, g.guardian_last_name]
                .filter(Boolean)
                .join(" ")
                .trim();
              return (
                <div
                  key={`${g.guardian_email}-${idx}`}
                  className="rounded-xl border border-border bg-card p-4 space-y-3"
                >
                  <div className="flex items-start gap-3">
                    <User className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        Nom et prénom
                      </p>
                      <p className="text-sm font-medium text-foreground break-words">
                        {fullName || <span className="italic text-muted-foreground">Non renseigné</span>}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <Mail className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        Email de contact
                      </p>
                      <a
                        href={`mailto:${g.guardian_email}`}
                        className="text-sm font-medium text-primary hover:underline break-words"
                      >
                        {g.guardian_email}
                      </a>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <ShieldCheck className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        Lien avec l'enfant
                      </p>
                      <p className="text-sm font-medium text-foreground">
                        {RELATIONSHIP_LABELS[g.relationship]}
                      </p>
                    </div>
                  </div>

                  {g.status !== "consented" && (
                    <p className="text-[11px] text-muted-foreground italic">
                      Statut de la désignation : {g.status}
                    </p>
                  )}
                </div>
              );
            })}

          {canResend && !loading && hasPendingGuardian && (
            <div className="pt-2">
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={handleResend}
                disabled={resending}
              >
                {resending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Send className="w-4 h-4 mr-2" />
                )}
                Renvoyer la demande de consentement
              </Button>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Un email de rappel sera envoyé au représentant légal avec un nouveau
                lien sécurisé pour donner son consentement.
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}