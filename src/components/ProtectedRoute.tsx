import { Loader2 } from 'lucide-react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useUserRole } from '@/hooks/useUserRole';
import { hasAdminSession } from '@/utils/adminSession';

interface ProtectedRouteProps {
  requireAdminSession?: boolean;
}

export function ProtectedRoute({ requireAdminSession = false }: ProtectedRouteProps) {
  const { user, profile, isLoading } = useAuth();
  const { isAdmin, isModerator, loading: roleLoading } = useUserRole();
  const location = useLocation();
  const hasAdminAccess = isAdmin || isModerator;
  const isOnPersonalInfoPage = location.pathname === '/personal-info';
  const isOnPdpaPage = location.pathname === '/pdpa-consent';

  if (isLoading || (requireAdminSession && roleLoading)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace state={{ from: location }} />;
  }

  if (!profile?.first_name && !isOnPersonalInfoPage) {
    return <Navigate to="/personal-info" replace />;
  }

  if (profile?.first_name && !profile.pdpa_accepted_at && !isOnPdpaPage) {
    return <Navigate to="/pdpa-consent" replace />;
  }

  if (!profile?.first_name && isOnPdpaPage) {
    return <Navigate to="/personal-info" replace />;
  }

  if (requireAdminSession) {
    if (!hasAdminAccess) {
      return <Navigate to="/profile" replace />;
    }

    if (!hasAdminSession(user.id)) {
      return <Navigate to="/admin/login" replace />;
    }
  }

  return <Outlet />;
}
