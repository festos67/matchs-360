/**
 * @component PrivacyNoticeGate
 * @description Affiche la notice d'information à tout utilisateur connecté qui
 *              n'en a pas encore accusé lecture pour la version courante, et
 *              enregistre l'accusé (date + version). Posée dans ProtectedRoute :
 *              elle couvre tous les rôles et tous les âges.
 *
 *              Ce n'est pas un consentement : c'est la preuve que l'information
 *              a été délivrée. En cas d'erreur de lecture (après 2 nouvelles
 *              tentatives), la page n'est pas bloquée et rien n'est mis en
 *              cache : la vérification repart à l'affichage suivant d'une page
 *              protégée. À l'ouverture, le focus est placé dans la fenêtre.
 */
import { useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { PrivacyNoticeContent } from "@/components/legal/PrivacyNoticeContent";
import { PRIVACY_NOTICE_VERSION, PRIVACY_PAGE_PATH } from "@/lib/privacy-notice";

export function PrivacyNoticeGate({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const checkboxRef = useRef<HTMLButtonElement>(null);

  const queryKey = ["privacy-notice-ack", user?.id, PRIVACY_NOTICE_VERSION];

  const { data: acknowledged } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "has_acknowledged_privacy_notice" as never,
        { _version: PRIVACY_NOTICE_VERSION } as never,
      );
      // Une erreur est levée, jamais convertie en « déjà lu » : la mettre en
      // cache (staleTime infini) masquerait la notice pour toute la session.
      if (error) throw error;
      return data === true;
    },
    enabled: !!user,
    // Seul un résultat réussi est gardé pour la session. En erreur, rien
    // n'est mis en cache : la vérification repart au prochain affichage
    // d'une page protégée.
    staleTime: Infinity,
    retry: 2,
  });

  const handleAcknowledge = async () => {
    if (!checked || saving) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc(
        "acknowledge_privacy_notice" as never,
        { _version: PRIVACY_NOTICE_VERSION } as never,
      );
      if (error) throw error;
      queryClient.setQueryData(queryKey, true);
    } catch (e) {
      console.error("acknowledge_privacy_notice failed", e);
      toast.error("Impossible d'enregistrer votre accusé de lecture", {
        description: "Vérifiez votre connexion et réessayez.",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {children}
      <AlertDialog open={!!user && acknowledged === false}>
        <AlertDialogContent
          className="flex max-h-[90dvh] max-w-2xl flex-col"
          // Sans bouton « Annuler », Radix ne place le focus nulle part : on
          // l'envoie sur la case à cocher pour la navigation au clavier et les
          // lecteurs d'écran.
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            checkboxRef.current?.focus();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Vos données sur MATCHS360</AlertDialogTitle>
            <AlertDialogDescription>
              Avant de continuer, prenez connaissance de la façon dont vos données sont utilisées.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div
            tabIndex={0}
            role="region"
            aria-label="Information sur l'utilisation de vos données"
            className="min-h-0 flex-1 overflow-y-auto rounded-lg border bg-muted/20 p-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <PrivacyNoticeContent />
          </div>

          <label className="flex cursor-pointer items-start gap-3 text-sm">
            <Checkbox
              ref={checkboxRef}
              checked={checked}
              onCheckedChange={(v) => setChecked(v === true)}
              className="mt-0.5"
            />
            <span>
              J'ai pris connaissance de l'information sur l'utilisation de mes données.{" "}
              <a
                href={PRIVACY_PAGE_PATH}
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline"
              >
                Ouvrir dans un nouvel onglet
              </a>
            </span>
          </label>

          <AlertDialogFooter>
            <Button onClick={handleAcknowledge} disabled={!checked || saving}>
              {saving ? "Enregistrement..." : "Continuer"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
