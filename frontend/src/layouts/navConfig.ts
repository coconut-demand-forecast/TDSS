export interface NavItem {
  key: string;
  label: string;
  to: string;
  roles: Array<'org_admin' | 'planner' | 'viewer'>;
}

export const ORG_NAV: NavItem[] = [
  { key: 'dashboard', label: 'แดชบอร์ด', to: '/tdss/dashboard', roles: ['org_admin', 'planner', 'viewer'] },
  { key: 'jobs', label: 'งานขนส่ง', to: '/tdss/jobs', roles: ['org_admin', 'planner', 'viewer'] },
  { key: 'vehicles', label: 'ยานพาหนะ', to: '/tdss/vehicles', roles: ['org_admin', 'planner', 'viewer'] },
  { key: 'products', label: 'ข้อมูลสินค้า (Product Master)', to: '/tdss/products', roles: ['org_admin', 'planner', 'viewer'] },
  { key: 'routes', label: 'เส้นทาง', to: '/tdss/routes', roles: ['org_admin', 'planner', 'viewer'] },
  { key: 'decision-profiles', label: 'โปรไฟล์การตัดสินใจ (AHP)', to: '/tdss/decision-profiles', roles: ['org_admin', 'planner', 'viewer'] },
  { key: 'reports', label: 'รายงาน', to: '/tdss/reports', roles: ['org_admin', 'planner', 'viewer'] },
  { key: 'ai-insights', label: 'ข้อมูลเชิงลึก AI', to: '/tdss/ai-insights', roles: ['org_admin', 'planner'] },
  { key: 'users', label: 'ผู้ใช้งานองค์กร', to: '/tdss/users', roles: ['org_admin'] },
  { key: 'org-info', label: 'ข้อมูลองค์กร', to: '/tdss/org-info', roles: ['org_admin', 'planner', 'viewer'] },
  { key: 'org-settings', label: 'ตั้งค่าองค์กร', to: '/tdss/settings', roles: ['org_admin'] },
];

export const OWNER_NAV = [
  { key: 'owner-dashboard', label: 'แดชบอร์ดระบบ', to: '/tdss/owner/dashboard' },
  { key: 'owner-orgs', label: 'องค์กรทั้งหมด', to: '/tdss/owner/organizations' },
  { key: 'owner-users', label: 'ผู้ใช้งานทั้งหมด', to: '/tdss/owner/users' },
  { key: 'owner-usage', label: 'การใช้งาน', to: '/tdss/owner/usage' },
  { key: 'owner-audit', label: 'บันทึกการใช้งาน', to: '/tdss/owner/audit-logs' },
  { key: 'owner-ai-insights', label: 'ข้อมูลเชิงลึก AI', to: '/tdss/owner/ai-insights' },
  { key: 'owner-health', label: 'สถานะระบบ', to: '/tdss/owner/system-health' },
  { key: 'owner-system-settings', label: 'ตั้งค่าระบบ', to: '/tdss/owner/system-settings' },
  { key: 'owner-profile', label: 'โปรไฟล์ของฉัน', to: '/tdss/owner/profile' },
];
