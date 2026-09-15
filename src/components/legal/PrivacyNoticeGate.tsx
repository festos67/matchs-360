/**
 * @component PrivacyNoticeGate
 * @description Affiche la notice d'information à tout utilisateur connecté qui
 *              n'en a pas encore accusé lecture pour la version courante, et
 *              enregistre l'accusé (date + version). Posée dans ProtectedRoute :
 *              elle couvre tous les rôles et tous les âges.
 *
 *              Ce n'est pas un consentement : c'est la preuve que l'information
 *              a été délivrée. En cas d'erreur de lecture, la page n'est pas
 *              bloquée (la fenêtre réapparaîtra à la prochaine vérification).
 */
import { useState, type ReactNode } from "react";
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

  const queryKey = ["privacy-notice-ack", user?.id, PRIVACY_NOTICE_VERSION];

  const { data: acknowledged } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "has_acknowledged_privacy_notice" as never,
        { _version: PRIVACY_NOTICE_VERSION } as never,
      );
      if (error) {
        console.error("has_acknowledged_privacy_notice failed", error);
        return true;
      }
      return data === true;
    },
    enabled: !!user,
    staleTime: Infinity,
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
        <AlertDialogContent className="flex max-h-[90dvh] max-w-2xl flex-col">
          <AlertDialogHeader>
            <AlertDialogTitle>Vos données sur MATCHS360</AlertDialogTitle>
            <AlertDialogDescription>
              Avant de continuer, prenez connaissance de la façon dont vos données sont utilisées.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border bg-muted/20 p-4">
            <PrivacyNoticeContent />
          </div>

          <label className="flex cursor-pointer items-start gap-3 text-sm">
            <Checkbox
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
