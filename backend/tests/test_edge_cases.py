from app.tdss.services.ahp_service import default_consistent_pairwise
from tests.test_api_flow import _auth_headers, _make_job, _make_profile, _make_route, _make_vehicle, _register


def test_cross_org_vehicle_access_returns_404(client):
    org1 = _register(client, email="iso1@test.com", org="Iso Org 1")
    org2 = _register(client, email="iso2@test.com", org="Iso Org 2")
    headers1 = _auth_headers(org1["access_token"])
    headers2 = _auth_headers(org2["access_token"])
    org1_id = org1["user"]["memberships"][0]["organization_id"]
    org2_id = org2["user"]["memberships"][0]["organization_id"]

    vehicle = _make_vehicle(client, headers1, org1_id)

    # Right vehicle id, wrong org_id in the URL -> not found (query filters by org).
    res = client.get(f"/api/tdss/organizations/{org2_id}/vehicles/{vehicle['id']}", headers=headers2)
    assert res.status_code == 404


def test_cross_org_job_access_blocked(client):
    org1 = _register(client, email="isoj1@test.com", org="Iso Job Org 1")
    org2 = _register(client, email="isoj2@test.com", org="Iso Job Org 2")
    headers1 = _auth_headers(org1["access_token"])
    headers2 = _auth_headers(org2["access_token"])
    org1_id = org1["user"]["memberships"][0]["organization_id"]

    job = _make_job(client, headers1, org1_id)

    # org2 user has no membership in org1 at all -> 403 before the job is even looked up.
    res = client.get(f"/api/tdss/organizations/{org1_id}/jobs/{job['id']}", headers=headers2)
    assert res.status_code == 403


def test_viewer_cannot_approve_recommendation(client):
    admin = _register(client, email="vieweradmin@test.com")
    admin_headers = _auth_headers(admin["access_token"])
    org_id = admin["user"]["memberships"][0]["organization_id"]

    vehicle = _make_vehicle(client, admin_headers, org_id)
    route = _make_route(client, admin_headers, org_id)
    profile = _make_profile(client, admin_headers, org_id)
    job = _make_job(client, admin_headers, org_id)
    run = client.post(
        f"/api/tdss/organizations/{org_id}/planning/recommend",
        headers=admin_headers,
        json={"job_id": job["id"], "route_ids": [route["id"]], "vehicle_ids": [vehicle["id"]], "decision_profile_id": profile["id"]},
    ).json()
    top = run["alternatives"][0]

    client.post(
        f"/api/tdss/organizations/{org_id}/users",
        headers=admin_headers,
        json={"name": "Viewer Only", "email": "viewerapprove@test.com", "password": "password123", "role": "viewer"},
    )
    viewer_headers = _auth_headers(client.post("/api/tdss/auth/login", json={"email": "viewerapprove@test.com", "password": "password123"}).json()["access_token"])

    res = client.post(
        f"/api/tdss/organizations/{org_id}/recommendations/{run['id']}/select",
        headers=viewer_headers,
        json={"alternative_id": top["id"]},
    )
    assert res.status_code == 403


def test_viewer_can_view_jobs_list(client):
    admin = _register(client, email="viewerread@test.com")
    admin_headers = _auth_headers(admin["access_token"])
    org_id = admin["user"]["memberships"][0]["organization_id"]
    _make_job(client, admin_headers, org_id)

    client.post(
        f"/api/tdss/organizations/{org_id}/users",
        headers=admin_headers,
        json={"name": "Viewer Read", "email": "viewerread2@test.com", "password": "password123", "role": "viewer"},
    )
    viewer_headers = _auth_headers(client.post("/api/tdss/auth/login", json={"email": "viewerread2@test.com", "password": "password123"}).json()["access_token"])

    res = client.get(f"/api/tdss/organizations/{org_id}/jobs", headers=viewer_headers)
    assert res.status_code == 200
    assert len(res.json()) == 1


def test_recommend_blocked_when_job_missing_shipment_info(client):
    data = _register(client, email="incomplete@test.com")
    headers = _auth_headers(data["access_token"])
    org_id = data["user"]["memberships"][0]["organization_id"]

    vehicle = _make_vehicle(client, headers, org_id)
    route = _make_route(client, headers, org_id)
    profile = _make_profile(client, headers, org_id)

    # Job created with only customer_name -> no origin/destination/weight/volume.
    job = client.post(f"/api/tdss/organizations/{org_id}/jobs", headers=headers, json={"customer_name": "Incomplete Co"}).json()

    res = client.post(
        f"/api/tdss/organizations/{org_id}/planning/recommend",
        headers=headers,
        json={"job_id": job["id"], "route_ids": [route["id"]], "vehicle_ids": [vehicle["id"]], "decision_profile_id": profile["id"]},
    )
    assert res.status_code == 400
    assert "missing required shipment info" in res.json()["detail"]


def test_zero_feasible_alternatives_handled_gracefully(client):
    data = _register(client, email="nofeasible@test.com")
    headers = _auth_headers(data["access_token"])
    org_id = data["user"]["memberships"][0]["organization_id"]

    # Vehicle capacity far too small for the shipment -> every alternative rejected.
    vehicle = _make_vehicle(client, headers, org_id)
    route = _make_route(client, headers, org_id)
    profile = _make_profile(client, headers, org_id)
    job = client.post(
        f"/api/tdss/organizations/{org_id}/jobs",
        headers=headers,
        json={"customer_name": "Huge Shipment Co", "origin": "A", "destination": "B", "shipment_weight_kg": 999999, "shipment_volume_m3": 999},
    ).json()

    res = client.post(
        f"/api/tdss/organizations/{org_id}/planning/recommend",
        headers=headers,
        json={"job_id": job["id"], "route_ids": [route["id"]], "vehicle_ids": [vehicle["id"]], "decision_profile_id": profile["id"]},
    )
    assert res.status_code == 200, res.text
    run = res.json()
    assert len(run["alternatives"]) == 1
    assert run["alternatives"][0]["feasible"] is False
    assert run["alternatives"][0]["rank"] is None
    assert len(run["alternatives"][0]["rejection_reasons"]) > 0
    assert run["explanations"] == []


def test_deleting_vehicle_referenced_by_recommendation_is_blocked(client):
    data = _register(client, email="delvehicle@test.com")
    headers = _auth_headers(data["access_token"])
    org_id = data["user"]["memberships"][0]["organization_id"]

    vehicle = _make_vehicle(client, headers, org_id)
    route = _make_route(client, headers, org_id)
    profile = _make_profile(client, headers, org_id)
    job = _make_job(client, headers, org_id)
    client.post(
        f"/api/tdss/organizations/{org_id}/planning/recommend",
        headers=headers,
        json={"job_id": job["id"], "route_ids": [route["id"]], "vehicle_ids": [vehicle["id"]], "decision_profile_id": profile["id"]},
    )

    res = client.delete(f"/api/tdss/organizations/{org_id}/vehicles/{vehicle['id']}", headers=headers)
    assert res.status_code == 400


def test_inconsistent_profile_cannot_be_activated(client):
    from app.tdss.services.ahp_service import pair_key, upper_triangle_pairs

    data = _register(client, email="inconsistentactivate@test.com")
    headers = _auth_headers(data["access_token"])
    org_id = data["user"]["memberships"][0]["organization_id"]

    pairwise = {pair_key(a, b): 1.0 for a, b in upper_triangle_pairs()}
    pairwise[pair_key("cost", "time")] = 9.0
    pairwise[pair_key("time", "co2")] = 9.0
    pairwise[pair_key("cost", "co2")] = 1 / 9

    created = client.post(
        f"/api/tdss/organizations/{org_id}/decision-profiles",
        headers=headers,
        json={"name": "Bad Profile", "pairwise": pairwise},
    ).json()
    assert created["is_consistent"] is False
    assert created["status"] == "draft"

    res = client.post(f"/api/tdss/organizations/{org_id}/decision-profiles/{created['id']}/activate", headers=headers, json={"active": True})
    assert res.status_code == 400


def test_double_approval_blocked(client):
    data = _register(client, email="doubleapprove@test.com")
    headers = _auth_headers(data["access_token"])
    org_id = data["user"]["memberships"][0]["organization_id"]

    vehicle = _make_vehicle(client, headers, org_id)
    route = _make_route(client, headers, org_id)
    profile = _make_profile(client, headers, org_id)
    job = _make_job(client, headers, org_id)
    run = client.post(
        f"/api/tdss/organizations/{org_id}/planning/recommend",
        headers=headers,
        json={"job_id": job["id"], "route_ids": [route["id"]], "vehicle_ids": [vehicle["id"]], "decision_profile_id": profile["id"]},
    ).json()
    top = run["alternatives"][0]

    first = client.post(f"/api/tdss/organizations/{org_id}/recommendations/{run['id']}/select", headers=headers, json={"alternative_id": top["id"]})
    assert first.status_code == 200

    second = client.post(f"/api/tdss/organizations/{org_id}/recommendations/{run['id']}/select", headers=headers, json={"alternative_id": top["id"]})
    assert second.status_code == 400


def test_disabled_feature_blocks_access(client, db_session):
    from app.tdss.models import OrganizationFeature

    data = _register(client, email="featureoff@test.com")
    headers = _auth_headers(data["access_token"])
    org_id = data["user"]["memberships"][0]["organization_id"]

    db_session.add(OrganizationFeature(organization_id=org_id, feature_key="ahp_profiles", enabled=False))
    db_session.commit()

    res = client.get(f"/api/tdss/organizations/{org_id}/decision-profiles", headers=headers)
    assert res.status_code == 403

    # Unrelated feature-gated area is unaffected.
    res2 = client.get(f"/api/tdss/organizations/{org_id}/vehicles", headers=headers)
    assert res2.status_code == 200


def test_notifications_created_for_recommendation_and_approval(client):
    data = _register(client, email="notify1@test.com")
    headers = _auth_headers(data["access_token"])
    org_id = data["user"]["memberships"][0]["organization_id"]
    user_id = data["user"]["id"]

    vehicle = _make_vehicle(client, headers, org_id)
    route = _make_route(client, headers, org_id)
    profile = _make_profile(client, headers, org_id)
    job = _make_job(client, headers, org_id)
    run = client.post(
        f"/api/tdss/organizations/{org_id}/planning/recommend",
        headers=headers,
        json={"job_id": job["id"], "route_ids": [route["id"]], "vehicle_ids": [vehicle["id"]], "decision_profile_id": profile["id"]},
    ).json()

    notifications = client.get("/api/tdss/notifications", headers=headers).json()
    assert any(n["type"] == "recommendation_completed" for n in notifications)

    top = run["alternatives"][0]
    client.post(f"/api/tdss/organizations/{org_id}/recommendations/{run['id']}/select", headers=headers, json={"alternative_id": top["id"]})

    notifications = client.get("/api/tdss/notifications", headers=headers).json()
    assert any(n["type"] == "job_approved" for n in notifications)


def test_notification_on_inconsistent_ahp_profile(client):
    from app.tdss.services.ahp_service import pair_key, upper_triangle_pairs

    data = _register(client, email="notifyahp@test.com")
    headers = _auth_headers(data["access_token"])
    org_id = data["user"]["memberships"][0]["organization_id"]

    pairwise = {pair_key(a, b): 1.0 for a, b in upper_triangle_pairs()}
    pairwise[pair_key("cost", "time")] = 9.0
    pairwise[pair_key("time", "co2")] = 9.0
    pairwise[pair_key("cost", "co2")] = 1 / 9

    client.post(f"/api/tdss/organizations/{org_id}/decision-profiles", headers=headers, json={"name": "Bad", "pairwise": pairwise})

    notifications = client.get("/api/tdss/notifications", headers=headers).json()
    assert any(n["type"] == "ahp_profile_inconsistent" for n in notifications)


def test_notification_on_organization_suspended(client, db_session):
    from app.tdss.auth import hash_password
    from app.tdss.models import User

    data = _register(client, email="notifysuspend@test.com")
    headers = _auth_headers(data["access_token"])
    org_id = data["user"]["memberships"][0]["organization_id"]

    owner = User(name="Owner", email="ownerx@test.com", password_hash=hash_password("password123"), is_system_owner=True)
    db_session.add(owner)
    db_session.commit()
    owner_login = client.post("/api/tdss/auth/login", json={"email": "ownerx@test.com", "password": "password123"}).json()
    owner_headers = _auth_headers(owner_login["access_token"])

    res = client.post(f"/api/tdss/owner/organizations/{org_id}/suspend", headers=owner_headers)
    assert res.status_code == 200

    notifications = client.get("/api/tdss/notifications", headers=headers).json()
    assert any(n["type"] == "organization_suspended" for n in notifications)
