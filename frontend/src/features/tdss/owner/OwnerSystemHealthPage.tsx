import { useEffect, useState } from 'react';
import { useLanguage } from '../../../context/LanguageContext';
import OwnerConsoleLayout from '../../../layouts/OwnerConsoleLayout';
import { Card, LoadingState, PageHeader, StatusBadge } from '../../../components/ui';
import { useToast } from '../../../context/ToastContext';
import { ownerApi, type SystemHealth } from '../../../api';

export default function OwnerSystemHealthPage() {
  const { t } = useLanguage();
  const { showError } = useToast();
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    ownerApi
      .systemHealth()
      .then(setHealth)
      .catch(() => showError('โหลดข้อมูลไม่สำเร็จ'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading || !health) {
    return (
      <OwnerConsoleLayout title={t('nav.owner-health')}>
        <LoadingState card />
      </OwnerConsoleLayout>
    );
  }

  return (
    <OwnerConsoleLayout title={t('nav.owner-health')}>
      <PageHeader title={t('nav.owner-health')} subtitle="ข้อมูลจริงจากแอปพลิเคชัน ไม่มีการจำลองข้อมูล" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
        <Card>
          <div style={{ fontSize: 11, color: 'var(--c-text-muted)', marginBottom: 8 }}>สถานะ API</div>
          <StatusBadge tone={health.api_status === 'ok' ? 'success' : 'danger'}>{health.api_status}</StatusBadge>
        </Card>
        <Card>
          <div style={{ fontSize: 11, color: 'var(--c-text-muted)', marginBottom: 8 }}>การเชื่อมต่อฐานข้อมูล</div>
          <StatusBadge tone={health.database_connected ? 'success' : 'danger'}>{health.database_connected ? 'เชื่อมต่อสำเร็จ' : 'เชื่อมต่อไม่สำเร็จ'}</StatusBadge>
        </Card>
        <Card>
          <div style={{ fontSize: 11, color: 'var(--c-text-muted)', marginBottom: 8 }}>เวอร์ชันแอปพลิเคชัน</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{health.app_version}</div>
        </Card>
        <Card>
          <div style={{ fontSize: 11, color: 'var(--c-text-muted)', marginBottom: 8 }}>สภาพแวดล้อม</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{health.environment}</div>
        </Card>
        <Card>
          <div style={{ fontSize: 11, color: 'var(--c-text-muted)', marginBottom: 8 }}>องค์กรทั้งหมด</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{health.total_organizations}</div>
        </Card>
        <Card>
          <div style={{ fontSize: 11, color: 'var(--c-text-muted)', marginBottom: 8 }}>ผู้ใช้งานทั้งหมด</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{health.total_users}</div>
        </Card>
        <Card>
          <div style={{ fontSize: 11, color: 'var(--c-text-muted)', marginBottom: 8 }}>งานขนส่งทั้งหมด</div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{health.total_jobs}</div>
        </Card>
      </div>
    </OwnerConsoleLayout>
  );
}
