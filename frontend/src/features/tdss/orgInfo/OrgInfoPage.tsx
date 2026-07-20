import { useEffect, useState } from 'react';
import OrgWorkspaceLayout from '../../../layouts/OrgWorkspaceLayout';
import { Button, Card, Field, Input, LoadingState, PageHeader, StatusBadge } from '../../../components/ui';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import { organizationsApi, type OrganizationInfo } from '../../../api';

const FEATURE_LABELS: Record<string, string> = {
  transportation_planning: 'การวางแผนงานขนส่ง',
  ahp_profiles: 'โปรไฟล์การตัดสินใจ (AHP)',
  recommendation_engine: 'ระบบแนะนำ',
  reports: 'รายงาน',
  google_maps_mode: 'โหมด Google Maps',
  manual_route_mode: 'โหมดเส้นทางแบบ Manual',
};

export default function OrgInfoPage() {
  const { currentOrgId, user } = useAuth();
  const { showSuccess, showError } = useToast();
  const [info, setInfo] = useState<OrganizationInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', code: '', contact: '', address: '' });
  const [saving, setSaving] = useState(false);

  const membership = user?.memberships.find((m) => m.organization_id === currentOrgId);
  const canEdit = user?.is_system_owner || membership?.role === 'org_admin';

  const load = async () => {
    if (!currentOrgId) return;
    setLoading(true);
    try {
      const data = await organizationsApi.getInfo(currentOrgId);
      setInfo(data);
      setForm({ name: data.name, code: data.code ?? '', contact: data.contact ?? '', address: data.address ?? '' });
    } catch {
      showError('โหลดข้อมูลองค์กรไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrgId]);

  const save = async () => {
    if (!currentOrgId) return;
    if (!form.name.trim()) {
      showError('กรุณากรอกชื่อองค์กร');
      return;
    }
    setSaving(true);
    try {
      await organizationsApi.updateInfo(currentOrgId, { name: form.name, code: form.code || undefined, contact: form.contact || undefined, address: form.address || undefined });
      showSuccess('บันทึกข้อมูลองค์กรแล้ว');
      setEditing(false);
      await load();
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      showError(typeof detail === 'string' ? detail : 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !info) {
    return (
      <OrgWorkspaceLayout title="ข้อมูลองค์กร">
        <LoadingState card />
      </OrgWorkspaceLayout>
    );
  }

  return (
    <OrgWorkspaceLayout title="ข้อมูลองค์กร">
      <PageHeader
        title="ข้อมูลองค์กร"
        subtitle="ข้อมูลพื้นฐานและการใช้งานขององค์กร"
        actions={
          canEdit && !editing ? (
            <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
              แก้ไข
            </Button>
          ) : undefined
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 16 }}>
        <Card>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>ข้อมูลพื้นฐาน</div>
          {editing ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <Field label="ชื่อองค์กร" required>
                  <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </Field>
              </div>
              <Field label="รหัสองค์กร">
                <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="เช่น ORG-001" />
              </Field>
              <Field label="ช่องทางติดต่อ">
                <Input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} placeholder="เบอร์โทร/อีเมล" />
              </Field>
              <div style={{ gridColumn: '1 / -1' }}>
                <Field label="ที่อยู่">
                  <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
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
              <Row label="ชื่อองค์กร" value={info.name} />
              <Row label="รหัสองค์กร" value={info.code || '-'} />
              <Row label="ช่องทางติดต่อ" value={info.contact || '-'} />
              <Row label="ที่อยู่" value={info.address || '-'} />
              <Row label="สร้างเมื่อ" value={new Date(info.created_at).toLocaleDateString('th-TH')} />
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 8 }}>
                <span style={{ color: 'var(--c-text-muted)' }}>สถานะ</span>
                <StatusBadge status={info.status} />
              </div>
            </div>
          )}
          {!editing && (
            <div style={{ marginTop: 12, fontSize: 11.5, color: 'var(--c-text-faint)' }}>
              สถานะและสิทธิ์การใช้งานฟีเจอร์ระดับแพลตฟอร์มกำหนดโดยผู้ดูแลระบบ (System Owner) เท่านั้น
            </div>
          )}
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Card>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>การใช้งานโดยสรุป</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
              <Row label="ยานพาหนะ" value={String(info.usage.vehicle_count)} />
              <Row label="เส้นทาง" value={String(info.usage.route_count)} />
              <Row label="งานขนส่ง" value={String(info.usage.job_count)} />
              <Row label="ผู้ใช้งาน" value={String(info.usage.user_count)} />
              <Row label="โปรไฟล์การตัดสินใจ" value={String(info.usage.decision_profile_count)} />
            </div>
          </Card>

          <Card>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>ฟีเจอร์ที่เปิดใช้งาน</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {info.features.map((f) => (
                <div key={f.feature_key} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                  <span>{FEATURE_LABELS[f.feature_key] ?? f.feature_key}</span>
                  <StatusBadge tone={f.enabled ? 'success' : 'neutral'}>{f.enabled ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}</StatusBadge>
                </div>
              ))}
            </div>
          </Card>
        </div>
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
