/**
 * @component PendingInvitationNote
 * @description Fiche joueur, pour le coach et le responsable du club : note
 *              quand le joueur n'a pas encore accepté son invitation ou que
 *              son représentant légal n'a pas encore donné son consentement.
 * @features
 *  - Une relance par e-mail possible, UNE seule fois par destinataire
 *    (remind-pending-invitation) ; ensuite, invitation à contacter la
 *    personne directement
 *  - Rien n'est affiché si tout est accepté ou si l'appelant n'a pas les
 *    droits (get_player_invitation_status renvoie NULL)
 */
import { useCallback, useEffect, useState } from "react";
import { MailWarning, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { getEdgeFunctionErrorInfo } from "@/lib/edge-function-errors";

interface InvitationStatus {
  player_pending: boolean;
  guardian_pending: boolean;
  player_reminded_at: string | null;
  guardian_reminded_at: string | null;
}

type Target = "player" | "guardian";

const fmt = (iso: string) =>
  new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });

export function PendingInvitationNote({ playerId }: { playerId: string }) {
  const [status, setStatus] = useState<InvitationStatus | null>(null);
  const [sending, setSending] = useState<Target | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc(
      "get_player_invitation_status" as never,
      { _player_id: playerId } as never,
    );
    if (error) {
      console.error("invitation status fetch failed", error);
      return;
    }
    setStatus((data ?? null) as unknown as InvitationStatus | null);
  }, [playerId]);

  useEffect(() => {
    load();
  }, [load]);

  const remind = async (target: Target) => {
    setSending(target);
    const { data, error } = await supabase.functions.invoke("remind-pending-invitation", {
      body: { playerId, target },
    });
    setSending(null);
    const payload = (data ?? {}) as { sentTo?: string; error?: string };
    if (error || payload.error) {
      const message = error ? (await getEdgeFunctionErrorInfo(error)).message : payload.error!;
      toast.error("Relance non envoyée", { description: message });
    } else {
      toast.success("Relance envoyée", {
        description: payload.sentTo ? `E-mail envoyé à ${payload.sentTo}.` : undefined,
      });
    }
    load();
  };

  if (!status) return null;
  // Tant que le consentement manque, le joueur ne peut pas être invité :
  // seule la relance du représentant légal a un sens.
  const items: { target: Target; label: string; remindedAt: string | null }[] = [];
  if (status.guardian_pending) {
    items.push({
      target: "guardian",
      label: "Le représentant légal n'a pas encore donné son consentement.",
      remindedAt: status.guardian_reminded_at,
    });
  } else if (status.player_pending) {
    items.push({
      target: "player",
      label: "Le joueur n'a pas encore accepté son invitation reçue par e-mail.",
      remindedAt: status.player_reminded_at,
    });
  }
  if (items.length === 0) return null;

  return (
    <div role="status" className="rounded-xl border border-border bg-muted/40 p-3 mb-3 space-y-2">
      {items.map((item) => (
        <div key={item.target} className="space-y-1.5">
          <p className="text-[11px] font-bold text-foreground flex items-center gap-1.5">
            <MailWarning className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            Invitation en attente
          </p>
          <p className="text-[11px] leading-snug text-muted-foreground">{item.label}</p>
          {item.remindedAt ? (
            <p className="text-[11px] leading-snug text-muted-foreground">
              Relance envoyée le {fmt(item.remindedAt)}. Pour ne pas multiplier les e-mails, contactez
              plutôt la personne directement.
            </p>
          ) : (
            <>
              <p className="text-[11px] leading-snug text-muted-foreground">
                Le mieux est de la contacter directement. Vous pouvez aussi renvoyer l'e-mail, une
                seule fois.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="w-full h-8 text-[11px] font-semibold"
                disabled={sending !== null}
                onClick={() => remind(item.target)}
              >
                {sending === item.target && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                Relancer par e-mail (une fois)
              </Button>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
