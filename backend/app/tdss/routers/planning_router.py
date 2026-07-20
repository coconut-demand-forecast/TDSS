from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.tdss.audit import write_audit
from app.tdss.deps import org_writer, org_member, require_feature
from app.tdss.models import (
    DecisionProfile,
    Organization,
    RecommendationAlternative,
    RecommendationApproval,
    RecommendationRun,
    Route,
    TransportJob,
    Vehicle,
)
from app.tdss.ai.decision_logger import log_decision_event
from app.tdss.ai.explainer import generate_ai_analysis
from app.tdss.routers.notifications_router import notify_organization
from app.tdss.schemas import GenerateRecommendationRequest, RecommendationRunOut, SelectAlternativeRequest
from app.tdss.services.recommendation_service import build_explanations, generate_recommendation

router = APIRouter(prefix="/api/tdss", tags=["tdss-planning"])


def _run_out(db: Session, run: RecommendationRun) -> dict:
    alt_out = []
    for alt in run.alternatives:
        vehicle = db.query(Vehicle).filter(Vehicle.id == alt.vehicle_id).first()
        route = db.query(Route).filter(Route.id == alt.route_id).first()
        alt_out.append(
            {
                "id": alt.id,
                "vehicle_id": alt.vehicle_id,
                "vehicle_code": vehicle.vehicle_code if vehicle else "?",
                "route_id": alt.route_id,
                "route_code": route.route_code if route else "?",
                "distance_km": alt.distance_km,
                "duration_minutes": alt.duration_minutes,
                "cost": alt.cost,
                "weight_utilization": alt.weight_utilization,
                "volume_utilization": alt.volume_utilization,
                "reliability_score": alt.reliability_score,
                "co2_estimate": alt.co2_estimate,
                "route_suitability": alt.route_suitability,
                "vehicle_suitability": alt.vehicle_suitability,
                "raw_values": alt.raw_values,
                "normalized_values": alt.normalized_values,
                "weighted_scores": alt.weighted_scores,
                "total_score": alt.total_score,
                "rank": alt.rank,
                "feasible": alt.feasible,
                "warnings": alt.warnings or [],
                "rejection_reasons": alt.rejection_reasons or [],
            }
        )

    top = next((a for a in run.alternatives if a.rank == 1), None)
    feasible_alts = [a for a in run.alternatives if a.feasible]
    explanations = build_explanations(top, feasible_alts) if top else []
    top_out = next((a for a in alt_out if a["id"] == top.id), None) if top else None
    ai_analysis = (
        generate_ai_analysis(top, feasible_alts, run.criteria_weights, top_out["vehicle_code"], top_out["route_code"])
        if top and top_out
        else None
    )

    approval = None
    if run.approval:
        approval = {
            "selected_alternative_id": run.approval.selected_alternative_id,
            "approved_by": run.approval.approved_by,
            "approved_at": run.approval.approved_at,
            "reason": run.approval.reason,
        }

    return {
        "id": run.id,
        "job_id": run.job_id,
        "decision_profile_id": run.decision_profile_id,
        "criteria_weights": run.criteria_weights,
        "created_at": run.created_at,
        "alternatives": alt_out,
        "explanations": explanations,
        "ai_analysis": ai_analysis,
        "approval": approval,
    }


@router.post(
    "/organizations/{organization_id}/planning/recommend",
    response_model=RecommendationRunOut,
    dependencies=[Depends(require_feature("recommendation_engine"))],
)
def recommend(organization_id: int, data: GenerateRecommendationRequest, db: Session = Depends(get_db), ctx=Depends(org_writer)):
    user, _ = ctx
    job = db.query(TransportJob).filter(TransportJob.id == data.job_id, TransportJob.organization_id == organization_id).first()
    if not job:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Job not found")
    if not job.origin or not job.destination or not job.shipment_weight_kg or not job.shipment_volume_m3:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Job is missing required shipment info (origin, destination, weight, volume) — complete it before planning",
        )
    profile = (
        db.query(DecisionProfile)
        .filter(DecisionProfile.id == data.decision_profile_id, DecisionProfile.organization_id == organization_id)
        .first()
    )
    if not profile:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Decision profile not found")
    if not profile.is_consistent:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Decision profile is inconsistent (CR={profile.cr:.3f}) and cannot be used")

    job.status = "planning"
    db.flush()

    try:
        run = generate_recommendation(
            db,
            job=job,
            route_ids=data.route_ids,
            vehicle_ids=data.vehicle_ids,
            profile=profile,
            created_by=user.id,
        )
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))

    write_audit(
        db,
        organization_id=organization_id,
        user_id=user.id,
        action="generate_recommendation",
        entity_type="recommendation_run",
        entity_id=run.id,
        details={"job_id": job.id},
    )
    org = db.query(Organization).filter(Organization.id == organization_id).first()
    if org is None or org.notify_on_recommendation_completed:
        notify_organization(
            db,
            organization_id=organization_id,
            type_="recommendation_completed",
            message=f"สร้างคำแนะนำสำหรับงาน {job.job_number} เสร็จแล้ว",
            roles=["org_admin", "planner"],
        )
    db.commit()
    db.refresh(run)
    return _run_out(db, run)


@router.get("/organizations/{organization_id}/recommendations/{run_id}", response_model=RecommendationRunOut)
def get_recommendation(organization_id: int, run_id: int, db: Session = Depends(get_db), ctx=Depends(org_member)):
    run = db.query(RecommendationRun).filter(RecommendationRun.id == run_id, RecommendationRun.organization_id == organization_id).first()
    if not run:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Recommendation run not found")
    return _run_out(db, run)


@router.post("/organizations/{organization_id}/recommendations/{run_id}/select", response_model=RecommendationRunOut)
def select_alternative(
    organization_id: int, run_id: int, data: SelectAlternativeRequest, db: Session = Depends(get_db), ctx=Depends(org_writer)
):
    user, _ = ctx
    run = db.query(RecommendationRun).filter(RecommendationRun.id == run_id, RecommendationRun.organization_id == organization_id).first()
    if not run:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Recommendation run not found")
    if run.approval is not None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This recommendation run has already been approved")

    alt = db.query(RecommendationAlternative).filter(
        RecommendationAlternative.id == data.alternative_id, RecommendationAlternative.run_id == run_id
    ).first()
    if not alt:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Alternative not found in this run")
    if not alt.feasible:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot select an infeasible alternative")

    if alt.rank != 1 and not data.reason:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "A reason is required when selecting an alternative other than the top recommendation")

    approval = RecommendationApproval(
        run_id=run.id,
        selected_alternative_id=alt.id,
        approved_by=user.id,
        reason=data.reason,
    )
    db.add(approval)
    log_decision_event(db, run=run, selected=alt, user=user, reason=data.reason)

    job = db.query(TransportJob).filter(TransportJob.id == run.job_id).first()
    if job:
        job.status = "approved"

    write_audit(
        db,
        organization_id=organization_id,
        user_id=user.id,
        action="approve_recommendation",
        entity_type="recommendation_run",
        entity_id=run.id,
        details={"alternative_id": alt.id, "rank": alt.rank, "reason": data.reason},
    )
    if job:
        org = db.query(Organization).filter(Organization.id == organization_id).first()
        if org is None or org.notify_on_job_approved:
            notify_organization(
                db,
                organization_id=organization_id,
                type_="job_approved",
                message=f"งาน {job.job_number} ได้รับการอนุมัติแผนแล้ว",
                roles=["org_admin", "planner", "viewer"],
            )
    db.commit()
    db.refresh(run)
    return _run_out(db, run)
