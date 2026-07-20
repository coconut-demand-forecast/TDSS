"""Raw criterion calculation + min-max normalization + AHP-weighted scoring.

Six criteria (app.tdss.models.CRITERIA):
  cost, time, co2          — "cost" criteria: lower raw value is better.
  utilization, reliability,
  suitability               — "benefit" criteria: higher raw value is better.

Formulas (deterministic, no randomness, documented so a thesis reader can
verify them by hand):

  cost  = vehicle.fixed_cost + vehicle.cost_per_km * route.distance_km + route.toll_cost
  time  = route.estimated_duration_minutes
  co2   = route.distance_km * vehicle.co2_factor
  utilization  = average(weight_utilization, volume_utilization)
  reliability  = risk-level lookup {low: 0.95, medium: 0.80, high: 0.60}
  suitability  = average(route_suitability, vehicle_suitability), where:
    - route_suitability   = risk-level lookup {low: 1.0, medium: 0.75, high: 0.5},
                             minus 0.1 if the route has road restrictions (floor 0)
    - vehicle_suitability = 1.0 once utilization >= 30%, else 0.5 + utilization
                             (penalizes using an oversized vehicle for a small shipment)

Normalization is min-max across the feasible alternatives of a single
recommendation run:
  cost criteria:    normalized = (max - value) / (max - min)
  benefit criteria:  normalized = (value - min) / (max - min)
  when max == min (every alternative identical on that criterion), every
  alternative gets normalized = 1.0 for it — there is nothing to discriminate
  on, so it should not penalize anyone.
"""

from app.tdss.models import CRITERIA, Route, TransportJob, Vehicle

COST_CRITERIA = {"cost", "time", "co2"}
BENEFIT_CRITERIA = {"utilization", "reliability", "suitability"}

_RISK_RELIABILITY = {"low": 0.95, "medium": 0.80, "high": 0.60}
_RISK_SUITABILITY = {"low": 1.0, "medium": 0.75, "high": 0.5}


def raw_values(job: TransportJob, vehicle: Vehicle, route: Route) -> dict:
    weight_utilization = (job.shipment_weight_kg or 0) / vehicle.capacity_weight_kg if vehicle.capacity_weight_kg else 0
    volume_utilization = (job.shipment_volume_m3 or 0) / vehicle.capacity_volume_m3 if vehicle.capacity_volume_m3 else 0
    utilization = (weight_utilization + volume_utilization) / 2

    cost = vehicle.fixed_cost + vehicle.cost_per_km * route.distance_km + route.toll_cost
    time = float(route.estimated_duration_minutes)
    co2 = route.distance_km * vehicle.co2_factor
    reliability = _RISK_RELIABILITY.get(route.route_risk_level, 0.8)

    route_suitability = _RISK_SUITABILITY.get(route.route_risk_level, 0.75)
    if route.road_restrictions:
        route_suitability = max(0.0, route_suitability - 0.1)
    vehicle_suitability = 1.0 if utilization >= 0.3 else 0.5 + utilization
    suitability = (route_suitability + vehicle_suitability) / 2

    return {
        "cost": round(cost, 2),
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
