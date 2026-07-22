from app.tdss.models import User
from tests.test_api_flow import _auth_headers


def _make_system_owner(db_session, email="owner@test.com") -> User:
    from app.tdss.auth import hash_password

    owner = User(name="System Owner", email=email, password_hash=hash_password("password123"), is_system_owner=True)
    db_session.add(owner)
    db_session.commit()
    db_session.refresh(owner)
    return owner


def _register_raw(client, email="pending1@test.com", org="Pending Org"):
    """Registers without the _activate_org_directly bypass used elsewhere —
    exercises the real pending-approval gate as a new org actually sees it."""
    res = client.post(
        "/api/tdss/auth/register",
        json={"name": "New Admin", "email": email, "password": "password123", "organization_name": org},
    )
    assert res.status_code == 200, res.text
    return res.json()


def test_new_org_registers_as_pending_not_active(client):
    data = _register_raw(client)
    membership = data["user"]["memberships"][0]
    assert membership["organization_status"] == "pending"


def test_pending_org_cannot_access_org_scoped_endpoints(client):
    data = _register_raw(client)
    headers = _auth_headers(data["access_token"])
    org_id = data["user"]["memberships"][0]["organization_id"]

    res = client.get(f"/api/tdss/organizations/{org_id}/vehicles", headers=headers)
    assert res.status_code == 403
    assert "pending approval" in res.json()["detail"].lower()


def test_system_owner_can_approve_pending_org_and_unblock_it(client, db_session):
    data = _register_raw(client)
    headers = _auth_headers(data["access_token"])
    org_id = data["user"]["memberships"][0]["organization_id"]

    owner = _make_system_owner(db_session)
    owner_token = client.post("/api/tdss/auth/login", json={"email": owner.email, "password": "password123"}).json()["access_token"]
    owner_headers = _auth_headers(owner_token)

    approve_res = client.post(f"/api/tdss/owner/organizations/{org_id}/activate", headers=owner_headers)
    assert approve_res.status_code == 200
    assert approve_res.json()["status"] == "active"

    vehicles_res = client.get(f"/api/tdss/organizations/{org_id}/vehicles", headers=headers)
    assert vehicles_res.status_code == 200


def test_owner_dashboard_counts_pending_organizations(client, db_session):
    _register_raw(client, email="pending2@test.com", org="Pending Org 2")
    owner = _make_system_owner(db_session, email="owner2@test.com")
    owner_token = client.post("/api/tdss/auth/login", json={"email": owner.email, "password": "password123"}).json()["access_token"]

    res = client.get("/api/tdss/owner/dashboard", headers=_auth_headers(owner_token))
    assert res.status_code == 200
    assert res.json()["pending_organizations"] >= 1


def test_pending_org_admin_can_still_log_in_and_see_pending_status(client):
    """Login itself isn't blocked (only org-scoped data access is) so the
    frontend can show a friendly waiting screen instead of a login error."""
    data = _register_raw(client, email="pending3@test.com", org="Pending Org 3")
    login_res = client.post("/api/tdss/auth/login", json={"email": "pending3@test.com", "password": "password123"})
    assert login_res.status_code == 200
    assert login_res.json()["user"]["memberships"][0]["organization_status"] == "pending"
