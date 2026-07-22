import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card } from '../../../components/ui';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';

export default function PendingApprovalPage() {
  const { user, currentOrgId, logout, refreshUser } = useAuth();
  const { showSuccess, showError } = useToast();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(false);

  const orgName = user?.memberships.find((m) => m.organization_id === currentOrgId)?.organization_name ?? '';

  const recheck = async () => {
    setChecking(true);
    try {
      await refreshUser();
      const refreshed = JSON.parse(localStorage.getItem('tdss_user') ?? 'null') as typeof user;
      const membership = refreshed?.memberships.find((m) => m.organization_id === currentOrgId);
      if (membership?.organization_status === 'active') {
        showSuccess('องค์กรของคุณได้รับการอนุมัติแล้ว');
        navigate('/tdss/dashboard', { replace: true });
      } else {
        showError('ยังไม่ได้รับการอนุมัติ กรุณารอ System Owner ตรวจสอบก่อน');
      }
    } finally {
      setChecking(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f6f7f8', padding: 20 }}>
      <Card style={{ maxWidth: 420, textAlign: 'center', padding: 32 }}>
        <div style={{ fontSize: 40, marginBottom: 14 }}>⏳</div>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>รอการอนุมัติจากผู้ดูแลระบบ</div>
        <div style={{ fontSize: 13, color: 'var(--c-text-muted)', lineHeight: 1.6, marginBottom: 24 }}>
          องค์กร "{orgName}" ของคุณสมัครใช้งานสำเร็จแล้ว แต่ยังต้องรอ System Owner ตรวจสอบและอนุมัติก่อนจึงจะเริ่มใช้งานได้
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <Button variant="secondary" onClick={logout}>
            ออกจากระบบ
          </Button>
          <Button onClick={recheck} loading={checking}>
            ตรวจสอบสถานะอีกครั้ง
          </Button>
        </div>
      </Card>
    </div>
  );
}
