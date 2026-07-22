from tests.test_api_flow import _auth_headers, _make_job, _register


def _make_product(client, headers, org_id, sku="SKU-1", **overrides):
    payload = {
        "sku": sku,
        "product_name": "กล่องสินค้า A",
        "unit": "กล่อง",
        "weight_per_unit_kg": 10,
        "width_cm": 40,
        "length_cm": 30,
        "height_cm": 20,
    }
    payload.update(overrides)
    res = client.post(f"/api/tdss/organizations/{org_id}/products", headers=headers, json=payload)
    assert res.status_code == 201, res.text
    return res.json()


def test_product_volume_is_server_computed(client):
    reg = _register(client)
    headers = _auth_headers(reg["access_token"])
    org_id = reg["user"]["memberships"][0]["organization_id"]

    product = _make_product(client, headers, org_id, width_cm=40, length_cm=30, height_cm=20)
    # 40 * 30 * 20 = 24,000 cm^3 = 0.024 m^3
    assert product["volume_per_unit_m3"] == 0.024


def test_add_job_item_pulls_weight_and_volume_from_product_and_updates_job_totals(client):
    reg = _register(client)
    headers = _auth_headers(reg["access_token"])
    org_id = reg["user"]["memberships"][0]["organization_id"]

    job = _make_job(client, headers, org_id)
    product = _make_product(client, headers, org_id, weight_per_unit_kg=10, width_cm=40, length_cm=30, height_cm=20)

    res = client.post(
        f"/api/tdss/organizations/{org_id}/jobs/{job['id']}/items",
        headers=headers,
        json={"product_id": product["id"], "quantity": 5},
    )
    assert res.status_code == 201, res.text
    item = res.json()
    assert item["weight_per_unit_kg"] == 10
    assert item["volume_per_unit_m3"] == 0.024
    assert item["total_weight_kg"] == 50
    assert item["total_volume_m3"] == 0.12

    job_res = client.get(f"/api/tdss/organizations/{org_id}/jobs/{job['id']}", headers=headers)
    updated_job = job_res.json()
    assert updated_job["shipment_weight_kg"] == 50
    assert updated_job["shipment_volume_m3"] == 0.12


def test_multiple_items_sum_into_job_totals_and_removal_recomputes(client):
    reg = _register(client)
    headers = _auth_headers(reg["access_token"])
    org_id = reg["user"]["memberships"][0]["organization_id"]

    job = _make_job(client, headers, org_id)
    product_a = _make_product(client, headers, org_id, sku="A", weight_per_unit_kg=10, width_cm=40, length_cm=30, height_cm=20)
    product_b = _make_product(client, headers, org_id, sku="B", weight_per_unit_kg=25, width_cm=50, length_cm=50, height_cm=50)

    item_a = client.post(
        f"/api/tdss/organizations/{org_id}/jobs/{job['id']}/items", headers=headers, json={"product_id": product_a["id"], "quantity": 5}
    ).json()
    client.post(f"/api/tdss/organizations/{org_id}/jobs/{job['id']}/items", headers=headers, json={"product_id": product_b["id"], "quantity": 2})

    job_res = client.get(f"/api/tdss/organizations/{org_id}/jobs/{job['id']}", headers=headers).json()
    # A: 5*10=50kg, 5*0.024=0.12 m3 | B: 2*25=50kg, 2*0.125=0.25 m3 -> totals 100kg / 0.37 m3
    assert job_res["shipment_weight_kg"] == 100
    assert job_res["shipment_volume_m3"] == 0.37

    del_res = client.delete(f"/api/tdss/organizations/{org_id}/jobs/{job['id']}/items/{item_a['id']}", headers=headers)
    assert del_res.status_code == 204

    job_res_2 = client.get(f"/api/tdss/organizations/{org_id}/jobs/{job['id']}", headers=headers).json()
    assert job_res_2["shipment_weight_kg"] == 50
    assert job_res_2["shipment_volume_m3"] == 0.25


def test_deleting_last_item_leaves_job_totals_untouched(client):
    reg = _register(client)
    headers = _auth_headers(reg["access_token"])
    org_id = reg["user"]["memberships"][0]["organization_id"]

    job = _make_job(client, headers, org_id)
    product = _make_product(client, headers, org_id)
    item = client.post(
        f"/api/tdss/organizations/{org_id}/jobs/{job['id']}/items", headers=headers, json={"product_id": product["id"], "quantity": 3}
    ).json()

    client.delete(f"/api/tdss/organizations/{org_id}/jobs/{job['id']}/items/{item['id']}", headers=headers)

    job_res = client.get(f"/api/tdss/organizations/{org_id}/jobs/{job['id']}", headers=headers).json()
    # No items remain — totals stay at their last-known value (30kg / 0.072 m3), not reset.
    assert job_res["shipment_weight_kg"] == 30
    assert job_res["shipment_volume_m3"] == 0.072


def test_cannot_delete_product_referenced_by_a_job_item(client):
    reg = _register(client)
    headers = _auth_headers(reg["access_token"])
    org_id = reg["user"]["memberships"][0]["organization_id"]

    job = _make_job(client, headers, org_id)
    product = _make_product(client, headers, org_id)
    client.post(f"/api/tdss/organizations/{org_id}/jobs/{job['id']}/items", headers=headers, json={"product_id": product["id"], "quantity": 1})

    res = client.delete(f"/api/tdss/organizations/{org_id}/products/{product['id']}", headers=headers)
    assert res.status_code == 400

    deactivate_res = client.post(f"/api/tdss/organizations/{org_id}/products/{product['id']}/deactivate", headers=headers)
    assert deactivate_res.status_code == 200
    assert deactivate_res.json()["status"] == "inactive"


def test_cannot_add_inactive_product_to_a_job(client):
    reg = _register(client)
    headers = _auth_headers(reg["access_token"])
    org_id = reg["user"]["memberships"][0]["organization_id"]

    job = _make_job(client, headers, org_id)
    product = _make_product(client, headers, org_id)
    client.post(f"/api/tdss/organizations/{org_id}/products/{product['id']}/deactivate", headers=headers)

    res = client.post(
        f"/api/tdss/organizations/{org_id}/jobs/{job['id']}/items", headers=headers, json={"product_id": product["id"], "quantity": 1}
    )
    assert res.status_code == 400


def test_update_item_quantity_recomputes_totals(client):
    reg = _register(client)
    headers = _auth_headers(reg["access_token"])
    org_id = reg["user"]["memberships"][0]["organization_id"]

    job = _make_job(client, headers, org_id)
    product = _make_product(client, headers, org_id, weight_per_unit_kg=10, width_cm=40, length_cm=30, height_cm=20)
    item = client.post(
        f"/api/tdss/organizations/{org_id}/jobs/{job['id']}/items", headers=headers, json={"product_id": product["id"], "quantity": 5}
    ).json()

    res = client.put(f"/api/tdss/organizations/{org_id}/jobs/{job['id']}/items/{item['id']}", headers=headers, json={"quantity": 10})
    assert res.status_code == 200
    assert res.json()["total_weight_kg"] == 100

    job_res = client.get(f"/api/tdss/organizations/{org_id}/jobs/{job['id']}", headers=headers).json()
    assert job_res["shipment_weight_kg"] == 100
    assert job_res["shipment_volume_m3"] == 0.24
