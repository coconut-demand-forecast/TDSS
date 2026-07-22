import { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '../../../context/LanguageContext';
import OrgWorkspaceLayout from '../../../layouts/OrgWorkspaceLayout';
import { Button, Card, Dialog, EmptyState, Field, Input, LoadingState, PageHeader, StatusBadge, Table, Td, Th } from '../../../components/ui';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import { productsApi, type Product } from '../../../api';

const EMPTY_FORM = {
  sku: '',
  product_name: '',
  unit: '',
  weight_per_unit_kg: '',
  width_cm: '',
  length_cm: '',
  height_cm: '',
};

export default function ProductsPage() {
  const { t } = useLanguage();
  const { currentOrgId, user } = useAuth();
  const { showSuccess, showError } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const membership = user?.memberships.find((m) => m.organization_id === currentOrgId);
  const canWrite = user?.is_system_owner || membership?.role === 'org_admin' || membership?.role === 'planner';

  const previewVolume = useMemo(() => {
    const w = Number(form.width_cm);
    const l = Number(form.length_cm);
    const h = Number(form.height_cm);
    if (!w || !l || !h) return null;
    return (w * l * h) / 1_000_000;
  }, [form.width_cm, form.length_cm, form.height_cm]);

  const load = async () => {
    if (!currentOrgId) return;
    setLoading(true);
    try {
      setProducts(await productsApi.list(currentOrgId, { search: search || undefined }));
    } catch {
      showError('โหลดข้อมูลสินค้าไม่สำเร็จ');
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

  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({
      sku: p.sku,
      product_name: p.product_name,
      unit: p.unit,
      weight_per_unit_kg: String(p.weight_per_unit_kg),
      width_cm: String(p.width_cm),
      length_cm: String(p.length_cm),
      height_cm: String(p.height_cm),
    });
    setShowForm(true);
  };

  const submit = async () => {
    if (!currentOrgId) return;
    if (!form.sku || !form.product_name || !form.unit || !form.weight_per_unit_kg || !form.width_cm || !form.length_cm || !form.height_cm) {
      showError('กรุณากรอกข้อมูลที่จำเป็นให้ครบ (มีเครื่องหมาย *)');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        sku: form.sku,
        product_name: form.product_name,
        unit: form.unit,
        weight_per_unit_kg: Number(form.weight_per_unit_kg),
        width_cm: Number(form.width_cm),
        length_cm: Number(form.length_cm),
        height_cm: Number(form.height_cm),
      };
      if (editing) {
        await productsApi.update(currentOrgId, editing.id, payload);
        showSuccess('แก้ไขสินค้าสำเร็จ');
      } else {
        await productsApi.create(currentOrgId, payload);
        showSuccess('เพิ่มสินค้าสำเร็จ');
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

  const toggleStatus = async (p: Product) => {
    if (!currentOrgId) return;
    try {
      if (p.status === 'active') await productsApi.deactivate(currentOrgId, p.id);
      else await productsApi.activate(currentOrgId, p.id);
      showSuccess('อัปเดตสถานะแล้ว');
      await load();
    } catch {
      showError('อัปเดตสถานะไม่สำเร็จ');
    }
  };

  const remove = async (p: Product) => {
    if (!currentOrgId) return;
    try {
      await productsApi.remove(currentOrgId, p.id);
      showSuccess('ลบสินค้าแล้ว');
      await load();
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      showError(typeof detail === 'string' ? detail : 'ลบสินค้าไม่สำเร็จ — สินค้านี้อาจถูกใช้ในงานขนส่งอยู่ ให้ปิดใช้งานแทน');
    }
  };

  return (
    <OrgWorkspaceLayout title={t('nav.products')}>
      <PageHeader
        title={t('nav.products')}
        subtitle="จัดการข้อมูลสินค้า (SKU) สำหรับใช้เลือกในงานขนส่ง"
        actions={
          <>
            <Input placeholder="ค้นหา SKU หรือชื่อสินค้า..." value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load()} style={{ width: 220 }} />
            {canWrite && <Button onClick={openCreate}>+ เพิ่มสินค้า</Button>}
          </>
        }
      />

      {loading ? (
        <LoadingState card />
      ) : products.length === 0 ? (
        <EmptyState message="ยังไม่มีข้อมูลสินค้า" action={canWrite && <Button onClick={openCreate}>+ เพิ่มสินค้าแรก</Button>} />
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <Table>
            <thead>
              <tr>
                <Th>SKU</Th>
                <Th>ชื่อสินค้า</Th>
                <Th>หน่วยนับ</Th>
                <Th align="right">น้ำหนัก/หน่วย</Th>
                <Th align="right">ขนาด (ก×ย×ส ซม.)</Th>
                <Th align="right">ปริมาตร/หน่วย</Th>
                <Th align="center">สถานะ</Th>
                {canWrite && <Th align="center"></Th>}
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <Td>{p.sku}</Td>
                  <Td>{p.product_name}</Td>
                  <Td>{p.unit}</Td>
                  <Td align="right">{p.weight_per_unit_kg.toLocaleString()} กก.</Td>
                  <Td align="right">
                    {p.width_cm} × {p.length_cm} × {p.height_cm}
                  </Td>
                  <Td align="right">{p.volume_per_unit_m3.toLocaleString(undefined, { maximumFractionDigits: 6 })} ลบ.ม.</Td>
                  <Td align="center">
                    <StatusBadge status={p.status} />
                  </Td>
                  {canWrite && (
                    <Td align="center">
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                        <Button size="sm" variant="secondary" onClick={() => openEdit(p)}>
                          แก้ไข
                        </Button>
                        <Button size="sm" variant={p.status === 'active' ? 'danger' : 'secondary'} onClick={() => toggleStatus(p)}>
                          {p.status === 'active' ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => remove(p)}>
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
        <Dialog title={editing ? 'แก้ไขสินค้า' : 'เพิ่มสินค้า'} onClose={() => setShowForm(false)}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label="รหัสสินค้า (SKU)" required>
              <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
            </Field>
            <Field label="ชื่อสินค้า" required>
              <Input value={form.product_name} onChange={(e) => setForm({ ...form, product_name: e.target.value })} />
            </Field>
            <Field label="หน่วยนับ" required>
              <Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="เช่น ชิ้น, กล่อง, พาเลท" />
            </Field>
            <Field label="น้ำหนักต่อหน่วย (กก.)" required>
              <Input type="number" value={form.weight_per_unit_kg} onChange={(e) => setForm({ ...form, weight_per_unit_kg: e.target.value })} />
            </Field>
            <Field label="กว้าง (ซม.)" required>
              <Input type="number" value={form.width_cm} onChange={(e) => setForm({ ...form, width_cm: e.target.value })} />
            </Field>
            <Field label="ยาว (ซม.)" required>
              <Input type="number" value={form.length_cm} onChange={(e) => setForm({ ...form, length_cm: e.target.value })} />
            </Field>
            <Field label="สูง (ซม.)" required>
              <Input type="number" value={form.height_cm} onChange={(e) => setForm({ ...form, height_cm: e.target.value })} />
            </Field>
            <Field label="ปริมาตร (คำนวณอัตโนมัติ)">
              <Input readOnly value={previewVolume != null ? `${previewVolume.toLocaleString(undefined, { maximumFractionDigits: 6 })} ลบ.ม.` : '— กรอกขนาดก่อน —'} style={{ background: '#f6f7f8', color: 'var(--c-text-muted)', cursor: 'not-allowed' }} />
            </Field>
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
