from app.tdss.services.fuel_reference import FUEL_SPECS, get_fuel_spec, normalize_fuel_type
from app.tdss.services.scoring_service import fuel_based_transport_calc, raw_values
from tests.conftest import make_job, make_route, make_vehicle


# ---------------------------------------------------------------------------
# normalize_fuel_type() — old/varied spellings must resolve to the same
# canonical key, and anything unrecognized must return None (never raise).
# ---------------------------------------------------------------------------
def test_normalize_fuel_type_handles_old_and_varied_spellings():
    assert normalize_fuel_type("diesel") == "diesel"
    assert normalize_fuel_type("Diesel") == "diesel"
    assert normalize_fuel_type("DIESEL") == "diesel"
    assert normalize_fuel_type("ดีเซล") == "diesel"
    assert normalize_fuel_type("ev") == "electric"
    assert normalize_fuel_type("ไฟฟ้า") == "electric"
    assert normalize_fuel_type("cng") == "ngv"


def test_normalize_fuel_type_returns_none_for_unrecognized_or_empty():
    assert normalize_fuel_type("some_unknown_fuel_xyz") is None
    assert normalize_fuel_type("") is None
    assert normalize_fuel_type(None) is None
    assert get_fuel_spec("some_unknown_fuel_xyz") is None


# ---------------------------------------------------------------------------
# fuel_based_transport_calc() — hand-verifiable per fuel type
# ---------------------------------------------------------------------------
def test_diesel_calculation_matches_hand_calculation():
    vehicle = make_vehicle(fuel_type="diesel", fuel_consumption_km_per_liter=10, fuel_cost_per_unit=32)
    result = fuel_based_transport_calc(vehicle, distance_km=100)

    assert result is not None
    assert result["fuel_units_used"] == 10.0  # 100 km / 10 km-per-litre
    assert result["fuel_cost"] == 320.0  # 10 litres * 32 baht/litre
    expected_co2 = round(10.0 * FUEL_SPECS["diesel"].kg_co2_per_unit, 3)
    assert result["co2_emission"] == expected_co2


def test_electric_vehicle_calculation_uses_kwh_and_grid_factor():
    vehicle = make_vehicle(fuel_type="EV", fuel_consumption_km_per_liter=5, fuel_cost_per_unit=4.5)
    result = fuel_based_transport_calc(vehicle, distance_km=200)

    assert result is not None
    assert result["fuel_unit_label"] == "kWh"
    assert result["fuel_units_used"] == 40.0  # 200 km / 5 km-per-kWh
    assert result["fuel_cost"] == 180.0  # 40 kWh * 4.5 baht/kWh
    expected_co2 = round(40.0 * FUEL_SPECS["electric"].kg_co2_per_unit, 3)
    assert result["co2_emission"] == expected_co2


def test_ngv_calculation_uses_mass_based_unit_kg():
    vehicle = make_vehicle(fuel_type="ngv", fuel_consumption_km_per_liter=15, fuel_cost_per_unit=17)
    result = fuel_based_transport_calc(vehicle, distance_km=150)

    assert result is not None
    assert result["fuel_unit_label"] == "กก."
    assert result["fuel_units_used"] == 10.0  # 150 km / 15 km-per-kg
    assert result["fuel_cost"] == 170.0  # 10 kg * 17 baht/kg
    expected_co2 = round(10.0 * FUEL_SPECS["ngv"].kg_co2_per_unit, 3)
    assert result["co2_emission"] == expected_co2


def test_gasohol_e20_emission_factor_is_80pct_of_gasoline_only():
    """Biogenic (ethanol) fraction must be excluded per IPCC 2006 convention —
    E20's factor should be exactly 80% of pure gasoline's, not an
    independently-invented number."""
    assert FUEL_SPECS["gasohol_e20"].kg_co2_per_unit == round(FUEL_SPECS["gasoline"].kg_co2_per_unit * 0.80, 4)


# ---------------------------------------------------------------------------
# Division-by-zero guards: zero/negative consumption or fuel cost must fall
# back, never raise or divide by zero.
# ---------------------------------------------------------------------------
def test_zero_or_negative_consumption_falls_back_to_none():
    vehicle = make_vehicle(fuel_type="diesel", fuel_consumption_km_per_liter=0, fuel_cost_per_unit=32)
    assert fuel_based_transport_calc(vehicle, distance_km=100) is None

    vehicle_negative = make_vehicle(fuel_type="diesel", fuel_consumption_km_per_liter=-5, fuel_cost_per_unit=32)
    assert fuel_based_transport_calc(vehicle_negative, distance_km=100) is None


def test_zero_or_negative_fuel_cost_falls_back_to_none():
    vehicle = make_vehicle(fuel_type="diesel", fuel_consumption_km_per_liter=10, fuel_cost_per_unit=0)
    assert fuel_based_transport_calc(vehicle, distance_km=100) is None

    vehicle_negative = make_vehicle(fuel_type="diesel", fuel_consumption_km_per_liter=10, fuel_cost_per_unit=-1)
    assert fuel_based_transport_calc(vehicle_negative, distance_km=100) is None


def test_unrecognized_fuel_type_falls_back_to_none_even_with_valid_numbers():
    vehicle = make_vehicle(fuel_type="some_unknown_fuel_xyz", fuel_consumption_km_per_liter=10, fuel_cost_per_unit=32)
    assert fuel_based_transport_calc(vehicle, distance_km=100) is None


def test_missing_fuel_cost_per_unit_falls_back_to_none():
    """All three (fuel_type, consumption, fuel cost) are required — having
    just two of three must still fall back, per spec."""
    vehicle = make_vehicle(fuel_type="diesel", fuel_consumption_km_per_liter=10, fuel_cost_per_unit=None)
    assert fuel_based_transport_calc(vehicle, distance_km=100) is None


# ---------------------------------------------------------------------------
# raw_values() integration: old fuel_type spelling still works; vehicles
# without complete fuel data score exactly as they did before this feature
# (the legacy flat-rate formula), proving the existing API never breaks.
# ---------------------------------------------------------------------------
def test_raw_values_uses_fuel_based_cost_and_co2_when_data_is_complete():
    job = make_job(shipment_weight_kg=1000, shipment_volume_m3=5)
    vehicle = make_vehicle(
        capacity_weight_kg=5000, capacity_volume_m3=20,
        fuel_type="Diesel", fuel_consumption_km_per_liter=10, fuel_cost_per_unit=32,
        cost_per_km=999, co2_factor=999,  # deliberately wrong legacy values — must NOT be used
    )
    route = make_route(distance_km=100, toll_cost=50)

    raw = raw_values(job, vehicle, route)
    expected_fuel_cost = (100 / 10) * 32  # 320
    expected_co2 = round((100 / 10) * FUEL_SPECS["diesel"].kg_co2_per_unit, 3)
    assert raw["cost"] == round(vehicle.fixed_cost + expected_fuel_cost + 50, 2)
    assert raw["co2"] == expected_co2


def test_raw_values_falls_back_to_legacy_formula_without_fuel_data():
    job = make_job(shipment_weight_kg=1000, shipment_volume_m3=5)
    vehicle = make_vehicle(
        capacity_weight_kg=5000, capacity_volume_m3=20,
        fuel_type=None, fuel_consumption_km_per_liter=None, fuel_cost_per_unit=None,
        cost_per_km=15, co2_factor=0.8, fixed_cost=500,
    )
    route = make_route(distance_km=100, toll_cost=50)

    raw = raw_values(job, vehicle, route)
    assert raw["cost"] == 500 + 15 * 100 + 50
    assert raw["co2"] == round(100 * 0.8, 3)


def test_raw_values_falls_back_when_fuel_data_incomplete():
    """fuel_type set but fuel_cost_per_unit missing -> must still use the
    legacy formula, not raise, and not silently use a zero fuel cost."""
    job = make_job(shipment_weight_kg=1000, shipment_volume_m3=5)
    vehicle = make_vehicle(
        capacity_weight_kg=5000, capacity_volume_m3=20,
        fuel_type="diesel", fuel_consumption_km_per_liter=10, fuel_cost_per_unit=None,
        cost_per_km=15, co2_factor=0.8, fixed_cost=500,
    )
    route = make_route(distance_km=100, toll_cost=50)

    raw = raw_values(job, vehicle, route)
    assert raw["cost"] == 500 + 15 * 100 + 50
    assert raw["co2"] == round(100 * 0.8, 3)
