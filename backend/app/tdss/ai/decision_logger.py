"""AI Learning — captures every approval decision (followed AHP top pick,
overrode it, changed vehicle, changed route) into an append-only event log.
Called once from planning_router.select_alternative, right after the
RecommendationApproval is created. Never reads or writes any table besides
the new AIDecisionEvent (purely additive)."""

from sqlalchemy.orm import Session

from app.tdss.models import AIDecisionEvent, RecommendationAlternative, RecommendationRun, User


def log_decision_event(
    db: Session, *, run: RecommendationRun, selected: RecommendationAlternative, user: User, reason: str | None
) -> AIDecisionEvent:
    top = next((a for a in run.alternatives if a.rank == 1), None)

    event = AIDecisionEvent(
        run_id=run.id,
        job_id=run.job_id,
        organization_id=run.organization_id,
        decision_profile_id=run.decision_profile_id,
        top_alternative_id=top.id if top else None,
        top_vehicle_id=top.vehicle_id if top else None,
        top_route_id=top.route_id if top else None,
        top_total_score=top.total_score if top else None,
        selected_alternative_id=selected.id,
        selected_vehicle_id=selected.vehicle_id,
        selected_route_id=selected.route_id,
        selected_total_score=selected.total_score,
        selected_rank=selected.rank,
        is_override=selected.rank != 1,
        vehicle_changed=bool(top) and selected.vehicle_id != top.vehicle_id,
        route_changed=bool(top) and selected.route_id != top.route_id,
        criteria_weights=run.criteria_weights,
        selected_raw_values=selected.raw_values,
        reason=reason,
        decided_by=user.id,
    )
    db.add(event)
    return event
