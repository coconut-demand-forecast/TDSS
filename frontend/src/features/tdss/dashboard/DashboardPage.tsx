import { useEffect, useState } from 'react';
import { useLanguage } from '../../../context/LanguageContext';
import { useNavigate } from 'react-router-dom';
import OrgWorkspaceLayout from '../../../layouts/OrgWorkspaceLayout';
import { Card, DateRangePicker, LoadingState, PageHeader, presetToRange, StatusBadge, type DateRange } from '../../../components/ui';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import { dashboardApi, type DashboardSummary } from '../../../api';

const STATUS_LABELS: Record<string, string> = {
  draft: 'ฉบับร่าง',
  ready: 'พร้อมวางแผน',
  planning: 'กำลังวางแผน',
  recommended: 'มีคำแนะนำแล้ว',
  approved: 'อนุมัติแล้ว',
  completed: 'เสร็จสิ้น',
  cancelled: 'ยกเลิก',
};

interface RecentJob {
  id: number;
  job_number: string;
  customer_name: string;
  status: string;
  created_at: string;
}

export default function DashboardPage() {
  const { t } = useLanguage();
  const { currentOrgId, user } = useAuth();
  const { showError } = useToast();
  const navigate = useNavigate();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [recentJobs, setRecentJobs] = useState<RecentJob[]>([]);
  const [distribution, setDistribution] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<DateRange>(() => presetToRange(30));

  useEffect(() => {
    if (!currentOrgId) return;
    (async () => {
      setLoading(true);
      try {
        const params = { date_from: range.date_from, date_to: range.date_to };
        const [s, jobs, dist] = await Promise.all([
          dashboardApi.summary(currentOrgId, params),
          dashboardApi.recentJobs(currentOrgId, params),
          dashboardApi.statusDistribution(currentOrgId, params),
        ]);
        setSummary(s);
        setRecentJobs(jobs as RecentJob[]);
        setDistribution(dist);
      } catch {
        showError('โหลดข้อมูลแดชบอร์ดไม่สำเร็จ');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrgId, range]);

  const membership = user?.memberships.find((m) => m.organization_id === currentOrgId);

  if (loading || !summary) {
    return (
      <OrgWorkspaceLayout title={t('nav.dashboard')}>
        <LoadingState card />
      </OrgWorkspaceLayout>
    );
  }

  const kpis = [
    { label: 'งานขนส่งทั้งหมด', value: summary.total_jobs.toLocaleString() },
    { label: 'รอการวางแผน', value: summary.jobs_awaiting_planning.toLocaleString() },
    { label: 'คำแนะนำที่สร้างแล้ว', value: summary.recommendations_generated.toLocaleString() },
    { label: 'แผนที่อนุมัติแล้ว', value: summary.approved_plans.toLocaleString() },
    { label: 'อัตราการใช้ความจุเฉลี่ย', value: summary.avg_utilization_pct != null ? `${summary.avg_utilization_pct}%` : '-' },
    { label: 'ต้นทุนประมาณการเฉลี่ย', value: summary.avg_estimated_cost != null ? `฿${summary.avg_estimated_cost.toLocaleString()}` : '-' },
    { label: 'ต้นทุนที่ประหยัดได้โดยเฉลี่ย', value: summary.estimated_cost_saving != null ? `฿${summary.estimated_cost_saving.toLocaleString()}` : '-' },
    { label: 'ความน่าเชื่อถือเฉลี่ย', value: summary.avg_reliability_pct != null ? `${summary.avg_reliability_pct}%` : '-' },
  ];

  return (
    <OrgWorkspaceLayout title={t('nav.dashboard')}>
      <PageHeader title={t('pageTitle.orgOverview')} subtitle={membership?.organization_name} actions={<DateRangePicker onChange={setRange} />} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14, marginBottom: 20 }}>
        {kpis.map((k) => (
          <Card key={k.label} style={{ padding: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--c-text-muted)', marginBottom: 8 }}>{k.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{k.value}</div>
          </Card>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Card>
          <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 14 }}>งานขนส่งล่าสุด</div>
          {recentJobs.length === 0 ? (
            <div style={{ fontSize: 12.5, color: 'var(--c-text-faint)' }}>ยังไม่มีงานขนส่ง</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {recentJobs.map((j) => (
                <div
                  key={j.id}
                  onClick={() => navigate(`/tdss/jobs/${j.id}`)}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderTop: '1px solid #f5f5f5', cursor: 'pointer', fontSize: 12.5 }}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>{j.job_number}</div>
                    <div style={{ color: 'var(--c-text-faint)', fontSize: 11 }}>{j.customer_name}</div>
                  </div>
                  <StatusBadge status={j.status}>{STATUS_LABELS[j.status] ?? j.status}</StatusBadge>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 14 }}>สถานะงานขนส่ง</div>
          {Object.keys(distribution).length === 0 ? (
            <div style={{ fontSize: 12.5, color: 'var(--c-text-faint)' }}>ยังไม่มีข้อมูล</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {Object.entries(distribution).map(([status, count]) => {
                const max = Math.max(...Object.values(distribution), 1);
                return (
                  <div key={status}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                      <span>{STATUS_LABELS[status] ?? status}</span>
                      <span style={{ fontWeight: 600 }}>{count}</span>
                    </div>
                    <div style={{ height: 8, borderRadius: 5, background: '#f0f0f0', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${(count / max) * 100}%`, background: 'var(--c-accent)' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </OrgWorkspaceLayout>
  );
}
