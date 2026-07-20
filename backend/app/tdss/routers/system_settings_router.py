from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.tdss.audit import write_audit
from app.tdss.auth import require_system_owner
from app.tdss.models import SystemSettings, User
from app.tdss.schemas import SystemSettingsOut, SystemSettingsUpdateRequest

router = APIRouter(prefix="/api/tdss/system-settings", tags=["tdss-system-settings"])


def _get_or_create(db: Session) -> SystemSettings:
    row = db.query(SystemSettings).filter(SystemSettings.id == 1).first()
    if row is None:
        row = SystemSettings(id=1, app_display_name="TDSS", banner_message=None)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


@router.get("", response_model=SystemSettingsOut)
def get_system_settings(db: Session = Depends(get_db)):
    """Public — the display name/banner are shown on the login page too, and
    contain nothing sensitive. No auth required to read them."""
    row = _get_or_create(db)
    return SystemSettingsOut(app_display_name=row.app_display_name, banner_message=row.banner_message)


@router.put("", response_model=SystemSettingsOut)
def update_system_settings(
    data: SystemSettingsUpdateRequest, db: Session = Depends(get_db), owner: User = Depends(require_system_owner)
):
    row = _get_or_create(db)
    row.app_display_name = data.app_display_name
    row.banner_message = data.banner_message or None
    write_audit(db, organization_id=None, user_id=owner.id, action="update_system_settings", entity_type="system_settings")
    db.commit()
    db.refresh(row)
    return SystemSettingsOut(app_display_name=row.app_display_name, banner_message=row.banner_message)
