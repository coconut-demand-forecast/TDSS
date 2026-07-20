from app.tdss.services.ahp_service import default_consistent_pairwise, pair_key, upper_triangle_pairs
from tests.test_api_flow import _auth_headers, _make_job, _make_profile, _make_route, _make_vehicle, _register


def test_update_organization_info_by_admin(client):
    data = _register(client, email="orginfo@test.com")
    headers = _auth_headers(data["access_token"])
    org_id = data["user"]["memberships"][0]["organization_id"]

    res = client.put(
        f"/api/tdss/organizations/{org_id}/info",
        headers=headers,
        json={"name": "New Name Co", "code": "NNC", "contact": "02-000-0000", "address": "123 Bangkok"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["name"] == "New Name Co"
    assert body["code"] == "NNC"
    assert body["usage"]["job_count"] == 0


def test_org_info_update_rejected_for_planner(client):
    admin = _register(client, email="orginfoadmin@test.com")
    admin_headers = _auth_headers(admin["access_token"])
    org_id = admin["user"]["memberships"][0]["organization_id"]
    client.post(
        f"/api/tdss/organizations/{org_id}/users",
        headers=admin_headers,
        json={"name": "Planner X", "email": "plannerx@test.com", "password": "password123", "role": "planner"},
    )
    planner_headers = _auth_headers(client.post("/api/tdss/auth/login", json={"email": "plannerx@test.com", "password": "password123"}).json()["access_token"])

    res = client.put(f"/api/tdss/organizations/{org_id}/info", headers=planner_headers, json={"name": "Hacked Name"})
    assert res.status_code == 403


def test_organization_settings_roundtrip_and_effect_on_notification(client):
    data = _register(client, email="orgsettings@test.com")
    headers = _auth_headers(data["access_token"])
    org_id = data["user"]["memberships"][0]["organization_id"]

    # Turn off recommendation_completed notifications for this org.
    res = client.put(
        f"/api/tdss/organizations/{org_id}/settings",
        headers=headers,
        json={"default_route_mode": "manual", "notify_on_recommendation_completed": False, "notify_on_job_approved": True},
    )
    assert res.status_code == 200, res.text
    assert res.json()["notify_on_recommendation_completed"] is False

    vehicle = _make_vehicle(client, headers, org_id)
    route = _make_route(client, headers, org_id)
    profile = _make_profile(client, headers, org_id)
    job = _make_job(client, headers, org_id)
    client.post(
        f"/api/tdss/organizations/{org_id}/planning/recommend",
        headers=headers,
        json={"job_id": job["id"], "route_ids": [route["id"]], "vehicle_ids": [vehicle["id"]], "decision_profile_id": profile["id"]},
    )

    notifications = client.get("/api/tdss/notifications", headers=headers).json()
    assert not any(n["type"] == "recommendation_completed" for n in notifications)


def test_decision_profile_edit_recalculates_weights(client):
    data = _register(client, email="profileedit@test.com")
    headers = _auth_headers(data["access_token"])
    org_id = data["user"]["memberships"][0]["organization_id"]
    profile = _make_profile(client, headers, org_id)

    equal_pairwise = {pair_key(a, b): 1.0 for a, b in upper_triangle_pairs()}
    res = client.put(
        f"/api/tdss/organizations/{org_id}/decision-profiles/{profile['id']}",
        headers=headers,
        json={"name": "Renamed", "pairwise": equal_pairwise},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["name"] == "Renamed"
    for w in body["weights"].values():
        assert abs(w - 1 / 6) < 1e-6
    assert body["is_consistent"] is True


def test_decision_profile_delete_blocked_when_referenced(client):
    data = _register(client, email="profiledelete@test.com")
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

    res = client.delete(f"/api/tdss/organizations/{org_id}/decision-profiles/{profile['id']}", headers=headers)
    assert res.status_code == 400
    assert "referenced" in res.json()["detail"]


def test_decision_profile_delete_allowed_when_unused(client):
    data = _register(client, email="profiledeleteok@test.com")
    headers = _auth_headers(data["access_token"])
    org_id = data["user"]["memberships"][0]["organization_id"]
    profile = _make_profile(client, headers, org_id)

    res = client.delete(f"/api/tdss/organizations/{org_id}/decision-profiles/{profile['id']}", headers=headers)
    assert res.status_code == 204


def test_owner_usage_reflects_real_activity(client, db_session):
    from app.tdss.auth import hash_password
    from app.tdss.models import User

    data = _register(client, email="usageorg@test.com")
    headers = _auth_headers(data["access_token"])
    org_id = data["user"]["memberships"][0]["organization_id"]
    _make_vehicle(client, headers, org_id)
    _make_job(client, headers, org_id)
    client.get(f"/api/tdss/organizations/{org_id}/reports/jobs.pdf", headers=headers)

    owner = User(name="Usage Owner", email="usageowner@test.com", password_hash=hash_password("password123"), is_system_owner=True)
    db_session.add(owner)
    db_session.commit()
    owner_headers = _auth_headers(client.post("/api/tdss/auth/login", json={"email": "usageowner@test.com", "password": "password123"}).json()["access_token"])

    res = client.get("/api/tdss/owner/usage", headers=owner_headers, params={"organization_id": org_id})
    assert res.status_code == 200, res.text
    rows = res.json()
    assert len(rows) == 1
    row = rows[0]
    assert row["organization_id"] == org_id
    assert row["vehicle_count"] == 1
    assert row["job_count"] == 1
    assert row["active_user_count"] == 1
    assert row["report_export_count"] == 1


def test_system_settings_get_public_put_owner_only(client, db_session):
    from app.tdss.auth import hash_password
    from app.tdss.models import User

    res = client.get("/api/tdss/system-settings")
    assert res.status_code == 200
    assert res.json()["app_display_name"] == "TDSS"

    data = _register(client, email="notowner@test.com")
    headers = _auth_headers(data["access_token"])
    res = client.put("/api/tdss/system-settings", headers=headers, json={"app_display_name": "Hacked"})
    assert res.status_code == 403

    owner = User(name="Owner", email="sysowner@test.com", password_hash=hash_password("password123"), is_system_owner=True)
    db_session.add(owner)
    db_session.commit()
    owner_headers = _auth_headers(client.post("/api/tdss/auth/login", json={"email": "sysowner@test.com", "password": "password123"}).json()["access_token"])

    res = client.put("/api/tdss/system-settings", headers=owner_headers, json={"app_display_name": "TDSS Renamed", "banner_message": "Maintenance tonight"})
    assert res.status_code == 200
    assert res.json()["app_display_name"] == "TDSS Renamed"

    res2 = client.get("/api/tdss/system-settings")
    assert res2.json()["app_display_name"] == "TDSS Renamed"
    assert res2.json()["banner_message"] == "Maintenance tonight"
