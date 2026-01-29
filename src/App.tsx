import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import Index from "./pages/Index";
import Teams from "./pages/Teams";
import Coaches from "./pages/Coaches";
import Auth from "./pages/Auth";
import { DashboardRedirect } from "./components/routing/DashboardRedirect";
import AdminDashboard from "./pages/admin/AdminDashboard";
import ClubDashboard from "./pages/club/ClubDashboard";
import CoachDashboard from "./pages/coach/CoachDashboard";
import PlayerDashboard from "./pages/player/PlayerDashboard";
import Clubs from "./pages/Clubs";
import ClubDetail from "./pages/ClubDetail";
import TeamDetail from "./pages/TeamDetail";
import PlayerDetail from "./pages/PlayerDetail";
import FrameworkEditor from "./pages/FrameworkEditor";
import ClubFrameworkEditor from "./pages/ClubFrameworkEditor";
import Evaluations from "./pages/Evaluations";
import PendingApproval from "./pages/PendingApproval";
import RoleApprovals from "./pages/RoleApprovals";
import InviteAccept from "./pages/InviteAccept";
import NotFound from "./pages/NotFound";
import Stats from "./pages/Stats";
import AdminUsers from "./pages/AdminUsers";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/dashboard" element={<DashboardRedirect />} />
            
            {/* Role-based dashboards */}
            <Route path="/admin/dashboard" element={<AdminDashboard />} />
            <Route path="/club/dashboard" element={<ClubDashboard />} />
            <Route path="/coach/dashboard" element={<CoachDashboard />} />
            <Route path="/player/dashboard" element={<PlayerDashboard />} />
            
            <Route path="/clubs" element={<Clubs />} />
            <Route path="/clubs/:id" element={<ClubDetail />} />
            <Route path="/clubs/:clubId/framework" element={<ClubFrameworkEditor />} />
            <Route path="/teams" element={<Teams />} />
            <Route path="/teams/:id" element={<TeamDetail />} />
            <Route path="/teams/:teamId/framework" element={<FrameworkEditor />} />
            <Route path="/coaches" element={<Coaches />} />
            <Route path="/players/:id" element={<PlayerDetail />} />
            <Route path="/evaluations" element={<Evaluations />} />
            <Route path="/pending-approval" element={<PendingApproval />} />
            <Route path="/role-approvals" element={<RoleApprovals />} />
            <Route path="/invite/accept" element={<InviteAccept />} />
            <Route path="/stats" element={<Stats />} />
            <Route path="/admin/users" element={<AdminUsers />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
