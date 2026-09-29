/**
 * @component ChildAccessPanel
 * @description Accès d'un joueur inscrit sans adresse e-mail (identifiant
 *              technique), dans la colonne de sa fiche : identifiant, demande
 *              « mot de passe oublié » en cours, code actif, et bouton
 *              « Générer l'accès ».
 *
 *              Le code d'accès est à usage unique (7 jours) et ne s'affiche
 *              qu'une fois. Il ne remplace PAS le mot de passe actuel : l'enfant
 *              s'en sert sur /code-acces pour choisir son propre mot de passe.
 *              Droits et anti-abus portés par la fonction child-access.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Printer } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { getEdgeFunctionErrorInfo } from "@/lib/edge-function-errors";

interface GeneratedAccess {
  code: string;
  identifier: string;
  expires_at: string;
  child_name: string;
}

interface AccessStatus {
  open_request_at: string | null;
  request_count: number | null;
  active_code_expires_at: string | null;
  last_code_used_at: string | null;
}

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Fiche de connexion imprimable, à remettre à l'enfant. */
function printAccessSheet(access: GeneratedAccess, clubName: string | undefined) {
  const win = window.open("", "_blank", "width=640,height=720");
  if (!win) {
    toast.error("Impression impossible", { description: "Autorisez l'ouverture de fenêtres pour ce site." });
    return;
  }
  const loginUrl = `${window.location.origin}/code-acces`;
  win.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8">
<title>Accès MATCHS360 — ${escapeHtml(access.child_name)}</title>
<style>
  body{font-family:Arial,Helvetica,sans-serif;color:#111827;padding:32px;}
  .card{border:2px dashed #94a3b8;border-radius:12px;padding:24px;max-width:480px;}
  h1{font-size:20px;margin:0 0 4px;color:#2563eb;} .muted{color:#6b7280;font-size:13px;}
  .row{margin:16px 0;} .label{font-size:12px;text-transform:uppercase;color:#6b7280;}
  .value{font-family:monospace;font-size:22px;font-weight:bold;letter-spacing:1px;}
  ol{font-size:14px;line-height:1.6;padding-left:20px;}
</style></head><body><div class="card">
  <h1>MATCHS360</h1>
  <p class="muted">${escapeHtml(clubName ?? "")}</p>
  <p><strong>${escapeHtml(access.child_name)}</strong>, voici ton accès.</p>
  <div class="row"><div class="label">Identifiant</div><div class="value">${escapeHtml(access.identifier)}</div></div>
  <div class="row"><div class="label">Code d'accès (une seule fois)</div><div class="value">${escapeHtml(access.code)}</div></div>
  <ol>
    <li>Va sur <strong>${escapeHtml(loginUrl)}</strong> (ou « J'ai un code d'accès » sur la page de connexion).</li>
    <li>Tape ton identifiant et ce code.</li>
    <li>Choisis ton propre mot de passe (12 caractères minimum) et garde-le pour toi.</li>
  </ol>
  <p class="muted">Code valable jusqu'au ${escapeHtml(formatDateTime(access.expires_at))}. Ensuite, tu te connectes avec ton identifiant et ton mot de passe.</p>
</div><script>window.onload=function(){window.print();}</script></body></html>`);
  win.document.close();
}

export function ChildAccessPanel({
  childId,
  identifier,
  childFirstName,
  clubName,
}: {
  childId: string;
  identifier: string;
  childFirstName: string;
  clubName?: string;
}) {
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState<GeneratedAccess | null>(null);

  const statusKey = ["child-access-status", childId];
  const { data: status } = useQuery({
    queryKey: statusKey,
    queryFn: async (): Promise<AccessStatus | null> => {
      const { data, error } = await supabase.rpc(
        "get_child_access_status" as never,
        { _child_id: childId } as never,
      );
      if (error) {
        console.error("get_child_access_status failed", error);
        return null;
      }
      return ((data as AccessStatus[] | null) ?? [])[0] ?? null;
    },
  });

  const generate = async () => {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("child-access", {
        body: { action: "generate", child_id: childId },
      });
      if (error) {
        const info = await getEdgeFunctionErrorInfo(error);
        toast.error("Impossible de générer l'accès", { description: info.message });
        return;
      }
      setGenerated(data as GeneratedAccess);
      setConfirmOpen(false);
      queryClient.invalidateQueries({ queryKey: statusKey });
    } catch (e) {
      toast.error("Impossible de générer l'accès", { description: (e as Error).message });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl p-3 mb-3">
      <p className="text-[10px] font-bold text-muted-foreground mb-2 uppercase tracking-wide">
        Accès de {childFirstName}
      </p>
      <p className="text-[11px] text-muted-foreground">
        Identifiant : <span className="font-mono font-medium text-foreground">{identifier}</span>
      </p>
      {status?.open_request_at && (
        <p className="mt-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-400">
          A oublié son mot de passe (demande du {formatDateTime(status.open_request_at)})
        </p>
      )}
      {status?.active_code_expires_at && !status.open_request_at && (
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          Un code est en attente d'utilisation (jusqu'au {formatDateTime(status.active_code_expires_at)}).
        </p>
      )}
      <Button
        variant="outline"
        size="sm"
        className="mt-2 w-full gap-1.5 justify-start text-[11px] h-9 px-2.5 font-semibold text-foreground"
        onClick={() => setConfirmOpen(true)}
      >
        <KeyRound className="w-3.5 h-3.5 text-accent" />Générer l'accès
      </Button>

      {/* Confirmation */}
      <AlertDialog open={confirmOpen} onOpenChange={(o) => !generating && setConfirmOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Générer un code d'accès pour {childFirstName} ?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  Un code à usage unique, valable 7 jours, va s'afficher une seule fois. Remettez-le
                  à {childFirstName} en main propre : il s'en servira pour choisir son propre mot de
                  passe.
                </p>
                <p>
                  Son mot de passe actuel reste valable d'ici là. Un code déjà remis et non utilisé
                  est annulé. Son représentant légal est prévenu par e-mail.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={generating}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={generating}
              onClick={(e) => {
                e.preventDefault();
                generate();
              }}
            >
              {generating ? "Génération..." : "Générer le code"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Résultat : affiché une seule fois */}
      <AlertDialog open={!!generated} onOpenChange={(o) => !o && setGenerated(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Accès de {generated?.child_name}</AlertDialogTitle>
            <AlertDialogDescription>
              Notez ou imprimez ce code maintenant : il ne sera plus affiché.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {generated && (
            <div className="space-y-3">
              <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Identifiant</p>
                  <p className="font-mono text-lg font-bold">{generated.identifier}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Code d'accès (une seule fois)</p>
                  <p className="font-mono text-lg font-bold break-all">{generated.code}</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Sur la page de connexion, {childFirstName} clique sur « J'ai un code d'accès », tape son
                identifiant et ce code, puis choisit son mot de passe. Code valable jusqu'au{" "}
                {formatDateTime(generated.expires_at)}.
              </p>
            </div>
          )}
          <AlertDialogFooter>
            <Button
              variant="outline"
              onClick={() => generated && printAccessSheet(generated, clubName)}
              className="gap-2"
            >
              <Printer className="w-4 h-4" />Imprimer la fiche
            </Button>
            <AlertDialogAction onClick={() => setGenerated(null)}>Terminé</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
