import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import OrgWorkspaceLayout from '../../../layouts/OrgWorkspaceLayout';
import { Button, Card, Field, Input, LoadingState, StatusBadge, Table, Td, Th, TextArea } from '../../../components/ui';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import {
  jobItemsApi,
  jobsApi,
  organizationsApi,
  planningApi,
  productsApi,
  profilesApi,
  routesApi,
  vehiclesApi,
  type DecisionProfile,
  type Product,
  type Route,
  type TransportJob,
  type TransportJobItem,
  type Vehicle,
} from '../../../api';
import { CRITERIA_LABELS } from '../decisionProfiles/ahpClient';

const STEPS = ['ความต้องการสินค้า', 'รายการสินค้า', 'เลือกเส้นทาง', 'เลือกยานพาหนะ', 'โปรไฟล์การตัดสินใจ', 'ตรวจสอบและยืนยัน'];

interface DraftState {
  origin: string;
  destination: string;
  shipment_weight_kg: string;
  shipment_volume_m3: string;
  required_delivery_datetime: string;
  special_requirements: string;
  number_of_stops: string;
  routeIds: number[];
  vehicleIds: number[];
  profileId: number | null;
}

export default function PlanningWizardPage() {
  const { jobId } = useParams();
  const { currentOrgId } = useAuth();
  const { showSuccess, showError } = useToast();
  const navigate = useNavigate();

  const draftKey = `tdss_wizard_draft_${jobId}`;
  const [job, setJob] = useState<TransportJob | null>(null);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [profiles, setProfiles] = useState<DecisionProfile[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [items, setItems] = useState<TransportJobItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [draft, setDraft] = useState<DraftState>({
    origin: '',
    destination: '',
    shipment_weight_kg: '',
    shipment_volume_m3: '',
    required_delivery_datetime: '',
    special_requirements: '',
    number_of_stops: '1',
    routeIds: [],
    vehicleIds: [],
    profileId: null,
  });

  // Product Items step (add/search) state — not persisted to localStorage,
  // items live server-side as soon as they're added (see jobItemsApi).
  const [productSearch, setProductSearch] = useState('');
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [quantityInput, setQuantityInput] = useState('');
  const [addingItem, setAddingItem] = useState(false);

  const reloadJobAndItems = async (orgId: number, id: number) => {
    const [freshJob, freshItems] = await Promise.all([jobsApi.get(orgId, id), jobItemsApi.list(orgId, id)]);
    setJob(freshJob);
    setItems(freshItems);
    setDraft((d) => ({
      ...d,
      shipment_weight_kg: freshJob.shipment_weight_kg ? String(freshJob.shipment_weight_kg) : '',
      shipment_volume_m3: freshJob.shipment_volume_m3 ? String(freshJob.shipment_volume_m3) : '',
    }));
    return freshJob;
  };

  useEffect(() => {
    if (!currentOrgId || !jobId) return;
    (async () => {
      setLoading(true);
      try {
        const [j, r, v, p, prod, jobItems, orgSettings] = await Promise.all([
          jobsApi.get(currentOrgId, Number(jobId)),
          routesApi.list(currentOrgId, { status: 'active' }),
          vehiclesApi.list(currentOrgId, { status: 'active' }),
          profilesApi.list(currentOrgId),
          productsApi.list(currentOrgId, { status: 'active' }),
          jobItemsApi.list(currentOrgId, Number(jobId)),
          organizationsApi.getSettings(currentOrgId).catch(() => null),
        ]);
        setJob(j);
        setRoutes(r);
        setVehicles(v);
        setProducts(prod);
        setItems(jobItems);
        const activeProfiles = p.filter((pr) => pr.status === 'active');
        setProfiles(activeProfiles);

        const stored = localStorage.getItem(draftKey);
        if (stored) {
          setDraft(JSON.parse(stored));
        } else {
          // Pre-select the organization's default decision profile (Org
          // Settings) when it's still active — saves a click for the
          // common case of "always use our standard profile".
          const defaultProfileId = orgSettings?.default_decision_profile_id;
          const defaultStillActive = defaultProfileId != null && activeProfiles.some((pr) => pr.id === defaultProfileId);
          setDraft((d) => ({
            ...d,
            origin: j.origin || '',
            destination: j.destination || '',
            shipment_weight_kg: j.shipment_weight_kg ? String(j.shipment_weight_kg) : '',
            shipment_volume_m3: j.shipment_volume_m3 ? String(j.shipment_volume_m3) : '',
            required_delivery_datetime: j.required_delivery_datetime ? j.required_delivery_datetime.slice(0, 16) : '',
            special_requirements: j.special_requirements || '',
            number_of_stops: String(j.number_of_stops || 1),
            profileId: defaultStillActive ? defaultProfileId! : d.profileId,
          }));
        }
      } catch {
        showError('โหลดข้อมูลไม่สำเร็จ');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrgId, jobId]);

  useEffect(() => {
    if (!loading) localStorage.setItem(draftKey, JSON.stringify(draft));
  }, [draft, loading, draftKey]);

  const eligibleVehicles = useMemo(() => {
    const w = Number(draft.shipment_weight_kg) || 0;
    const v = Number(draft.shipment_volume_m3) || 0;
    return vehicles.filter((veh) => veh.capacity_weight_kg >= w && veh.capacity_volume_m3 >= v);
  }, [vehicles, draft.shipment_weight_kg, draft.shipment_volume_m3]);

  const itemsSummary = useMemo(() => {
    const skuCount = new Set(items.map((i) => i.product_id)).size;
    const totalQuantity = items.reduce((sum, i) => sum + i.quantity, 0);
    const totalWeight = items.reduce((sum, i) => sum + i.total_weight_kg, 0);
    const totalVolume = items.reduce((sum, i) => sum + i.total_volume_m3, 0);
    return { skuCount, totalQuantity, totalWeight: Math.round(totalWeight * 1000) / 1000, totalVolume: Math.round(totalVolume * 1_000_000) / 1_000_000 };
  }, [items]);

  const filteredProducts = useMemo(() => {
    if (!productSearch) return [];
    const q = productSearch.toLowerCase();
    return products.filter((p) => p.sku.toLowerCase().includes(q) || p.product_name.toLowerCase().includes(q)).slice(0, 8);
  }, [productSearch, products]);

  const saveRequirements = async () => {
    if (!currentOrgId || !job) return false;
    if (!draft.origin || !draft.destination) {
      showError('กรุณากรอกต้นทางและปลายทาง');
      return false;
    }
    try {
      await jobsApi.update(currentOrgId, job.id, {
        origin: draft.origin,
        destination: draft.destination,
        required_delivery_datetime: draft.required_delivery_datetime ? new Date(draft.required_delivery_datetime).toISOString() : undefined,
        special_requirements: draft.special_requirements || undefined,
        number_of_stops: Number(draft.number_of_stops || 1),
      });
      return true;
    } catch {
      showError('บันทึกข้อมูลไม่สำเร็จ');
      return false;
    }
  };

  const saveManualWeightVolume = async () => {
    if (!currentOrgId || !job) return false;
    if (!(Number(draft.shipment_weight_kg) > 0) || !(Number(draft.shipment_volume_m3) > 0)) {
      showError('กรุณาเพิ่มรายการสินค้าอย่างน้อย 1 รายการ หรือกรอกน้ำหนักและปริมาตรรวมเอง');
      return false;
    }
    try {
      await jobsApi.update(currentOrgId, job.id, {
        shipment_weight_kg: Number(draft.shipment_weight_kg),
        shipment_volume_m3: Number(draft.shipment_volume_m3),
      });
      return true;
    } catch {
      showError('บันทึกข้อมูลไม่สำเร็จ');
      return false;
    }
  };

  const addItem = async () => {
    if (!currentOrgId || !job || !selectedProductId || !(Number(quantityInput) > 0)) {
      showError('กรุณาเลือกสินค้าและกรอกจำนวนให้ถูกต้อง');
      return;
    }
    setAddingItem(true);
    try {
      await jobItemsApi.add(currentOrgId, job.id, { product_id: selectedProductId, quantity: Number(quantityInput) });
      await reloadJobAndItems(currentOrgId, job.id);
      setProductSearch('');
      setSelectedProductId(null);
      setQuantityInput('');
      showSuccess('เพิ่มรายการสินค้าแล้ว');
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      showError(typeof detail === 'string' ? detail : 'เพิ่มรายการไม่สำเร็จ');
    } finally {
      setAddingItem(false);
    }
  };

  const removeItem = async (itemId: number) => {
    if (!currentOrgId || !job) return;
    try {
      await jobItemsApi.remove(currentOrgId, job.id, itemId);
      await reloadJobAndItems(currentOrgId, job.id);
      showSuccess('ลบรายการแล้ว');
    } catch {
      showError('ลบรายการไม่สำเร็จ');
    }
  };

  const next = async () => {
    if (step === 0) {
      const ok = await saveRequirements();
      if (!ok) return;
    }
    if (step === 1) {
      if (items.length === 0) {
        const ok = await saveManualWeightVolume();
        if (!ok) return;
      } else if (!(Number(draft.shipment_weight_kg) > 0) || !(Number(draft.shipment_volume_m3) > 0)) {
        showError('น้ำหนัก/ปริมาตรรวมยังไม่ถูกต้อง');
        return;
      }
    }
    if (step === 2 && draft.routeIds.length === 0) {
      showError('กรุณาเลือกอย่างน้อย 1 เส้นทาง');
      return;
    }
    if (step === 3 && draft.vehicleIds.length === 0) {
      showError('กรุณาเลือกอย่างน้อย 1 ยานพาหนะ');
      return;
    }
    if (step === 4 && !draft.profileId) {
      showError('กรุณาเลือกโปรไฟล์การตัดสินใจ');
      return;
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };

  const generate = async () => {
    if (!currentOrgId || !job || !draft.profileId) return;
    setGenerating(true);
    try {
      const run = await planningApi.recommend(currentOrgId, {
        job_id: job.id,
        route_ids: draft.routeIds,
        vehicle_ids: draft.vehicleIds,
        decision_profile_id: draft.profileId,
      });
      localStorage.removeItem(draftKey);
      showSuccess('สร้างคำแนะนำสำเร็จ');
      navigate(`/tdss/recommendations/${run.id}`);
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      showError(typeof detail === 'string' ? detail : 'สร้างคำแนะนำไม่สำเร็จ');
    } finally {
      setGenerating(false);
    }
  };

  const toggleId = (list: number[], id: number) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  if (loading) {
    return (
      <OrgWorkspaceLayout title="Planning Wizard">
        <LoadingState card />
      </OrgWorkspaceLayout>
    );
  }
  if (!job) {
    return (
      <OrgWorkspaceLayout title="Planning Wizard">
        <Card>ไม่พบงานขนส่งนี้</Card>
      </OrgWorkspaceLayout>
    );
  }

  const selectedProfile = profiles.find((p) => p.id === draft.profileId);

  return (
    <OrgWorkspaceLayout title={`Planning Wizard — ${job.job_number}`}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 28 }}>
        {STEPS.map((label, i) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : 'none' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 12.5,
                  fontWeight: 700,
                  background: i <= step ? 'var(--c-accent)' : '#f0f0f0',
                  color: i <= step ? '#fff' : '#9ca3af',
                }}
              >
                {i + 1}
              </div>
              <div style={{ fontSize: 11, color: i <= step ? 'var(--c-text)' : '#9ca3af', fontWeight: 600, whiteSpace: 'nowrap' }}>{label}</div>
            </div>
            {i < STEPS.length - 1 && <div style={{ flex: 1, height: 2, background: i < step ? 'var(--c-accent)' : '#f0f0f0', margin: '0 10px 20px' }} />}
          </div>
        ))}
      </div>

      {step === 0 && (
        <Card>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Field label="ต้นทาง" required>
              <Input value={draft.origin} onChange={(e) => setDraft({ ...draft, origin: e.target.value })} />
            </Field>
            <Field label="ปลายทาง" required>
              <Input value={draft.destination} onChange={(e) => setDraft({ ...draft, destination: e.target.value })} />
            </Field>
            <Field label="กำหนดส่งมอบ">
              <Input type="datetime-local" value={draft.required_delivery_datetime} onChange={(e) => setDraft({ ...draft, required_delivery_datetime: e.target.value })} />
            </Field>
            <Field label="จำนวนจุดส่งทั้งหมด">
              <Input
                type="number"
                min={1}
                value={draft.number_of_stops}
                onChange={(e) => setDraft({ ...draft, number_of_stops: e.target.value })}
              />
              <div style={{ fontSize: 11, color: 'var(--c-text-faint)', marginTop: 4 }}>
                นับรวมปลายทางหลัก — ค่าเริ่มต้น 1 คือส่งจุดเดียวไม่มีจุดแวะเพิ่ม จุดที่เกิน 1 จะถูกบวกเวลา/ต้นทุนต่อจุดเข้าไปในการคำนวณคำแนะนำ
              </div>
            </Field>
            <div style={{ gridColumn: '1 / -1' }}>
              <Field label="ความต้องการพิเศษ">
                <TextArea value={draft.special_requirements} onChange={(e) => setDraft({ ...draft, special_requirements: e.target.value })} />
              </Field>
            </div>
          </div>
        </Card>
      )}

      {step === 1 && (
        <Card>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>รายการสินค้า</div>
          <div style={{ fontSize: 12, color: 'var(--c-text-muted)', marginBottom: 16 }}>
            ค้นหาสินค้าจาก SKU หรือชื่อสินค้า เพิ่มได้หลายรายการ — ระบบจะดึงน้ำหนัก/ปริมาตรจาก Product Master และคำนวณยอดรวมให้อัตโนมัติ
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', marginBottom: 8, position: 'relative' }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <Field label="ค้นหาสินค้า (SKU / ชื่อสินค้า)">
                <Input
                  value={productSearch}
                  onChange={(e) => {
                    setProductSearch(e.target.value);
                    setSelectedProductId(null);
                  }}
                  placeholder="พิมพ์ SKU หรือชื่อสินค้า..."
                />
              </Field>
              {productSearch && !selectedProductId && filteredProducts.length > 0 && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    zIndex: 10,
                    background: '#fff',
                    border: '1px solid var(--c-border)',
                    borderRadius: 8,
                    marginTop: 4,
                    maxHeight: 220,
                    overflowY: 'auto',
                    boxShadow: '0 8px 20px rgba(0,0,0,.08)',
                  }}
                >
                  {filteredProducts.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => {
                        setSelectedProductId(p.id);
                        setProductSearch(`${p.sku} — ${p.product_name}`);
                      }}
                      style={{ padding: '8px 12px', fontSize: 12.5, cursor: 'pointer', borderBottom: '1px solid #f3f4f6' }}
                    >
                      <strong>{p.sku}</strong> — {p.product_name}{' '}
                      <span style={{ color: 'var(--c-text-muted)' }}>
                        ({p.weight_per_unit_kg} กก./{p.unit}, {p.volume_per_unit_m3.toLocaleString(undefined, { maximumFractionDigits: 4 })} ลบ.ม./{p.unit})
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ width: 120 }}>
              <Field label="จำนวน">
                <Input type="number" value={quantityInput} onChange={(e) => setQuantityInput(e.target.value)} />
              </Field>
            </div>
            <Button onClick={addItem} loading={addingItem} disabled={!selectedProductId || !quantityInput}>
              + เพิ่มรายการ
            </Button>
          </div>

          {products.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--c-text-faint)', marginBottom: 16 }}>
              ยังไม่มีข้อมูลสินค้าในระบบ — ไปที่หน้า "ข้อมูลสินค้า (Product Master)" เพื่อเพิ่มก่อน หรือกรอกน้ำหนัก/ปริมาตรรวมเองด้านล่าง
            </div>
          )}

          {items.length > 0 && (
            <Card style={{ padding: 0, overflow: 'hidden', marginTop: 16, marginBottom: 16 }}>
              <Table>
                <thead>
                  <tr>
                    <Th>SKU</Th>
                    <Th>ชื่อสินค้า</Th>
                    <Th align="right">จำนวน</Th>
                    <Th align="right">น้ำหนักรวม</Th>
                    <Th align="right">ปริมาตรรวม</Th>
                    <Th align="center"></Th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.id}>
                      <Td>{it.sku}</Td>
                      <Td>{it.product_name}</Td>
                      <Td align="right">
                        {it.quantity.toLocaleString()} {it.unit}
                      </Td>
                      <Td align="right">{it.total_weight_kg.toLocaleString()} กก.</Td>
                      <Td align="right">{it.total_volume_m3.toLocaleString(undefined, { maximumFractionDigits: 4 })} ลบ.ม.</Td>
                      <Td align="center">
                        <Button size="sm" variant="danger" onClick={() => removeItem(it.id)}>
                          ลบ
                        </Button>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          )}

          {items.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              <SummaryTile label="จำนวน SKU" value={`${itemsSummary.skuCount} รายการ`} />
              <SummaryTile label="จำนวนรวม" value={itemsSummary.totalQuantity.toLocaleString()} />
              <SummaryTile label="น้ำหนักรวม (kg)" value={itemsSummary.totalWeight.toLocaleString()} />
              <SummaryTile label="ปริมาตรรวม (m³)" value={itemsSummary.totalVolume.toLocaleString(undefined, { maximumFractionDigits: 4 })} />
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 12, color: 'var(--c-text-muted)', marginBottom: 10 }}>
                หรือกรอกน้ำหนักและปริมาตรรวมเอง (ถ้าไม่ต้องการเลือกจากรายการสินค้า)
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <Field label="น้ำหนักรวม (กก.)" required>
                  <Input type="number" value={draft.shipment_weight_kg} onChange={(e) => setDraft({ ...draft, shipment_weight_kg: e.target.value })} />
                </Field>
                <Field label="ปริมาตรรวม (ลบ.ม.)" required>
                  <Input type="number" value={draft.shipment_volume_m3} onChange={(e) => setDraft({ ...draft, shipment_volume_m3: e.target.value })} />
                </Field>
              </div>
            </div>
          )}
        </Card>
      )}

      {step === 2 && (
        <Card>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>เลือกเส้นทางที่ต้องการเปรียบเทียบ</div>
          <div style={{ fontSize: 12, color: 'var(--c-text-muted)', marginBottom: 16 }}>เลือกได้มากกว่า 1 เส้นทาง — เฉพาะเส้นทางที่เปิดใช้งานเท่านั้น</div>
          {routes.length === 0 ? (
            <div style={{ color: 'var(--c-text-faint)', fontSize: 13 }}>ยังไม่มีเส้นทางที่ใช้งานได้ — ไปที่หน้า "เส้นทาง" เพื่อเพิ่มก่อน</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
              {routes.map((r) => (
                <div
                  key={r.id}
                  onClick={() => setDraft({ ...draft, routeIds: toggleId(draft.routeIds, r.id) })}
                  style={{
                    border: `1.5px solid ${draft.routeIds.includes(r.id) ? 'var(--c-accent)' : 'var(--c-border)'}`,
                    background: draft.routeIds.includes(r.id) ? '#fef2f2' : '#fff',
                    borderRadius: 10,
                    padding: 14,
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>{r.route_name}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--c-text-muted)', display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span>ระยะทาง: {r.distance_km} กม.</span>
                    <span>เวลา: {r.estimated_duration_minutes} นาที</span>
                    <span>ค่าทางด่วน: ฿{r.toll_cost}</span>
                    <StatusBadge status={r.route_risk_level} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {step === 3 && (
        <Card>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>เลือกยานพาหนะที่ต้องการเปรียบเทียบ</div>
          <div style={{ fontSize: 12, color: 'var(--c-text-muted)', marginBottom: 16 }}>
            แสดงเฉพาะยานพาหนะที่ความจุเพียงพอสำหรับสินค้า ({draft.shipment_weight_kg} กก. / {draft.shipment_volume_m3} ลบ.ม.)
          </div>
          {eligibleVehicles.length === 0 ? (
            <div style={{ color: 'var(--c-text-faint)', fontSize: 13 }}>ไม่มียานพาหนะที่ความจุเพียงพอสำหรับสินค้านี้</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
              {eligibleVehicles.map((v) => (
                <div
                  key={v.id}
                  onClick={() => setDraft({ ...draft, vehicleIds: toggleId(draft.vehicleIds, v.id) })}
                  style={{
                    border: `1.5px solid ${draft.vehicleIds.includes(v.id) ? 'var(--c-accent)' : 'var(--c-border)'}`,
                    background: draft.vehicleIds.includes(v.id) ? '#fef2f2' : '#fff',
                    borderRadius: 10,
                    padding: 14,
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
                    {v.vehicle_code} · {v.vehicle_type}
                  </div>
                  <div style={{ fontSize: 11.5, color: 'var(--c-text-muted)', display: 'flex', flexDirection: 'column', gap: 3 }}>
                    <span>ความจุ: {v.capacity_weight_kg.toLocaleString()} กก. / {v.capacity_volume_m3.toLocaleString()} ลบ.ม.</span>
                    <span>ต้นทุน: ฿{v.cost_per_km}/กม. + ฿{v.fixed_cost}</span>
                    <span>CO2: {v.co2_factor} กก./กม.</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {step === 4 && (
        <Card>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>เลือกโปรไฟล์การตัดสินใจ (AHP)</div>
          <div style={{ fontSize: 12, color: 'var(--c-text-muted)', marginBottom: 16 }}>แสดงเฉพาะโปรไฟล์ที่ใช้งานอยู่และผ่านเกณฑ์ความสอดคล้อง</div>
          {profiles.length === 0 ? (
            <div style={{ color: 'var(--c-text-faint)', fontSize: 13 }}>ยังไม่มีโปรไฟล์ที่ใช้งานอยู่ — ไปที่หน้า "โปรไฟล์การตัดสินใจ" เพื่อสร้างและเปิดใช้งานก่อน</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
              {profiles.map((p) => (
                <div
                  key={p.id}
                  onClick={() => setDraft({ ...draft, profileId: p.id })}
                  style={{
                    border: `1.5px solid ${draft.profileId === p.id ? 'var(--c-accent)' : 'var(--c-border)'}`,
                    background: draft.profileId === p.id ? '#fef2f2' : '#fff',
                    borderRadius: 10,
                    padding: 14,
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>{p.name}</div>
                  {Object.entries(p.weights).map(([k, w]) => (
                    <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--c-text-muted)' }}>
                      <span>{CRITERIA_LABELS[k]}</span>
                      <span>{(w * 100).toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {step === 5 && (
        <Card>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>ตรวจสอบข้อมูลก่อนสร้างคำแนะนำ</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
            <Row label="เส้นทาง → ปลายทาง" value={`${draft.origin} → ${draft.destination}`} />
            <Row label="น้ำหนัก / ปริมาตร" value={`${draft.shipment_weight_kg} กก. / ${draft.shipment_volume_m3} ลบ.ม.`} />
            {items.length > 0 && <Row label="จำนวนรายการสินค้า" value={`${itemsSummary.skuCount} SKU / ${itemsSummary.totalQuantity.toLocaleString()} หน่วย`} />}
            <Row label="จำนวนจุดส่ง" value={`${draft.number_of_stops} จุด`} />
            <Row label="จำนวนเส้นทางที่เลือก" value={`${draft.routeIds.length} เส้นทาง`} />
            <Row label="จำนวนยานพาหนะที่เลือก" value={`${draft.vehicleIds.length} คัน`} />
            <Row label="โปรไฟล์การตัดสินใจ" value={selectedProfile?.name ?? '-'} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
            <Button onClick={generate} loading={generating}>
              แนะนำยานพาหนะ →
            </Button>
          </div>
        </Card>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 18 }}>
        <Button variant="secondary" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>
          ย้อนกลับ
        </Button>
        {step < STEPS.length - 1 && <Button onClick={next}>ถัดไป</Button>}
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

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: '1px solid var(--c-border)', borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ fontSize: 11, color: 'var(--c-text-muted)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700 }}>{value}</div>
    </div>
  );
}
