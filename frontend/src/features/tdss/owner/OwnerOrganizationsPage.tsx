import { useEffect, useState } from 'react';
import { useLanguage } from '../../../context/LanguageContext';
import OwnerConsoleLayout from '../../../layouts/OwnerConsoleLayout';
import { Button, Card, Dialog, Field, Input, LoadingState, PageHeader, StatusBadge, Table, Td, Th } from '../../../components/ui';
import { useToast } from '../../../context/ToastContext';
import { ownerApi, type Feature, type Organization } from '../../../api';

const FEATURE_LABELS: Record<string, string> = {
  transportation_planning: 'การวางแผนงานขนส่ง',
  ahp_profiles: 'โปรไฟล์การตัดสินใจ (AHP)',
  recommendation_engine: 'ระบบแนะนำ',
  reports: 'รายงาน',
  google_maps_mode: 'โหมด Google Maps',
  manual_route_mode: 'โหมดเส้นทางแบบ Manual',
};

export default function OwnerOrganizationsPage() {
  const { t } = useLanguage();
  const { showSuccess, showError } = useToast();
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [featuresOrg, setFeaturesOrg] = useState<Organization | null>(null);
  const [features, setFeatures] = useState<Feature[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      setOrgs(await ownerApi.listOrganizations());
    } catch {
      showError('โหลดข้อมูลองค์กรไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createOrg = async () => {
    if (!newName) return;
    setSaving(true);
    try {
      await ownerApi.createOrganization(newName);
      showSuccess('สร้างองค์กรสำเร็จ');
      setShowCreate(false);
      setNewName('');
      await load();
    } catch {
      showError('สร้างองค์กรไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  const toggleOrgStatus = async (org: Organization) => {
    try {
      if (org.status === 'active') await ownerApi.suspendOrganization(org.id);
      else await ownerApi.activateOrganization(org.id);
      showSuccess('อัปเดตสถานะแล้ว');
      await load();
    } catch {
      showError('อัปเดตสถานะไม่สำเร็จ');
    }
  };

  const openFeatures = async (org: Organization) => {
    setFeaturesOrg(org);
    setFeatures(await ownerApi.getFeatures(org.id));
  };

  const toggleFeature = async (f: Feature) => {
    if (!featuresOrg) return;
    try {
      await ownerApi.setFeature(featuresOrg.id, f.feature_key, !f.enabled);
      setFeatures(await ownerApi.getFeatures(featuresOrg.id));
      showSuccess('อัปเดตฟีเจอร์แล้ว');
    } catch {
      showError('อัปเดตฟีเจอร์ไม่สำเร็จ');
    }
  };

  return (
    <OwnerConsoleLayout title={t('nav.owner-orgs')}>
      <PageHeader title={t('nav.owner-orgs')} subtitle="จัดการองค์กรและสิทธิ์การใช้งานฟีเจอร์" actions={<Button onClick={() => setShowCreate(true)}>+ สร้างองค์กรใหม่</Button>} />

      {loading ? (
        <LoadingState card />
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <Table>
            <thead>
              <tr>
                <Th>ชื่อองค์กร</Th>
                <Th align="center">สถานะ</Th>
                <Th>สร้างเมื่อ</Th>
                <Th align="center"></Th>
              </tr>
            </thead>
            <tbody>
              {orgs.map((o) => (
                <tr key={o.id}>
                  <Td>{o.name}</Td>
                  <Td align="center">
                    <StatusBadge status={o.status} />
                  </Td>
                  <Td>{new Date(o.created_at).toLocaleDateString('th-TH')}</Td>
                  <Td align="center">
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                      <Button size="sm" variant="secondary" onClick={() => openFeatures(o)}>
                        ฟีเจอร์
                      </Button>
                      <Button size="sm" variant={o.status === 'active' ? 'danger' : 'secondary'} onClick={() => toggleOrgStatus(o)}>
                        {o.status === 'active' ? 'ระงับ' : 'เปิดใช้งาน'}
                      </Button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      {showCreate && (
        <Dialog title="สร้างองค์กรใหม่" onClose={() => setShowCreate(false)}>
          <Field label="ชื่อองค์กร" required>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} />
          </Field>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>
              ยกเลิก
            </Button>
            <Button onClick={createOrg} loading={saving}>
              สร้าง
            </Button>
          </div>
        </Dialog>
      )}

      {featuresOrg && (
        <Dialog title={`ฟีเจอร์ — ${featuresOrg.name}`} onClose={() => setFeaturesOrg(null)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {features.map((f) => (
              <div key={f.feature_key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f3f4f6' }}>
                <span style={{ fontSize: 13 }}>{FEATURE_LABELS[f.feature_key] ?? f.feature_key}</span>
                <Button size="sm" variant={f.enabled ? 'danger' : 'secondary'} onClick={() => toggleFeature(f)}>
                  {f.enabled ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                </Button>
              </div>
            ))}
          </div>
        </Dialog>
      )}
    </OwnerConsoleLayout>
  );
}
