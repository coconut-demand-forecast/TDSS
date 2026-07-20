from app.tdss.services.scoring_service import normalize_across, raw_values, weighted_score
from tests.conftest import make_job, make_route, make_vehicle


def test_raw_values_utilization_and_cost():
    job = make_job(shipment_weight_kg=2500, shipment_volume_m3=10)
    vehicle = make_vehicle(capacity_weight_kg=5000, capacity_volume_m3=20, cost_per_km=15, fixed_cost=500)
    route = make_route(distance_km=100, toll_cost=50)

    raw = raw_values(job, vehicle, route)
    assert raw["weight_utilization"] == 0.5
    assert raw["volume_utilization"] == 0.5
    assert raw["utilization"] == 0.5
    assert raw["cost"] == 500 + 15 * 100 + 50  # 2050


def test_normalize_cost_criterion_favors_lower_value():
    cheap = raw_values(make_job(), make_vehicle(cost_per_km=5), make_route())
    expensive = raw_values(make_job(), make_vehicle(cost_per_km=50), make_route())

    normalized = normalize_across([cheap, expensive])
    assert normalized[0]["cost"] == 1.0  # cheapest gets full score
    assert normalized[1]["cost"] == 0.0  # most expensive gets zero


def test_normalize_identical_values_gives_full_score_to_all():
    a = raw_values(make_job(), make_vehicle(), make_route())
    b = raw_values(make_job(), make_vehicle(), make_route())
    normalized = normalize_across([a, b])
    assert normalized[0]["cost"] == 1.0
    assert normalized[1]["cost"] == 1.0


def test_weighted_score_sums_to_expected():
    normalized = {"cost": 1.0, "time": 0.5, "utilization": 0.8, "reliability": 0.9, "co2": 0.6, "suitability": 0.7}
    weights = {"cost": 0.3, "time": 0.2, "utilization": 0.2, "reliability": 0.1, "co2": 0.1, "suitability": 0.1}
    weighted, total = weighted_score(normalized, weights)
    expected_total = sum(normalized[c] * weights[c] for c in normalized)
    assert abs(total - expected_total) < 1e-9
