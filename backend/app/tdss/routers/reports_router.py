import csv
import datetime as dt
import io

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.tdss.audit import write_audit
from app.tdss.deps import org_member, require_feature
from app.tdss.models import (
    DecisionProfile,
    RecommendationAlternative,
    RecommendationApproval,
    RecommendationRun,
    Route,
    TransportJob,
    Vehicle,
)

router = APIRouter(
    prefix="/api/tdss/organizations/{organization_id}/reports",
    tags=["tdss-reports"],
    dependencies=[Depends(require_feature("reports"))],
)


def _csv_response(rows: list[dict], filename: str) -> StreamingResponse:
    buf = io.StringIO()
    if rows:
        writer = csv.DictWriter(buf, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)
    else:
        buf.write("")
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _log_export(db: Session, organization_id: int, user_id: int, report: str) -> None:
    write_audit(db, organization_id=organization_id, user_id=user_id, action=f"export_report:{report}", entity_type="report")
    db.commit()


def _feasible_alts_in_range(db: Session, organization_id: int, date_from: dt.datetime | None, date_to: dt.datetime | None):
    q = (
        db.query(RecommendationAlternative)
        .join(RecommendationRun, RecommendationAlternative.run_id == RecommendationRun.id)
        .filter(RecommendationRun.organization_id == organization_id, RecommendationAlternative.feasible == True)  # noqa: E712
    )
    if date_from:
        q = q.filter(RecommendationRun.created_at >= date_from)
    if date_to:
        q = q.filter(RecommendationRun.created_at <= date_to)
    return q.all()


@router.get("/jobs.csv")
def jobs_report(
    organization_id: int,
    status_filter: str | None = Query(default=None, alias="status"),
    date_from: dt.datetime | None = Query(default=None),
    date_to: dt.datetime | None = Query(default=None),
    db: Session = Depends(get_db),
    ctx=Depends(org_member),
):
    user, _ = ctx
    q = db.query(TransportJob).filter(TransportJob.organization_id == organization_id)
    if status_filter:
        q = q.filter(TransportJob.status == status_filter)
    if date_from:
        q = q.filter(TransportJob.created_at >= date_from)
    if date_to:
        q = q.filter(TransportJob.created_at <= date_to)
    jobs = q.order_by(TransportJob.created_at.desc()).all()

    rows = [
        {
            "job_number": j.job_number,
            "customer_name": j.customer_name,
            "origin": j.origin,
            "destination": j.destination,
            "shipment_weight_kg": j.shipment_weight_kg,
            "shipment_volume_m3": j.shipment_volume_m3,
            "priority": j.priority,
            "status": j.status,
            "required_delivery_datetime": j.required_delivery_datetime,
            "created_at": j.created_at,
        }
        for j in jobs
    ]
    _log_export(db, organization_id, user.id, "jobs")
    return _csv_response(rows, "transport_jobs_report.csv")


@router.get("/vehicle-utilization.csv")
def vehicle_utilization_report(
    organization_id: int,
    date_from: dt.datetime | None = Query(default=None),
    date_to: dt.datetime | None = Query(default=None),
    db: Session = Depends(get_db),
    ctx=Depends(org_member),
):
    user, _ = ctx
    alts = _feasible_alts_in_range(db, organization_id, date_from, date_to)
    rows = []
    for a in alts:
        vehicle = db.query(Vehicle).filter(Vehicle.id == a.vehicle_id).first()
        rows.append(
            {
                "vehicle_code": vehicle.vehicle_code if vehicle else a.vehicle_id,
                "run_id": a.run_id,
                "weight_utilization_pct": round(a.weight_utilization * 100, 1),
                "volume_utilization_pct": round(a.volume_utilization * 100, 1),
                "rank": a.rank,
                "selected": a.id in [ap.selected_alternative_id for ap in db.query(RecommendationApproval).filter(RecommendationApproval.run_id == a.run_id)],
            }
        )
    _log_export(db, organization_id, user.id, "vehicle_utilization")
    return _csv_response(rows, "vehicle_utilization_report.csv")


@router.get("/cost-comparison.csv")
def cost_comparison_report(
    organization_id: int,
    date_from: dt.datetime | None = Query(default=None),
    date_to: dt.datetime | None = Query(default=None),
    db: Session = Depends(get_db),
    ctx=Depends(org_member),
):
    user, _ = ctx
    alts = _feasible_alts_in_range(db, organization_id, date_from, date_to)
    rows = []
    for a in alts:
        vehicle = db.query(Vehicle).filter(Vehicle.id == a.vehicle_id).first()
        route = db.query(Route).filter(Route.id == a.route_id).first()
        rows.append(
            {
                "run_id": a.run_id,
                "vehicle_code": vehicle.vehicle_code if vehicle else a.vehicle_id,
                "route_code": route.route_code if route else a.route_id,
                "cost": a.cost,
                "rank": a.rank,
            }
        )
    _log_export(db, organization_id, user.id, "cost_comparison")
    return _csv_response(rows, "cost_comparison_report.csv")


@router.get("/co2.csv")
def co2_report(
    organization_id: int,
    date_from: dt.datetime | None = Query(default=None),
    date_to: dt.datetime | None = Query(default=None),
    db: Session = Depends(get_db),
    ctx=Depends(org_member),
):
    user, _ = ctx
    alts = _feasible_alts_in_range(db, organization_id, date_from, date_to)
    rows = []
    for a in alts:
        vehicle = db.query(Vehicle).filter(Vehicle.id == a.vehicle_id).first()
        rows.append({"run_id": a.run_id, "vehicle_code": vehicle.vehicle_code if vehicle else a.vehicle_id, "co2_estimate_kg": a.co2_estimate, "rank": a.rank})
    _log_export(db, organization_id, user.id, "co2")
    return _csv_response(rows, "co2_report.csv")


@router.get("/decision-profiles.csv")
def decision_profile_report(
    organization_id: int,
    date_from: dt.datetime | None = Query(default=None),
    date_to: dt.datetime | None = Query(default=None),
    db: Session = Depends(get_db),
    ctx=Depends(org_member),
):
    user, _ = ctx
    q = db.query(DecisionProfile).filter(DecisionProfile.organization_id == organization_id)
    if date_from:
        q = q.filter(DecisionProfile.created_at >= date_from)
    if date_to:
        q = q.filter(DecisionProfile.created_at <= date_to)
    profiles = q.all()
    rows = [
        {
            "name": p.name,
            "status": p.status,
            "weights": p.weights,
            "lambda_max": p.lambda_max,
            "ci": p.ci,
            "cr": p.cr,
            "is_consistent": p.is_consistent,
            "created_at": p.created_at,
        }
        for p in profiles
    ]
    _log_export(db, organization_id, user.id, "decision_profiles")
    return _csv_response(rows, "decision_profiles_report.csv")


@router.get("/recommendations/{run_id}.csv")
def recommendation_report(organization_id: int, run_id: int, db: Session = Depends(get_db), ctx=Depends(org_member)):
    user, _ = ctx
    run = db.query(RecommendationRun).filter(RecommendationRun.id == run_id, RecommendationRun.organization_id == organization_id).first()
    if not run:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Recommendation run not found")

    approval = db.query(RecommendationApproval).filter(RecommendationApproval.run_id == run_id).first()
    rows = []
    for a in run.alternatives:
        vehicle = db.query(Vehicle).filter(Vehicle.id == a.vehicle_id).first()
        route = db.query(Route).filter(Route.id == a.route_id).first()
        rows.append(
            {
                "rank": a.rank,
                "vehicle_code": vehicle.vehicle_code if vehicle else a.vehicle_id,
                "route_code": route.route_code if route else a.route_id,
                "cost": a.cost,
                "duration_minutes": a.duration_minutes,
                "co2_estimate": a.co2_estimate,
                "total_score": a.total_score,
                "feasible": a.feasible,
                "selected": approval is not None and approval.selected_alternative_id == a.id,
                "approval_reason": approval.reason if approval and approval.selected_alternative_id == a.id else "",
            }
        )
    _log_export(db, organization_id, user.id, "recommendation")
    return _csv_response(rows, f"recommendation_report_run{run_id}.csv")
