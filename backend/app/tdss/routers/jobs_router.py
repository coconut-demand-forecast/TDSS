import datetime as dt

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.tdss.audit import write_audit
from app.tdss.deps import org_member, org_writer, require_feature
from app.tdss.models import RecommendationRun, TransportJob
from app.tdss.schemas import JobCreateRequest, JobOut, JobUpdateRequest

router = APIRouter(
    prefix="/api/tdss/organizations/{organization_id}/jobs",
    tags=["tdss-jobs"],
    dependencies=[Depends(require_feature("transportation_planning"))],
)

CANCELLABLE_STATUSES = {"draft", "ready", "planning", "recommended"}


def _next_job_number(db: Session, organization_id: int) -> str:
    count = db.query(TransportJob).filter(TransportJob.organization_id == organization_id).count()
    year = dt.datetime.utcnow().year
    return f"JOB-{year}-{count + 1:04d}"


@router.get("", response_model=list[JobOut])
def list_jobs(
    organization_id: int,
    search: str | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    db: Session = Depends(get_db),
    ctx=Depends(org_member),
):
    q = db.query(TransportJob).filter(TransportJob.organization_id == organization_id)
    if search:
        like = f"%{search}%"
        q = q.filter((TransportJob.job_number.ilike(like)) | (TransportJob.customer_name.ilike(like)))
    if status_filter:
        q = q.filter(TransportJob.status == status_filter)
    return q.order_by(TransportJob.created_at.desc()).all()


@router.post("", response_model=JobOut, status_code=status.HTTP_201_CREATED)
def create_job(organization_id: int, data: JobCreateRequest, db: Session = Depends(get_db), ctx=Depends(org_writer)):
    user, _ = ctx
    job = TransportJob(
        organization_id=organization_id,
        job_number=_next_job_number(db, organization_id),
        created_by=user.id,
        status="draft",
        **data.model_dump(),
    )
    db.add(job)
    db.flush()
    write_audit(db, organization_id=organization_id, user_id=user.id, action="create", entity_type="job", entity_id=job.id)
    db.commit()
    db.refresh(job)
    return job


@router.get("/{job_id}", response_model=JobOut)
def get_job(organization_id: int, job_id: int, db: Session = Depends(get_db), ctx=Depends(org_member)):
    job = db.query(TransportJob).filter(TransportJob.id == job_id, TransportJob.organization_id == organization_id).first()
    if not job:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Job not found")
    return job


def _is_ready(job: TransportJob) -> bool:
    return bool(job.origin and job.destination and job.shipment_weight_kg and job.shipment_volume_m3)


@router.put("/{job_id}", response_model=JobOut)
def update_job(organization_id: int, job_id: int, data: JobUpdateRequest, db: Session = Depends(get_db), ctx=Depends(org_writer)):
    user, _ = ctx
    job = db.query(TransportJob).filter(TransportJob.id == job_id, TransportJob.organization_id == organization_id).first()
    if not job:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Job not found")
    if job.status in ("completed", "cancelled"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Cannot edit a job in status '{job.status}'")

    for k, v in data.model_dump(exclude_unset=True, exclude={"status"}).items():
        setattr(job, k, v)
    if job.status == "draft" and _is_ready(job):
        job.status = "ready"

    write_audit(db, organization_id=organization_id, user_id=user.id, action="update", entity_type="job", entity_id=job.id)
    db.commit()
    db.refresh(job)
    return job


@router.post("/{job_id}/cancel", response_model=JobOut)
def cancel_job(organization_id: int, job_id: int, db: Session = Depends(get_db), ctx=Depends(org_writer)):
    user, _ = ctx
    job = db.query(TransportJob).filter(TransportJob.id == job_id, TransportJob.organization_id == organization_id).first()
    if not job:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Job not found")
    if job.status not in CANCELLABLE_STATUSES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Cannot cancel a job in status '{job.status}'")
    job.status = "cancelled"
    write_audit(db, organization_id=organization_id, user_id=user.id, action="cancel", entity_type="job", entity_id=job.id)
    db.commit()
    db.refresh(job)
    return job


@router.post("/{job_id}/duplicate", response_model=JobOut, status_code=status.HTTP_201_CREATED)
def duplicate_job(organization_id: int, job_id: int, db: Session = Depends(get_db), ctx=Depends(org_writer)):
    user, _ = ctx
    original = db.query(TransportJob).filter(TransportJob.id == job_id, TransportJob.organization_id == organization_id).first()
    if not original:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Job not found")
    copy = TransportJob(
        organization_id=organization_id,
        job_number=_next_job_number(db, organization_id),
        customer_name=original.customer_name,
        origin=original.origin,
        destination=original.destination,
        required_delivery_datetime=original.required_delivery_datetime,
        shipment_weight_kg=original.shipment_weight_kg,
        shipment_volume_m3=original.shipment_volume_m3,
        number_of_stops=original.number_of_stops,
        priority=original.priority,
        special_requirements=original.special_requirements,
        preferred_route_id=original.preferred_route_id,
        status="draft",
        created_by=user.id,
    )
    db.add(copy)
    db.flush()
    write_audit(db, organization_id=organization_id, user_id=user.id, action="duplicate", entity_type="job", entity_id=copy.id, details={"from_job_id": job_id})
    db.commit()
    db.refresh(copy)
    return copy


@router.get("/{job_id}/recommendation-runs")
def job_recommendation_history(organization_id: int, job_id: int, db: Session = Depends(get_db), ctx=Depends(org_member)):
    job = db.query(TransportJob).filter(TransportJob.id == job_id, TransportJob.organization_id == organization_id).first()
    if not job:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Job not found")
    runs = (
        db.query(RecommendationRun)
        .filter(RecommendationRun.job_id == job_id)
        .order_by(RecommendationRun.created_at.desc())
        .all()
    )
    return [
        {
            "id": r.id,
            "created_at": r.created_at,
            "decision_profile_id": r.decision_profile_id,
            "has_approval": r.approval is not None,
        }
        for r in runs
    ]
