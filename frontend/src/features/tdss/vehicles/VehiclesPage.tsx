import { useEffect, useState } from 'react';
import OrgWorkspaceLayout from '../../../layouts/OrgWorkspaceLayout';
import { Button, Card, Dialog, EmptyState, Field, Input, LoadingState, PageHeader, StatusBadge, Table, Td, Th } from '../../../components/ui';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import { vehiclesApi, type Vehicle } from '../../../api';

const EMPTY_FORM = {
  vehicle_code: '',
  registration_number: '',
  vehicle_type: '',
  capacity_weight_kg: '',
  capacity_volume_m3: '',
  fuel_type: '',
  fuel_consumption_km_per_liter: '',
  cost_per_km: '',
  fixed_cost: '0',
  co2_factor: '',
};

export default function VehiclesPage() {
  const { currentOrgId, user } = useAuth();
  const { showSuccess, showError } = useToast();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const membership = user?.memberships.find((m) => m.organization_id === currentOrgId);
  const canWrite = user?.is_system_owner || membership?.role === 'org_admin' || membership?.role === 'planner';

  const load = async () => {
    if (!currentOrgId) return;
    setLoading(true);
    try {
      setVehicles(await vehiclesApi.list(currentOrgId, { search: search || undefined }));
    } catch {
      showError('โหลดข้อมูลยานพาหนะไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrgId]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const openEdit = (v: Vehicle) => {
    setEditing(v);
    setForm({
      vehicle_code: v.vehicle_code,
      registration_number: v.registration_number,
      vehicle_type: v.vehicle_type,
      capacity_weight_kg: String(v.capacity_weight_kg),
      capacity_volume_m3: String(v.capacity_volume_m3),
      fuel_type: v.fuel_type ?? '',
      fuel_consumption_km_per_liter: v.fuel_consumption_km_per_liter != null ? String(v.fuel_consumption_km_per_liter) : '',
      cost_per_km: String(v.cost_per_km),
      fixed_cost: String(v.fixed_cost),
      co2_factor: String(v.co2_factor),
    });
    setShowForm(true);
  };

  const submit = async () => {
    if (!currentOrgId) return;
    if (!form.vehicle_code || !form.registration_number || !form.vehicle_type || !form.capacity_weight_kg || !form.capacity_volume_m3 || !form.cost_per_km || !form.co2_factor) {
      showError('กรุณากรอกข้อมูลที่จำเป็นให้ครบ (มีเครื่องหมาย *)');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        vehicle_code: form.vehicle_code,
        registration_number: form.registration_number,
        vehicle_type: form.vehicle_type,
        capacity_weight_kg: Number(form.capacity_weight_kg),
        capacity_volume_m3: Number(form.capacity_volume_m3),
        fuel_type: form.fuel_type || undefined,
        fuel_consumption_km_per_liter: form.fuel_consumption_km_per_liter ? Number(form.fuel_consumption_km_per_liter) : undefined,
        cost_per_km: Number(form.cost_per_km),
        fixed_cost: Number(form.fixed_cost || 0),
        co2_factor: Number(form.co2_factor),
      };
      if (editing) {
        await vehiclesApi.update(currentOrgId, editing.id, payload);
        showSuccess('แก้ไขยานพาหนะสำเร็จ');
      } else {
        await vehiclesApi.create(currentOrgId, payload);
        showSuccess('เพิ่มยานพาหนะสำเร็จ');
      }
      setShowForm(false);
      await load();
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      showError(typeof detail === 'string' ? detail : 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (v: Vehicle) => {
    if (!currentOrgId) return;
    try {
      if (v.status === 'active') await vehiclesApi.deactivate(currentOrgId, v.id);
      else await vehiclesApi.activate(currentOrgId, v.id);
      showSuccess('อัปเดตสถานะแล้ว');
      await load();
    } catch {
      showError('อัปเดตสถานะไม่สำเร็จ');
    }
  };

  return (
    <OrgWorkspaceLayout title="ยานพาหนะ">
      <PageHeader
        title="ยานพาหนะ"
        subtitle="จัดการข้อมูลยานพาหนะและความจุสำหรับใช้ในการวางแผน"
        actions={
          <>
            <Input placeholder="ค้นหา..." value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} style={{ width: 200 }} />
            {canWrite && <Button onClick={openCreate}>+ เพิ่มยานพาหนะ</Button>}
          </>
        }
      />

      {loading ? (
        <LoadingState card />
      ) : vehicles.length === 0 ? (
        <EmptyState message="ยังไม่มีข้อมูลยานพาหนะ" action={canWrite && <Button onClick={openCreate}>+ เพิ่มยานพาหนะแรก</Button>} />
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <Table>
            <thead>
              <tr>
                <Th>รหัส</Th>
                <Th>ทะเบียน</Th>
                <Th>ประเภท</Th>
                <Th align="right">ความจุน้ำหนัก</Th>
                <Th align="right">ความจุปริมาตร</Th>
                <Th align="right">ต้นทุน/กม.</Th>
                <Th align="center">สถานะ</Th>
                {canWrite && <Th align="center"></Th>}
              </tr>
            </thead>
            <tbody>
              {vehicles.map((v) => (
                <tr key={v.id}>
                  <Td>{v.vehicle_code}</Td>
                  <Td>{v.registration_number}</Td>
                  <Td>{v.vehicle_type}</Td>
                  <Td align="right">{v.capacity_weight_kg.toLocaleString()} กก.</Td>
                  <Td align="right">{v.capacity_volume_m3.toLocaleString()} ลบ.ม.</Td>
                  <Td align="right">฿{v.cost_per_km.toLocaleString()}</Td>
                  <Td align="center">
                    <StatusBadge status={v.status} />
                  </Td>
                  {canWrite && (
                    <Td align="center">
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                        <Button size="sm" variant="secondary" onClick={() => openEdit(v)}>
                          แก้ไข
                        </Button>
                        <Button size="sm" variant={v.status === 'active' ? 'danger' : 'secondary'} onClick={() => toggleStatus(v)}>
                          {v.status === 'active' ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                        </Button>
                      </div>
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      {showForm && (
        <Dialog title={editing ? 'แก้ไขยานพาหนะ' : 'เพิ่มยานพาหนะ'} onClose={() => setShowForm(false)}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label="รหัสยานพาหนะ" required>
              <Input value={form.vehicle_code} onChange={(e) => setForm({ ...form, vehicle_code: e.target.value })} />
            </Field>
            <Field label="ทะเบียนรถ" required>
              <Input value={form.registration_number} onChange={(e) => setForm({ ...form, registration_number: e.target.value })} />
            </Field>
            <Field label="ประเภทยานพาหนะ" required>
              <Input value={form.vehicle_type} onChange={(e) => setForm({ ...form, vehicle_type: e.target.value })} placeholder="เช่น รถบรรทุก 6 ล้อ" />
            </Field>
            <Field label="ประเภทเชื้อเพลิง">
              <Input value={form.fuel_type} onChange={(e) => setForm({ ...form, fuel_type: e.target.value })} />
            </Field>
            <Field label="ความจุน้ำหนัก (กก.)" required>
              <Input type="number" value={form.capacity_weight_kg} onChange={(e) => setForm({ ...form, capacity_weight_kg: e.target.value })} />
            </Field>
            <Field label="ความจุปริมาตร (ลบ.ม.)" required>
              <Input type="number" value={form.capacity_volume_m3} onChange={(e) => setForm({ ...form, capacity_volume_m3: e.target.value })} />
            </Field>
            <Field label="อัตราสิ้นเปลือง (กม./ลิตร)">
              <Input type="number" value={form.fuel_consumption_km_per_liter} onChange={(e) => setForm({ ...form, fuel_consumption_km_per_liter: e.target.value })} />
            </Field>
            <Field label="ต้นทุนต่อกิโลเมตร (บาท)" required>
              <Input type="number" value={form.cost_per_km} onChange={(e) => setForm({ ...form, cost_per_km: e.target.value })} />
            </Field>
            <Field label="ต้นทุนคงที่ (บาท)">
              <Input type="number" value={form.fixed_cost} onChange={(e) => setForm({ ...form, fixed_cost: e.target.value })} />
            </Field>
            <Field label="ค่าสัมประสิทธิ์ CO2 (กก./กม.)" required>
              <Input type="number" value={form.co2_factor} onChange={(e) => setForm({ ...form, co2_factor: e.target.value })} />
            </Field>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
            <Button variant="secondary" onClick={() => setShowForm(false)}>
              ยกเลิก
            </Button>
            <Button onClick={submit} loading={saving}>
              บันทึก
            </Button>
          </div>
        </Dialog>
      )}
    </OrgWorkspaceLayout>
  );
}
