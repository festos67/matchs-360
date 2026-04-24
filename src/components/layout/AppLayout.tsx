/**
 * @component AppLayout
 * @description Layout standard de toutes les pages authentifiées : combine la
 *              Sidebar (desktop) + TopBar + TrialBanner (essai/free) + zone
 *              principale scrollable avec max-w-7xl centré.
 * @props children: ReactNode — contenu de la page rendue
 * @access Tous rôles authentifiés (les pages publiques ne l'utilisent pas)
 * @features
 *  - Layout flex h-screen (sidebar fixe + zone scrollable)
 *  - TrialBanner conditionnel (affiché si plan free ou trial actif)
 *  - custom-scrollbar pour cohérence visuelle desktop
 *  - Padding responsive (p-3 mobile / p-6 desktop)
 * @maintenance
 *  - Pour pages plein écran (éditeurs) : ne pas utiliser AppLayout
 *  - Voir mem://navigation/mobile-responsiveness
 *  - TrialBanner : src/components/subscription/TrialBanner.tsx
 */
import { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { TrialBanner } from "@/components/subscription/TrialBanner";
import { usePlan } from "@/hooks/usePlan";

interface AppLayoutProps {
  children: ReactNode;
}

export const AppLayout = ({ children }: AppLayoutProps) => {
  const { isTrial, isFree, trialDaysLeft } = usePlan();
  return (
    <div className="h-screen bg-background flex overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />
        <TrialBanner
          isTrial={isTrial}
          isFree={isFree}
          trialDaysLeft={trialDaysLeft}
        />
        <main className="flex-1 p-3 md:p-6 overflow-y-auto overflow-x-hidden custom-scrollbar">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};
