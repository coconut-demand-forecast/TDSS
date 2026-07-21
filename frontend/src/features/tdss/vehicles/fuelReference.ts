// Mirrors backend/app/tdss/services/fuel_reference.py — same standard,
// internally-defined figures (no external Carbon API, no live pricing
// service). Used only to (a) offer a fixed dropdown of recognized fuel
// types and (b) preview the Emission Factor that will apply once a fuel
// type is selected. The backend recomputes independently and is the
// source of truth for scoring — see fuel_reference.py for full derivation
// notes and sources.

export interface FuelSpec {
  key: string;
  labelTh: string;
  unitLabel: string; // e.g. "ลิตร", "กก.", "kWh"
  kgCo2PerUnit: number;
}

export const FUEL_SPECS: Record<string, FuelSpec> = {
  diesel: { key: 'diesel', labelTh: 'ดีเซล', unitLabel: 'ลิตร', kgCo2PerUnit: 2.6765 },
  gasoline: { key: 'gasoline', labelTh: 'เบนซิน', unitLabel: 'ลิตร', kgCo2PerUnit: 2.2871 },
  gasohol_e20: { key: 'gasohol_e20', labelTh: 'แก๊สโซฮอล์ E20', unitLabel: 'ลิตร', kgCo2PerUnit: 1.8297 },
  lpg: { key: 'lpg', labelTh: 'LPG', unitLabel: 'ลิตร', kgCo2PerUnit: 1.6117 },
  ngv: { key: 'ngv', labelTh: 'NGV/CNG', unitLabel: 'กก.', kgCo2PerUnit: 2.6928 },
  electric: { key: 'electric', labelTh: 'ไฟฟ้า (EV)', unitLabel: 'kWh', kgCo2PerUnit: 0.475 },
};

export const FUEL_TYPE_OPTIONS = Object.values(FUEL_SPECS);
