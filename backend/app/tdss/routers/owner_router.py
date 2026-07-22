import datetime as dt

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db
from app.tdss.audit import write_audit
from app.tdss.auth import require_system_owner
from app.tdss.routers.notifications_router import notify_organization
from app.tdss.models import (
    FEATURE_KEYS,
    AuditLog,
    Membership,
    Organization,
    OrganizationFeature,
    RecommendationRun,
    Route,
    TransportJob,
    User,
    Vehicle,
)
from app.tdss.schemas import (
    FeatureOut,
    OrganizationCreateRequest,
    OrganizationOut,
    OrganizationUsageRow,
    OwnerDashboardOut,
    SetFeatureRequest,
    SystemHealthOut,
)

router = APIRouter(prefix="/api/tdss/owner", tags=["tdss-owner"])


@router.get("/dashboard", response_model=OwnerDashboardOut)
def owner_dashboard(db: Session = Depends(get_db), owner: User = Depends(require_system_owner)):
    orgs = db.query(Organization).all()
    return OwnerDashboardOut(
        total_organizations=len(orgs),
        active_organizations=sum(1 for o in orgs if o.status == "active"),
        suspended_organizations=sum(1 for o in orgs if o.status == "suspended"),
        pending_organizations=sum(1 for o in orgs if o.status == "pending"),
        total_users=db.query(User).count(),
        total_jobs=db.query(TransportJob).count(),
        recommendation_runs=db.query(RecommendationRun).count(),
    )


@router.get("/usage", response_model=list[OrganizationUsageRow])
def owner_usage(
    organization_id: int | None = Query(default=None),
    search: str | None = Query(default=None),
    date_from: dt.datetime | None = Query(default=None),
    date_to: dt.datetime | None = Query(default=None),
    db: Session = Depends(get_db),
    owner: User = Depends(require_system_owner),
):
    """Real usage only — every count below is a direct query against
    actual rows, never estimated or fabricated. Each metric is filtered by
    its own natural date column (jobs by TransportJob.created_at,
    recommendation runs by RecommendationRun.created_at, exports by
    AuditLog.created_at) so date_from/date_to means "activity in this
    window" per metric, not a single unrelated timestamp."""
    orgs_q = db.query(Organization)
    if organization_id:
        orgs_q = orgs_q.filter(Organization.id == organization_id)
    if search:
        orgs_q = orgs_q.filter(Organization.name.ilike(f"%{search}%"))
    orgs = orgs_q.order_by(Organization.name).all()

    def _ranged(q, column):
        if date_from:
            q = q.filter(column >= date_from)
        if date_to:
            q = q.filter(column <= date_to)
        return q

    rows = []
    for org in orgs:
        job_count = _ranged(db.query(TransportJob).filter(TransportJob.organization_id == org.id), TransportJob.created_at).count()
        run_count = _ranged(db.query(RecommendationRun).filter(RecommendationRun.organization_id == org.id), RecommendationRun.created_at).count()
        export_count = _ranged(
            db.query(AuditLog).filter(AuditLog.organization_id == org.id, AuditLog.action.like("export_report:%")), AuditLog.created_at
        ).count()
        active_users = db.query(Membership).filter(Membership.organization_id == org.id, Membership.status == "active").count()
        vehicle_count = db.query(Vehicle).filter(Vehicle.organization_id == org.id).count()
        route_count = db.query(Route).filter(Route.organization_id == org.id).count()

        rows.append(
            OrganizationUsageRow(
                organization_id=org.id,
                organization_name=org.name,
                organization_status=org.status,
                job_count=job_count,
                recommendation_run_count=run_count,
                active_user_count=active_users,
                vehicle_count=vehicle_count,
                route_count=route_count,
                report_export_count=export_count,
            )
        )
    return rows


@router.get("/organizations", response_model=list[OrganizationOut])
def list_all_organizations(
    search: str | None = Query(default=None), db: Session = Depends(get_db), owner: User = Depends(require_system_owner)
):
    q = db.query(Organization)
    if search:
        q = q.filter(Organization.name.ilike(f"%{search}%"))
    return q.order_by(Organization.created_at.desc()).all()


@router.post("/organizations", response_model=OrganizationOut, status_code=status.HTTP_201_CREATED)
def create_organization(data: OrganizationCreateRequest, db: Session = Depends(get_db), owner: User = Depends(require_system_owner)):
    org = Organization(name=data.name)
    db.add(org)
    db.flush()
    write_audit(db, organization_id=org.id, user_id=owner.id, action="create", entity_type="organization", entity_id=org.id)
    db.commit()
    db.refresh(org)
    return org


@router.get("/organizations/{organization_id}", response_model=OrganizationOut)
def get_organization_as_owner(organization_id: int, db: Session = Depends(get_db), owner: User = Depends(require_system_owner)):
    org = db.query(Organization).filter(Organization.id == organization_id).first()
    if not org:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Organization not found")
    return org


@router.post("/organizations/{organization_id}/suspend", response_model=OrganizationOut)
def suspend_organization(organization_id: int, db: Session = Depends(get_db), owner: User = Depends(require_system_owner)):
    return _set_org_status(organization_id, "suspended", db, owner)


@router.post("/organizations/{organization_id}/activate", response_model=OrganizationOut)
def activate_organization(organization_id: int, db: Session = Depends(get_db), owner: User = Depends(require_system_owner)):
    return _set_org_status(organization_id, "active", db, owner)


def _set_org_status(organization_id: int, new_status: str, db: Session, owner: User) -> Organization:
    org = db.query(Organization).filter(Organization.id == organization_id).first()
    if not org:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Organization not found")
    org.status = new_status
    write_audit(db, organization_id=org.id, user_id=owner.id, action=f"set_status:{new_status}", entity_type="organization", entity_id=org.id)
    if new_status == "suspended":
        notify_organization(
            db,
            organization_id=org.id,
            type_="organization_suspended",
            message=f"องค์กร {org.name} ถูกระงับการใช้งานโดยผู้ดูแลระบบ",
        )
    db.commit()
    db.refresh(org)
    return org


@router.get("/organizations/{organization_id}/features", response_model=list[FeatureOut])
def get_org_features(organization_id: int, db: Session = Depends(get_db), owner: User = Depends(require_system_owner)):
    rows = {f.feature_key: f.enabled for f in db.query(OrganizationFeature).filter(OrganizationFeature.organization_id == organization_id).all()}
    return [FeatureOut(feature_key=key, enabled=rows.get(key, True)) for key in FEATURE_KEYS]


@router.put("/organizations/{organization_id}/features", response_model=FeatureOut)
def set_org_feature(
    organization_id: int, data: SetFeatureRequest, db: Session = Depends(get_db), owner: User = Depends(require_system_owner)
):
    if data.feature_key not in FEATURE_KEYS:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"feature_key must be one of {FEATURE_KEYS}")
    row = (
        db.query(OrganizationFeature)
        .filter(OrganizationFeature.organization_id == organization_id, OrganizationFeature.feature_key == data.feature_key)
        .first()
    )
    if row is None:
        row = OrganizationFeature(organization_id=organization_id, feature_key=data.feature_key, enabled=data.enabled)
        db.add(row)
    else:
        row.enabled = data.enabled
    write_audit(
        db,
        organization_id=organization_id,
        user_id=owner.id,
        action="set_feature",
        entity_type="organization_feature",
        details={"feature_key": data.feature_key, "enabled": data.enabled},
    )
    db.commit()
    return FeatureOut(feature_key=data.feature_key, enabled=data.enabled)


@router.get("/users")
def list_all_users(
    search: str | None = Query(default=None), db: Session = Depends(get_db), owner: User = Depends(require_system_owner)
):
    q = db.query(User)
    if search:
        like = f"%{search}%"
        q = q.filter((User.name.ilike(like)) | (User.email.ilike(like)))
    users = q.order_by(User.created_at.desc()).all()
    result = []
    for u in users:
        memberships = db.query(Membership).filter(Membership.user_id == u.id).all()
        result.append(
            {
                "id": u.id,
                "name": u.name,
                "email": u.email,
                "is_system_owner": u.is_system_owner,
                "status": u.status,
                "organizations": [{"organization_id": m.organization_id, "organization_name": m.organization.name, "role": m.role} for m in memberships],
            }
        )
    return result


@router.post("/users/{user_id}/status")
def set_user_status(user_id: int, new_status: str, db: Session = Depends(get_db), owner: User = Depends(require_system_owner)):
    if new_status not in ("active", "suspended", "disabled"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "status must be active, suspended, or disabled")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if user.is_system_owner:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Cannot modify a System Owner account")
    user.status = new_status
    write_audit(db, organization_id=None, user_id=owner.id, action=f"set_status:{new_status}", entity_type="user", entity_id=user.id)
    db.commit()
    return {"id": user.id, "status": user.status}


@router.get("/system-health", response_model=SystemHealthOut)
def system_health(db: Session = Depends(get_db), owner: User = Depends(require_system_owner)):
    db_ok = True
    try:
        db.execute(text("SELECT 1"))
    except Exception:
        db_ok = False

    return SystemHealthOut(
        api_status="ok",
        database_connected=db_ok,
        app_version="0.1.0",
        environment="development",
        total_organizations=db.query(Organization).count(),
        total_users=db.query(User).count(),
        total_jobs=db.query(TransportJob).count(),
    )
