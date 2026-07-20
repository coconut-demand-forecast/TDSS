import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { ProtectedRoute, OwnerRoute, AdminRoute } from './components/ProtectedRoute';

import LoginPage from './features/tdss/auth/LoginPage';
import DashboardPage from './features/tdss/dashboard/DashboardPage';
import VehiclesPage from './features/tdss/vehicles/VehiclesPage';
import RoutesPage from './features/tdss/routes/RoutesPage';
import DecisionProfilesPage from './features/tdss/decisionProfiles/DecisionProfilesPage';
import JobsPage from './features/tdss/jobs/JobsPage';
import JobDetailPage from './features/tdss/jobs/JobDetailPage';
import PlanningWizardPage from './features/tdss/planning/PlanningWizardPage';
import RecommendationResultPage from './features/tdss/recommendations/RecommendationResultPage';
import ReportsPage from './features/tdss/reports/ReportsPage';
import OrgUsersPage from './features/tdss/users/OrgUsersPage';
import ProfilePage from './features/tdss/profile/ProfilePage';
import OrgInfoPage from './features/tdss/orgInfo/OrgInfoPage';
import OrgSettingsPage from './features/tdss/orgSettings/OrgSettingsPage';
import OwnerDashboardPage from './features/tdss/owner/OwnerDashboardPage';
import OwnerOrganizationsPage from './features/tdss/owner/OwnerOrganizationsPage';
import OwnerUsersPage from './features/tdss/owner/OwnerUsersPage';
import OwnerAuditLogsPage from './features/tdss/owner/OwnerAuditLogsPage';
import OwnerSystemHealthPage from './features/tdss/owner/OwnerSystemHealthPage';
import OwnerUsagePage from './features/tdss/owner/OwnerUsagePage';
import SystemSettingsPage from './features/tdss/owner/SystemSettingsPage';
import OwnerProfilePage from './features/tdss/owner/OwnerProfilePage';

function LoginRoute() {
  const { user } = useAuth();
  if (user) return <Navigate to={user.is_system_owner ? '/tdss/owner/dashboard' : '/tdss/dashboard'} replace />;
  return <LoginPage />;
}

function HomeRedirect() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.is_system_owner ? '/tdss/owner/dashboard' : '/tdss/dashboard'} replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginRoute />} />
            <Route path="/" element={<HomeRedirect />} />

            {/* Organization workspace */}
            <Route path="/tdss/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
            <Route path="/tdss/jobs" element={<ProtectedRoute><JobsPage /></ProtectedRoute>} />
            <Route path="/tdss/jobs/:jobId" element={<ProtectedRoute><JobDetailPage /></ProtectedRoute>} />
            <Route path="/tdss/jobs/:jobId/planning" element={<ProtectedRoute><PlanningWizardPage /></ProtectedRoute>} />
            <Route path="/tdss/recommendations/:runId" element={<ProtectedRoute><RecommendationResultPage /></ProtectedRoute>} />
            <Route path="/tdss/vehicles" element={<ProtectedRoute><VehiclesPage /></ProtectedRoute>} />
            <Route path="/tdss/routes" element={<ProtectedRoute><RoutesPage /></ProtectedRoute>} />
            <Route path="/tdss/decision-profiles" element={<ProtectedRoute><DecisionProfilesPage /></ProtectedRoute>} />
            <Route path="/tdss/reports" element={<ProtectedRoute><ReportsPage /></ProtectedRoute>} />
            <Route path="/tdss/users" element={<AdminRoute><OrgUsersPage /></AdminRoute>} />
            <Route path="/tdss/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
            <Route path="/tdss/org-info" element={<ProtectedRoute><OrgInfoPage /></ProtectedRoute>} />
            <Route path="/tdss/settings" element={<ProtectedRoute><OrgSettingsPage /></ProtectedRoute>} />

            {/* System Owner console */}
            <Route path="/tdss/owner/dashboard" element={<OwnerRoute><OwnerDashboardPage /></OwnerRoute>} />
            <Route path="/tdss/owner/organizations" element={<OwnerRoute><OwnerOrganizationsPage /></OwnerRoute>} />
            <Route path="/tdss/owner/users" element={<OwnerRoute><OwnerUsersPage /></OwnerRoute>} />
            <Route path="/tdss/owner/usage" element={<OwnerRoute><OwnerUsagePage /></OwnerRoute>} />
            <Route path="/tdss/owner/audit-logs" element={<OwnerRoute><OwnerAuditLogsPage /></OwnerRoute>} />
            <Route path="/tdss/owner/system-health" element={<OwnerRoute><OwnerSystemHealthPage /></OwnerRoute>} />
            <Route path="/tdss/owner/system-settings" element={<OwnerRoute><SystemSettingsPage /></OwnerRoute>} />
            <Route path="/tdss/owner/profile" element={<OwnerRoute><OwnerProfilePage /></OwnerRoute>} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  );
}
