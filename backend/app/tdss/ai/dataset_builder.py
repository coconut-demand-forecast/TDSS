"""Dataset export + descriptive-analytics layer over AIDecisionEvent —
feeds both the "AI Insights" pages and the (future) train_model.py."""

from sqlalchemy.orm import Session

from app.tdss.models import AIDecisionEvent, Route, Vehicle


def build_dataset_rows(db: Session, organization_id: int | None = None) -> list[dict]:
    q = db.query(AIDecisionEvent)
    if organization_id is not None:
        q = q.filter(AIDecisionEvent.organization_id == organization_id)
    events = q.order_by(AIDecisionEvent.created_at).all()

    rows = []
    for e in events:
        row = {
            "event_id": e.id,
            "run_id": e.run_id,
            "job_id": e.job_id,
            "organization_id": e.organization_id,
            "decision_profile_id": e.decision_profile_id,
            "top_vehicle_id": e.top_vehicle_id,
            "top_route_id": e.top_route_id,
            "top_total_score": e.top_total_score,
            "selected_vehicle_id": e.selected_vehicle_id,
            "selected_route_id": e.selected_route_id,
            "selected_total_score": e.selected_total_score,
            "selected_rank": e.selected_rank,
            "is_override": e.is_override,
            "vehicle_changed": e.vehicle_changed,
            "route_changed": e.route_changed,
            "reason": e.reason,
            "created_at": e.created_at,
        }
        for k, v in (e.criteria_weights or {}).items():
            row[f"weight_{k}"] = v
        for k, v in (e.selected_raw_values or {}).items():
            row[f"selected_{k}"] = v
        rows.append(row)
    return rows


def compute_insights(db: Session, organization_id: int | None = None) -> dict:
    q = db.query(AIDecisionEvent)
    if organization_id is not None:
        q = q.filter(AIDecisionEvent.organization_id == organization_id)
    events = q.all()

    total = len(events)
    followed = sum(1 for e in events if not e.is_override)
    match_rate = (followed / total * 100) if total else 0.0

    vehicle_override_counts: dict[int, int] = {}
    route_change_counts: dict[int, int] = {}
    monthly: dict[str, list[int]] = {}  # "YYYY-MM" -> [followed_count, total_count]

    for e in events:
        if e.is_override and e.top_vehicle_id is not None:
            vehicle_override_counts[e.top_vehicle_id] = vehicle_override_counts.get(e.top_vehicle_id, 0) + 1
        if e.route_changed and e.top_route_id is not None:
            route_change_counts[e.top_route_id] = route_change_counts.get(e.top_route_id, 0) + 1
        key = e.created_at.strftime("%Y-%m") if e.created_at else "unknown"
        bucket = monthly.setdefault(key, [0, 0])
        bucket[1] += 1
        if not e.is_override:
            bucket[0] += 1

    most_overridden_vehicle = None
    if vehicle_override_counts:
        vid = max(vehicle_override_counts, key=vehicle_override_counts.get)
        vehicle = db.query(Vehicle).filter(Vehicle.id == vid).first()
        most_overridden_vehicle = {
            "vehicle_id": vid,
            "vehicle_code": vehicle.vehicle_code if vehicle else str(vid),
            "override_count": vehicle_override_counts[vid],
        }

    most_changed_route = None
    if route_change_counts:
        rid = max(route_change_counts, key=route_change_counts.get)
        route = db.query(Route).filter(Route.id == rid).first()
        most_changed_route = {
            "route_id": rid,
            "route_code": route.route_code if route else str(rid),
            "change_count": route_change_counts[rid],
        }

    trend = [
        {"period": k, "match_rate_pct": round((v[0] / v[1] * 100) if v[1] else 0.0, 1), "total_decisions": v[1]}
        for k, v in sorted(monthly.items())
    ]

    return {
        "total_decisions": total,
        "match_rate_pct": round(match_rate, 1),
        "most_overridden_vehicle": most_overridden_vehicle,
        "most_changed_route": most_changed_route,
        "trend": trend,
    }
