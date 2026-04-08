import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/routing/ProtectedRoute";
import Index from "./pages/Index";
import Teams from "./pages/Teams";
import Coaches from "./pages/Coaches";
import Players from "./pages/Players";
import Auth from "./pages/Auth";
import { DashboardRedirect } from "./components/routing/DashboardRedirect";
import AdminDashboard from "./pages/admin/AdminDashboard";
import ClubRedirectPage from "./pages/club/ClubRedirectPage";
import CoachDashboard from "./pages/coach/CoachDashboard";
import CoachMyClub from "./pages/coach/CoachMyClub";
import PlayerDashboard from "./pages/player/PlayerDashboard";
import PlayerProfileRedirect from "./pages/player/PlayerProfileRedirect";
import SelfEvaluation from "./pages/player/SelfEvaluation";
import SupporterDashboard from "./pages/supporter/SupporterDashboard";
import SupporterEvaluation from "./pages/supporter/SupporterEvaluation";
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
import ClubUsers from "./pages/ClubUsers";
import ResetPassword from "./pages/ResetPassword";
import MyTeamRedirect from "./pages/MyTeamRedirect";
import MySupporters from "./pages/player/MySupporters";
import Profile from "./pages/Profile";
import Supporters from "./pages/Supporters";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            {/* Public routes */}
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/invite/accept" element={<InviteAccept />} />
            <Route path="/reset-password" element={<ResetPassword />} />

            {/* Dashboard redirect */}
            <Route path="/dashboard" element={<ProtectedRoute><DashboardRedirect /></ProtectedRoute>} />

            {/* Admin routes */}
            <Route path="/admin/dashboard" element={<ProtectedRoute allowedRoles={['admin']}><AdminDashboard /></ProtectedRoute>} />
            <Route path="/admin/users" element={<ProtectedRoute allowedRoles={['admin']}><AdminUsers /></ProtectedRoute>} />

            {/* Club admin routes */}
            <Route path="/club/redirect" element={<ProtectedRoute allowedRoles={['admin', 'club_admin']}><ClubRedirectPage /></ProtectedRoute>} />
            <Route path="/club/users" element={<ProtectedRoute allowedRoles={['admin', 'club_admin']}><ClubUsers /></ProtectedRoute>} />

            {/* Coach routes */}
            <Route path="/coach/dashboard" element={<ProtectedRoute allowedRoles={['admin', 'club_admin', 'coach']}><CoachMyClub /></ProtectedRoute>} />
            <Route path="/coach/my-club" element={<ProtectedRoute allowedRoles={['admin', 'club_admin', 'coach']}><CoachMyClub /></ProtectedRoute>} />

            {/* Player routes */}
            <Route path="/player/dashboard" element={<ProtectedRoute allowedRoles={['player']}><PlayerDashboard /></ProtectedRoute>} />
            <Route path="/player/profile" element={<ProtectedRoute allowedRoles={['player']}><PlayerProfileRedirect /></ProtectedRoute>} />
            <Route path="/player/self-evaluation" element={<ProtectedRoute allowedRoles={['player']}><SelfEvaluation /></ProtectedRoute>} />
            <Route path="/my-team" element={<ProtectedRoute allowedRoles={['player', 'supporter']}><MyTeamRedirect /></ProtectedRoute>} />
            <Route path="/my-supporters" element={<ProtectedRoute allowedRoles={['player']}><MySupporters /></ProtectedRoute>} />

            {/* Supporter routes */}
            <Route path="/supporter/dashboard" element={<ProtectedRoute allowedRoles={['supporter']}><SupporterDashboard /></ProtectedRoute>} />
            <Route path="/supporter/evaluate/:requestId" element={<ProtectedRoute allowedRoles={['supporter']}><SupporterEvaluation /></ProtectedRoute>} />

            {/* Generic protected routes (any authenticated user) */}
            <Route path="/clubs" element={<ProtectedRoute><Clubs /></ProtectedRoute>} />
            <Route path="/clubs/:id" element={<ProtectedRoute><ClubDetail /></ProtectedRoute>} />
            <Route path="/clubs/:clubId/framework" element={<ProtectedRoute><ClubFrameworkEditor /></ProtectedRoute>} />
            <Route path="/teams" element={<ProtectedRoute><Teams /></ProtectedRoute>} />
            <Route path="/teams/:id" element={<ProtectedRoute><TeamDetail /></ProtectedRoute>} />
            <Route path="/teams/:teamId/framework" element={<ProtectedRoute><FrameworkEditor /></ProtectedRoute>} />
            <Route path="/coaches" element={<ProtectedRoute><Coaches /></ProtectedRoute>} />
            <Route path="/players" element={<ProtectedRoute><Players /></ProtectedRoute>} />
            <Route path="/supporters" element={<ProtectedRoute><Supporters /></ProtectedRoute>} />
            <Route path="/players/:id" element={<ProtectedRoute><PlayerDetail /></ProtectedRoute>} />
            <Route path="/evaluations" element={<ProtectedRoute><Evaluations /></ProtectedRoute>} />
            <Route path="/pending-approval" element={<ProtectedRoute><PendingApproval /></ProtectedRoute>} />
            <Route path="/role-approvals" element={<ProtectedRoute><RoleApprovals /></ProtectedRoute>} />
            <Route path="/stats" element={<ProtectedRoute><Stats /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
