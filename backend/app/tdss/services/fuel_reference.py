"""Standard fuel reference data used to derive Transport Cost and CO2
Emission from real fuel economics — no external Carbon API, no live
pricing service. Every constant below is either a widely-published IPCC
default or an explicit, documented conversion from one; nothing here is
invented. All figures should be re-verified against the primary documents
(cited per constant) before being cited as-is in a published thesis.

--------------------------------------------------------------------------
Methodology for combustion fuels (diesel, gasoline, gasohol E20, LPG, NGV)
--------------------------------------------------------------------------
IPCC 2006 Guidelines for National Greenhouse Gas Inventories, Volume 2
(Energy), Chapter 1, Table 1.4 gives default CO2 emission factors on an
energy basis (kg CO2 / TJ, net calorific value). Volume 1 gives default
net calorific values (NCV, TJ/Gg) for each fuel. Neither is directly a
"kg CO2 per litre" figure — that requires two conversions:

    kg CO2 per kg fuel   = NCV[TJ/Gg] * EF[kg CO2/TJ] / 1,000,000
    kg CO2 per litre     = (kg CO2 per kg fuel) * density[kg/L]

The 1,000,000 divides out because 1 Gg = 1,000,000 kg. Density is not an
IPCC/emissions figure — it's a standard physical property of the fuel,
needed only to convert the mass-basis result into a volume-basis one
because vehicles are usually filled by volume (litres), not mass.

This module stores the IPCC (EF, NCV) pair and the density assumption
separately for each fuel, and derives kg_co2_per_unit at import time —
so the derivation is auditable and reproducible, not just a bare number.
"""

import datetime as dt

# ---------------------------------------------------------------------------
# IPCC 2006 Vol. 2 Ch. 1 Table 1.4 default CO2 emission factors (kg CO2/TJ)
# and IPCC 2006 Vol. 1 default net calorific values (TJ/Gg). These are the
# commonly-published IPCC 2006 default values reproduced across national
# GHG inventories worldwide — verify against the primary IPCC document
# before citing directly in a thesis.
# ---------------------------------------------------------------------------
_IPCC_EF_KG_PER_TJ = {
    "diesel": 74_100,  # Gas/Diesel oil
    "gasoline": 69_300,  # Motor gasoline
    "lpg": 63_100,
    "ngv": 56_100,  # Natural gas, mass basis
}
_IPCC_NCV_TJ_PER_GG = {
    "diesel": 43.0,
    "gasoline": 44.3,
    "lpg": 47.3,
    "ngv": 48.0,
}
# Typical physical densities (kg/L) — NOT an emissions figure, only used to
# convert the IPCC mass-basis result into a volume-basis (per-litre) one.
_DENSITY_KG_PER_LITRE = {
    "diesel": 0.84,
    "gasoline": 0.745,
    "lpg": 0.54,
}


def _kg_co2_per_kg(fuel: str) -> float:
    return _IPCC_NCV_TJ_PER_GG[fuel] * _IPCC_EF_KG_PER_TJ[fuel] / 1_000_000


def _kg_co2_per_litre(fuel: str) -> float:
    return round(_kg_co2_per_kg(fuel) * _DENSITY_KG_PER_LITRE[fuel], 4)


_DIESEL_KG_CO2_PER_LITRE = _kg_co2_per_litre("diesel")  # ≈ 2.68
_GASOLINE_KG_CO2_PER_LITRE = _kg_co2_per_litre("gasoline")  # ≈ 2.29
_LPG_KG_CO2_PER_LITRE = _kg_co2_per_litre("lpg")  # ≈ 1.61
_NGV_KG_CO2_PER_KG = round(_kg_co2_per_kg("ngv"), 4)  # ≈ 2.69 (NGV sold/consumed by kg, not litre)

# ---------------------------------------------------------------------------
# Gasohol E20 (20% ethanol / 80% gasoline by volume): under IPCC 2006
# methodology, CO2 from combusting the biofuel (ethanol) portion is
# "biogenic" — carbon recently absorbed from the atmosphere by the
# feedstock crop — and is excluded from the fossil-fuel CO2 total in
# national inventories (reported as a separate memo item, not summed in).
# This module follows that same convention: only the fossil (gasoline)
# volume fraction contributes to the emission factor below.
#   EF(E20) = fraction_gasoline * EF(gasoline, per litre) + fraction_ethanol * 0
# ---------------------------------------------------------------------------
_E20_GASOLINE_FRACTION = 0.80
_E20_ETHANOL_FRACTION = 0.20
_E20_KG_CO2_PER_LITRE = round(_GASOLINE_KG_CO2_PER_LITRE * _E20_GASOLINE_FRACTION, 4)

# ---------------------------------------------------------------------------
# Electricity (EV): NOT a combustion emission factor — this is a *grid*
# emission factor (kg CO2e per kWh consumed), which depends on the
# electricity generation mix of the country and year, published
# periodically by Thailand's TGO (Thailand Greenhouse Gas Management
# Organization). Value below is what was publicly reported as TGO's
# Scope 2 grid emission factor effective 2026-01-01 (0.4750 kgCO2e/kWh),
# found via a secondary news source, not TGO's primary document directly.
#
# ACTION REQUIRED before citing in the thesis: confirm this figure
# against TGO's official published Grid Emission Factor report
# (https://ghgreduction.tgo.or.th) for the exact year being studied, and
# update ELECTRICITY_GRID_EF_SOURCE / ELECTRICITY_GRID_EF_YEAR below.
# Treat this as an adjustable placeholder until then.
# ---------------------------------------------------------------------------
ELECTRICITY_GRID_KG_CO2_PER_KWH = 0.4750
ELECTRICITY_GRID_EF_YEAR = 2026
ELECTRICITY_GRID_EF_SOURCE = (
    "TGO (Thailand Greenhouse Gas Management Organization) Scope 2 grid emission factor, "
    "reported effective 2026-01-01 — via secondary source, NOT yet cross-checked against "
    "TGO's primary published report. Verify before formal citation."
)


class FuelSpec:
    def __init__(self, key: str, label_th: str, unit_label: str, kg_co2_per_unit: float, source: str):
        self.key = key
        self.label_th = label_th
        self.unit_label = unit_label  # e.g. "ลิตร", "กก.", "kWh"
        self.kg_co2_per_unit = kg_co2_per_unit
        self.source = source


FUEL_SPECS: dict[str, FuelSpec] = {
    "diesel": FuelSpec(
        "diesel", "ดีเซล", "ลิตร", _DIESEL_KG_CO2_PER_LITRE,
        "IPCC 2006 Vol.2 Table 1.4 (EF=74,100 kgCO2/TJ) x Vol.1 NCV (43.0 TJ/Gg) x density 0.84 kg/L",
    ),
    "gasoline": FuelSpec(
        "gasoline", "เบนซิน", "ลิตร", _GASOLINE_KG_CO2_PER_LITRE,
        "IPCC 2006 Vol.2 Table 1.4 (EF=69,300 kgCO2/TJ) x Vol.1 NCV (44.3 TJ/Gg) x density 0.745 kg/L",
    ),
    "gasohol_e20": FuelSpec(
        "gasohol_e20", "แก๊สโซฮอล์ E20", "ลิตร", _E20_KG_CO2_PER_LITRE,
        f"{int(_E20_GASOLINE_FRACTION * 100)}% gasoline (fossil, counted) + "
        f"{int(_E20_ETHANOL_FRACTION * 100)}% ethanol (biogenic, excluded per IPCC 2006 convention) "
        "by volume; fossil fraction x gasoline EF above",
    ),
    "lpg": FuelSpec(
        "lpg", "LPG", "ลิตร", _LPG_KG_CO2_PER_LITRE,
        "IPCC 2006 Vol.2 Table 1.4 (EF=63,100 kgCO2/TJ) x Vol.1 NCV (47.3 TJ/Gg) x density 0.54 kg/L",
    ),
    "ngv": FuelSpec(
        "ngv", "NGV/CNG", "กก.", _NGV_KG_CO2_PER_KG,
        "IPCC 2006 Vol.2 Table 1.4 (EF=56,100 kgCO2/TJ) x Vol.1 NCV (48.0 TJ/Gg, mass basis) — no density conversion, NGV sold by mass",
    ),
    "electric": FuelSpec(
        "electric", "ไฟฟ้า (EV)", "kWh", ELECTRICITY_GRID_KG_CO2_PER_KWH, ELECTRICITY_GRID_EF_SOURCE
    ),
}

FUEL_TYPE_KEYS = list(FUEL_SPECS.keys())

# ---------------------------------------------------------------------------
# Normalization: existing data (and any future free-text entry) may contain
# "diesel", "Diesel", "ดีเซล", etc. This maps every known spelling/case
# variant to the canonical key above. Anything NOT recognized returns None
# — callers must treat that as "use the legacy fallback formula", never as
# an error, so old rows/any API caller sending an unrecognized value never
# breaks.
# ---------------------------------------------------------------------------
_FUEL_TYPE_ALIASES: dict[str, str] = {
    "diesel": "diesel",
    "ดีเซล": "diesel",
    "gasoline": "gasoline",
    "petrol": "gasoline",
    "เบนซิน": "gasoline",
    "แก๊สโซลีน": "gasoline",
    "gasohol": "gasohol_e20",
    "gasohol_e20": "gasohol_e20",
    "gasohol e20": "gasohol_e20",
    "e20": "gasohol_e20",
    "แก๊สโซฮอล์": "gasohol_e20",
    "แก๊สโซฮอล์e20": "gasohol_e20",
    "แก๊สโซฮอล์ e20": "gasohol_e20",
    "lpg": "lpg",
    "แอลพีจี": "lpg",
    "ngv": "ngv",
    "cng": "ngv",
    "เอ็นจีวี": "ngv",
    "electric": "electric",
    "ev": "electric",
    "ไฟฟ้า": "electric",
}


def normalize_fuel_type(raw: str | None) -> str | None:
    """Returns a canonical FUEL_SPECS key, or None if `raw` is empty/unrecognized.
    None is not an error — it signals "use the legacy fallback formula"."""
    if not raw:
        return None
    key = raw.strip().lower()
    return _FUEL_TYPE_ALIASES.get(key)


def get_fuel_spec(fuel_type: str | None) -> FuelSpec | None:
    key = normalize_fuel_type(fuel_type)
    return FUEL_SPECS.get(key) if key else None
