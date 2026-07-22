import { useEffect, useState } from 'react';
import { useLanguage } from '../../../context/LanguageContext';
import OwnerConsoleLayout from '../../../layouts/OwnerConsoleLayout';
import { Card, LoadingState, PageHeader } from '../../../components/ui';
import { useToast } from '../../../context/ToastContext';
import { ownerApi, type OwnerDashboard } from '../../../api';

export default function OwnerDashboardPage() {
  const { t } = useLanguage();
  const { showError } = useToast();
  const [data, setData] = useState<OwnerDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    ownerApi
      .dashboard()
      .then(setData)
      .catch(() => showError('โหลดข้อมูลไม่สำเร็จ'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading || !data) {
    return (
      <OwnerConsoleLayout title={t('nav.owner-dashboard')}>
        <LoadingState card />
      </OwnerConsoleLayout>
    );
  }

  const kpis = [
    { label: 'องค์กรทั้งหมด', value: data.total_organizations },
    { label: 'องค์กรที่ใช้งานอยู่', value: data.active_organizations },
    { label: 'รอการอนุมัติ', value: data.pending_organizations },
    { label: 'องค์กรที่ถูกระงับ', value: data.suspended_organizations },
    { label: 'ผู้ใช้งานทั้งหมด', value: data.total_users },
    { label: 'งานขนส่งทั้งหมด', value: data.total_jobs },
    { label: 'คำแนะนำที่สร้างแล้ว', value: data.recommendation_runs },
  ];

  return (
    <OwnerConsoleLayout title={t('nav.owner-dashboard')}>
      <PageHeader title={t('pageTitle.ownerOverview')} subtitle="สรุปการใช้งานทั้งแพลตฟอร์ม" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14 }}>
        {kpis.map((k) => (
          <Card key={k.label} style={{ padding: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--c-text-muted)', marginBottom: 8 }}>{k.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{k.value.toLocaleString()}</div>
          </Card>
        ))}
      </div>
    </OwnerConsoleLayout>
  );
}
