import datetime as dt

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.tdss.auth import get_current_user, require_system_owner
from app.tdss.deps import org_member
from app.tdss.models import AuditLog, User

org_audit_router = APIRouter(prefix="/api/tdss/organizations/{organization_id}/audit-logs", tags=["tdss-audit"])
owner_audit_router = APIRouter(prefix="/api/tdss/owner/audit-logs", tags=["tdss-audit"])


def _serialize(rows: list[AuditLog], db: Session) -> list[dict]:
    out = []
    for r in rows:
        user = db.query(User).filter(User.id == r.user_id).first() if r.user_id else None
        out.append(
            {
                "id": r.id,
                "organization_id": r.organization_id,
                "user_id": r.user_id,
                "user_name": user.name if user else None,
                "action": r.action,
                "entity_type": r.entity_type,
                "entity_id": r.entity_id,
                "details": r.details,
                "created_at": r.created_at,
            }
        )
    return out


@org_audit_router.get("")
def list_org_audit_logs(
    organization_id: int,
    action: str | None = Query(default=None),
    entity_type: str | None = Query(default=None),
    user_id: int | None = Query(default=None),
    date_from: dt.datetime | None = Query(default=None),
    date_to: dt.datetime | None = Query(default=None),
    db: Session = Depends(get_db),
    ctx=Depends(org_member),
):
    q = db.query(AuditLog).filter(AuditLog.organization_id == organization_id)
    if action:
        q = q.filter(AuditLog.action.ilike(f"%{action}%"))
    if entity_type:
        q = q.filter(AuditLog.entity_type == entity_type)
    if user_id:
        q = q.filter(AuditLog.user_id == user_id)
    if date_from:
        q = q.filter(AuditLog.created_at >= date_from)
    if date_to:
        q = q.filter(AuditLog.created_at <= date_to)
    rows = q.order_by(AuditLog.created_at.desc()).limit(500).all()
    return _serialize(rows, db)


@owner_audit_router.get("")
def list_all_audit_logs(
    organization_id: int | None = Query(default=None),
    action: str | None = Query(default=None),
    user_id: int | None = Query(default=None),
    date_from: dt.datetime | None = Query(default=None),
    date_to: dt.datetime | None = Query(default=None),
    db: Session = Depends(get_db),
    owner: User = Depends(require_system_owner),
):
    q = db.query(AuditLog)
    if organization_id:
        q = q.filter(AuditLog.organization_id == organization_id)
    if action:
        q = q.filter(AuditLog.action.ilike(f"%{action}%"))
    if user_id:
        q = q.filter(AuditLog.user_id == user_id)
    if date_from:
        q = q.filter(AuditLog.created_at >= date_from)
    if date_to:
        q = q.filter(AuditLog.created_at <= date_to)
    rows = q.order_by(AuditLog.created_at.desc()).limit(500).all()
    return _serialize(rows, db)
