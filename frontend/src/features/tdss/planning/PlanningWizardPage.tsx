import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import OrgWorkspaceLayout from '../../../layouts/OrgWorkspaceLayout';
import { Button, Card, Field, Input, LoadingState, StatusBadge, TextArea } from '../../../components/ui';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import { jobsApi, organizationsApi, planningApi, profilesApi, routesApi, vehiclesApi, type DecisionProfile, type Route, type TransportJob, type Vehicle } from '../../../api';
import { CRITERIA_LABELS } from '../decisionProfiles/ahpClient';

const STEPS = ['ความต้องการสินค้า', 'เลือกเส้นทาง', 'เลือกยานพาหนะ', 'โปรไฟล์การตัดสินใจ', 'ตรวจสอบและยืนยัน'];

interface DraftState {
  origin: string;
  destination: string;
  shipment_weight_kg: string;
  shipment_volume_m3: string;
  required_delivery_datetime: string;
  special_requirements: string;
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
    routeIds: [],
    vehicleIds: [],
    profileId: null,
  });

  useEffect(() => {
    if (!currentOrgId || !jobId) return;
    (async () => {
      setLoading(true);
      try {
        const [j, r, v, p, orgSettings] = await Promise.all([
          jobsApi.get(currentOrgId, Number(jobId)),
          routesApi.list(currentOrgId, { status: 'active' }),
          vehiclesApi.list(currentOrgId, { status: 'active' }),
          profilesApi.list(currentOrgId),
          organizationsApi.getSettings(currentOrgId).catch(() => null),
        ]);
        setJob(j);
        setRoutes(r);
        setVehicles(v);
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

  const saveRequirements = async () => {
    if (!currentOrgId || !job) return false;
    if (!draft.origin || !draft.destination || !draft.shipment_weight_kg || !draft.shipment_volume_m3) {
      showError('กรุณากรอกต้นทาง ปลายทาง น้ำหนัก และปริมาตรให้ครบ');
      return false;
    }
    try {
      await jobsApi.update(currentOrgId, job.id, {
        origin: draft.origin,
        destination: draft.destination,
        shipment_weight_kg: Number(draft.shipment_weight_kg),
        shipment_volume_m3: Number(draft.shipment_volume_m3),
        required_delivery_datetime: draft.required_delivery_datetime ? new Date(draft.required_delivery_datetime).toISOString() : undefined,
        special_requirements: draft.special_requirements || undefined,
      });
      return true;
    } catch {
      showError('บันทึกข้อมูลไม่สำเร็จ');
      return false;
    }
  };

  const next = async () => {
    if (step === 0) {
      const ok = await saveRequirements();
      if (!ok) return;
    }
    if (step === 1 && draft.routeIds.length === 0) {
      showError('กรุณาเลือกอย่างน้อย 1 เส้นทาง');
      return;
    }
    if (step === 2 && draft.vehicleIds.length === 0) {
      showError('กรุณาเลือกอย่างน้อย 1 ยานพาหนะ');
      return;
    }
    if (step === 3 && !draft.profileId) {
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
            <Field label="น้ำหนักสินค้า (กก.)" required>
              <Input type="number" value={draft.shipment_weight_kg} onChange={(e) => setDraft({ ...draft, shipment_weight_kg: e.target.value })} />
            </Field>
            <Field label="ปริมาตรสินค้า (ลบ.ม.)" required>
              <Input type="number" value={draft.shipment_volume_m3} onChange={(e) => setDraft({ ...draft, shipment_volume_m3: e.target.value })} />
            </Field>
            <Field label="กำหนดส่งมอบ">
              <Input type="datetime-local" value={draft.required_delivery_datetime} onChange={(e) => setDraft({ ...draft, required_delivery_datetime: e.target.value })} />
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

      {step === 2 && (
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

      {step === 3 && (
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

      {step === 4 && (
        <Card>
          <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 16 }}>ตรวจสอบข้อมูลก่อนสร้างคำแนะนำ</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
            <Row label="เส้นทาง → ปลายทาง" value={`${draft.origin} → ${draft.destination}`} />
            <Row label="น้ำหนัก / ปริมาตร" value={`${draft.shipment_weight_kg} กก. / ${draft.shipment_volume_m3} ลบ.ม.`} />
            <Row label="จำนวนเส้นทางที่เลือก" value={`${draft.routeIds.length} เส้นทาง`} />
            <Row label="จำนวนยานพาหนะที่เลือก" value={`${draft.vehicleIds.length} คัน`} />
            <Row label="โปรไฟล์การตัดสินใจ" value={selectedProfile?.name ?? '-'} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
            <Button onClick={generate} loading={generating}>
              สร้างคำแนะนำ →
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
