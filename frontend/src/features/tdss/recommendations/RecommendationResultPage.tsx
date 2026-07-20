import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import OrgWorkspaceLayout from '../../../layouts/OrgWorkspaceLayout';
import { Button, Card, Dialog, LoadingState, PageHeader, StatusBadge, Table, Td, TextArea, Th } from '../../../components/ui';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import { planningApi, reportsApi, type Alternative, type RecommendationRun } from '../../../api';
import { CRITERIA_LABELS } from '../decisionProfiles/ahpClient';

export default function RecommendationResultPage() {
  const { runId } = useParams();
  const { currentOrgId, user } = useAuth();
  const { showSuccess, showError } = useToast();
  const navigate = useNavigate();
  const [run, setRun] = useState<RecommendationRun | null>(null);
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState<Alternative | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const membership = user?.memberships.find((m) => m.organization_id === currentOrgId);
  const canApprove = user?.is_system_owner || membership?.role === 'org_admin' || membership?.role === 'planner';

  const load = async () => {
    if (!currentOrgId || !runId) return;
    setLoading(true);
    try {
      setRun(await planningApi.get(currentOrgId, Number(runId)));
    } catch {
      showError('โหลดข้อมูลคำแนะนำไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentOrgId, runId]);

  const openSelect = (alt: Alternative) => {
    setSelecting(alt);
    setReason('');
  };

  const confirmSelect = async () => {
    if (!currentOrgId || !run || !selecting) return;
    if (selecting.rank !== 1 && !reason.trim()) {
      showError('กรุณาระบุเหตุผลเมื่อเลือกทางเลือกที่ไม่ใช่อันดับ 1');
      return;
    }
    setSubmitting(true);
    try {
      await planningApi.select(currentOrgId, run.id, { alternative_id: selecting.id, reason: reason.trim() || undefined });
      showSuccess('อนุมัติแผนแล้ว');
      setSelecting(null);
      await load();
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      showError(typeof detail === 'string' ? detail : 'บันทึกการอนุมัติไม่สำเร็จ');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <OrgWorkspaceLayout title="ผลการแนะนำ">
        <LoadingState card />
      </OrgWorkspaceLayout>
    );
  }
  if (!run) {
    return (
      <OrgWorkspaceLayout title="ผลการแนะนำ">
        <Card>ไม่พบข้อมูลคำแนะนำนี้</Card>
      </OrgWorkspaceLayout>
    );
  }

  const top = run.alternatives.find((a) => a.rank === 1);
  const feasibleAlts = run.alternatives.filter((a) => a.feasible);
  const infeasibleAlts = run.alternatives.filter((a) => !a.feasible);

  return (
    <OrgWorkspaceLayout title="ผลการแนะนำ">
      <PageHeader
        title="ผลการแนะนำ"
        subtitle={`คำแนะนำจากงาน #${run.job_id} · สร้างเมื่อ ${new Date(run.created_at).toLocaleString('th-TH')}`}
        actions={
          <Button variant="secondary" onClick={() => reportsApi.recommendation(currentOrgId!, run.id)}>
            ส่งออกรายงาน (CSV)
          </Button>
        }
      />

      {run.approval && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', borderRadius: 10, padding: '12px 16px', fontSize: 13, marginBottom: 18 }}>
          ✓ อนุมัติแล้วเมื่อ {new Date(run.approval.approved_at).toLocaleString('th-TH')}
          {run.approval.reason && <div style={{ marginTop: 4 }}>เหตุผล: {run.approval.reason}</div>}
        </div>
      )}

      {top && (
        <Card style={{ border: '1.5px solid var(--c-accent)', boxShadow: '0 4px 14px rgba(215,25,32,.08)', marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div>
              <StatusBadge tone="danger">อันดับ 1 — คำแนะนำหลัก</StatusBadge>
              <div style={{ fontSize: 17, fontWeight: 700, marginTop: 10 }}>
                {top.vehicle_code} · {top.route_code}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: 'var(--c-text-muted)' }}>คะแนนรวม</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--c-accent)' }}>{(top.total_score * 100).toFixed(1)}</div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 16 }}>
            <Stat label="ต้นทุนประมาณการ" value={`฿${top.cost.toLocaleString()}`} />
            <Stat label="เวลาโดยประมาณ" value={`${top.duration_minutes.toLocaleString()} นาที`} />
            <Stat label="อัตราการใช้ความจุ" value={`${(((top.weight_utilization + top.volume_utilization) / 2) * 100).toFixed(0)}%`} />
            <Stat label="CO2 โดยประมาณ" value={`${top.co2_estimate.toFixed(1)} กก.`} />
          </div>

          {run.explanations.length > 0 && (
            <div style={{ background: '#f6f7f8', borderRadius: 10, padding: 14, marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 8 }}>เหตุผลของคำแนะนำ</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: 'var(--c-text-muted)', lineHeight: 1.8 }}>
                {run.explanations.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}

          {run.ai_analysis && (
            <div style={{ background: '#fdf4ff', border: '1px solid #f3d9ff', borderRadius: 10, padding: 14, marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 12.5, marginBottom: 10, color: '#7e22ce' }}>🤖 การวิเคราะห์โดย AI</div>
              <div style={{ fontSize: 12.5, marginBottom: 8 }}>
                <strong>ทำไมเลือกรถคันนี้: </strong>
                <span style={{ color: 'var(--c-text-muted)' }}>{run.ai_analysis.vehicle_reason}</span>
              </div>
              <div style={{ fontSize: 12.5, marginBottom: 10 }}>
                <strong>ทำไมเลือกเส้นทางนี้: </strong>
                <span style={{ color: 'var(--c-text-muted)' }}>{run.ai_analysis.route_reason}</span>
              </div>
              {run.ai_analysis.strengths.length > 0 && (
                <div style={{ marginBottom: run.ai_analysis.cautions.length > 0 ? 10 : 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>จุดเด่นของทางเลือกนี้</div>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: 'var(--c-text-muted)', lineHeight: 1.7 }}>
                    {run.ai_analysis.strengths.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
              {run.ai_analysis.cautions.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4, color: 'var(--c-accent)' }}>ข้อควรระวัง</div>
                  <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: 'var(--c-accent)', lineHeight: 1.7 }}>
                    {run.ai_analysis.cautions.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {canApprove && !run.approval && (
            <Button onClick={() => openSelect(top)}>ยอมรับคำแนะนำนี้</Button>
          )}
        </Card>
      )}

      <Card style={{ padding: 0, overflow: 'hidden', marginBottom: 20 }}>
        <div style={{ padding: '14px 18px', fontWeight: 700, fontSize: 13.5, borderBottom: '1px solid var(--c-border)' }}>ทางเลือกที่เป็นไปได้ทั้งหมด</div>
        <Table>
          <thead>
            <tr>
              <Th align="center">อันดับ</Th>
              <Th>ยานพาหนะ</Th>
              <Th>เส้นทาง</Th>
              <Th align="right">ต้นทุน</Th>
              <Th align="right">เวลา</Th>
              <Th align="right">การใช้ความจุ</Th>
              <Th align="right">ความน่าเชื่อถือ</Th>
              <Th align="right">CO2</Th>
              <Th align="right">คะแนนรวม</Th>
              <Th align="center">สถานะ</Th>
              {canApprove && !run.approval && <Th align="center"></Th>}
            </tr>
          </thead>
          <tbody>
            {feasibleAlts.map((a) => (
              <tr key={a.id} style={{ background: a.rank === 1 ? '#fef2f2' : undefined }}>
                <Td align="center">#{a.rank}</Td>
                <Td>{a.vehicle_code}</Td>
                <Td>{a.route_code}</Td>
                <Td align="right">฿{a.cost.toLocaleString()}</Td>
                <Td align="right">{a.duration_minutes.toLocaleString()} นาที</Td>
                <Td align="right">{(((a.weight_utilization + a.volume_utilization) / 2) * 100).toFixed(0)}%</Td>
                <Td align="right">{(a.reliability_score * 100).toFixed(0)}%</Td>
                <Td align="right">{a.co2_estimate.toFixed(1)} กก.</Td>
                <Td align="right">{(a.total_score * 100).toFixed(1)}</Td>
                <Td align="center">
                  {run.approval?.selected_alternative_id === a.id ? <StatusBadge tone="success">เลือกแล้ว</StatusBadge> : <StatusBadge tone="info">เป็นไปได้</StatusBadge>}
                </Td>
                {canApprove && !run.approval && (
                  <Td align="center">
                    <Button size="sm" variant="secondary" onClick={() => openSelect(a)}>
                      เลือกทางเลือกนี้
                    </Button>
                  </Td>
                )}
              </tr>
            ))}
            {infeasibleAlts.map((a) => (
              <tr key={a.id} style={{ opacity: 0.6 }}>
                <Td align="center">-</Td>
                <Td>{a.vehicle_code}</Td>
                <Td>{a.route_code}</Td>
                <Td align="right" colSpan={6}>
                  <span style={{ fontSize: 11.5, color: 'var(--c-accent)' }}>{a.rejection_reasons.join(' · ')}</span>
                </Td>
                <Td align="center">
                  <StatusBadge tone="danger">ไม่ผ่านเงื่อนไข</StatusBadge>
                </Td>
                {canApprove && !run.approval && <Td></Td>}
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      {top && (
        <Card>
          <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 14 }}>รายละเอียดคะแนน (ทางเลือกอันดับ 1)</div>
          <Table minWidth={520}>
            <thead>
              <tr>
                <Th>เกณฑ์</Th>
                <Th align="right">ค่าดิบ</Th>
                <Th align="right">ค่าปรับมาตรฐาน</Th>
                <Th align="right">น้ำหนัก AHP</Th>
                <Th align="right">คะแนนถ่วงน้ำหนัก</Th>
              </tr>
            </thead>
            <tbody>
              {Object.keys(run.criteria_weights).map((c) => (
                <tr key={c}>
                  <Td>{CRITERIA_LABELS[c] ?? c}</Td>
                  <Td align="right">{top.raw_values[c]?.toFixed(2)}</Td>
                  <Td align="right">{top.normalized_values[c]?.toFixed(3)}</Td>
                  <Td align="right">{(run.criteria_weights[c] * 100).toFixed(1)}%</Td>
                  <Td align="right">{top.weighted_scores[c]?.toFixed(3)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      {selecting && (
        <Dialog title="ยืนยันการเลือกทางเลือก" onClose={() => setSelecting(null)}>
          <div style={{ fontSize: 13, marginBottom: 14 }}>
            เลือก <strong>{selecting.vehicle_code} · {selecting.route_code}</strong> (อันดับ #{selecting.rank}, คะแนน {(selecting.total_score * 100).toFixed(1)})
          </div>
          {selecting.rank !== 1 && (
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--c-text-muted)', marginBottom: 6 }}>
                เหตุผลที่เลือกทางเลือกนี้แทนอันดับ 1 <span style={{ color: 'var(--c-accent)' }}>*</span>
              </label>
              <TextArea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="เช่น ต้องการยานพาหนะที่เหมาะกับสินค้าแตกหักง่ายมากกว่า" />
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <Button variant="secondary" onClick={() => setSelecting(null)}>
              ยกเลิก
            </Button>
            <Button onClick={confirmSelect} loading={submitting}>
              ยืนยันการอนุมัติ
            </Button>
          </div>
        </Dialog>
      )}

      <div style={{ marginTop: 16 }}>
        <Button variant="ghost" onClick={() => navigate(-1)}>
          ← กลับ
        </Button>
      </div>
    </OrgWorkspaceLayout>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: '#f6f7f8', borderRadius: 10, padding: 12 }}>
      <div style={{ fontSize: 11, color: 'var(--c-text-muted)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700 }}>{value}</div>
    </div>
  );
}
