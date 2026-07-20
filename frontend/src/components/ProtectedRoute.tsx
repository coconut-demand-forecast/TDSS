import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function OwnerRoute({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!user.is_system_owner) return <Navigate to="/tdss/dashboard" replace />;
  return <>{children}</>;
}

export function AdminRoute({ children }: { children: ReactNode }) {
  const { user, currentOrgId } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.is_system_owner) return <>{children}</>;
  const membership = user.memberships.find((m) => m.organization_id === currentOrgId);
  if (membership?.role !== 'org_admin') return <Navigate to="/tdss/dashboard" replace />;
  return <>{children}</>;
}
