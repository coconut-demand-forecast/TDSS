// Convenience defaults for the "Add Vehicle" form — selecting a vehicle
// type prefills typical capacity/consumption figures so users don't have
// to look them up, but every field stays editable afterward. These numbers
// mirror the demo fleet in backend/app/tdss/seed.py for internal
// consistency; they are starting points, not authoritative specs.

export interface VehicleTypePreset {
  key: string;
  labelTh: string;
  capacityWeightKg: number;
  capacityVolumeM3: number;
  fuelConsumptionKmPerLiter: number;
}

export const CUSTOM_VEHICLE_TYPE = '__custom__';

export const VEHICLE_TYPE_PRESETS: VehicleTypePreset[] = [
  { key: 'pickup', labelTh: 'รถกระบะ', capacityWeightKg: 1500, capacityVolumeM3: 6, fuelConsumptionKmPerLiter: 14 },
  { key: 'truck4', labelTh: 'รถบรรทุก 4 ล้อ', capacityWeightKg: 3500, capacityVolumeM3: 12, fuelConsumptionKmPerLiter: 10 },
  { key: 'truck6', labelTh: 'รถบรรทุก 6 ล้อ', capacityWeightKg: 5000, capacityVolumeM3: 20, fuelConsumptionKmPerLiter: 8 },
  { key: 'truck10', labelTh: 'รถบรรทุก 10 ล้อ', capacityWeightKg: 12000, capacityVolumeM3: 40, fuelConsumptionKmPerLiter: 5 },
  { key: 'trailer', labelTh: 'รถพ่วง', capacityWeightKg: 25000, capacityVolumeM3: 60, fuelConsumptionKmPerLiter: 3.5 },
];

// Rough Thai-market reference prices (baht per fuel unit) used only to
// prefill fuel_cost_per_unit the first time a fuel type is selected — NOT
// a live price feed. Always editable; users should adjust to their actual
// purchase price.
export const DEFAULT_FUEL_COST_PER_UNIT: Record<string, number> = {
  diesel: 32,
  gasoline: 36,
  gasohol_e20: 34,
  lpg: 24,
  ngv: 18,
  electric: 4.5,
};
