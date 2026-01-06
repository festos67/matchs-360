import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Clubs from "./pages/Clubs";
import ClubDetail from "./pages/ClubDetail";
import TeamDetail from "./pages/TeamDetail";
import PlayerDetail from "./pages/PlayerDetail";
import FrameworkEditor from "./pages/FrameworkEditor";
import Evaluations from "./pages/Evaluations";
import PendingApproval from "./pages/PendingApproval";
import RoleApprovals from "./pages/RoleApprovals";
import InviteAccept from "./pages/InviteAccept";
import NotFound from "./pages/NotFound";

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
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/clubs" element={<Clubs />} />
            <Route path="/clubs/:id" element={<ClubDetail />} />
            <Route path="/teams" element={<Navigate to="/clubs" replace />} />
            <Route path="/teams/:id" element={<TeamDetail />} />
            <Route path="/teams/:teamId/framework" element={<FrameworkEditor />} />
            <Route path="/players/:id" element={<PlayerDetail />} />
            <Route path="/evaluations" element={<Evaluations />} />
            <Route path="/pending-approval" element={<PendingApproval />} />
            <Route path="/role-approvals" element={<RoleApprovals />} />
            <Route path="/invite/accept" element={<InviteAccept />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
