import { Loader2 } from 'lucide-react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useUserRole } from '@/hooks/useUserRole';

interface ProtectedRouteProps {
  requireAdminSession?: boolean;
}

export function ProtectedRoute({ requireAdminSession = false }: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();
  const { isAdmin, isModerator, loading: roleLoading } = useUserRole();
  const location = useLocation();
  const hasAdminAccess = isAdmin || isModerator;

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

  if (requireAdminSession) {
    const isCodeVerified = sessionStorage.getItem('admin_code_verified') === 'true';
    const isVerified = sessionStorage.getItem('admin_verified') === user.id;

    if (!hasAdminAccess) {
      return <Navigate to="/profile" replace />;
    }

    if (!isCodeVerified || !isVerified) {
      return <Navigate to="/admin/login" replace />;
    }
  }

  return <Outlet />;
}
