import { useEffect, useState } from 'react';
import { useLanguage } from '../../../context/LanguageContext';
import OwnerConsoleLayout from '../../../layouts/OwnerConsoleLayout';
import { Card, DateRangePicker, Input, LoadingState, PageHeader, StatusBadge, Table, Td, Th, type DateRange } from '../../../components/ui';
import { useToast } from '../../../context/ToastContext';
import { ownerApi, type OrganizationUsageRow } from '../../../api';

export default function OwnerUsagePage() {
  const { t } = useLanguage();
  const { showError } = useToast();
  const [rows, setRows] = useState<OrganizationUsageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [range, setRange] = useState<DateRange>({ label: 'ทั้งหมด' });

  const load = async () => {
    setLoading(true);
    try {
      setRows(await ownerApi.usage({ search: search || undefined, date_from: range.date_from, date_to: range.date_to }));
    } catch {
      showError('โหลดข้อมูลการใช้งานไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  return (
    <OwnerConsoleLayout title={t('nav.owner-usage')}>
      <PageHeader
        title={t('pageTitle.ownerUsageByOrg')}
        subtitle={`ข้อมูลจริงจากฐานข้อมูล — ช่วงเวลา: ${range.label}`}
        actions={
          <>
            <Input placeholder="ค้นหาองค์กร..." value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} style={{ width: 200 }} />
            <DateRangePicker onChange={setRange} />
          </>
        }
      />

      {loading ? (
        <LoadingState card />
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <Table minWidth={760}>
            <thead>
              <tr>
                <Th>องค์กร</Th>
                <Th align="center">สถานะ</Th>
                <Th align="right">งานขนส่ง</Th>
                <Th align="right">คำแนะนำที่สร้าง</Th>
                <Th align="right">ผู้ใช้งาน</Th>
                <Th align="right">ยานพาหนะ</Th>
                <Th align="right">เส้นทาง</Th>
                <Th align="right">การส่งออกรายงาน</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.organization_id}>
                  <Td>{r.organization_name}</Td>
                  <Td align="center">
                    <StatusBadge status={r.organization_status} />
                  </Td>
                  <Td align="right">{r.job_count}</Td>
                  <Td align="right">{r.recommendation_run_count}</Td>
                  <Td align="right">{r.active_user_count}</Td>
                  <Td align="right">{r.vehicle_count}</Td>
                  <Td align="right">{r.route_count}</Td>
                  <Td align="right">{r.report_export_count}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </OwnerConsoleLayout>
  );
}
