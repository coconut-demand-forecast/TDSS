import { useEffect, useState, type ReactNode } from 'react';
import { useLanguage } from '../../../context/LanguageContext';
import OrgWorkspaceLayout from '../../../layouts/OrgWorkspaceLayout';
import { Button, Card, Dialog, EmptyState, Field, Input, LoadingState, PageHeader, Select, StatusBadge, Table, Td, Th } from '../../../components/ui';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import { vehiclesApi, type Vehicle } from '../../../api';
import { FUEL_SPECS, FUEL_TYPE_OPTIONS } from './fuelReference';
import { CUSTOM_VEHICLE_TYPE, DEFAULT_FUEL_COST_PER_UNIT, VEHICLE_TYPE_PRESETS } from './vehicleTypePresets';

const EMPTY_FORM = {
  vehicle_code: '',
  registration_number: '',
  vehicle_type_choice: '',
  vehicle_type: '',
  capacity_weight_kg: '',
  capacity_volume_m3: '',
  fuel_type: '',
  fuel_consumption_km_per_liter: '',
  fuel_cost_per_unit: '',
  fixed_cost: '0',
};

// Estimated cost/km for the list view — fuel_cost_per_unit / consumption
// when fuel data is present (matches the fuel-based formula scoring uses),
// otherwise the vehicle's legacy flat rate. Display only.
function estimatedCostPerKm(v: Vehicle): number {
  if (v.fuel_type && v.fuel_consumption_km_per_liter && v.fuel_cost_per_unit) {
    return v.fuel_cost_per_unit / v.fuel_consumption_km_per_liter;
  }
  return v.cost_per_km;
}

export default function VehiclesPage() {
  const { t } = useLanguage();
  const { currentOrgId, user } = useAuth();
  const { showSuccess, showError } = useToast();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Vehicle | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const membership = user?.memberships.find((m) => m.organization_id === currentOrgId);
  const canWrite = user?.is_system_owner || membership?.role === 'org_admin' || membership?.role === 'planner';
  const selectedFuelSpec = form.fuel_type ? FUEL_SPECS[form.fuel_type] : undefined;

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
    const matchedPreset = VEHICLE_TYPE_PRESETS.find((p) => p.labelTh === v.vehicle_type);
    setForm({
      vehicle_code: v.vehicle_code,
      registration_number: v.registration_number,
      vehicle_type_choice: matchedPreset ? matchedPreset.key : CUSTOM_VEHICLE_TYPE,
      vehicle_type: v.vehicle_type,
      capacity_weight_kg: String(v.capacity_weight_kg),
      capacity_volume_m3: String(v.capacity_volume_m3),
      fuel_type: v.fuel_type ?? '',
      fuel_consumption_km_per_liter: v.fuel_consumption_km_per_liter != null ? String(v.fuel_consumption_km_per_liter) : '',
      fuel_cost_per_unit: v.fuel_cost_per_unit != null ? String(v.fuel_cost_per_unit) : '',
      fixed_cost: String(v.fixed_cost),
    });
    setShowForm(true);
  };

  const onVehicleTypeChoiceChange = (choice: string) => {
    if (choice === CUSTOM_VEHICLE_TYPE) {
      setForm({ ...form, vehicle_type_choice: choice, vehicle_type: '' });
      return;
    }
    const preset = VEHICLE_TYPE_PRESETS.find((p) => p.key === choice);
    if (!preset) {
      setForm({ ...form, vehicle_type_choice: choice, vehicle_type: '' });
      return;
    }
    setForm({
      ...form,
      vehicle_type_choice: choice,
      vehicle_type: preset.labelTh,
      capacity_weight_kg: String(preset.capacityWeightKg),
      capacity_volume_m3: String(preset.capacityVolumeM3),
      fuel_consumption_km_per_liter: String(preset.fuelConsumptionKmPerLiter),
    });
  };

  const onFuelTypeChange = (fuelType: string) => {
    const defaultPrice = DEFAULT_FUEL_COST_PER_UNIT[fuelType];
    setForm({
      ...form,
      fuel_type: fuelType,
      fuel_cost_per_unit: fuelType && defaultPrice != null ? String(defaultPrice) : form.fuel_cost_per_unit,
    });
  };

  const submit = async () => {
    if (!currentOrgId) return;
    if (!form.vehicle_code || !form.registration_number || !form.vehicle_type || !form.capacity_weight_kg || !form.capacity_volume_m3) {
      showError('กรุณากรอกข้อมูลที่จำเป็นให้ครบ (มีเครื่องหมาย *)');
      return;
    }
    if (!form.fuel_type || !form.fuel_consumption_km_per_liter || !form.fuel_cost_per_unit) {
      showError('กรุณาเลือกประเภทเชื้อเพลิง และกรอกอัตราสิ้นเปลืองกับราคาเชื้อเพลิงให้ครบ');
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
        fuel_type: form.fuel_type,
        fuel_consumption_km_per_liter: Number(form.fuel_consumption_km_per_liter),
        fuel_cost_per_unit: Number(form.fuel_cost_per_unit),
        fixed_cost: Number(form.fixed_cost || 0),
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

  const confirmDelete = async () => {
    if (!currentOrgId || !deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await vehiclesApi.remove(currentOrgId, deleteTarget.id);
      showSuccess('ลบยานพาหนะแล้ว');
      setDeleteTarget(null);
      await load();
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setDeleteError(typeof detail === 'string' ? detail : 'ลบไม่สำเร็จ');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <OrgWorkspaceLayout title={t('nav.vehicles')}>
      <PageHeader
        title={t('nav.vehicles')}
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
                <Th align="right">ต้นทุน/กม. (ประมาณการ)</Th>
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
                  <Td align="right">฿{estimatedCostPerKm(v).toLocaleString(undefined, { maximumFractionDigits: 2 })}</Td>
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
                        <Button size="sm" variant="danger" onClick={() => { setDeleteTarget(v); setDeleteError(null); }}>
                          ลบ
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
        <Dialog title={editing ? 'แก้ไขยานพาหนะ' : 'เพิ่มยานพาหนะ'} onClose={() => setShowForm(false)} width={720}>
          <div style={{ display: 'grid', gap: 22 }}>
            <FormSection title="ข้อมูลรถ">
              <Field label="รหัสยานพาหนะ" required>
                <Input value={form.vehicle_code} onChange={(e) => setForm({ ...form, vehicle_code: e.target.value })} />
              </Field>
              <Field label="ทะเบียนรถ" required>
                <Input value={form.registration_number} onChange={(e) => setForm({ ...form, registration_number: e.target.value })} />
              </Field>
              <Field label="ประเภทยานพาหนะ" required>
                <Select value={form.vehicle_type_choice} onChange={(e) => onVehicleTypeChoiceChange(e.target.value)}>
                  <option value="">-- เลือกประเภทยานพาหนะ --</option>
                  {VEHICLE_TYPE_PRESETS.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.labelTh}
                    </option>
                  ))}
                  <option value={CUSTOM_VEHICLE_TYPE}>อื่นๆ (ระบุเอง)</option>
                </Select>
              </Field>
              {form.vehicle_type_choice === CUSTOM_VEHICLE_TYPE && (
                <Field label="ระบุประเภทยานพาหนะ" required>
                  <Input value={form.vehicle_type} onChange={(e) => setForm({ ...form, vehicle_type: e.target.value })} placeholder="เช่น รถหัวลาก" />
                </Field>
              )}
            </FormSection>

            <FormSection title="ความสามารถในการบรรทุก">
              <Field label="ความจุน้ำหนัก (กก.)" required>
                <Input type="number" value={form.capacity_weight_kg} onChange={(e) => setForm({ ...form, capacity_weight_kg: e.target.value })} />
              </Field>
              <Field label="ความจุปริมาตร (ลบ.ม.)" required>
                <Input type="number" value={form.capacity_volume_m3} onChange={(e) => setForm({ ...form, capacity_volume_m3: e.target.value })} />
              </Field>
            </FormSection>

            <FormSection title="ข้อมูลต้นทุนและเชื้อเพลิง">
              <Field label="ประเภทเชื้อเพลิง" required>
                <Select value={form.fuel_type} onChange={(e) => onFuelTypeChange(e.target.value)}>
                  <option value="">-- เลือกประเภทเชื้อเพลิง --</option>
                  {FUEL_TYPE_OPTIONS.map((f) => (
                    <option key={f.key} value={f.key}>
                      {f.labelTh}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={`อัตราสิ้นเปลือง (กม./${selectedFuelSpec?.unitLabel ?? 'หน่วย'})`} required>
                <Input type="number" value={form.fuel_consumption_km_per_liter} onChange={(e) => setForm({ ...form, fuel_consumption_km_per_liter: e.target.value })} />
              </Field>
              <Field label={`ราคาเชื้อเพลิง (บาท/${selectedFuelSpec?.unitLabel ?? 'หน่วย'})`} required>
                <Input type="number" value={form.fuel_cost_per_unit} onChange={(e) => setForm({ ...form, fuel_cost_per_unit: e.target.value })} />
              </Field>
              <Field label="ค่าสัมประสิทธิ์การปล่อย CO2">
                <Input
                  readOnly
                  value={selectedFuelSpec ? `${selectedFuelSpec.kgCo2PerUnit} kgCO2 / ${selectedFuelSpec.unitLabel}` : '— เลือกประเภทเชื้อเพลิงก่อน —'}
                  style={{ background: '#f6f7f8', color: 'var(--c-text-muted)', cursor: 'not-allowed' }}
                />
              </Field>
              <Field label="ต้นทุนคงที่ (บาท)">
                <Input type="number" value={form.fixed_cost} onChange={(e) => setForm({ ...form, fixed_cost: e.target.value })} />
              </Field>
            </FormSection>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22 }}>
            <Button variant="secondary" onClick={() => setShowForm(false)}>
              ยกเลิก
            </Button>
            <Button onClick={submit} loading={saving}>
              บันทึก
            </Button>
          </div>
        </Dialog>
      )}

      {deleteTarget && (
        <Dialog title="ยืนยันการลบยานพาหนะ" onClose={() => setDeleteTarget(null)}>
          <div style={{ fontSize: 13, marginBottom: 14 }}>
            ต้องการลบยานพาหนะ <strong>{deleteTarget.vehicle_code}</strong> ใช่หรือไม่? การลบไม่สามารถย้อนกลับได้
          </div>
          {deleteError && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: 8, padding: '10px 12px', fontSize: 12.5, marginBottom: 14 }}>
              {deleteError}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
              ยกเลิก
            </Button>
            <Button variant="danger" onClick={confirmDelete} loading={deleting}>
              ยืนยันการลบ
            </Button>
          </div>
        </Dialog>
      )}
    </OrgWorkspaceLayout>
  );
}

function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--c-text)', marginBottom: 12, paddingBottom: 6, borderBottom: '1px solid var(--c-border)' }}>{title}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>{children}</div>
    </div>
  );
}
