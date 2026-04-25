import { Suspense, lazy, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { Loader2 } from "lucide-react";
import { BottomNav } from "@/components/BottomNav";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";
import { GlobalChatNotificationProvider } from "@/components/GlobalChatNotificationProvider";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppErrorBoundary } from "@/components/shared/AppErrorBoundary";
import { RouteErrorBoundary } from "@/components/shared/RouteErrorBoundary";
import { NotificationsProvider } from "@/hooks/useNotifications";
import { FriendRequestsProvider } from "@/hooks/useFriendRequests";

const Index = lazy(() => import("./pages/Index"));
const CreateAgreement = lazy(() => import("./pages/CreateAgreement"));
const AgreementConfirm = lazy(() => import("./pages/AgreementConfirm"));
const AgreementContract = lazy(() => import("./pages/AgreementContract"));
const Friends = lazy(() => import("./pages/Friends"));
const Chat = lazy(() => import("./pages/Chat"));
const Notifications = lazy(() => import("./pages/Notifications"));
const Profile = lazy(() => import("./pages/Profile"));
const Settings = lazy(() => import("./pages/Settings"));
const Badges = lazy(() => import("./pages/Badges"));
const History = lazy(() => import("./pages/History"));
const DebtDetail = lazy(() => import("./pages/DebtDetail"));
const Auth = lazy(() => import("./pages/Auth"));
const AdminHub = lazy(() => import("./pages/AdminHub"));
const AdminLogin = lazy(() => import("./pages/AdminLogin"));
const AdminCodeLogin = lazy(() => import("./pages/AdminCodeLogin"));
const AdminSecurity = lazy(() => import("./pages/AdminSecurity"));
const AdminUserRoles = lazy(() => import("./pages/AdminUserRoles"));
const AdminCodesPage = lazy(() => import("./pages/admin/AdminCodesPage"));
const Terms = lazy(() => import("./pages/Terms"));
const Privacy = lazy(() => import("./pages/Privacy"));
const PDPAConsent = lazy(() => import("./pages/PDPAConsent"));
const Subscription = lazy(() => import("./pages/Subscription"));
const Support = lazy(() => import("./pages/Support"));
const Help = lazy(() => import("./pages/Help"));
const NotFound = lazy(() => import("./pages/NotFound"));
const PersonalInfoOnboarding = lazy(() => import("./pages/PersonalInfoOnboarding"));
const DebtConsolidation = lazy(() => import("./pages/DebtConsolidation"));

function RouteFallback() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );
}

const ROUTES_WITH_BOTTOM_NAV = ["/", "/create", "/chat", "/notifications", "/profile", "/settings", "/badges", "/history", "/friends", "/debt", "/agreement", "/pdpa-consent", "/personal-info", "/subscription", "/admin"];

function AnimatedRoutes() {
  const location = useLocation();
  const isChatRoomRoute = location.pathname !== "/chat" && location.pathname.startsWith("/chat/");
  const showBottomNav = !isChatRoomRoute && ROUTES_WITH_BOTTOM_NAV.some(r =>
    r === "/" ? location.pathname === "/" : location.pathname.startsWith(r)
  );
  return (
    <>
      <Suspense fallback={<RouteFallback />}>
        <AnimatePresence mode="wait">
          <Routes location={location} key={location.pathname}>
          <Route path="/auth" element={<Auth />} />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin/code" element={<AdminCodeLogin />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/support" element={<Support />} />
          <Route path="/help" element={<Help />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<Index />} />
            <Route path="/create" element={<CreateAgreement />} />
            <Route path="/agreement/:id/confirm" element={<RouteErrorBoundary area="หน้ายืนยันข้อตกลง"><AgreementConfirm /></RouteErrorBoundary>} />
            <Route path="/agreement/:id/contract" element={<RouteErrorBoundary area="หน้าทำสัญญา"><AgreementContract /></RouteErrorBoundary>} />
            <Route path="/friends" element={<Friends />} />
            <Route path="/chat" element={<RouteErrorBoundary area="หน้าแชท"><Chat /></RouteErrorBoundary>} />
            <Route path="/chat/:chatId" element={<RouteErrorBoundary area="หน้าแชท"><Chat /></RouteErrorBoundary>} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/badges" element={<Badges />} />
            <Route path="/history" element={<History />} />
            <Route path="/history/debt-consolidation" element={<DebtConsolidation />} />
            <Route path="/debt/:id" element={<DebtDetail />} />
            <Route path="/pdpa-consent" element={<PDPAConsent />} />
            <Route path="/personal-info" element={<PersonalInfoOnboarding />} />
            <Route path="/subscription" element={<Subscription />} />
          </Route>

          <Route element={<ProtectedRoute requireAdminSession />}>
            <Route path="/admin" element={<AdminHub />} />
            <Route path="/admin/security" element={<AdminSecurity />} />
            <Route path="/admin/users" element={<AdminUserRoles />} />
            <Route path="/admin/codes" element={<AdminCodesPage />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
        </AnimatePresence>
      </Suspense>
      {showBottomNav && <BottomNav />}
    </>
  );
}

const App = () => {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            gcTime: 10 * 60 * 1000,
            retry: 2,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeProvider>
          <LanguageProvider>
            <TooltipProvider>
              <Toaster />
              <Sonner />
              <BrowserRouter>
                <PWAInstallPrompt />
                <AppErrorBoundary>
                  <NotificationsProvider>
                    <FriendRequestsProvider>
                      <GlobalChatNotificationProvider>
                        <AnimatedRoutes />
                      </GlobalChatNotificationProvider>
                    </FriendRequestsProvider>
                  </NotificationsProvider>
                </AppErrorBoundary>
              </BrowserRouter>
            </TooltipProvider>
          </LanguageProvider>
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
