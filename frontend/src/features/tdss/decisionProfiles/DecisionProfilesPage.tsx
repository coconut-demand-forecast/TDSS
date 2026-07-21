import { useEffect, useMemo, useState } from 'react';
import OrgWorkspaceLayout from '../../../layouts/OrgWorkspaceLayout';
import { Button, Card, Dialog, EmptyState, Field, Input, LoadingState, PageHeader, StatusBadge, TextArea } from '../../../components/ui';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import { profilesApi, type DecisionProfile } from '../../../api';
import { CRITERIA_LABELS, buildMatrix, calculateWeights, matrixToPairwise, upperTrianglePairs, pairKey } from './ahpClient';
import { PROFILE_TEMPLATES, type ProfileTemplate } from './templates';

const SAATY_OPTIONS = [
  { value: 1 / 9, label: '1/9 — ตัวหลังสำคัญกว่ามากที่สุด' },
  { value: 1 / 7, label: '1/7 — ตัวหลังสำคัญกว่ามาก' },
  { value: 1 / 5, label: '1/5 — ตัวหลังสำคัญกว่าค่อนข้างมาก' },
  { value: 1 / 3, label: '1/3 — ตัวหลังสำคัญกว่าเล็กน้อย' },
  { value: 1, label: '1 — สำคัญเท่ากัน' },
  { value: 3, label: '3 — ตัวหน้าสำคัญกว่าเล็กน้อย' },
  { value: 5, label: '5 — ตัวหน้าสำคัญกว่าค่อนข้างมาก' },
  { value: 7, label: '7 — ตัวหน้าสำคัญกว่ามาก' },
  { value: 9, label: '9 — ตัวหน้าสำคัญกว่ามากที่สุด' },
];

const EMPTY_PAIRWISE = () => {
  const init: Record<string, number> = {};
  upperTrianglePairs().forEach(([a, b]) => (init[pairKey(a, b)] = 1));
  return init;
};

export default function DecisionProfilesPage() {
  const { currentOrgId, user } = useAuth();
  const { showSuccess, showError } = useToast();
  const [profiles, setProfiles] = useState<DecisionProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingProfile, setEditingProfile] = useState<DecisionProfile | null>(null);
  const [step, setStep] = useState<'template' | 'form'>('template');
  const [templateKey, setTemplateKey] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [pairwise, setPairwise] = useState<Record<string, number>>(EMPTY_PAIRWISE);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DecisionProfile | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const membership = user?.memberships.find((m) => m.organization_id === currentOrgId);
  const canWrite = user?.is_system_owner || membership?.role === 'org_admin' || membership?.role === 'planner';

  const preview = useMemo(() => calculateWeights(buildMatrix(pairwise)), [pairwise]);

  const load = async () => {
    if (!currentOrgId) return;
    setLoading(true);
    try {
      setProfiles(await profilesApi.list(currentOrgId));
    } catch {
      showError('โหลดข้อมูลโปรไฟล์ไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrgId]);

  const openCreate = () => {
    setEditingProfile(null);
    setName('');
    setDescription('');
    setPairwise(EMPTY_PAIRWISE());
    setTemplateKey(null);
    setStep('template');
    setShowForm(true);
  };

  const openEdit = (p: DecisionProfile) => {
    setEditingProfile(p);
    setName(p.name);
    setDescription(p.description ?? '');
    setPairwise(matrixToPairwise(p.pairwise_matrix));
    setTemplateKey('custom');
    setStep('form');
    setShowForm(true);
  };

  const selectTemplate = (t: ProfileTemplate) => {
    setTemplateKey(t.key);
    if (t.key === 'custom') {
      setPairwise(EMPTY_PAIRWISE());
    } else {
      setPairwise(t.pairwise!);
      setName(t.label);
      setDescription(t.description);
    }
    setStep('form');
  };

  const isCustom = templateKey === 'custom';

  const submit = async () => {
    if (!currentOrgId) return;
    if (!name) {
      showError('กรุณากรอกชื่อโปรไฟล์');
      return;
    }
    if (isCustom && !preview.isConsistent) {
      showError(`ค่าความสอดคล้องไม่ผ่านเกณฑ์ (CR = ${preview.cr.toFixed(3)} > 0.10) — กรุณาปรับค่าเปรียบเทียบก่อนบันทึก`);
      return;
    }
    setSaving(true);
    try {
      const payload = { name, description: description || undefined, pairwise, save_as_draft_if_inconsistent: false };
      if (editingProfile) await profilesApi.update(currentOrgId, editingProfile.id, payload);
      else await profilesApi.create(currentOrgId, payload);
      showSuccess(editingProfile ? 'แก้ไขโปรไฟล์สำเร็จ' : 'สร้างโปรไฟล์สำเร็จ พร้อมใช้งานทันที');
      setShowForm(false);
      await load();
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      showError(typeof detail === 'string' ? detail : 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (p: DecisionProfile) => {
    if (!currentOrgId) return;
    try {
      await profilesApi.setActive(currentOrgId, p.id, p.status !== 'active');
      showSuccess('อัปเดตสถานะแล้ว');
      await load();
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      showError(typeof detail === 'string' ? detail : 'อัปเดตไม่สำเร็จ');
    }
  };

  const confirmDelete = async () => {
    if (!currentOrgId || !deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await profilesApi.remove(currentOrgId, deleteTarget.id);
      showSuccess('ลบโปรไฟล์แล้ว');
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
    <OrgWorkspaceLayout title="โปรไฟล์การตัดสินใจ (AHP)">
      <PageHeader
        title="โปรไฟล์การตัดสินใจ (AHP)"
        subtitle="กำหนดน้ำหนักความสำคัญของเกณฑ์ต่างๆ ด้วยวิธี Analytic Hierarchy Process"
        actions={canWrite && <Button onClick={openCreate}>+ สร้างโปรไฟล์ใหม่</Button>}
      />

      {loading ? (
        <LoadingState card />
      ) : profiles.length === 0 ? (
        <EmptyState message="ยังไม่มีโปรไฟล์การตัดสินใจ" action={canWrite && <Button onClick={openCreate}>+ สร้างโปรไฟล์แรก</Button>} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          {profiles.map((p) => (
            <Card key={p.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                <div style={{ fontWeight: 700, fontSize: 14.5 }}>{p.name}</div>
                <StatusBadge status={p.status} />
              </div>
              {p.description && <div style={{ fontSize: 12, color: 'var(--c-text-muted)', marginBottom: 12 }}>{p.description}</div>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                {Object.entries(p.weights).map(([k, w]) => (
                  <div key={k}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--c-text-muted)', marginBottom: 2 }}>
                      <span>{CRITERIA_LABELS[k] ?? k}</span>
                      <span>{(w * 100).toFixed(1)}%</span>
                    </div>
                    <div style={{ height: 5, borderRadius: 4, background: '#f0f0f0', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${w * 100}%`, background: 'var(--c-accent)' }} />
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11.5, color: p.is_consistent ? '#166534' : '#991b1b', marginBottom: 12 }}>
                CR = {p.cr.toFixed(3)} {p.is_consistent ? '(ผ่านเกณฑ์ความสอดคล้อง)' : '(ไม่ผ่านเกณฑ์ — ต้องปรับก่อนใช้งาน)'}
              </div>
              {canWrite && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <Button size="sm" variant={p.status === 'active' ? 'danger' : 'secondary'} disabled={!p.is_consistent && p.status !== 'active'} onClick={() => toggleActive(p)}>
                    {p.status === 'active' ? 'ปิดใช้งาน' : 'ตั้งเป็นโปรไฟล์ที่ใช้งาน'}
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => openEdit(p)}>
                    แก้ไข
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => {
                      setDeleteTarget(p);
                      setDeleteError(null);
                    }}
                  >
                    ลบ
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {showForm && step === 'template' && (
        <Dialog title="เลือกรูปแบบโปรไฟล์การตัดสินใจ" onClose={() => setShowForm(false)} width={720}>
          <div style={{ fontSize: 12.5, color: 'var(--c-text-muted)', marginBottom: 16 }}>
            เลือกโปรไฟล์สำเร็จรูป (คำนวณน้ำหนักและผ่านเกณฑ์ความสอดคล้องไว้ล่วงหน้าแล้ว) หรือกำหนดเองแบบละเอียด
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
            {PROFILE_TEMPLATES.map((t) => (
              <div
                key={t.key}
                onClick={() => selectTemplate(t)}
                style={{
                  border: '1.5px solid var(--c-border)',
                  borderRadius: 10,
                  padding: 14,
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{t.label}</div>
                <div style={{ fontSize: 11.5, color: 'var(--c-text-muted)', lineHeight: 1.5 }}>{t.description}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
            <Button variant="secondary" onClick={() => setShowForm(false)}>
              ยกเลิก
            </Button>
          </div>
        </Dialog>
      )}

      {showForm && step === 'form' && (
        <Dialog title={editingProfile ? `แก้ไขโปรไฟล์ — ${editingProfile.name}` : 'สร้างโปรไฟล์การตัดสินใจใหม่'} onClose={() => setShowForm(false)} width={720}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 18 }}>
            <Field label="ชื่อโปรไฟล์" required>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="คำอธิบาย">
              <TextArea value={description} onChange={(e) => setDescription(e.target.value)} />
            </Field>
          </div>

          {isCustom ? (
            <>
              <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 4 }}>เปรียบเทียบความสำคัญของเกณฑ์ (Saaty scale 1-9)</div>
              <div style={{ fontSize: 12, color: 'var(--c-text-muted)', marginBottom: 14 }}>สำหรับแต่ละคู่ เลือกว่าเกณฑ์ใดสำคัญกว่าและมากน้อยเพียงใด</div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                {upperTrianglePairs().map(([a, b]) => {
                  const key = pairKey(a, b);
                  return (
                    <div key={key} style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr 1fr', gap: 10, alignItems: 'center', fontSize: 12.5 }}>
                      <div style={{ textAlign: 'right', fontWeight: 600 }}>{CRITERIA_LABELS[a]}</div>
                      <select
                        value={pairwise[key]}
                        onChange={(e) => setPairwise({ ...pairwise, [key]: Number(e.target.value) })}
                        style={{ padding: '7px 9px', borderRadius: 8, border: '1px solid var(--c-border)', fontFamily: 'inherit', fontSize: 12 }}
                      >
                        {SAATY_OPTIONS.map((o) => (
                          <option key={o.label} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                      <div style={{ fontWeight: 600 }}>{CRITERIA_LABELS[b]}</div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--c-text-muted)', marginBottom: 14 }}>
              ใช้ Pairwise Matrix ที่กำหนดไว้ล่วงหน้าสำหรับโปรไฟล์นี้ — ไม่ต้องกรอกเปรียบเทียบเอง{' '}
              <span style={{ color: 'var(--c-accent)', cursor: 'pointer', fontWeight: 600 }} onClick={() => setTemplateKey('custom')}>
                แก้ไขค่าเปรียบเทียบเอง →
              </span>
            </div>
          )}

          <Card style={{ background: '#f6f7f8', border: 'none' }}>
            <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 10 }}>
              น้ำหนักที่คำนวณได้ {isCustom && '(คำนวณใหม่ทันทีเมื่อเปลี่ยนค่า)'}
            </div>
            {Object.entries(preview.weights).map(([k, w]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                <span>{CRITERIA_LABELS[k]}</span>
                <span style={{ fontWeight: 600 }}>{(w * 100).toFixed(1)}%</span>
              </div>
            ))}
            <div style={{ marginTop: 8, fontSize: 12, fontWeight: 600, color: preview.isConsistent ? '#166534' : '#991b1b' }}>
              CR = {preview.cr.toFixed(3)} {preview.isConsistent ? '✓ สอดคล้อง (≤ 0.10)' : '✗ ไม่สอดคล้อง (> 0.10) — ต้องปรับก่อนบันทึก'}
            </div>
          </Card>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 20 }}>
            <div>
              {!editingProfile && (
                <Button variant="ghost" onClick={() => setStep('template')}>
                  ← เลือกรูปแบบใหม่
                </Button>
              )}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <Button variant="secondary" onClick={() => setShowForm(false)}>
                ยกเลิก
              </Button>
              <Button onClick={submit} loading={saving} disabled={isCustom && !preview.isConsistent}>
                {editingProfile ? 'บันทึกการแก้ไข' : 'บันทึกโปรไฟล์'}
              </Button>
            </div>
          </div>
        </Dialog>
      )}

      {deleteTarget && (
        <Dialog title="ยืนยันการลบโปรไฟล์" onClose={() => setDeleteTarget(null)}>
          <div style={{ fontSize: 13, marginBottom: 14 }}>
            ต้องการลบโปรไฟล์ <strong>{deleteTarget.name}</strong> ใช่หรือไม่? การลบไม่สามารถย้อนกลับได้
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
