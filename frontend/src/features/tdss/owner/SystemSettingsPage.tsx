import { useEffect, useState } from 'react';
import OwnerConsoleLayout from '../../../layouts/OwnerConsoleLayout';
import { Button, Card, Field, Input, LoadingState, PageHeader, TextArea } from '../../../components/ui';
import { useToast } from '../../../context/ToastContext';
import { systemSettingsApi, type SystemSettings } from '../../../api';

export default function SystemSettingsPage() {
  const { showSuccess, showError } = useToast();
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    systemSettingsApi
      .get()
      .then(setSettings)
      .catch(() => showError('โหลดการตั้งค่าระบบไม่สำเร็จ'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async () => {
    if (!settings) return;
    if (!settings.app_display_name.trim()) {
      showError('กรุณากรอกชื่อแอปพลิเคชัน');
      return;
    }
    setSaving(true);
    try {
      const updated = await systemSettingsApi.update(settings);
      setSettings(updated);
      showSuccess('บันทึกการตั้งค่าระบบแล้ว — ชื่อ/ข้อความจะแสดงผลทันทีในหน้าถัดไปที่โหลด');
    } catch {
      showError('บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !settings) {
    return (
      <OwnerConsoleLayout title="ตั้งค่าระบบ">
        <LoadingState card />
      </OwnerConsoleLayout>
    );
  }

  return (
    <OwnerConsoleLayout title="ตั้งค่าระบบ">
      <PageHeader title="ตั้งค่าระบบ" subtitle="ตั้งค่าที่มีผลจริงต่อการแสดงผลของแอปพลิเคชันเท่านั้น" />
      <Card style={{ maxWidth: 560 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <Field label="ชื่อแอปพลิเคชัน" required>
            <Input value={settings.app_display_name} onChange={(e) => setSettings({ ...settings, app_display_name: e.target.value })} />
            <div style={{ fontSize: 11, color: 'var(--c-text-faint)', marginTop: 4 }}>แสดงในแถบด้านข้างและหน้าเข้าสู่ระบบของทุกผู้ใช้งาน</div>
          </Field>
          <Field label="ข้อความประกาศระบบ">
            <TextArea
              value={settings.banner_message ?? ''}
              onChange={(e) => setSettings({ ...settings, banner_message: e.target.value })}
              placeholder="เช่น ระบบจะปิดปรับปรุงวันที่ 20 ก.ค. เวลา 22:00-23:00 น."
            />
            <div style={{ fontSize: 11, color: 'var(--c-text-faint)', marginTop: 4 }}>แสดงเป็นแถบแจ้งเตือนด้านบนของทุกหน้าจอเมื่อไม่ว่าง — เว้นว่างไว้เพื่อไม่แสดง</div>
          </Field>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button onClick={save} loading={saving}>
              บันทึก
            </Button>
          </div>
        </div>
      </Card>
    </OwnerConsoleLayout>
  );
}
