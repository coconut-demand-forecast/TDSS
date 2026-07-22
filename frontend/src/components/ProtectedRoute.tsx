import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import type { User } from '../api';

function isOrgPending(user: User, currentOrgId: number | null): boolean {
  if (user.is_system_owner) return false;
  const membership = user.memberships.find((m) => m.organization_id === currentOrgId);
  return membership?.organization_status === 'pending';
}

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, currentOrgId } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (isOrgPending(user, currentOrgId)) return <Navigate to="/pending-approval" replace />;
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
  if (isOrgPending(user, currentOrgId)) return <Navigate to="/pending-approval" replace />;
  const membership = user.memberships.find((m) => m.organization_id === currentOrgId);
  if (membership?.role !== 'org_admin') return <Navigate to="/tdss/dashboard" replace />;
  return <>{children}</>;
}
