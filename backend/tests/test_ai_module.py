from app.tdss.services.ahp_service import default_consistent_pairwise
from tests.test_api_flow import _auth_headers, _make_job, _make_profile, _make_route, _make_vehicle, _register


def _plan_and_get_run(client, headers, org_id, vehicle_ids, route_id, profile_id, job_id):
    res = client.post(
        f"/api/tdss/organizations/{org_id}/planning/recommend",
        headers=headers,
        json={"job_id": job_id, "route_ids": [route_id], "vehicle_ids": vehicle_ids, "decision_profile_id": profile_id},
    )
    assert res.status_code == 200, res.text
    return res.json()


def test_ai_analysis_present_on_recommendation(client):
    data = _register(client, email="ai1@test.com")
    headers = _auth_headers(data["access_token"])
    org_id = data["user"]["memberships"][0]["organization_id"]

    vehicle = _make_vehicle(client, headers, org_id)
    route = _make_route(client, headers, org_id)
    profile = _make_profile(client, headers, org_id)
    job = _make_job(client, headers, org_id)

    run = _plan_and_get_run(client, headers, org_id, [vehicle["id"]], route["id"], profile["id"], job["id"])

    assert run["ai_analysis"] is not None
    assert vehicle["vehicle_code"] in run["ai_analysis"]["vehicle_reason"]
    assert route["route_code"] in run["ai_analysis"]["route_reason"]
    assert isinstance(run["ai_analysis"]["strengths"], list) and len(run["ai_analysis"]["strengths"]) > 0
    assert isinstance(run["ai_analysis"]["cautions"], list)


def test_decision_event_logged_and_insights_reflect_override(client):
    data = _register(client, email="ai2@test.com")
    headers = _auth_headers(data["access_token"])
    org_id = data["user"]["memberships"][0]["organization_id"]

    v1 = _make_vehicle(client, headers, org_id, code="V1")
    v2 = _make_vehicle(client, headers, org_id, code="V2")
    client.put(
        f"/api/tdss/organizations/{org_id}/vehicles/{v2['id']}",
        headers=headers,
        json={
            **{k: v2[k] for k in ("vehicle_code", "registration_number", "vehicle_type", "capacity_weight_kg", "capacity_volume_m3", "fuel_type", "fuel_consumption_km_per_liter", "co2_factor")},
            "cost_per_km": 100,
            "fixed_cost": 2000,
        },
    )
    route = _make_route(client, headers, org_id)
    profile = _make_profile(client, headers, org_id)
    job = _make_job(client, headers, org_id)

    run = _plan_and_get_run(client, headers, org_id, [v1["id"], v2["id"]], route["id"], profile["id"], job["id"])
    top = next(a for a in run["alternatives"] if a["rank"] == 1)
    lower_ranked = next(a for a in run["alternatives"] if a["rank"] == 2)

    # Insights before any approval: no decisions yet.
    res = client.get(f"/api/tdss/organizations/{org_id}/ai-insights", headers=headers)
    assert res.status_code == 200, res.text
    assert res.json()["total_decisions"] == 0

    # Override: pick the lower-ranked alternative (requires a reason).
    res = client.post(
        f"/api/tdss/organizations/{org_id}/recommendations/{run['id']}/select",
        headers=headers,
        json={"alternative_id": lower_ranked["id"], "reason": "Preferred vehicle for fragile cargo"},
    )
    assert res.status_code == 200, res.text

    res = client.get(f"/api/tdss/organizations/{org_id}/ai-insights", headers=headers)
    insights = res.json()
    assert insights["total_decisions"] == 1
    assert insights["match_rate_pct"] == 0.0  # the one decision was an override
    assert insights["most_overridden_vehicle"]["vehicle_code"] == top["vehicle_code"]

    # Dataset PDF export (org_admin only) should succeed and be a real PDF.
    res = client.get(f"/api/tdss/organizations/{org_id}/ai-insights/dataset.pdf", headers=headers)
    assert res.status_code == 200
    assert res.headers["content-type"] == "application/pdf"
    assert res.content.startswith(b"%PDF-")


def test_match_rate_100_pct_when_top_pick_always_followed(client):
    data = _register(client, email="ai3@test.com")
    headers = _auth_headers(data["access_token"])
    org_id = data["user"]["memberships"][0]["organization_id"]

    vehicle = _make_vehicle(client, headers, org_id)
    route = _make_route(client, headers, org_id)
    profile = _make_profile(client, headers, org_id)
    job = _make_job(client, headers, org_id)

    run = _plan_and_get_run(client, headers, org_id, [vehicle["id"]], route["id"], profile["id"], job["id"])
    top = run["alternatives"][0]

    res = client.post(
        f"/api/tdss/organizations/{org_id}/recommendations/{run['id']}/select",
        headers=headers,
        json={"alternative_id": top["id"]},
    )
    assert res.status_code == 200, res.text

    res = client.get(f"/api/tdss/organizations/{org_id}/ai-insights", headers=headers)
    insights = res.json()
    assert insights["total_decisions"] == 1
    assert insights["match_rate_pct"] == 100.0
    assert insights["most_overridden_vehicle"] is None
