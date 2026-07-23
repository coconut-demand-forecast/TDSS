import { useState } from 'react';
import { useLanguage } from '../../../context/LanguageContext';
import OrgWorkspaceLayout from '../../../layouts/OrgWorkspaceLayout';
import { Button, Card, Field, Input, PageHeader, Select } from '../../../components/ui';

interface DropPointDraft {
  id: number;
  address: string;
  weightKg: string;
}

let nextId = 1;

export default function RouteOptimizationPage() {
  const { t } = useLanguage();
  const [dropPoints, setDropPoints] = useState<DropPointDraft[]>([
    { id: nextId++, address: '', weightKg: '' },
    { id: nextId++, address: '', weightKg: '' },
  ]);
  const [showResultNote, setShowResultNote] = useState(false);

  const addDropPoint = () => setDropPoints((pts) => [...pts, { id: nextId++, address: '', weightKg: '' }]);
  const removeDropPoint = (id: number) => setDropPoints((pts) => pts.filter((p) => p.id !== id));
  const updateDropPoint = (id: number, patch: Partial<DropPointDraft>) =>
    setDropPoints((pts) => pts.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  return (
    <OrgWorkspaceLayout title={t('nav.route-optimization')}>
      <PageHeader
        title="เพิ่มประสิทธิภาพเส้นทางหลายจุดส่ง (Route Optimization / VRP)"
        subtitle="ออกแบบหน้าตาไว้สำหรับต่อยอดในอนาคต — ยังไม่เปิดใช้งานจริง"
      />

      <div
        style={{
          background: '#fffbeb',
          border: '1px solid #fde68a',
          color: '#92400e',
          borderRadius: 10,
          padding: '14px 16px',
          fontSize: 12.5,
          lineHeight: 1.7,
          marginBottom: 20,
        }}
      >
        <strong>หน้านี้ยังไม่เปิดใช้งานจริง (UI Preview เท่านั้น)</strong>
        <br />
        การหาลำดับเส้นทางที่เหมาะสมที่สุดสำหรับยานพาหนะหลายคันและจุดส่งหลายจุดพร้อมกัน (Vehicle Routing Problem — VRP) เป็นปัญหาการหาค่าเหมาะที่สุดแบบ
        NP-hard ต้องใช้อัลกอริทึมเฉพาะทาง (เช่น Google OR-Tools, Genetic Algorithm) และ/หรือ Google Maps Routes API แบบ waypoint
        optimization ซึ่งมีค่าใช้จ่ายต่อการเรียกใช้งาน (billing) — ขอบเขตของงานวิจัยนี้จึงจำกัดไว้ที่การวิเคราะห์ผลกระทบของ{' '}
        <em>จำนวนจุดส่ง</em> ต่อต้นทุนและเวลาโดยประมาณเท่านั้น (ดูได้ที่ Planning Wizard ขั้นตอน "ความต้องการสินค้า")
        หน้านี้แสดงไว้เพื่ออธิบายแนวคิดที่ออกแบบไว้สำหรับงานในอนาคต
      </div>

      <Card style={{ maxWidth: 720 }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>จุดส่งสินค้า</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
          {dropPoints.map((p, i) => (
            <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '1fr 140px 80px', gap: 10, alignItems: 'end' }}>
              <Field label={`จุดที่ ${i + 1} — ที่อยู่`}>
                <Input value={p.address} onChange={(e) => updateDropPoint(p.id, { address: e.target.value })} placeholder="เช่น 123 ถ.สุขุมวิท..." />
              </Field>
              <Field label="น้ำหนัก (กก.)">
                <Input type="number" value={p.weightKg} onChange={(e) => updateDropPoint(p.id, { weightKg: e.target.value })} />
              </Field>
              <Button variant="danger" size="sm" onClick={() => removeDropPoint(p.id)} disabled={dropPoints.length <= 1}>
                ลบ
              </Button>
            </div>
          ))}
        </div>
        <Button variant="secondary" size="sm" onClick={addDropPoint}>
          + เพิ่มจุดส่ง
        </Button>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 22 }}>
          <Field label="จำนวนยานพาหนะที่ใช้ได้">
            <Input type="number" defaultValue={1} min={1} />
          </Field>
          <Field label="วิธีเพิ่มประสิทธิภาพ (ตัวอย่าง)">
            <Select defaultValue="nearest">
              <option value="nearest">ระยะทางใกล้ที่สุดก่อน (Nearest Neighbor)</option>
              <option value="ortools">Google OR-Tools (แผน)</option>
              <option value="genetic">Genetic Algorithm (แผน)</option>
            </Select>
          </Field>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 22 }}>
          <Button onClick={() => setShowResultNote(true)}>คำนวณเส้นทางที่เหมาะสมที่สุด →</Button>
        </div>

        {showResultNote && (
          <div style={{ marginTop: 16, background: '#f6f7f8', borderRadius: 8, padding: '12px 14px', fontSize: 12.5, color: 'var(--c-text-muted)' }}>
            ฟีเจอร์นี้ยังไม่เปิดใช้งานจริง — เป็นเพียงตัวอย่างหน้าตาที่ออกแบบไว้เพื่ออธิบายแนวคิดในเอกสารงานวิจัย
          </div>
        )}
      </Card>
    </OrgWorkspaceLayout>
  );
}
