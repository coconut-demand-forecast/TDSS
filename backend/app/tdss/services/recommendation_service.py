"""Orchestrates a full recommendation run: candidate generation -> rule
filtering -> scoring -> normalization -> AHP-weighted ranking -> persistence.
"""

from sqlalchemy.orm import Session

from app.tdss.models import (
    DecisionProfile,
    Organization,
    RecommendationAlternative,
    RecommendationRun,
    Route,
    TransportJob,
    Vehicle,
)
from app.tdss.services import optimization_service, rule_engine, scoring_service


def generate_recommendation(
    db: Session,
    *,
    job: TransportJob,
    route_ids: list[int],
    vehicle_ids: list[int],
    profile: DecisionProfile,
    created_by: int | None,
) -> RecommendationRun:
    routes = db.query(Route).filter(Route.id.in_(route_ids), Route.organization_id == job.organization_id).all()
    vehicles = db.query(Vehicle).filter(Vehicle.id.in_(vehicle_ids), Vehicle.organization_id == job.organization_id).all()
    if not routes:
        raise ValueError("No valid candidate routes selected")
    if not vehicles:
        raise ValueError("No valid candidate vehicles selected")

    organization = db.query(Organization).filter(Organization.id == job.organization_id).first()

    checked = []  # list of (vehicle, route, rule_result)
    for vehicle in vehicles:
        for route in routes:
            rule_result = rule_engine.check_alternative(job, vehicle, route)
            checked.append((vehicle, route, rule_result))

    feasible_raw = []
    feasible_index = []  # index into `checked` for feasible entries, aligned with feasible_raw
    for idx, (vehicle, route, rule_result) in enumerate(checked):
        if rule_result["feasible"]:
            feasible_raw.append(
                scoring_service.raw_values(
                    job, vehicle, route, avg_stop_time_minutes=organization.avg_stop_time_minutes, avg_stop_cost=organization.avg_stop_cost
                )
            )
            feasible_index.append(idx)

    normalized_list = scoring_service.normalize_across(feasible_raw)

    scored = []
    norm_cursor = 0
    for idx, (vehicle, route, rule_result) in enumerate(checked):
        entry = {
            "vehicle": vehicle,
            "route": route,
            "feasible": rule_result["feasible"],
            "warnings": rule_result["warnings"],
            "rejection_reasons": rule_result["rejection_reasons"],
        }
        if rule_result["feasible"]:
            raw = feasible_raw[norm_cursor]
            normalized = normalized_list[norm_cursor]
            norm_cursor += 1
            weighted, total = scoring_service.weighted_score(normalized, profile.weights)
            entry.update(
                raw_values=raw,
                normalized_values=normalized,
                weighted_scores=weighted,
                total_score=total,
            )
        else:
            entry.update(raw_values={}, normalized_values={}, weighted_scores={}, total_score=0.0)
        scored.append(entry)

    ranked = optimization_service.rank_alternatives(scored)

    run = RecommendationRun(
        job_id=job.id,
        organization_id=job.organization_id,
        decision_profile_id=profile.id,
        criteria_weights=profile.weights,
        candidate_route_ids=route_ids,
        candidate_vehicle_ids=vehicle_ids,
        created_by=created_by,
    )
    db.add(run)
    db.flush()

    for entry in ranked:
        raw = entry["raw_values"]
        alt = RecommendationAlternative(
            run_id=run.id,
            vehicle_id=entry["vehicle"].id,
            route_id=entry["route"].id,
            distance_km=entry["route"].distance_km,
            # Use raw_values["time"], not the bare route duration — for a
            # multi-drop job (number_of_stops > 1) these differ (extra stop
            # time is added on top), and this column feeds both the
            # Recommendation Result display and the AHP ranking itself, so
            # they must show the same number the scoring actually used.
            duration_minutes=raw.get("time", entry["route"].estimated_duration_minutes),
            cost=raw.get("cost", 0.0),
            weight_utilization=raw.get("weight_utilization", 0.0),
            volume_utilization=raw.get("volume_utilization", 0.0),
            reliability_score=raw.get("reliability", 0.0),
            co2_estimate=raw.get("co2", 0.0),
            route_suitability=raw.get("suitability", 0.0),
            vehicle_suitability=raw.get("suitability", 0.0),
            raw_values=entry["raw_values"],
            normalized_values=entry["normalized_values"],
            weighted_scores=entry["weighted_scores"],
            total_score=entry["total_score"],
            rank=entry["rank"],
            feasible=entry["feasible"],
            warnings=entry["warnings"],
            rejection_reasons=entry["rejection_reasons"],
        )
        db.add(alt)

    job.status = "recommended"
    db.commit()
    db.refresh(run)
    return run


def build_explanations(top: RecommendationAlternative, all_feasible: list[RecommendationAlternative]) -> list[str]:
    reasons = []
    if not all_feasible:
        return reasons

    lowest_cost = min(a.cost for a in all_feasible)
    if top.cost <= lowest_cost + 1e-6:
        reasons.append(f"ทางเลือกนี้มีต้นทุนโดยประมาณต่ำที่สุด ({top.cost:,.0f} บาท)")

    lowest_time = min(a.duration_minutes for a in all_feasible)
    if top.duration_minutes <= lowest_time + 1e-6:
        reasons.append(f"ใช้เวลาเดินทางโดยประมาณสั้นที่สุด ({top.duration_minutes:,.0f} นาที)")

    lowest_co2 = min(a.co2_estimate for a in all_feasible)
    if top.co2_estimate <= lowest_co2 + 1e-6:
        reasons.append(f"ปล่อย CO2 โดยประมาณต่ำที่สุด ({top.co2_estimate:,.1f} กก.)")

    avg_util = (top.weight_utilization + top.volume_utilization) / 2
    reasons.append(f"ยานพาหนะมีความจุเพียงพอสำหรับสินค้า โดยใช้พื้นที่บรรทุกประมาณ {avg_util * 100:.0f}%")

    if top.warnings:
        reasons.append("มีข้อควรระวัง: " + "; ".join(top.warnings))

    return reasons
