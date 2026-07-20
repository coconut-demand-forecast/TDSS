import { useEffect, useState } from 'react';
import OrgWorkspaceLayout from '../../../layouts/OrgWorkspaceLayout';
import { Button, Card, DateRangePicker, LoadingState, PageHeader, Table, Th, Td, presetToRange, type DateRange } from '../../../components/ui';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import { auditApi, reportsApi, type AuditLogEntry } from '../../../api';

const REPORTS = [
  { key: 'jobs', label: 'รายงานงานขนส่ง', desc: 'รายการงานขนส่งทั้งหมดพร้อมสถานะ' },
  { key: 'vehicleUtilization', label: 'รายงานอัตราการใช้ความจุยานพาหนะ', desc: 'อัตราการใช้น้ำหนัก/ปริมาตรของยานพาหนะที่แนะนำ' },
  { key: 'costComparison', label: 'รายงานเปรียบเทียบต้นทุน', desc: 'ต้นทุนของแต่ละทางเลือกในทุกคำแนะนำ' },
  { key: 'co2', label: 'รายงานการปล่อย CO2', desc: 'ปริมาณ CO2 โดยประมาณของแต่ละทางเลือก' },
  { key: 'decisionProfiles', label: 'รายงานโปรไฟล์การตัดสินใจ (AHP)', desc: 'น้ำหนักเกณฑ์และค่าความสอดคล้องของทุกโปรไฟล์' },
] as const;

export default function ReportsPage() {
  const { currentOrgId } = useAuth();
  const { showError, showSuccess } = useToast();
  const [range, setRange] = useState<DateRange>(() => presetToRange(30));

  const download = async (key: (typeof REPORTS)[number]['key']) => {
    if (!currentOrgId) return;
    try {
      await reportsApi[key](currentOrgId, { date_from: range.date_from, date_to: range.date_to });
      showSuccess('ดาวน์โหลดรายงานแล้ว');
    } catch {
      showError('ดาวน์โหลดรายงานไม่สำเร็จ');
    }
  };

  return (
    <OrgWorkspaceLayout title="รายงาน">
      <PageHeader
        title="รายงาน"
        subtitle={`ส่งออกรายงานเป็นไฟล์ CSV — ช่วงเวลา: ${range.label} (มีผลกับทั้งตารางและไฟล์ที่ดาวน์โหลด)`}
        actions={<DateRangePicker onChange={setRange} />}
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {REPORTS.map((r) => (
          <Card key={r.key}>
            <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 6 }}>{r.label}</div>
            <div style={{ fontSize: 12, color: 'var(--c-text-muted)', marginBottom: 14 }}>{r.desc}</div>
            <Button size="sm" variant="secondary" onClick={() => download(r.key)}>
              ดาวน์โหลด CSV
            </Button>
          </Card>
        ))}
      </div>

      <div style={{ marginTop: 20 }}>
        <PageHeader title="บันทึกการใช้งาน (Audit Log)" subtitle={`ประวัติการสร้าง/แก้ไข/อนุมัติในองค์กร — ช่วงเวลา: ${range.label}`} />
        <AuditLogTable range={range} />
      </div>
    </OrgWorkspaceLayout>
  );
}

function AuditLogTable({ range }: { range: DateRange }) {
  const { currentOrgId } = useAuth();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentOrgId) return;
    setLoading(true);
    const params: Record<string, string> = {};
    if (range.date_from) params.date_from = range.date_from;
    if (range.date_to) params.date_to = range.date_to;
    auditApi
      .listOrg(currentOrgId, params)
      .then(setLogs)
      .finally(() => setLoading(false));
  }, [currentOrgId, range]);

  if (loading) return <LoadingState card />;
  if (logs.length === 0) return <Card style={{ padding: 24, fontSize: 12.5, color: 'var(--c-text-faint)' }}>ไม่มีบันทึกการใช้งานในช่วงเวลานี้</Card>;

  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <Table>
        <thead>
          <tr>
            <Th>เวลา</Th>
            <Th>ผู้ใช้งาน</Th>
            <Th>การกระทำ</Th>
            <Th>ประเภท</Th>
            <Th align="right">รหัส</Th>
          </tr>
        </thead>
        <tbody>
          {logs.map((l) => (
            <tr key={l.id}>
              <Td>{new Date(l.created_at).toLocaleString('th-TH')}</Td>
              <Td>{l.user_name ?? '-'}</Td>
              <Td>{l.action}</Td>
              <Td>{l.entity_type}</Td>
              <Td align="right">{l.entity_id ?? '-'}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}
