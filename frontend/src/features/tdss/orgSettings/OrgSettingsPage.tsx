import { useEffect, useState } from 'react';
import { useLanguage } from '../../../context/LanguageContext';
import OrgWorkspaceLayout from '../../../layouts/OrgWorkspaceLayout';
import { Button, Card, Field, LoadingState, PageHeader, Select } from '../../../components/ui';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import { organizationsApi, profilesApi, type DecisionProfile, type OrganizationSettings } from '../../../api';

export default function OrgSettingsPage() {
  const { t } = useLanguage();
  const { currentOrgId, user } = useAuth();
  const { showSuccess, showError } = useToast();
  const [settings, setSettings] = useState<OrganizationSettings | null>(null);
  const [profiles, setProfiles] = useState<DecisionProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const membership = user?.memberships.find((m) => m.organization_id === currentOrgId);
  const canEdit = user?.is_system_owner || membership?.role === 'org_admin';

  const load = async () => {
    if (!currentOrgId) return;
    setLoading(true);
    try {
      const [s, p] = await Promise.all([organizationsApi.getSettings(currentOrgId), profilesApi.list(currentOrgId)]);
      setSettings(s);
      setProfiles(p);
    } catch {
      showError('โหลดการตั้งค่าไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrgId]);

  const save = async () => {
    if (!currentOrgId || !settings) return;
    setSaving(true);
    try {
      const updated = await organizationsApi.updateSettings(currentOrgId, settings);
      setSettings(updated);
      showSuccess('บันทึกการตั้งค่าแล้ว');
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      showError(typeof detail === 'string' ? detail : 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !settings) {
    return (
      <OrgWorkspaceLayout title={t('nav.org-settings')}>
        <LoadingState card />
      </OrgWorkspaceLayout>
    );
  }

  if (!canEdit) {
    return (
      <OrgWorkspaceLayout title={t('nav.org-settings')}>
        <Card>เฉพาะผู้ดูแลองค์กรเท่านั้นที่สามารถแก้ไขการตั้งค่านี้ได้ — คุณดูได้แต่ไม่สามารถแก้ไข</Card>
      </OrgWorkspaceLayout>
    );
  }

  return (
    <OrgWorkspaceLayout title={t('nav.org-settings')}>
      <PageHeader title={t('nav.org-settings')} subtitle="ค่าเริ่มต้นและการแจ้งเตือนที่มีผลต่อการทำงานจริงของระบบ" />

      <Card style={{ maxWidth: 560 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <Field label="โหมดเส้นทางเริ่มต้น">
            <Select value={settings.default_route_mode} onChange={(e) => setSettings({ ...settings, default_route_mode: e.target.value })}>
              <option value="manual">Manual</option>
              <option value="google_maps">Google Maps</option>
            </Select>
            <div style={{ fontSize: 11, color: 'var(--c-text-faint)', marginTop: 4 }}>ใช้เป็นค่าเริ่มต้นเมื่อสร้างเส้นทางใหม่ในหน้า "เส้นทาง"</div>
          </Field>

          <Field label="โปรไฟล์การตัดสินใจเริ่มต้น">
            <Select
              value={settings.default_decision_profile_id ?? ''}
              onChange={(e) => setSettings({ ...settings, default_decision_profile_id: e.target.value ? Number(e.target.value) : null })}
            >
              <option value="">ไม่กำหนด</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
            <div style={{ fontSize: 11, color: 'var(--c-text-faint)', marginTop: 4 }}>ถูกเลือกไว้ล่วงหน้าในขั้นตอนที่ 4 ของ Planning Wizard</div>
          </Field>

          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--c-text-muted)', marginBottom: 10 }}>การแจ้งเตือน</div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, marginBottom: 10, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settings.notify_on_recommendation_completed}
                onChange={(e) => setSettings({ ...settings, notify_on_recommendation_completed: e.target.checked })}
              />
              แจ้งเตือนเมื่อสร้างคำแนะนำเสร็จ
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settings.notify_on_job_approved}
                onChange={(e) => setSettings({ ...settings, notify_on_job_approved: e.target.checked })}
              />
              แจ้งเตือนเมื่องานขนส่งได้รับการอนุมัติ
            </label>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button onClick={save} loading={saving}>
              บันทึกการตั้งค่า
            </Button>
          </div>
        </div>
      </Card>
    </OrgWorkspaceLayout>
  );
}
