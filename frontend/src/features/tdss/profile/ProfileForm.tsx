import { useState } from 'react';
import { Button, Card, Field, Input, PageHeader } from '../../../components/ui';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import { authApi } from '../../../api';

export default function ProfileForm() {
  const { user, refreshUser } = useAuth();
  const { showSuccess, showError } = useToast();
  const [name, setName] = useState(user?.name ?? '');
  const [savingName, setSavingName] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const saveName = async () => {
    setSavingName(true);
    try {
      await authApi.updateProfile({ name });
      await refreshUser();
      showSuccess('บันทึกชื่อแล้ว');
    } catch {
      showError('บันทึกไม่สำเร็จ');
    } finally {
      setSavingName(false);
    }
  };

  const changePassword = async () => {
    if (newPassword.length < 6) {
      showError('รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร');
      return;
    }
    setSavingPassword(true);
    try {
      await authApi.changePassword({ current_password: currentPassword, new_password: newPassword });
      showSuccess('เปลี่ยนรหัสผ่านแล้ว');
      setCurrentPassword('');
      setNewPassword('');
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      showError(typeof detail === 'string' ? detail : 'เปลี่ยนรหัสผ่านไม่สำเร็จ');
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <>
      <PageHeader title="โปรไฟล์ของฉัน" subtitle={user?.email} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Card>
          <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 14 }}>ข้อมูลส่วนตัว</div>
          <Field label="ชื่อ-นามสกุล">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <div style={{ marginTop: 14 }}>
            <Button onClick={saveName} loading={savingName}>
              บันทึก
            </Button>
          </div>
        </Card>

        <Card>
          <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 14 }}>เปลี่ยนรหัสผ่าน</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Field label="รหัสผ่านปัจจุบัน">
              <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
            </Field>
            <Field label="รหัสผ่านใหม่">
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={6} />
            </Field>
          </div>
          <div style={{ marginTop: 14 }}>
            <Button onClick={changePassword} loading={savingPassword}>
              เปลี่ยนรหัสผ่าน
            </Button>
          </div>
        </Card>
      </div>
    </>
  );
}
