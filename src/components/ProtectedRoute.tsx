import { Loader2 } from 'lucide-react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useUserRole } from '@/hooks/useUserRole';
import { clearAdminSession, getValidatedAdminSession } from '@/utils/adminSession';
import { getRequiredOnboardingPath } from '@/utils/onboardingGuard';

interface ProtectedRouteProps {
  requireAdminSession?: boolean;
}

export function ProtectedRoute({ requireAdminSession = false }: ProtectedRouteProps) {
  const { user, profile, isLoading } = useAuth();
  const { isAdmin, isModerator, loading: roleLoading } = useUserRole();
  const location = useLocation();
  const hasAdminAccess = isAdmin || isModerator;
  const requiredOnboardingPath = getRequiredOnboardingPath(profile, location.pathname);
  const [adminSessionValid, setAdminSessionValid] = useState<boolean | null>(requireAdminSession ? null : true);

  useEffect(() => {
    if (!requireAdminSession) {
      setAdminSessionValid(true);
      return;
    }

    if (!user || !hasAdminAccess) {
      setAdminSessionValid(false);
      return;
    }

    let cancelled = false;

    void (async () => {
      const valid = await getValidatedAdminSession(user.id);

      if (cancelled) {
        return;
      }

      if (!valid) {
        clearAdminSession();
      }

      setAdminSessionValid(Boolean(valid));
    })();

    return () => {
      cancelled = true;
    };
  }, [requireAdminSession, user, hasAdminAccess]);

  if (isLoading || (requireAdminSession && (roleLoading || adminSessionValid === null))) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace state={{ from: location }} />;
  }

  if (requiredOnboardingPath) {
    return <Navigate to={requiredOnboardingPath} replace />;
  }

  if (requireAdminSession) {
    if (!hasAdminAccess) {
      return <Navigate to="/profile" replace />;
    }

    if (!adminSessionValid) {
      return <Navigate to="/admin/login" replace />;
    }
  }

  return <Outlet />;
}
