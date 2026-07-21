import { useEffect, useState } from 'react';
import { useLanguage } from '../../../context/LanguageContext';
import OrgWorkspaceLayout from '../../../layouts/OrgWorkspaceLayout';
import { Button, Card, Dialog, Field, Input, LoadingState, PageHeader, Select, StatusBadge, Table, Td, Th } from '../../../components/ui';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import { organizationsApi, type OrgUser } from '../../../api';

export default function OrgUsersPage() {
  const { t } = useLanguage();
  const { currentOrgId } = useAuth();
  const { showSuccess, showError } = useToast();
  const [users, setUsers] = useState<OrgUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'planner' });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!currentOrgId) return;
    setLoading(true);
    try {
      setUsers(await organizationsApi.listUsers(currentOrgId));
    } catch {
      showError('โหลดข้อมูลผู้ใช้งานไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrgId]);

  const submit = async () => {
    if (!currentOrgId) return;
    if (!form.name || !form.email || form.password.length < 6) {
      showError('กรุณากรอกข้อมูลให้ครบ (รหัสผ่านอย่างน้อย 6 ตัวอักษร)');
      return;
    }
    setSaving(true);
    try {
      await organizationsApi.inviteUser(currentOrgId, form);
      showSuccess('เพิ่มผู้ใช้งานสำเร็จ');
      setShowForm(false);
      setForm({ name: '', email: '', password: '', role: 'planner' });
      await load();
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      showError(typeof detail === 'string' ? detail : 'เพิ่มผู้ใช้งานไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (u: OrgUser, status: string) => {
    if (!currentOrgId) return;
    try {
      await organizationsApi.updateUser(currentOrgId, u.user_id, { membership_status: status });
      showSuccess('อัปเดตสถานะแล้ว');
      await load();
    } catch {
      showError('อัปเดตสถานะไม่สำเร็จ');
    }
  };

  const changeRole = async (u: OrgUser, role: string) => {
    if (!currentOrgId) return;
    try {
      await organizationsApi.updateUser(currentOrgId, u.user_id, { role });
      showSuccess('เปลี่ยนบทบาทแล้ว');
      await load();
    } catch {
      showError('เปลี่ยนบทบาทไม่สำเร็จ');
    }
  };

  return (
    <OrgWorkspaceLayout title={t('nav.users')}>
      <PageHeader title={t('nav.users')} subtitle="จัดการสมาชิกและบทบาทในองค์กร" actions={<Button onClick={() => setShowForm(true)}>+ เพิ่มผู้ใช้งาน</Button>} />

      {loading ? (
        <LoadingState card />
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <Table>
            <thead>
              <tr>
                <Th>ชื่อ</Th>
                <Th>อีเมล</Th>
                <Th align="center">บทบาท</Th>
                <Th align="center">สถานะ</Th>
                <Th align="center"></Th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.user_id}>
                  <Td>{u.name}</Td>
                  <Td>{u.email}</Td>
                  <Td align="center">
                    <Select value={u.role} onChange={(e) => changeRole(u, e.target.value)} style={{ fontSize: 12, padding: '5px 8px' }}>
                      <option value="org_admin">ผู้ดูแลองค์กร</option>
                      <option value="planner">นักวางแผน</option>
                      <option value="viewer">ผู้เยี่ยมชม</option>
                    </Select>
                  </Td>
                  <Td align="center">
                    <StatusBadge status={u.membership_status} />
                  </Td>
                  <Td align="center">
                    {u.membership_status === 'active' ? (
                      <Button size="sm" variant="danger" onClick={() => changeStatus(u, 'suspended')}>
                        ระงับ
                      </Button>
                    ) : (
                      <Button size="sm" variant="secondary" onClick={() => changeStatus(u, 'active')}>
                        เปิดใช้งาน
                      </Button>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      {showForm && (
        <Dialog title="เพิ่มผู้ใช้งานใหม่" onClose={() => setShowForm(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Field label="ชื่อ-นามสกุล" required>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="อีเมล" required>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label="รหัสผ่านชั่วคราว" required>
              <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} minLength={6} />
            </Field>
            <Field label="บทบาท" required>
              <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="org_admin">ผู้ดูแลองค์กร</option>
                <option value="planner">นักวางแผน</option>
                <option value="viewer">ผู้เยี่ยมชม</option>
              </Select>
            </Field>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
            <Button variant="secondary" onClick={() => setShowForm(false)}>
              ยกเลิก
            </Button>
            <Button onClick={submit} loading={saving}>
              เพิ่มผู้ใช้งาน
            </Button>
          </div>
        </Dialog>
      )}
    </OrgWorkspaceLayout>
  );
}
