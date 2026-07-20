from app.tdss.services.ahp_service import default_consistent_pairwise


def _register(client, email="admin1@test.com", org="Org One"):
    res = client.post(
        "/api/tdss/auth/register",
        json={"name": "Admin One", "email": email, "password": "password123", "organization_name": org},
    )
    assert res.status_code == 200, res.text
    return res.json()


def _auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


def _make_vehicle(client, headers, org_id, code="V1"):
    res = client.post(
        f"/api/tdss/organizations/{org_id}/vehicles",
        headers=headers,
        json={
            "vehicle_code": code,
            "registration_number": "70-1234",
            "vehicle_type": "truck_6wheel",
            "capacity_weight_kg": 5000,
            "capacity_volume_m3": 20,
            "cost_per_km": 15,
            "fixed_cost": 500,
            "co2_factor": 0.8,
        },
    )
    assert res.status_code == 201, res.text
    return res.json()


def _make_route(client, headers, org_id, code="R1"):
    res = client.post(
        f"/api/tdss/organizations/{org_id}/routes",
        headers=headers,
        json={
            "route_code": code,
            "route_name": "A to B",
            "origin": "A",
            "destination": "B",
            "distance_km": 100,
            "estimated_duration_minutes": 120,
            "toll_cost": 50,
        },
    )
    assert res.status_code == 201, res.text
    return res.json()


def _make_profile(client, headers, org_id):
    res = client.post(
        f"/api/tdss/organizations/{org_id}/decision-profiles",
        headers=headers,
        json={"name": "Default", "pairwise": default_consistent_pairwise()},
    )
    assert res.status_code == 201, res.text
    profile = res.json()
    assert profile["is_consistent"] is True
    return profile


def _make_job(client, headers, org_id):
    res = client.post(
        f"/api/tdss/organizations/{org_id}/jobs",
        headers=headers,
        json={
            "customer_name": "Test Customer",
            "origin": "A",
            "destination": "B",
            "shipment_weight_kg": 2000,
            "shipment_volume_m3": 8,
        },
    )
    assert res.status_code == 201, res.text
    return res.json()


def test_register_creates_org_admin(client):
    data = _register(client)
    assert data["user"]["memberships"][0]["role"] == "org_admin"


def test_login_wrong_password_rejected(client):
    _register(client, email="a@test.com")
    res = client.post("/api/tdss/auth/login", json={"email": "a@test.com", "password": "wrong"})
    assert res.status_code == 401


def test_vehicle_capacity_validation_rejects_bad_input(client):
    data = _register(client, email="v@test.com")
    headers = _auth_headers(data["access_token"])
    org_id = data["user"]["memberships"][0]["organization_id"]
    res = client.post(
        f"/api/tdss/organizations/{org_id}/vehicles",
        headers=headers,
        json={
            "vehicle_code": "V1",
            "registration_number": "X",
            "vehicle_type": "truck",
            "capacity_weight_kg": -1,  # invalid
            "capacity_volume_m3": 10,
            "cost_per_km": 5,
            "co2_factor": 0.5,
        },
    )
    assert res.status_code == 422


def test_full_recommendation_flow_and_approval(client):
    data = _register(client, email="flow@test.com")
    token = data["access_token"]
    headers = _auth_headers(token)
    org_id = data["user"]["memberships"][0]["organization_id"]

    vehicle = _make_vehicle(client, headers, org_id)
    route = _make_route(client, headers, org_id)
    profile = _make_profile(client, headers, org_id)
    job = _make_job(client, headers, org_id)

    res = client.post(
        f"/api/tdss/organizations/{org_id}/planning/recommend",
        headers=headers,
        json={
            "job_id": job["id"],
            "route_ids": [route["id"]],
            "vehicle_ids": [vehicle["id"]],
            "decision_profile_id": profile["id"],
        },
    )
    assert res.status_code == 200, res.text
    run = res.json()
    assert len(run["alternatives"]) == 1
    top = run["alternatives"][0]
    assert top["feasible"] is True
    assert top["rank"] == 1
    assert len(run["explanations"]) > 0

    # Approve the top recommendation (no reason needed for rank 1)
    res = client.post(
        f"/api/tdss/organizations/{org_id}/recommendations/{run['id']}/select",
        headers=headers,
        json={"alternative_id": top["id"]},
    )
    assert res.status_code == 200, res.text
    approved = res.json()
    assert approved["approval"]["selected_alternative_id"] == top["id"]

    job_check = client.get(f"/api/tdss/organizations/{org_id}/jobs/{job['id']}", headers=headers)
    assert job_check.json()["status"] == "approved"

    audit = client.get(f"/api/tdss/organizations/{org_id}/audit-logs", headers=headers)
    actions = [a["action"] for a in audit.json()]
    assert "generate_recommendation" in actions
    assert "approve_recommendation" in actions


def test_selecting_lower_ranked_alternative_requires_reason(client):
    data = _register(client, email="reason@test.com")
    headers = _auth_headers(data["access_token"])
    org_id = data["user"]["memberships"][0]["organization_id"]

    v1 = _make_vehicle(client, headers, org_id, code="V1")
    v2 = _make_vehicle(client, headers, org_id, code="V2")
    # Make v2 more expensive so it ranks lower on cost.
    client.put(
        f"/api/tdss/organizations/{org_id}/vehicles/{v2['id']}",
        headers=headers,
        json={**{k: v2[k] for k in ("vehicle_code", "registration_number", "vehicle_type", "capacity_weight_kg", "capacity_volume_m3", "fuel_type", "fuel_consumption_km_per_liter", "co2_factor")}, "cost_per_km": 100, "fixed_cost": 2000},
    )
    route = _make_route(client, headers, org_id)
    profile = _make_profile(client, headers, org_id)
    job = _make_job(client, headers, org_id)

    res = client.post(
        f"/api/tdss/organizations/{org_id}/planning/recommend",
        headers=headers,
        json={"job_id": job["id"], "route_ids": [route["id"]], "vehicle_ids": [v1["id"], v2["id"]], "decision_profile_id": profile["id"]},
    )
    run = res.json()
    lower_ranked = next(a for a in run["alternatives"] if a["rank"] == 2)

    res = client.post(
        f"/api/tdss/organizations/{org_id}/recommendations/{run['id']}/select",
        headers=headers,
        json={"alternative_id": lower_ranked["id"]},
    )
    assert res.status_code == 400

    res = client.post(
        f"/api/tdss/organizations/{org_id}/recommendations/{run['id']}/select",
        headers=headers,
        json={"alternative_id": lower_ranked["id"], "reason": "Preferred vehicle for fragile cargo"},
    )
    assert res.status_code == 200, res.text


def test_organization_data_isolation(client):
    org1 = _register(client, email="org1@test.com", org="Org 1")
    org2 = _register(client, email="org2@test.com", org="Org 2")
    org1_id = org1["user"]["memberships"][0]["organization_id"]

    headers2 = _auth_headers(org2["access_token"])
    res = client.get(f"/api/tdss/organizations/{org1_id}/vehicles", headers=headers2)
    assert res.status_code == 403


def test_viewer_role_cannot_create_vehicle(client):
    admin = _register(client, email="orgadmin@test.com")
    admin_headers = _auth_headers(admin["access_token"])
    org_id = admin["user"]["memberships"][0]["organization_id"]

    res = client.post(
        f"/api/tdss/organizations/{org_id}/users",
        headers=admin_headers,
        json={"name": "View Only", "email": "viewer@test.com", "password": "password123", "role": "viewer"},
    )
    assert res.status_code == 201, res.text

    login = client.post("/api/tdss/auth/login", json={"email": "viewer@test.com", "password": "password123"})
    viewer_headers = _auth_headers(login.json()["access_token"])

    res = client.post(
        f"/api/tdss/organizations/{org_id}/vehicles",
        headers=viewer_headers,
        json={
            "vehicle_code": "V1",
            "registration_number": "X",
            "vehicle_type": "truck",
            "capacity_weight_kg": 1000,
            "capacity_volume_m3": 10,
            "cost_per_km": 5,
            "co2_factor": 0.5,
        },
    )
    assert res.status_code == 403


def test_suspended_organization_blocks_operations(client, db_session):
    from app.tdss.models import Organization

    data = _register(client, email="suspend@test.com")
    headers = _auth_headers(data["access_token"])
    org_id = data["user"]["memberships"][0]["organization_id"]

    org = db_session.query(Organization).filter(Organization.id == org_id).first()
    org.status = "suspended"
    db_session.commit()

    res = client.get(f"/api/tdss/organizations/{org_id}/vehicles", headers=headers)
    assert res.status_code == 403


def test_partial_job_update_without_customer_name_succeeds(client):
    """Regression test: the Planning Wizard's requirements step PATCHes only
    shipment fields (origin/destination/weight/volume), never customer_name.
    JobUpdateRequest must treat every field as optional so this doesn't 422."""
    data = _register(client, email="partial@test.com")
    headers = _auth_headers(data["access_token"])
    org_id = data["user"]["memberships"][0]["organization_id"]
    job = _make_job(client, headers, org_id)

    res = client.put(
        f"/api/tdss/organizations/{org_id}/jobs/{job['id']}",
        headers=headers,
        json={"origin": "New Origin", "destination": "New Destination", "shipment_weight_kg": 500, "shipment_volume_m3": 2},
    )
    assert res.status_code == 200, res.text
    updated = res.json()
    assert updated["origin"] == "New Origin"
    assert updated["customer_name"] == job["customer_name"]  # unchanged


def test_org_admin_cannot_edit_system_owner_via_membership(client):
    data = _register(client, email="orgadmin2@test.com")
    headers = _auth_headers(data["access_token"])
    org_id = data["user"]["memberships"][0]["organization_id"]
    # Attempting to update a membership for a user_id that was never a member should 404.
    res = client.put(f"/api/tdss/organizations/{org_id}/users/999999", headers=headers, json={"role": "viewer"})
    assert res.status_code == 404
