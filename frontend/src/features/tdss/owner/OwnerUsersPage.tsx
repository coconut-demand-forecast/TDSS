import { useEffect, useState } from 'react';
import { useLanguage } from '../../../context/LanguageContext';
import OwnerConsoleLayout from '../../../layouts/OwnerConsoleLayout';
import { Button, Card, Input, LoadingState, PageHeader, StatusBadge, Table, Td, Th } from '../../../components/ui';
import { useToast } from '../../../context/ToastContext';
import { ownerApi } from '../../../api';

interface OwnerUserRow {
  id: number;
  name: string;
  email: string;
  is_system_owner: boolean;
  status: string;
  organizations: { organization_id: number; organization_name: string; role: string }[];
}

export default function OwnerUsersPage() {
  const { t } = useLanguage();
  const { showSuccess, showError } = useToast();
  const [users, setUsers] = useState<OwnerUserRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      setUsers((await ownerApi.listUsers(search || undefined)) as OwnerUserRow[]);
    } catch {
      showError('โหลดข้อมูลผู้ใช้งานไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setStatus = async (u: OwnerUserRow, status: string) => {
    try {
      await ownerApi.setUserStatus(u.id, status);
      showSuccess('อัปเดตสถานะแล้ว');
      await load();
    } catch {
      showError('อัปเดตสถานะไม่สำเร็จ (อาจเป็นบัญชี System Owner)');
    }
  };

  return (
    <OwnerConsoleLayout title={t('nav.owner-users')}>
      <PageHeader
        title={t('nav.owner-users')}
        subtitle="ดูและจัดการผู้ใช้งานข้ามทุกองค์กร"
        actions={<Input placeholder="ค้นหา..." value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} style={{ width: 220 }} />}
      />

      {loading ? (
        <LoadingState card />
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <Table>
            <thead>
              <tr>
                <Th>ชื่อ</Th>
                <Th>อีเมล</Th>
                <Th>องค์กร / บทบาท</Th>
                <Th align="center">สถานะ</Th>
                <Th align="center"></Th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <Td>
                    {u.name} {u.is_system_owner && <StatusBadge tone="warning">System Owner</StatusBadge>}
                  </Td>
                  <Td>{u.email}</Td>
                  <Td>{u.organizations.map((o) => `${o.organization_name} (${o.role})`).join(', ') || '-'}</Td>
                  <Td align="center">
                    <StatusBadge status={u.status} />
                  </Td>
                  <Td align="center">
                    {!u.is_system_owner &&
                      (u.status === 'active' ? (
                        <Button size="sm" variant="danger" onClick={() => setStatus(u, 'suspended')}>
                          ระงับ
                        </Button>
                      ) : (
                        <Button size="sm" variant="secondary" onClick={() => setStatus(u, 'active')}>
                          เปิดใช้งาน
                        </Button>
                      ))}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </OwnerConsoleLayout>
  );
}
