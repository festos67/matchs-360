import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/routing/ProtectedRoute";
import { Loader2 } from "lucide-react";

// Critical path — static imports
import Index from "./pages/Index";
import Auth from "./pages/Auth";

// Lazy imports
const Teams = lazy(() => import("./pages/Teams"));
const Coaches = lazy(() => import("./pages/Coaches"));
const Players = lazy(() => import("./pages/Players"));
const DashboardRedirect = lazy(() => import("./components/routing/DashboardRedirect").then(m => ({ default: m.DashboardRedirect })));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const ClubRedirectPage = lazy(() => import("./pages/club/ClubRedirectPage"));
const CoachDashboard = lazy(() => import("./pages/coach/CoachDashboard"));
const CoachMyClub = lazy(() => import("./pages/coach/CoachMyClub"));
const PlayerDashboard = lazy(() => import("./pages/player/PlayerDashboard"));
const PlayerProfileRedirect = lazy(() => import("./pages/player/PlayerProfileRedirect"));
const SelfEvaluation = lazy(() => import("./pages/player/SelfEvaluation"));
const SupporterDashboard = lazy(() => import("./pages/supporter/SupporterDashboard"));
const SupporterDebriefs = lazy(() => import("./pages/supporter/SupporterDebriefs"));
const SupporterEvaluation = lazy(() => import("./pages/supporter/SupporterEvaluation"));
const Clubs = lazy(() => import("./pages/Clubs"));
const ClubDetail = lazy(() => import("./pages/ClubDetail"));
const TeamDetail = lazy(() => import("./pages/TeamDetail"));
const PlayerDetail = lazy(() => import("./pages/PlayerDetail"));
const FrameworkEditor = lazy(() => import("./pages/FrameworkEditor"));
const ClubFrameworkEditor = lazy(() => import("./pages/ClubFrameworkEditor"));
const Evaluations = lazy(() => import("./pages/Evaluations"));
const PendingApproval = lazy(() => import("./pages/PendingApproval"));
const RoleApprovals = lazy(() => import("./pages/RoleApprovals"));
const InviteAccept = lazy(() => import("./pages/InviteAccept"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Stats = lazy(() => import("./pages/Stats"));
const AdminUsers = lazy(() => import("./pages/AdminUsers"));
const ClubUsers = lazy(() => import("./pages/ClubUsers"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const MyTeamRedirect = lazy(() => import("./pages/MyTeamRedirect"));
const MySupporters = lazy(() => import("./pages/player/MySupporters"));
const Profile = lazy(() => import("./pages/Profile"));
const Supporters = lazy(() => import("./pages/Supporters"));
const Pricing = lazy(() => import("./pages/Pricing"));

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Suspense fallback={<div className="flex items-center justify-center h-screen"><Loader2 className="animate-spin h-8 w-8 text-muted-foreground" /></div>}>
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
              <Route path="/supporter/debriefs" element={<ProtectedRoute allowedRoles={['supporter']}><SupporterDebriefs /></ProtectedRoute>} />
              <Route path="/supporter/evaluate/:requestId" element={<ProtectedRoute allowedRoles={['supporter']}><SupporterEvaluation /></ProtectedRoute>} />

              {/* Generic protected routes */}
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

              <Route path="/pricing" element={<ProtectedRoute><Pricing /></ProtectedRoute>} />

              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
