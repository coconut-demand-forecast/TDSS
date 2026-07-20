import datetime as dt

from app.tdss.services.rule_engine import check_alternative
from tests.conftest import make_job, make_route, make_vehicle


def test_feasible_alternative_has_no_rejections():
    result = check_alternative(make_job(), make_vehicle(), make_route())
    assert result["feasible"] is True
    assert result["rejection_reasons"] == []


def test_rejects_over_weight_capacity():
    job = make_job(shipment_weight_kg=9000)
    result = check_alternative(job, make_vehicle(), make_route())
    assert result["feasible"] is False
    assert any("น้ำหนัก" in r for r in result["rejection_reasons"])


def test_rejects_over_volume_capacity():
    job = make_job(shipment_volume_m3=999)
    result = check_alternative(job, make_vehicle(), make_route())
    assert result["feasible"] is False
    assert any("ปริมาตร" in r for r in result["rejection_reasons"])


def test_rejects_inactive_vehicle():
    result = check_alternative(make_job(), make_vehicle(status="inactive"), make_route())
    assert result["feasible"] is False


def test_rejects_inactive_route():
    result = check_alternative(make_job(), make_vehicle(), make_route(status="inactive"))
    assert result["feasible"] is False


def test_rejects_unmeetable_deadline():
    job = make_job(required_delivery_datetime=dt.datetime.utcnow() + dt.timedelta(minutes=5))
    result = check_alternative(job, make_vehicle(), make_route(estimated_duration_minutes=600))
    assert result["feasible"] is False
    assert any("กำหนดส่งมอบ" in r for r in result["rejection_reasons"])


def test_high_risk_route_produces_warning_not_rejection():
    result = check_alternative(make_job(), make_vehicle(), make_route(route_risk_level="high"))
    assert result["feasible"] is True
    assert any("ความเสี่ยงสูง" in w for w in result["warnings"])
