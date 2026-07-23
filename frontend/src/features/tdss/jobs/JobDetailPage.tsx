import { useEffect, useState } from 'react';
import { useLanguage } from '../../../context/LanguageContext';
import { useNavigate, useParams } from 'react-router-dom';
import OrgWorkspaceLayout from '../../../layouts/OrgWorkspaceLayout';
import { Button, Card, Field, Input, LoadingState, PageHeader, Select, StatusBadge, Table, Td, Th, TextArea } from '../../../components/ui';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import { jobItemsApi, jobsApi, type TransportJob, type TransportJobItem } from '../../../api';

interface RunHistoryItem {
  id: number;
  created_at: string;
  decision_profile_id: number;
  has_approval: boolean;
}

export default function JobDetailPage() {
  const { t } = useLanguage();
  const { jobId } = useParams();
  const { currentOrgId, user } = useAuth();
  const { showSuccess, showError } = useToast();
  const navigate = useNavigate();
  const [job, setJob] = useState<TransportJob | null>(null);
  const [items, setItems] = useState<TransportJobItem[]>([]);
  const [history, setHistory] = useState<RunHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<TransportJob>>({});
  const [saving, setSaving] = useState(false);

  const membership = user?.memberships.find((m) => m.organization_id === currentOrgId);
  const canWrite = user?.is_system_owner || membership?.role === 'org_admin' || membership?.role === 'planner';

  const load = async () => {
    if (!currentOrgId || !jobId) return;
    setLoading(true);
    try {
      const j = await jobsApi.get(currentOrgId, Number(jobId));
      setJob(j);
      setForm(j);
      setItems(await jobItemsApi.list(currentOrgId, Number(jobId)));
      setHistory((await jobsApi.history(currentOrgId, Number(jobId))) as RunHistoryItem[]);
    } catch {
      showError('โหลดข้อมูลงานไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrgId, jobId]);

  const save = async () => {
    if (!currentOrgId || !job) return;
    setSaving(true);
    try {
      await jobsApi.update(currentOrgId, job.id, {
        customer_name: form.customer_name,
        origin: form.origin || undefined,
        destination: form.destination || undefined,
        // When the job has product line items, weight/volume are computed
        // from them (see Planning Wizard) — omit these keys entirely so we
        // never overwrite that computed total with a stale manual value.
        shipment_weight_kg: items.length > 0 ? undefined : form.shipment_weight_kg ? Number(form.shipment_weight_kg) : undefined,
        shipment_volume_m3: items.length > 0 ? undefined : form.shipment_volume_m3 ? Number(form.shipment_volume_m3) : undefined,
        priority: form.priority,
        special_requirements: form.special_requirements || undefined,
        number_of_stops: form.number_of_stops ? Number(form.number_of_stops) : undefined,
      });
      showSuccess('บันทึกการแก้ไขแล้ว');
      setEditing(false);
      await load();
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      showError(typeof detail === 'string' ? detail : 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  const cancelJob = async () => {
    if (!currentOrgId || !job) return;
    try {
      await jobsApi.cancel(currentOrgId, job.id);
      showSuccess('ยกเลิกงานแล้ว');
      await load();
    } catch {
      showError('ยกเลิกงานไม่สำเร็จ');
    }
  };

  const duplicateJob = async () => {
    if (!currentOrgId || !job) return;
    try {
      const copy = await jobsApi.duplicate(currentOrgId, job.id);
      showSuccess('ทำสำเนางานสำเร็จ');
      navigate(`/tdss/jobs/${copy.id}`);
    } catch {
      showError('ทำสำเนาไม่สำเร็จ');
    }
  };

  if (loading) {
    return (
      <OrgWorkspaceLayout title={t('pageTitle.jobDetail')}>
        <LoadingState card />
      </OrgWorkspaceLayout>
    );
  }
  if (!job) {
    return (
      <OrgWorkspaceLayout title={t('pageTitle.jobDetail')}>
        <Card>ไม่พบงานขนส่งนี้</Card>
      </OrgWorkspaceLayout>
    );
  }

  const isReadyForPlanning = !!(job.origin && job.destination && job.shipment_weight_kg && job.shipment_volume_m3);
  const canCancel = ['draft', 'ready', 'planning', 'recommended'].includes(job.status);
  const canEdit = canWrite && !['completed', 'cancelled'].includes(job.status);

  return (
    <OrgWorkspaceLayout title={job.job_number}>
      <PageHeader
        title={job.job_number}
        subtitle={job.customer_name}
        actions={
          <>
            <StatusBadge status={job.status} />
            {canWrite && (
              <>
                <Button variant="secondary" size="sm" onClick={duplicateJob}>
                  ทำสำเนา
                </Button>
                {canCancel && (
                  <Button variant="danger" size="sm" onClick={cancelJob}>
                    ยกเลิกงาน
                  </Button>
                )}
                {isReadyForPlanning && !['completed', 'cancelled'].includes(job.status) && (
                  <Button onClick={() => navigate(`/tdss/jobs/${job.id}/planning`)}>เปิด Planning Wizard →</Button>
                )}
              </>
            )}
          </>
        }
      />

      {!isReadyForPlanning && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', borderRadius: 10, padding: '10px 14px', fontSize: 12.5, marginBottom: 16 }}>
          กรอกต้นทาง ปลายทาง น้ำหนัก และปริมาตรให้ครบก่อนจึงจะเริ่มวางแผนได้
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 16 }}>
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>ข้อมูลงานขนส่ง</div>
            {canEdit && !editing && (
              <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
                แก้ไข
              </Button>
            )}
          </div>

          {editing ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <Field label="ชื่อลูกค้า" required>
                  <Input value={form.customer_name ?? ''} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} />
                </Field>
              </div>
              <Field label="ต้นทาง">
                <Input value={form.origin ?? ''} onChange={(e) => setForm({ ...form, origin: e.target.value })} />
              </Field>
              <Field label="ปลายทาง">
                <Input value={form.destination ?? ''} onChange={(e) => setForm({ ...form, destination: e.target.value })} />
              </Field>
              {items.length > 0 ? (
                <div style={{ gridColumn: '1 / -1', fontSize: 12, color: 'var(--c-text-muted)', background: '#f6f7f8', borderRadius: 8, padding: '10px 12px' }}>
                  น้ำหนัก/ปริมาตรคำนวณจาก {items.length} รายการสินค้าที่เลือกไว้ ({job.shipment_weight_kg?.toLocaleString()} กก. / {job.shipment_volume_m3?.toLocaleString()} ลบ.ม.) —
                  แก้ไขรายการสินค้าได้ที่ Planning Wizard
                </div>
              ) : (
                <>
                  <Field label="น้ำหนัก (กก.)">
                    <Input type="number" value={form.shipment_weight_kg ?? ''} onChange={(e) => setForm({ ...form, shipment_weight_kg: Number(e.target.value) })} />
                  </Field>
                  <Field label="ปริมาตร (ลบ.ม.)">
                    <Input type="number" value={form.shipment_volume_m3 ?? ''} onChange={(e) => setForm({ ...form, shipment_volume_m3: Number(e.target.value) })} />
                  </Field>
                </>
              )}
              <Field label="ความสำคัญ">
                <Select value={form.priority ?? 'normal'} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                  <option value="low">ต่ำ</option>
                  <option value="normal">ปกติ</option>
                  <option value="high">สูง</option>
                  <option value="urgent">เร่งด่วน</option>
                </Select>
              </Field>
              <Field label="จำนวนจุดส่ง">
                <Input type="number" min={1} value={form.number_of_stops ?? 1} onChange={(e) => setForm({ ...form, number_of_stops: Number(e.target.value) })} />
              </Field>
              <div style={{ gridColumn: '1 / -1' }}>
                <Field label="ความต้องการพิเศษ">
                  <TextArea value={form.special_requirements ?? ''} onChange={(e) => setForm({ ...form, special_requirements: e.target.value })} />
                </Field>
              </div>
              <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <Button variant="secondary" onClick={() => setEditing(false)}>
                  ยกเลิก
                </Button>
                <Button onClick={save} loading={saving}>
                  บันทึก
                </Button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
              <Row label="ต้นทาง" value={job.origin || '-'} />
              <Row label="ปลายทาง" value={job.destination || '-'} />
              <Row label="น้ำหนัก" value={job.shipment_weight_kg ? `${job.shipment_weight_kg.toLocaleString()} กก.` : '-'} />
              <Row label="ปริมาตร" value={job.shipment_volume_m3 ? `${job.shipment_volume_m3.toLocaleString()} ลบ.ม.` : '-'} />
              <Row label="ความสำคัญ" value={job.priority} />
              <Row label="จำนวนจุดส่ง" value={`${job.number_of_stops} จุด`} />
              <Row label="ความต้องการพิเศษ" value={job.special_requirements || '-'} />

              {items.length > 0 && (
                <div style={{ marginTop: 4 }}>
                  <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 8, color: 'var(--c-text-muted)' }}>รายการสินค้า ({items.length})</div>
                  <Table minWidth={360}>
                    <thead>
                      <tr>
                        <Th>SKU</Th>
                        <Th>ชื่อสินค้า</Th>
                        <Th align="right">จำนวน</Th>
                        <Th align="right">น้ำหนักรวม</Th>
                        <Th align="right">ปริมาตรรวม</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it) => (
                        <tr key={it.id}>
                          <Td>{it.sku}</Td>
                          <Td>{it.product_name}</Td>
                          <Td align="right">
                            {it.quantity.toLocaleString()} {it.unit}
                          </Td>
                          <Td align="right">{it.total_weight_kg.toLocaleString()} กก.</Td>
                          <Td align="right">{it.total_volume_m3.toLocaleString(undefined, { maximumFractionDigits: 4 })} ลบ.ม.</Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
              )}
            </div>
          )}
        </Card>

        <Card>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>ประวัติคำแนะนำ</div>
          {history.length === 0 ? (
            <div style={{ fontSize: 12.5, color: 'var(--c-text-faint)' }}>ยังไม่มีการสร้างคำแนะนำสำหรับงานนี้</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {history.map((h) => (
                <div key={h.id} onClick={() => navigate(`/tdss/recommendations/${h.id}`)} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', border: '1px solid var(--c-border)', borderRadius: 8, cursor: 'pointer', fontSize: 12.5 }}>
                  <span>{new Date(h.created_at).toLocaleString('th-TH')}</span>
                  <StatusBadge tone={h.has_approval ? 'success' : 'neutral'}>{h.has_approval ? 'อนุมัติแล้ว' : 'รอการอนุมัติ'}</StatusBadge>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </OrgWorkspaceLayout>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 8, borderBottom: '1px solid #f3f4f6' }}>
      <span style={{ color: 'var(--c-text-muted)' }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}
