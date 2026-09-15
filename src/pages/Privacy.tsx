/**
 * @page Privacy
 * @route /confidentialite (publique)
 *
 * Notice d'information sur les données personnelles, accessible sans
 * connexion (page de connexion, fenêtre d'accusé de lecture, barre latérale).
 */
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { RadarPulseLogo } from "@/components/shared/RadarPulseLogo";
import { PrivacyNoticeContent } from "@/components/legal/PrivacyNoticeContent";

export default function Privacy() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-background px-4 py-8">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <RadarPulseLogo size={40} />
            <div>
              <p className="font-display text-xl font-bold">MATCHS360</p>
              <p className="text-sm text-muted-foreground">Vos données personnelles</p>
            </div>
          </div>
          <Link
            to={user ? "/dashboard" : "/auth"}
            className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />
            {user ? "Retour" : "Connexion"}
          </Link>
        </div>

        <div className="rounded-xl border bg-card p-6 sm:p-8">
          <h1 className="mb-5 font-display text-2xl font-bold">Confidentialité</h1>
          <PrivacyNoticeContent />
        </div>
      </div>
    </div>
  );
}
