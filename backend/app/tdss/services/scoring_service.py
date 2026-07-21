"""Raw criterion calculation + min-max normalization + AHP-weighted scoring.

Six criteria (app.tdss.models.CRITERIA):
  cost, time, co2          — "cost" criteria: lower raw value is better.
  utilization, reliability,
  suitability               — "benefit" criteria: higher raw value is better.

Formulas (deterministic, no randomness, documented so a thesis reader can
verify them by hand):

  cost  = vehicle.fixed_cost + fuel_cost_component + route.toll_cost
  time  = route.estimated_duration_minutes
  co2   = fuel_co2_component
  utilization  = average(weight_utilization, volume_utilization)
  reliability  = risk-level lookup {low: 0.95, medium: 0.80, high: 0.60}
  suitability  = average(route_suitability, vehicle_suitability), where:
    - route_suitability   = risk-level lookup {low: 1.0, medium: 0.75, high: 0.5},
                             minus 0.1 if the route has road restrictions (floor 0)
    - vehicle_suitability = 1.0 once utilization >= 30%, else 0.5 + utilization
                             (penalizes using an oversized vehicle for a small shipment)

fuel_cost_component / fuel_co2_component (see fuel_based_transport_calc()):
  Used only when the vehicle has a *recognized* fuel_type (via
  fuel_reference.normalize_fuel_type) AND fuel_consumption_km_per_liter > 0
  AND fuel_cost_per_unit > 0 — all three required, otherwise this module
  falls back to the original flat-rate formula:
      fuel_cost_component = vehicle.cost_per_km * route.distance_km
      fuel_co2_component   = route.distance_km * vehicle.co2_factor
  This keeps any vehicle that hasn't been given fuel data scoring exactly
  as it did before this feature existed.

Normalization is min-max across the feasible alternatives of a single
recommendation run:
  cost criteria:    normalized = (max - value) / (max - min)
  benefit criteria:  normalized = (value - min) / (max - min)
  when max == min (every alternative identical on that criterion), every
  alternative gets normalized = 1.0 for it — there is nothing to discriminate
  on, so it should not penalize anyone.
"""

from app.tdss.models import CRITERIA, Route, TransportJob, Vehicle
from app.tdss.services.fuel_reference import get_fuel_spec

COST_CRITERIA = {"cost", "time", "co2"}
BENEFIT_CRITERIA = {"utilization", "reliability", "suitability"}

_RISK_RELIABILITY = {"low": 0.95, "medium": 0.80, "high": 0.60}
_RISK_SUITABILITY = {"low": 1.0, "medium": 0.75, "high": 0.5}


def fuel_based_transport_calc(vehicle: Vehicle, distance_km: float) -> dict | None:
    """Returns the fuel-based cost/CO2 breakdown, or None if the vehicle is
    missing any of the three required inputs (recognized fuel_type, a
    positive consumption rate, a positive fuel price) — callers must treat
    None as "use the legacy flat-rate formula instead", never as an error.
    Also guards against division-by-zero: consumption/cost must be > 0."""
    spec = get_fuel_spec(vehicle.fuel_type)
    if spec is None:
        return None
    consumption = vehicle.fuel_consumption_km_per_liter
    fuel_cost_per_unit = vehicle.fuel_cost_per_unit
    if not consumption or consumption <= 0:
        return None
    if not fuel_cost_per_unit or fuel_cost_per_unit <= 0:
        return None

    fuel_units_used = distance_km / consumption
    fuel_cost = fuel_units_used * fuel_cost_per_unit
    co2_emission = fuel_units_used * spec.kg_co2_per_unit

    return {
        "fuel_type": spec.key,
        "fuel_unit_label": spec.unit_label,
        "fuel_units_used": round(fuel_units_used, 4),
        "fuel_cost": round(fuel_cost, 2),
        "co2_emission": round(co2_emission, 3),
    }


def raw_values(job: TransportJob, vehicle: Vehicle, route: Route) -> dict:
    weight_utilization = (job.shipment_weight_kg or 0) / vehicle.capacity_weight_kg if vehicle.capacity_weight_kg else 0
    volume_utilization = (job.shipment_volume_m3 or 0) / vehicle.capacity_volume_m3 if vehicle.capacity_volume_m3 else 0
    utilization = (weight_utilization + volume_utilization) / 2

    fuel_calc = fuel_based_transport_calc(vehicle, route.distance_km)
    if fuel_calc is not None:
        fuel_cost_component = fuel_calc["fuel_cost"]
        co2 = fuel_calc["co2_emission"]
    else:
        fuel_cost_component = vehicle.cost_per_km * route.distance_km
        co2 = route.distance_km * vehicle.co2_factor

    total_transport_cost = vehicle.fixed_cost + fuel_cost_component + route.toll_cost
    time = float(route.estimated_duration_minutes)
    reliability = _RISK_RELIABILITY.get(route.route_risk_level, 0.8)

    route_suitability = _RISK_SUITABILITY.get(route.route_risk_level, 0.75)
    if route.road_restrictions:
        route_suitability = max(0.0, route_suitability - 0.1)
    vehicle_suitability = 1.0 if utilization >= 0.3 else 0.5 + utilization
    suitability = (route_suitability + vehicle_suitability) / 2

    # NOTE: raw_values() intentionally keeps the exact same key set it has
    # always had (cost, time, co2, utilization, reliability, suitability,
    # weight_utilization, volume_utilization) — this dict is stored verbatim
    # in RecommendationAlternative.raw_values and gets flattened into extra
    # PDF/CSV columns via the AI Learning dataset export, so adding more
    # keys here would widen every future dataset row. The fuel breakdown
    # (fuel_units_used, fuel_cost, total_transport_cost, co2_emission) is
    # still fully available — for tests, and for explaining results in the
    # thesis — by calling fuel_based_transport_calc() directly; see
    # tests/test_scoring_service.py.
    return {
        "cost": round(total_transport_cost, 2),
        "time": round(time, 2),
        "co2": round(co2, 3),
        "utilization": round(utilization, 4),
        "reliability": round(reliability, 4),
        "suitability": round(suitability, 4),
        # extra display-only fields, not scored directly
        "weight_utilization": round(weight_utilization, 4),
        "volume_utilization": round(volume_utilization, 4),
    }


def normalize_across(all_raw: list[dict]) -> list[dict]:
    """all_raw: list of raw_values() dicts (one per feasible alternative).
    Returns a parallel list of {criterion: normalized_0_to_1}."""
    if not all_raw:
        return []

    bounds = {}
    for c in CRITERIA:
        values = [r[c] for r in all_raw]
        bounds[c] = (min(values), max(values))

    normalized_list = []
    for r in all_raw:
        normalized = {}
        for c in CRITERIA:
            lo, hi = bounds[c]
            if hi == lo:
                normalized[c] = 1.0
            elif c in COST_CRITERIA:
                normalized[c] = round((hi - r[c]) / (hi - lo), 6)
            else:
                normalized[c] = round((r[c] - lo) / (hi - lo), 6)
        normalized_list.append(normalized)
    return normalized_list


def weighted_score(normalized: dict, weights: dict) -> tuple[dict, float]:
    weighted = {c: round(normalized[c] * weights[c], 6) for c in CRITERIA}
    total = round(sum(weighted.values()), 6)
    return weighted, total
