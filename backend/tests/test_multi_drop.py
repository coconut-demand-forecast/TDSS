from tests.test_api_flow import _auth_headers, _make_job, _make_profile, _make_route, _make_vehicle, _register


def test_recommendation_reflects_multi_drop_cost_and_time(client):
    data = _register(client, email="multidrop@test.com")
    headers = _auth_headers(data["access_token"])
    org_id = data["user"]["memberships"][0]["organization_id"]

    settings_res = client.put(
        f"/api/tdss/organizations/{org_id}/settings",
        headers=headers,
        json={
            "default_route_mode": "manual",
            "notify_on_recommendation_completed": True,
            "notify_on_job_approved": True,
            "avg_stop_time_minutes": 30,
            "avg_stop_cost": 100,
        },
    )
    assert settings_res.status_code == 200

    vehicle = _make_vehicle(client, headers, org_id)  # cost_per_km=15, fixed_cost=500
    route = _make_route(client, headers, org_id)  # distance_km=100, estimated_duration_minutes=120, toll_cost=50
    profile = _make_profile(client, headers, org_id)
    job = _make_job(client, headers, org_id)  # default number_of_stops=1

    update_res = client.put(f"/api/tdss/organizations/{org_id}/jobs/{job['id']}", headers=headers, json={"number_of_stops": 4})
    assert update_res.status_code == 200
    assert update_res.json()["number_of_stops"] == 4

    res = client.post(
        f"/api/tdss/organizations/{org_id}/planning/recommend",
        headers=headers,
        json={"job_id": job["id"], "route_ids": [route["id"]], "vehicle_ids": [vehicle["id"]], "decision_profile_id": profile["id"]},
    )
    assert res.status_code == 200, res.text
    alt = res.json()["alternatives"][0]

    # base cost = 500 (fixed) + 15*100 (flat-rate, no fuel data on _make_vehicle) + 50 (toll) = 2050
    # + 3 extra stops * 100 = 2350
    assert alt["cost"] == 500 + 15 * 100 + 50 + 3 * 100
    # base time = 120 minutes; + 3 extra stops * 30 = 210
    assert alt["duration_minutes"] == 210
    # The displayed duration must match what raw_values actually scored with (same invariant checked here at the API layer).
    assert alt["raw_values"]["time"] == alt["duration_minutes"]


def test_recommendation_unaffected_for_single_stop_job(client):
    data = _register(client, email="singledrop@test.com")
    headers = _auth_headers(data["access_token"])
    org_id = data["user"]["memberships"][0]["organization_id"]

    vehicle = _make_vehicle(client, headers, org_id)
    route = _make_route(client, headers, org_id)
    profile = _make_profile(client, headers, org_id)
    job = _make_job(client, headers, org_id)  # number_of_stops defaults to 1

    res = client.post(
        f"/api/tdss/organizations/{org_id}/planning/recommend",
        headers=headers,
        json={"job_id": job["id"], "route_ids": [route["id"]], "vehicle_ids": [vehicle["id"]], "decision_profile_id": profile["id"]},
    )
    alt = res.json()["alternatives"][0]
    assert alt["cost"] == 500 + 15 * 100 + 50  # 2000, no stop penalty
    assert alt["duration_minutes"] == 120  # bare route duration, no stop penalty
