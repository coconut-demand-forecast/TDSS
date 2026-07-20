import { useEffect, useState } from 'react';
import OrgWorkspaceLayout from '../../../layouts/OrgWorkspaceLayout';
import { Button, Card, LoadingState, PageHeader, Table, Td, Th } from '../../../components/ui';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import { aiApi, type AIInsights } from '../../../api';

export default function AIInsightsPage() {
  const { currentOrgId, user } = useAuth();
  const { showError } = useToast();
  const [data, setData] = useState<AIInsights | null>(null);
  const [loading, setLoading] = useState(true);

  const membership = user?.memberships.find((m) => m.organization_id === currentOrgId);
  const canExport = user?.is_system_owner || membership?.role === 'org_admin';

  useEffect(() => {
    if (!currentOrgId) return;
    setLoading(true);
    aiApi
      .orgInsights(currentOrgId)
      .then(setData)
      .catch(() => showError('โหลดข้อมูลเชิงลึก AI ไม่สำเร็จ'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrgId]);

  if (loading || !data) {
    return (
      <OrgWorkspaceLayout title="ข้อมูลเชิงลึก AI">
        <LoadingState card />
      </OrgWorkspaceLayout>
    );
  }

  const kpis = [
    { label: 'การตัดสินใจทั้งหมด', value: data.total_decisions.toLocaleString() },
    { label: 'เลือกตรงกับคำแนะนำ AHP', value: `${data.match_rate_pct.toFixed(1)}%` },
    { label: 'รถที่ถูกเปลี่ยนบ่อยที่สุด', value: data.most_overridden_vehicle ? `${data.most_overridden_vehicle.vehicle_code} (${data.most_overridden_vehicle.override_count})` : '-' },
    { label: 'เส้นทางที่ถูกเปลี่ยนบ่อยที่สุด', value: data.most_changed_route ? `${data.most_changed_route.route_code} (${data.most_changed_route.change_count})` : '-' },
  ];

  return (
    <OrgWorkspaceLayout title="ข้อมูลเชิงลึก AI">
      <PageHeader
        title="ข้อมูลเชิงลึก AI"
        subtitle="สรุปพฤติกรรมการตัดสินใจของ Planner เทียบกับคำแนะนำจาก AHP"
        actions={
          canExport ? (
            <Button variant="secondary" onClick={() => currentOrgId && aiApi.exportDataset(currentOrgId)}>
              ส่งออก Dataset (CSV)
            </Button>
          ) : undefined
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14, marginBottom: 20 }}>
        {kpis.map((k) => (
          <Card key={k.label} style={{ padding: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--c-text-muted)', marginBottom: 8 }}>{k.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{k.value}</div>
          </Card>
        ))}
      </div>

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', fontWeight: 700, fontSize: 13.5, borderBottom: '1px solid var(--c-border)' }}>แนวโน้มรายเดือน</div>
        {data.trend.length === 0 ? (
          <div style={{ padding: 18, fontSize: 12.5, color: 'var(--c-text-muted)' }}>ยังไม่มีข้อมูลการอนุมัติ</div>
        ) : (
          <Table minWidth={420}>
            <thead>
              <tr>
                <Th>เดือน</Th>
                <Th align="right">เลือกตรงกับ AHP</Th>
                <Th align="right">จำนวนการตัดสินใจ</Th>
              </tr>
            </thead>
            <tbody>
              {data.trend.map((t) => (
                <tr key={t.period}>
                  <Td>{t.period}</Td>
                  <Td align="right">{t.match_rate_pct.toFixed(1)}%</Td>
                  <Td align="right">{t.total_decisions}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </OrgWorkspaceLayout>
  );
}
