import { useEffect, useState } from 'react';
import { useLanguage } from '../../../context/LanguageContext';
import OwnerConsoleLayout from '../../../layouts/OwnerConsoleLayout';
import { Card, LoadingState, PageHeader, Table, Td, Th } from '../../../components/ui';
import { useToast } from '../../../context/ToastContext';
import { auditApi, type AuditLogEntry } from '../../../api';

export default function OwnerAuditLogsPage() {
  const { t } = useLanguage();
  const { showError } = useToast();
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    auditApi
      .listAll()
      .then(setLogs)
      .catch(() => showError('โหลดข้อมูลไม่สำเร็จ'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <OwnerConsoleLayout title={t('nav.owner-audit')}>
      <PageHeader title={t('pageTitle.ownerAuditFull')} subtitle="ประวัติการกระทำทุกองค์กร ล่าสุด 500 รายการ" />
      {loading ? (
        <LoadingState card />
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <Table>
            <thead>
              <tr>
                <Th>เวลา</Th>
                <Th align="right">องค์กร</Th>
                <Th>ผู้ใช้งาน</Th>
                <Th>การกระทำ</Th>
                <Th>ประเภท</Th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <Td>{new Date(l.created_at).toLocaleString('th-TH')}</Td>
                  <Td align="right">{l.organization_id ?? '-'}</Td>
                  <Td>{l.user_name ?? '-'}</Td>
                  <Td>{l.action}</Td>
                  <Td>{l.entity_type}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </OwnerConsoleLayout>
  );
}
