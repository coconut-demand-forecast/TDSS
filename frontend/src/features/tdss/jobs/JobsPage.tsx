import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import OrgWorkspaceLayout from '../../../layouts/OrgWorkspaceLayout';
import { Button, Card, Dialog, EmptyState, Field, Input, LoadingState, PageHeader, Select, StatusBadge, Table, Td, TextArea, Th } from '../../../components/ui';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import { jobsApi, type TransportJob } from '../../../api';

const STATUS_LABELS: Record<string, string> = {
  draft: 'ฉบับร่าง',
  ready: 'พร้อมวางแผน',
  planning: 'กำลังวางแผน',
  recommended: 'มีคำแนะนำแล้ว',
  approved: 'อนุมัติแล้ว',
  completed: 'เสร็จสิ้น',
  cancelled: 'ยกเลิก',
};

const EMPTY_FORM = {
  customer_name: '',
  origin: '',
  destination: '',
  required_delivery_datetime: '',
  shipment_weight_kg: '',
  shipment_volume_m3: '',
  number_of_stops: '1',
  priority: 'normal',
  special_requirements: '',
};

export default function JobsPage() {
  const { currentOrgId, user } = useAuth();
  const { showSuccess, showError } = useToast();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<TransportJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const membership = user?.memberships.find((m) => m.organization_id === currentOrgId);
  const canWrite = user?.is_system_owner || membership?.role === 'org_admin' || membership?.role === 'planner';

  const load = async () => {
    if (!currentOrgId) return;
    setLoading(true);
    try {
      setJobs(await jobsApi.list(currentOrgId, { status: statusFilter || undefined }));
    } catch {
      showError('โหลดข้อมูลงานขนส่งไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrgId, statusFilter]);

  const submit = async () => {
    if (!currentOrgId) return;
    if (!form.customer_name) {
      showError('กรุณากรอกชื่อลูกค้า');
      return;
    }
    setSaving(true);
    try {
      const created = await jobsApi.create(currentOrgId, {
        customer_name: form.customer_name,
        origin: form.origin || undefined,
        destination: form.destination || undefined,
        required_delivery_datetime: form.required_delivery_datetime ? new Date(form.required_delivery_datetime).toISOString() : undefined,
        shipment_weight_kg: form.shipment_weight_kg ? Number(form.shipment_weight_kg) : undefined,
        shipment_volume_m3: form.shipment_volume_m3 ? Number(form.shipment_volume_m3) : undefined,
        number_of_stops: Number(form.number_of_stops || 1),
        priority: form.priority,
        special_requirements: form.special_requirements || undefined,
      });
      showSuccess('สร้างงานขนส่งสำเร็จ');
      setShowForm(false);
      setForm(EMPTY_FORM);
      navigate(`/tdss/jobs/${created.id}`);
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      showError(typeof detail === 'string' ? detail : 'สร้างงานไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  return (
    <OrgWorkspaceLayout title="งานขนส่ง">
      <PageHeader
        title="งานขนส่ง"
        subtitle="สร้างและติดตามงานขนส่ง"
        actions={
          <>
            <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ width: 170 }}>
              <option value="">ทุกสถานะ</option>
              {Object.entries(STATUS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
            {canWrite && <Button onClick={() => setShowForm(true)}>+ สร้างงานขนส่ง</Button>}
          </>
        }
      />

      {loading ? (
        <LoadingState card />
      ) : jobs.length === 0 ? (
        <EmptyState message="ยังไม่มีงานขนส่ง" action={canWrite && <Button onClick={() => setShowForm(true)}>+ สร้างงานแรก</Button>} />
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <Table>
            <thead>
              <tr>
                <Th>เลขที่งาน</Th>
                <Th>ลูกค้า</Th>
                <Th>ต้นทาง → ปลายทาง</Th>
                <Th align="right">น้ำหนัก/ปริมาตร</Th>
                <Th align="center">ความสำคัญ</Th>
                <Th align="center">สถานะ</Th>
                <Th align="center"></Th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id}>
                  <Td>{j.job_number}</Td>
                  <Td>{j.customer_name}</Td>
                  <Td>
                    {j.origin || '-'} → {j.destination || '-'}
                  </Td>
                  <Td align="right">
                    {j.shipment_weight_kg ? `${j.shipment_weight_kg.toLocaleString()} กก.` : '-'} / {j.shipment_volume_m3 ? `${j.shipment_volume_m3.toLocaleString()} ลบ.ม.` : '-'}
                  </Td>
                  <Td align="center">
                    <StatusBadge status={j.priority} />
                  </Td>
                  <Td align="center">
                    <StatusBadge status={j.status}>{STATUS_LABELS[j.status] ?? j.status}</StatusBadge>
                  </Td>
                  <Td align="center">
                    <Button size="sm" variant="secondary" onClick={() => navigate(`/tdss/jobs/${j.id}`)}>
                      เปิดดู
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      {showForm && (
        <Dialog title="สร้างงานขนส่งใหม่" onClose={() => setShowForm(false)}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <Field label="ชื่อลูกค้า" required>
                <Input value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} />
              </Field>
            </div>
            <Field label="ต้นทาง">
              <Input value={form.origin} onChange={(e) => setForm({ ...form, origin: e.target.value })} />
            </Field>
            <Field label="ปลายทาง">
              <Input value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} />
            </Field>
            <Field label="น้ำหนักสินค้า (กก.)">
              <Input type="number" value={form.shipment_weight_kg} onChange={(e) => setForm({ ...form, shipment_weight_kg: e.target.value })} />
            </Field>
            <Field label="ปริมาตรสินค้า (ลบ.ม.)">
              <Input type="number" value={form.shipment_volume_m3} onChange={(e) => setForm({ ...form, shipment_volume_m3: e.target.value })} />
            </Field>
            <Field label="กำหนดส่งมอบ">
              <Input type="datetime-local" value={form.required_delivery_datetime} onChange={(e) => setForm({ ...form, required_delivery_datetime: e.target.value })} />
            </Field>
            <Field label="ความสำคัญ">
              <Select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                <option value="low">ต่ำ</option>
                <option value="normal">ปกติ</option>
                <option value="high">สูง</option>
                <option value="urgent">เร่งด่วน</option>
              </Select>
            </Field>
            <div style={{ gridColumn: '1 / -1' }}>
              <Field label="ความต้องการพิเศษ">
                <TextArea value={form.special_requirements} onChange={(e) => setForm({ ...form, special_requirements: e.target.value })} />
              </Field>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
            <Button variant="secondary" onClick={() => setShowForm(false)}>
              ยกเลิก
            </Button>
            <Button onClick={submit} loading={saving}>
              บันทึกและเปิดดู
            </Button>
          </div>
        </Dialog>
      )}
    </OrgWorkspaceLayout>
  );
}
