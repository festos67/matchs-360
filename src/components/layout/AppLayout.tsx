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
        <main className="flex-1 p-3 md:p-6 overflow-y-scroll overflow-x-hidden custom-scrollbar">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};
