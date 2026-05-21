/**
 * @page PendingMinorConsent
 * @route /pending-minor-consent
 * @description Écran affiché aux mineurs < 15 ans dont le compte est
 *              `profiles.is_active = false` — c'est-à-dire qui n'ont pas
 *              encore reçu de consentement parental valide, ou dont le
 *              consentement a été révoqué (art. 7 §3 RGPD).
 *
 *              La RLS bloque déjà tout accès aux données applicatives ;
 *              cet écran est la couche UX qui empêche le rendu de l'app
 *              et explique au mineur ce qu'il doit faire.
 * @access Tout user connecté avec profiles.is_active = false
 * @maintenance I8-003 — gate is_active enforcé via RLS (couche 1) + écran (couche 2)
 */
import { Clock, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";

export default function PendingMinorConsent() {
  const { signOut, profile } = useAuth();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-lg w-full">
        <CardHeader>
          <div className="mx-auto h-12 w-12 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center mb-3">
            <Clock className="h-6 w-6" />
          </div>
          <CardTitle className="text-center">
            En attente du consentement parental
          </CardTitle>
          <CardDescription className="text-center">
            {profile?.first_name ? `Bonjour ${profile.first_name}, ton ` : "Ton "}
            compte est en attente d'activation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Conformément à l'article 8 du RGPD, les mineurs de moins de
            15 ans doivent obtenir le consentement d'un parent ou tuteur
            légal pour utiliser MATCHS360.
          </p>
          <p className="text-sm text-muted-foreground">
            Un email a été (ou sera) envoyé à ton tuteur. Dès que ce
            dernier aura validé le consentement, ton compte sera activé
            automatiquement et tu pourras accéder à l'application.
          </p>
          <p className="text-xs text-muted-foreground">
            Si ton tuteur a déjà validé puis révoqué le consentement, tu
            peux le contacter pour qu'il le redonne via l'écran « Mes
            consentements ».
          </p>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => signOut()}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Se déconnecter
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}