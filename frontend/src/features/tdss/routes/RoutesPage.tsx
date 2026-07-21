import { useEffect, useState } from 'react';
import OrgWorkspaceLayout from '../../../layouts/OrgWorkspaceLayout';
import { Button, Card, Dialog, EmptyState, Field, Input, LoadingState, PageHeader, Select, StatusBadge, Table, Td, TextArea, Th } from '../../../components/ui';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import { organizationsApi, routesApi, type Route } from '../../../api';
import GoogleMapsRoutePicker, { type RouteComputationResult } from './GoogleMapsRoutePicker';
import { isGoogleMapsConfigured } from './googleMapsClient';

const GOOGLE_MAPS_AVAILABLE = isGoogleMapsConfigured();

const EMPTY_FORM = {
  route_code: '',
  route_name: '',
  origin: '',
  destination: '',
  distance_km: '',
  estimated_duration_minutes: '',
  toll_cost: '0',
  route_risk_level: 'low',
  road_restrictions: '',
};

export default function RoutesPage() {
  const { currentOrgId, user } = useAuth();
  const { showSuccess, showError } = useToast();
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Route | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [defaultMode, setDefaultMode] = useState('manual');
  const [formMode, setFormMode] = useState('manual');

  const membership = user?.memberships.find((m) => m.organization_id === currentOrgId);
  const canWrite = user?.is_system_owner || membership?.role === 'org_admin' || membership?.role === 'planner';

  const load = async () => {
    if (!currentOrgId) return;
    setLoading(true);
    try {
      const [list, settings] = await Promise.all([
        routesApi.list(currentOrgId, { search: search || undefined }),
        organizationsApi.getSettings(currentOrgId).catch(() => null),
      ]);
      setRoutes(list);
      if (settings) setDefaultMode(settings.default_route_mode);
    } catch {
      showError('โหลดข้อมูลเส้นทางไม่สำเร็จ');
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
    setFormMode(defaultMode);
    setShowForm(true);
  };

  const openEdit = (r: Route) => {
    setEditing(r);
    setForm({
      route_code: r.route_code,
      route_name: r.route_name,
      origin: r.origin,
      destination: r.destination,
      distance_km: String(r.distance_km),
      estimated_duration_minutes: String(r.estimated_duration_minutes),
      toll_cost: String(r.toll_cost),
      route_risk_level: r.route_risk_level,
      road_restrictions: r.road_restrictions ?? '',
    });
    setFormMode(r.mode);
    setShowForm(true);
  };

  const applyRouteComputation = (result: RouteComputationResult) => {
    setForm((prev) => ({
      ...prev,
      origin: result.origin,
      destination: result.destination,
      distance_km: String(result.distance_km),
      estimated_duration_minutes: String(result.estimated_duration_minutes),
    }));
  };

  const submit = async () => {
    if (!currentOrgId) return;
    if (!form.route_code || !form.route_name || !form.origin || !form.destination || !form.distance_km || !form.estimated_duration_minutes) {
      showError('กรุณากรอกข้อมูลที่จำเป็นให้ครบ (มีเครื่องหมาย *)');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        route_code: form.route_code,
        route_name: form.route_name,
        origin: form.origin,
        destination: form.destination,
        distance_km: Number(form.distance_km),
        estimated_duration_minutes: Number(form.estimated_duration_minutes),
        toll_cost: Number(form.toll_cost || 0),
        route_risk_level: form.route_risk_level,
        road_restrictions: form.road_restrictions || undefined,
        mode: formMode,
      };
      if (editing) {
        await routesApi.update(currentOrgId, editing.id, payload);
        showSuccess('แก้ไขเส้นทางสำเร็จ');
      } else {
        await routesApi.create(currentOrgId, payload);
        showSuccess('เพิ่มเส้นทางสำเร็จ');
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

  const toggleStatus = async (r: Route) => {
    if (!currentOrgId) return;
    try {
      if (r.status === 'active') await routesApi.deactivate(currentOrgId, r.id);
      else await routesApi.activate(currentOrgId, r.id);
      showSuccess('อัปเดตสถานะแล้ว');
      await load();
    } catch {
      showError('อัปเดตสถานะไม่สำเร็จ');
    }
  };

  return (
    <OrgWorkspaceLayout title="เส้นทาง">
      <PageHeader
        title="เส้นทาง"
        subtitle={GOOGLE_MAPS_AVAILABLE ? 'จัดการเส้นทางขนส่ง (เชื่อมต่อ Google Maps แล้ว)' : 'จัดการเส้นทางขนส่ง (โหมด Manual — ยังไม่ได้เชื่อมต่อ Google Maps API)'}
        actions={
          <>
            <Input placeholder="ค้นหา..." value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} style={{ width: 200 }} />
            {canWrite && <Button onClick={openCreate}>+ เพิ่มเส้นทาง</Button>}
          </>
        }
      />

      {!GOOGLE_MAPS_AVAILABLE && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', borderRadius: 10, padding: '10px 14px', fontSize: 12.5, marginBottom: 16 }}>
          ยังไม่ได้ตั้งค่า Google Maps API Key — ระบบทำงานในโหมด Manual Route เต็มรูปแบบ (กรอกระยะทาง/เวลาด้วยตนเอง)
        </div>
      )}

      {loading ? (
        <LoadingState card />
      ) : routes.length === 0 ? (
        <EmptyState message="ยังไม่มีข้อมูลเส้นทาง" action={canWrite && <Button onClick={openCreate}>+ เพิ่มเส้นทางแรก</Button>} />
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <Table>
            <thead>
              <tr>
                <Th>รหัส</Th>
                <Th>ชื่อเส้นทาง</Th>
                <Th>ต้นทาง → ปลายทาง</Th>
                <Th align="right">ระยะทาง</Th>
                <Th align="right">เวลาโดยประมาณ</Th>
                <Th align="center">ความเสี่ยง</Th>
                <Th align="center">สถานะ</Th>
                {canWrite && <Th align="center"></Th>}
              </tr>
            </thead>
            <tbody>
              {routes.map((r) => (
                <tr key={r.id}>
                  <Td>{r.route_code}</Td>
                  <Td>{r.route_name}</Td>
                  <Td>
                    {r.origin} → {r.destination}
                  </Td>
                  <Td align="right">{r.distance_km.toLocaleString()} กม.</Td>
                  <Td align="right">{r.estimated_duration_minutes.toLocaleString()} นาที</Td>
                  <Td align="center">
                    <StatusBadge status={r.route_risk_level} />
                  </Td>
                  <Td align="center">
                    <StatusBadge status={r.status} />
                  </Td>
                  {canWrite && (
                    <Td align="center">
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                        <Button size="sm" variant="secondary" onClick={() => openEdit(r)}>
                          แก้ไข
                        </Button>
                        <Button size="sm" variant={r.status === 'active' ? 'danger' : 'secondary'} onClick={() => toggleStatus(r)}>
                          {r.status === 'active' ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
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
        <Dialog title={editing ? 'แก้ไขเส้นทาง' : 'เพิ่มเส้นทาง'} onClose={() => setShowForm(false)} width={formMode === 'google_maps' ? 640 : undefined}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: formMode === 'google_maps' ? 14 : 0 }}>
            <Field label="รหัสเส้นทาง" required>
              <Input value={form.route_code} onChange={(e) => setForm({ ...form, route_code: e.target.value })} />
            </Field>
            <Field label="ชื่อเส้นทาง" required>
              <Input value={form.route_name} onChange={(e) => setForm({ ...form, route_name: e.target.value })} />
            </Field>
          </div>

          {GOOGLE_MAPS_AVAILABLE && !editing && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <Button size="sm" variant={formMode === 'manual' ? 'primary' : 'secondary'} onClick={() => setFormMode('manual')}>
                กรอกเอง (Manual)
              </Button>
              <Button size="sm" variant={formMode === 'google_maps' ? 'primary' : 'secondary'} onClick={() => setFormMode('google_maps')}>
                ค้นหาจาก Google Maps
              </Button>
            </div>
          )}

          {formMode === 'google_maps' ? (
            <div style={{ marginBottom: 14 }}>
              <GoogleMapsRoutePicker initialOrigin={form.origin} initialDestination={form.destination} onResult={applyRouteComputation} />
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <Field label="ต้นทาง" required>
                <Input value={form.origin} onChange={(e) => setForm({ ...form, origin: e.target.value })} />
              </Field>
              <Field label="ปลายทาง" required>
                <Input value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} />
              </Field>
              <Field label="ระยะทาง (กม.)" required>
                <Input type="number" value={form.distance_km} onChange={(e) => setForm({ ...form, distance_km: e.target.value })} />
              </Field>
              <Field label="เวลาโดยประมาณ (นาที)" required>
                <Input type="number" value={form.estimated_duration_minutes} onChange={(e) => setForm({ ...form, estimated_duration_minutes: e.target.value })} />
              </Field>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label="ค่าทางด่วน (บาท)">
              <Input type="number" value={form.toll_cost} onChange={(e) => setForm({ ...form, toll_cost: e.target.value })} />
            </Field>
            <Field label="ระดับความเสี่ยง">
              <Select value={form.route_risk_level} onChange={(e) => setForm({ ...form, route_risk_level: e.target.value })}>
                <option value="low">ต่ำ</option>
                <option value="medium">ปานกลาง</option>
                <option value="high">สูง</option>
              </Select>
            </Field>
            <div style={{ gridColumn: '1 / -1' }}>
              <Field label="ข้อจำกัดของเส้นทาง">
                <TextArea value={form.road_restrictions} onChange={(e) => setForm({ ...form, road_restrictions: e.target.value })} placeholder="เช่น ห้ามรถบรรทุกเกิน 10 ล้อ ช่วงเวลาเร่งด่วน" />
              </Field>
            </div>
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
