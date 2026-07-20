from sqlalchemy.orm import Session

from app.tdss.models import AuditLog


def write_audit(
    db: Session,
    *,
    organization_id: int | None,
    user_id: int | None,
    action: str,
    entity_type: str,
    entity_id: int | None = None,
    details: dict | None = None,
) -> AuditLog:
    entry = AuditLog(
        organization_id=organization_id,
        user_id=user_id,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        details=details,
    )
    db.add(entry)
    db.flush()
    return entry
