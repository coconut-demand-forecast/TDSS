from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.tdss.auth import get_current_user
from app.tdss.models import Notification, User
from app.tdss.schemas import NotificationOut

router = APIRouter(prefix="/api/tdss/notifications", tags=["tdss-notifications"])


@router.get("", response_model=list[NotificationOut])
def list_notifications(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return (
        db.query(Notification)
        .filter(Notification.user_id == user.id)
        .order_by(Notification.created_at.desc())
        .limit(50)
        .all()
    )


@router.post("/{notification_id}/read", response_model=NotificationOut)
def mark_read(notification_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    n = db.query(Notification).filter(Notification.id == notification_id, Notification.user_id == user.id).first()
    if not n:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Notification not found")
    n.is_read = True
    db.commit()
    db.refresh(n)
    return n


@router.post("/read-all")
def mark_all_read(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    db.query(Notification).filter(Notification.user_id == user.id, Notification.is_read == False).update({"is_read": True})  # noqa: E712
    db.commit()
    return {"status": "ok"}


def notify(db: Session, *, user_id: int | None, organization_id: int | None, type_: str, message: str) -> Notification:
    n = Notification(user_id=user_id, organization_id=organization_id, type=type_, message=message)
    db.add(n)
    db.flush()
    return n


def notify_organization(db: Session, *, organization_id: int, type_: str, message: str, roles: list[str] | None = None) -> None:
    """Fans out one Notification row per active member of the organization
    (optionally restricted to specific roles). `list_notifications` only
    matches on `user_id`, so a single organization-scoped row would never
    surface to anyone — fan-out is what actually makes it visible."""
    from app.tdss.models import Membership

    q = db.query(Membership).filter(Membership.organization_id == organization_id, Membership.status == "active")
    if roles:
        q = q.filter(Membership.role.in_(roles))
    for m in q.all():
        db.add(Notification(user_id=m.user_id, organization_id=organization_id, type=type_, message=message))
