import datetime as dt

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.tdss.deps import org_member
from app.tdss.models import RecommendationAlternative, RecommendationApproval, RecommendationRun, TransportJob
from app.tdss.schemas import DashboardSummaryOut

router = APIRouter(prefix="/api/tdss/organizations/{organization_id}/dashboard", tags=["tdss-dashboard"])


def _jobs_query(db: Session, organization_id: int, date_from: dt.datetime | None, date_to: dt.datetime | None):
    q = db.query(TransportJob).filter(TransportJob.organization_id == organization_id)
    if date_from:
        q = q.filter(TransportJob.created_at >= date_from)
    if date_to:
        q = q.filter(TransportJob.created_at <= date_to)
    return q


def _runs_query(db: Session, organization_id: int, date_from: dt.datetime | None, date_to: dt.datetime | None):
    q = db.query(RecommendationRun).filter(RecommendationRun.organization_id == organization_id)
    if date_from:
        q = q.filter(RecommendationRun.created_at >= date_from)
    if date_to:
        q = q.filter(RecommendationRun.created_at <= date_to)
    return q


@router.get("/summary", response_model=DashboardSummaryOut)
def dashboard_summary(
    organization_id: int,
    date_from: dt.datetime | None = Query(default=None),
    date_to: dt.datetime | None = Query(default=None),
    db: Session = Depends(get_db),
    ctx=Depends(org_member),
):
    jobs = _jobs_query(db, organization_id, date_from, date_to).all()
    total_jobs = len(jobs)
    awaiting = sum(1 for j in jobs if j.status in ("draft", "ready"))

    runs = _runs_query(db, organization_id, date_from, date_to).all()
    run_ids = [r.id for r in runs]
    approvals = db.query(RecommendationApproval).filter(RecommendationApproval.run_id.in_(run_ids)).all() if run_ids else []

    approved_alt_ids = [a.selected_alternative_id for a in approvals]
    approved_alts = (
        db.query(RecommendationAlternative).filter(RecommendationAlternative.id.in_(approved_alt_ids)).all()
        if approved_alt_ids
        else []
    )

    def avg(values):
        values = [v for v in values if v is not None]
        return round(sum(values) / len(values), 3) if values else None

    avg_util = avg([(a.weight_utilization + a.volume_utilization) / 2 for a in approved_alts]) if approved_alts else None
    avg_cost = avg([a.cost for a in approved_alts]) if approved_alts else None
    avg_reliability = avg([a.reliability_score for a in approved_alts]) if approved_alts else None
    avg_co2 = avg([a.co2_estimate for a in approved_alts]) if approved_alts else None

    # "Cost saving" = average cost of the top-ranked alternative across runs
    # minus what was actually approved, i.e. the cost impact of picking a
    # non-top alternative (0 when the top recommendation was always taken).
    cost_saving = None
    if approvals:
        deltas = []
        for run in runs:
            approval = next((a for a in approvals if a.run_id == run.id), None)
            if not approval:
                continue
            top = next((a for a in run.alternatives if a.rank == 1), None)
            selected = next((a for a in run.alternatives if a.id == approval.selected_alternative_id), None)
            if top and selected:
                deltas.append(top.cost - selected.cost)
        cost_saving = avg(deltas)

    return DashboardSummaryOut(
        total_jobs=total_jobs,
        jobs_awaiting_planning=awaiting,
        recommendations_generated=len(runs),
        approved_plans=len(approvals),
        avg_utilization_pct=round(avg_util * 100, 1) if avg_util is not None else None,
        avg_estimated_cost=avg_cost,
        estimated_cost_saving=cost_saving,
        avg_reliability_pct=round(avg_reliability * 100, 1) if avg_reliability is not None else None,
        avg_co2=avg_co2,
    )


@router.get("/recent-jobs")
def recent_jobs(
    organization_id: int,
    date_from: dt.datetime | None = Query(default=None),
    date_to: dt.datetime | None = Query(default=None),
    db: Session = Depends(get_db),
    ctx=Depends(org_member),
):
    jobs = _jobs_query(db, organization_id, date_from, date_to).order_by(TransportJob.created_at.desc()).limit(8).all()
    return [
        {"id": j.id, "job_number": j.job_number, "customer_name": j.customer_name, "status": j.status, "created_at": j.created_at}
        for j in jobs
    ]


@router.get("/status-distribution")
def status_distribution(
    organization_id: int,
    date_from: dt.datetime | None = Query(default=None),
    date_to: dt.datetime | None = Query(default=None),
    db: Session = Depends(get_db),
    ctx=Depends(org_member),
):
    jobs = _jobs_query(db, organization_id, date_from, date_to).all()
    counts: dict[str, int] = {}
    for j in jobs:
        counts[j.status] = counts.get(j.status, 0) + 1
    return counts
