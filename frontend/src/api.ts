import axios from 'axios';

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('tdss_token');
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface Membership {
  organization_id: number;
  organization_name: string;
  organization_status: string;
  role: 'org_admin' | 'planner' | 'viewer';
  membership_status: string;
}

export interface User {
  id: number;
  name: string;
  email: string;
  is_system_owner: boolean;
  status: string;
  memberships: Membership[];
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface Vehicle {
  id: number;
  organization_id: number;
  vehicle_code: string;
  registration_number: string;
  vehicle_type: string;
  capacity_weight_kg: number;
  capacity_volume_m3: number;
  fuel_type: string | null;
  fuel_consumption_km_per_liter: number | null;
  cost_per_km: number;
  fixed_cost: number;
  co2_factor: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface Route {
  id: number;
  organization_id: number;
  route_code: string;
  route_name: string;
  origin: string;
  destination: string;
  distance_km: number;
  estimated_duration_minutes: number;
  toll_cost: number;
  route_risk_level: string;
  road_restrictions: string | null;
  mode: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface DecisionProfile {
  id: number;
  organization_id: number;
  name: string;
  description: string | null;
  status: string;
  pairwise_matrix: number[][];
  weights: Record<string, number>;
  lambda_max: number;
  ci: number;
  cr: number;
  is_consistent: boolean;
  created_by: number | null;
  created_at: string;
}

export interface TransportJob {
  id: number;
  organization_id: number;
  job_number: string;
  customer_name: string;
  origin: string | null;
  destination: string | null;
  required_delivery_datetime: string | null;
  shipment_weight_kg: number | null;
  shipment_volume_m3: number | null;
  number_of_stops: number;
  priority: string;
  special_requirements: string | null;
  preferred_route_id: number | null;
  status: string;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface Alternative {
  id: number;
  vehicle_id: number;
  vehicle_code: string;
  route_id: number;
  route_code: string;
  distance_km: number;
  duration_minutes: number;
  cost: number;
  weight_utilization: number;
  volume_utilization: number;
  reliability_score: number;
  co2_estimate: number;
  route_suitability: number;
  vehicle_suitability: number;
  raw_values: Record<string, number>;
  normalized_values: Record<string, number>;
  weighted_scores: Record<string, number>;
  total_score: number;
  rank: number | null;
  feasible: boolean;
  warnings: string[];
  rejection_reasons: string[];
}

export interface RecommendationRun {
  id: number;
  job_id: number;
  decision_profile_id: number;
  criteria_weights: Record<string, number>;
  created_at: string;
  alternatives: Alternative[];
  explanations: string[];
  approval: { selected_alternative_id: number; approved_by: number; approved_at: string; reason: string | null } | null;
}

export interface DashboardSummary {
  total_jobs: number;
  jobs_awaiting_planning: number;
  recommendations_generated: number;
  approved_plans: number;
  avg_utilization_pct: number | null;
  avg_estimated_cost: number | null;
  estimated_cost_saving: number | null;
  avg_reliability_pct: number | null;
  avg_co2: number | null;
}

export interface OrgUser {
  user_id: number;
  name: string;
  email: string;
  role: string;
  membership_status: string;
  user_status: string;
}

export interface Feature {
  feature_key: string;
  enabled: boolean;
}

export interface AuditLogEntry {
  id: number;
  organization_id: number | null;
  user_id: number | null;
  user_name: string | null;
  action: string;
  entity_type: string;
  entity_id: number | null;
  details: Record<string, unknown> | null;
  created_at: string;
}

export interface Notification {
  id: number;
  type: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

export interface OwnerDashboard {
  total_organizations: number;
  active_organizations: number;
  suspended_organizations: number;
  total_users: number;
  total_jobs: number;
  recommendation_runs: number;
}

export interface SystemHealth {
  api_status: string;
  database_connected: boolean;
  app_version: string;
  environment: string;
  total_organizations: number;
  total_users: number;
  total_jobs: number;
}

export interface Organization {
  id: number;
  name: string;
  status: string;
  created_at: string;
}

export interface OrganizationUsage {
  vehicle_count: number;
  route_count: number;
  job_count: number;
  user_count: number;
  decision_profile_count: number;
}

export interface OrganizationInfo {
  id: number;
  name: string;
  code: string | null;
  status: string;
  contact: string | null;
  address: string | null;
  created_at: string;
  features: Feature[];
  usage: OrganizationUsage;
}

export interface OrganizationSettings {
  default_route_mode: string;
  default_decision_profile_id: number | null;
  notify_on_recommendation_completed: boolean;
  notify_on_job_approved: boolean;
}

export interface OrganizationUsageRow {
  organization_id: number;
  organization_name: string;
  organization_status: string;
  job_count: number;
  recommendation_run_count: number;
  active_user_count: number;
  vehicle_count: number;
  route_count: number;
  report_export_count: number;
}

export interface SystemSettings {
  app_display_name: string;
  banner_message: string | null;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
export const authApi = {
  register: (data: { name: string; email: string; password: string; organization_name: string }) =>
    api.post<TokenResponse>('/api/tdss/auth/register', data).then((r) => r.data),
  login: (data: { email: string; password: string }) => api.post<TokenResponse>('/api/tdss/auth/login', data).then((r) => r.data),
  me: () => api.get<User>('/api/tdss/auth/me').then((r) => r.data),
  updateProfile: (data: { name: string }) => api.put<User>('/api/tdss/auth/me', data).then((r) => r.data),
  changePassword: (data: { current_password: string; new_password: string }) =>
    api.post('/api/tdss/auth/change-password', data).then((r) => r.data),
};

// ---------------------------------------------------------------------------
// Vehicles
// ---------------------------------------------------------------------------
export const vehiclesApi = {
  list: (orgId: number, params?: { search?: string; status?: string; vehicle_type?: string }) =>
    api.get<Vehicle[]>(`/api/tdss/organizations/${orgId}/vehicles`, { params }).then((r) => r.data),
  create: (orgId: number, data: Partial<Vehicle>) =>
    api.post<Vehicle>(`/api/tdss/organizations/${orgId}/vehicles`, data).then((r) => r.data),
  update: (orgId: number, id: number, data: Partial<Vehicle>) =>
    api.put<Vehicle>(`/api/tdss/organizations/${orgId}/vehicles/${id}`, data).then((r) => r.data),
  activate: (orgId: number, id: number) => api.post<Vehicle>(`/api/tdss/organizations/${orgId}/vehicles/${id}/activate`).then((r) => r.data),
  deactivate: (orgId: number, id: number) => api.post<Vehicle>(`/api/tdss/organizations/${orgId}/vehicles/${id}/deactivate`).then((r) => r.data),
  remove: (orgId: number, id: number) => api.delete(`/api/tdss/organizations/${orgId}/vehicles/${id}`),
};

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
export const routesApi = {
  list: (orgId: number, params?: { search?: string; status?: string }) =>
    api.get<Route[]>(`/api/tdss/organizations/${orgId}/routes`, { params }).then((r) => r.data),
  create: (orgId: number, data: Partial<Route>) => api.post<Route>(`/api/tdss/organizations/${orgId}/routes`, data).then((r) => r.data),
  update: (orgId: number, id: number, data: Partial<Route>) =>
    api.put<Route>(`/api/tdss/organizations/${orgId}/routes/${id}`, data).then((r) => r.data),
  activate: (orgId: number, id: number) => api.post<Route>(`/api/tdss/organizations/${orgId}/routes/${id}/activate`).then((r) => r.data),
  deactivate: (orgId: number, id: number) => api.post<Route>(`/api/tdss/organizations/${orgId}/routes/${id}/deactivate`).then((r) => r.data),
  remove: (orgId: number, id: number) => api.delete(`/api/tdss/organizations/${orgId}/routes/${id}`),
};

// ---------------------------------------------------------------------------
// Decision Profiles
// ---------------------------------------------------------------------------
export const profilesApi = {
  criteria: (orgId: number) =>
    api.get<{ criteria: string[]; pairs: string[] }>(`/api/tdss/organizations/${orgId}/decision-profiles/criteria`).then((r) => r.data),
  list: (orgId: number) => api.get<DecisionProfile[]>(`/api/tdss/organizations/${orgId}/decision-profiles`).then((r) => r.data),
  create: (orgId: number, data: { name: string; description?: string; pairwise: Record<string, number>; save_as_draft_if_inconsistent?: boolean }) =>
    api.post<DecisionProfile>(`/api/tdss/organizations/${orgId}/decision-profiles`, data).then((r) => r.data),
  update: (orgId: number, id: number, data: { name: string; description?: string; pairwise: Record<string, number>; save_as_draft_if_inconsistent?: boolean }) =>
    api.put<DecisionProfile>(`/api/tdss/organizations/${orgId}/decision-profiles/${id}`, data).then((r) => r.data),
  setActive: (orgId: number, id: number, active: boolean) =>
    api.post<DecisionProfile>(`/api/tdss/organizations/${orgId}/decision-profiles/${id}/activate`, { active }).then((r) => r.data),
  remove: (orgId: number, id: number) => api.delete(`/api/tdss/organizations/${orgId}/decision-profiles/${id}`),
};

export const CRITERIA_KEYS = ['cost', 'time', 'utilization', 'reliability', 'co2', 'suitability'] as const;
export function pairKeys(): string[] {
  const pairs: string[] = [];
  for (let i = 0; i < CRITERIA_KEYS.length; i++) {
    for (let j = i + 1; j < CRITERIA_KEYS.length; j++) {
      pairs.push(`${CRITERIA_KEYS[i]}__${CRITERIA_KEYS[j]}`);
    }
  }
  return pairs;
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------
export const jobsApi = {
  list: (orgId: number, params?: { search?: string; status?: string }) =>
    api.get<TransportJob[]>(`/api/tdss/organizations/${orgId}/jobs`, { params }).then((r) => r.data),
  get: (orgId: number, id: number) => api.get<TransportJob>(`/api/tdss/organizations/${orgId}/jobs/${id}`).then((r) => r.data),
  create: (orgId: number, data: Partial<TransportJob>) => api.post<TransportJob>(`/api/tdss/organizations/${orgId}/jobs`, data).then((r) => r.data),
  update: (orgId: number, id: number, data: Partial<TransportJob>) =>
    api.put<TransportJob>(`/api/tdss/organizations/${orgId}/jobs/${id}`, data).then((r) => r.data),
  cancel: (orgId: number, id: number) => api.post<TransportJob>(`/api/tdss/organizations/${orgId}/jobs/${id}/cancel`).then((r) => r.data),
  duplicate: (orgId: number, id: number) => api.post<TransportJob>(`/api/tdss/organizations/${orgId}/jobs/${id}/duplicate`).then((r) => r.data),
  history: (orgId: number, id: number) => api.get(`/api/tdss/organizations/${orgId}/jobs/${id}/recommendation-runs`).then((r) => r.data),
};

// ---------------------------------------------------------------------------
// Planning / Recommendations
// ---------------------------------------------------------------------------
export const planningApi = {
  recommend: (orgId: number, data: { job_id: number; route_ids: number[]; vehicle_ids: number[]; decision_profile_id: number }) =>
    api.post<RecommendationRun>(`/api/tdss/organizations/${orgId}/planning/recommend`, data).then((r) => r.data),
  get: (orgId: number, runId: number) => api.get<RecommendationRun>(`/api/tdss/organizations/${orgId}/recommendations/${runId}`).then((r) => r.data),
  select: (orgId: number, runId: number, data: { alternative_id: number; reason?: string }) =>
    api.post<RecommendationRun>(`/api/tdss/organizations/${orgId}/recommendations/${runId}/select`, data).then((r) => r.data),
};

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------
export interface DateRangeParams {
  date_from?: string;
  date_to?: string;
}

export const dashboardApi = {
  summary: (orgId: number, range?: DateRangeParams) =>
    api.get<DashboardSummary>(`/api/tdss/organizations/${orgId}/dashboard/summary`, { params: range }).then((r) => r.data),
  recentJobs: (orgId: number, range?: DateRangeParams) =>
    api.get(`/api/tdss/organizations/${orgId}/dashboard/recent-jobs`, { params: range }).then((r) => r.data),
  statusDistribution: (orgId: number, range?: DateRangeParams) =>
    api.get<Record<string, number>>(`/api/tdss/organizations/${orgId}/dashboard/status-distribution`, { params: range }).then((r) => r.data),
};

// ---------------------------------------------------------------------------
// Organizations / Users / Features / Info / Settings
// ---------------------------------------------------------------------------
export const organizationsApi = {
  get: (orgId: number) => api.get<Organization>(`/api/tdss/organizations/${orgId}`).then((r) => r.data),
  listUsers: (orgId: number) => api.get<OrgUser[]>(`/api/tdss/organizations/${orgId}/users`).then((r) => r.data),
  inviteUser: (orgId: number, data: { name: string; email: string; password: string; role: string }) =>
    api.post<OrgUser>(`/api/tdss/organizations/${orgId}/users`, data).then((r) => r.data),
  updateUser: (orgId: number, userId: number, data: { role?: string; membership_status?: string }) =>
    api.put<OrgUser>(`/api/tdss/organizations/${orgId}/users/${userId}`, data).then((r) => r.data),
  features: (orgId: number) => api.get<Feature[]>(`/api/tdss/organizations/${orgId}/features`).then((r) => r.data),
  getInfo: (orgId: number) => api.get<OrganizationInfo>(`/api/tdss/organizations/${orgId}/info`).then((r) => r.data),
  updateInfo: (orgId: number, data: { name: string; code?: string; contact?: string; address?: string }) =>
    api.put<OrganizationInfo>(`/api/tdss/organizations/${orgId}/info`, data).then((r) => r.data),
  getSettings: (orgId: number) => api.get<OrganizationSettings>(`/api/tdss/organizations/${orgId}/settings`).then((r) => r.data),
  updateSettings: (orgId: number, data: OrganizationSettings) =>
    api.put<OrganizationSettings>(`/api/tdss/organizations/${orgId}/settings`, data).then((r) => r.data),
};

export const systemSettingsApi = {
  get: () => api.get<SystemSettings>('/api/tdss/system-settings').then((r) => r.data),
  update: (data: SystemSettings) => api.put<SystemSettings>('/api/tdss/system-settings', data).then((r) => r.data),
};

export const auditApi = {
  listOrg: (orgId: number, params?: Record<string, string>) =>
    api.get<AuditLogEntry[]>(`/api/tdss/organizations/${orgId}/audit-logs`, { params }).then((r) => r.data),
  listAll: (params?: Record<string, string>) => api.get<AuditLogEntry[]>('/api/tdss/owner/audit-logs', { params }).then((r) => r.data),
};

export const notificationsApi = {
  list: () => api.get<Notification[]>('/api/tdss/notifications').then((r) => r.data),
  markRead: (id: number) => api.post(`/api/tdss/notifications/${id}/read`).then((r) => r.data),
  markAllRead: () => api.post('/api/tdss/notifications/read-all').then((r) => r.data),
};

// ---------------------------------------------------------------------------
// Owner console
// ---------------------------------------------------------------------------
export const ownerApi = {
  dashboard: () => api.get<OwnerDashboard>('/api/tdss/owner/dashboard').then((r) => r.data),
  listOrganizations: (search?: string) => api.get<Organization[]>('/api/tdss/owner/organizations', { params: { search } }).then((r) => r.data),
  createOrganization: (name: string) => api.post<Organization>('/api/tdss/owner/organizations', { name }).then((r) => r.data),
  getOrganization: (id: number) => api.get<Organization>(`/api/tdss/owner/organizations/${id}`).then((r) => r.data),
  suspendOrganization: (id: number) => api.post<Organization>(`/api/tdss/owner/organizations/${id}/suspend`).then((r) => r.data),
  activateOrganization: (id: number) => api.post<Organization>(`/api/tdss/owner/organizations/${id}/activate`).then((r) => r.data),
  getFeatures: (orgId: number) => api.get<Feature[]>(`/api/tdss/owner/organizations/${orgId}/features`).then((r) => r.data),
  setFeature: (orgId: number, feature_key: string, enabled: boolean) =>
    api.put<Feature>(`/api/tdss/owner/organizations/${orgId}/features`, { feature_key, enabled }).then((r) => r.data),
  listUsers: (search?: string) => api.get('/api/tdss/owner/users', { params: { search } }).then((r) => r.data),
  setUserStatus: (userId: number, status: string) =>
    api.post(`/api/tdss/owner/users/${userId}/status`, null, { params: { new_status: status } }).then((r) => r.data),
  systemHealth: () => api.get<SystemHealth>('/api/tdss/owner/system-health').then((r) => r.data),
  usage: (params?: DateRangeParams & { organization_id?: number; search?: string }) =>
    api.get<OrganizationUsageRow[]>('/api/tdss/owner/usage', { params }).then((r) => r.data),
};

// ---------------------------------------------------------------------------
// Reports (CSV downloads)
// ---------------------------------------------------------------------------
async function downloadCsv(url: string, params: object, fallbackFilename: string) {
  const res = await api.get(url, { params, responseType: 'blob' });
  const disposition = res.headers['content-disposition'] as string | undefined;
  const match = disposition?.match(/filename="?([^";]+)"?/);
  const filename = match?.[1] ?? fallbackFilename;
  const blobUrl = window.URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(blobUrl);
}

export const reportsApi = {
  jobs: (orgId: number, range?: DateRangeParams & { status?: string }) =>
    downloadCsv(`/api/tdss/organizations/${orgId}/reports/jobs.csv`, range ?? {}, 'jobs_report.csv'),
  vehicleUtilization: (orgId: number, range?: DateRangeParams) =>
    downloadCsv(`/api/tdss/organizations/${orgId}/reports/vehicle-utilization.csv`, range ?? {}, 'vehicle_utilization.csv'),
  costComparison: (orgId: number, range?: DateRangeParams) =>
    downloadCsv(`/api/tdss/organizations/${orgId}/reports/cost-comparison.csv`, range ?? {}, 'cost_comparison.csv'),
  co2: (orgId: number, range?: DateRangeParams) => downloadCsv(`/api/tdss/organizations/${orgId}/reports/co2.csv`, range ?? {}, 'co2_report.csv'),
  decisionProfiles: (orgId: number, range?: DateRangeParams) =>
    downloadCsv(`/api/tdss/organizations/${orgId}/reports/decision-profiles.csv`, range ?? {}, 'decision_profiles.csv'),
  recommendation: (orgId: number, runId: number) =>
    downloadCsv(`/api/tdss/organizations/${orgId}/reports/recommendations/${runId}.csv`, {}, `recommendation_${runId}.csv`),
};
