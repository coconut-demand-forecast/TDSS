from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.tdss.auth import get_current_user, require_org_access, require_role
from app.tdss.models import Organization, User, WRITE_ROLES


def get_org_or_404(organization_id: int, db: Session) -> Organization:
    org = db.query(Organization).filter(Organization.id == organization_id).first()
    if org is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Organization not found")
    return org


def org_member(organization_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Any active membership (or System Owner) may read org-scoped data."""
    get_org_or_404(organization_id, db)
    membership = require_org_access(organization_id, db, user)
    return user, membership


def org_writer(organization_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """org_admin or planner (or System Owner) may create/edit/approve."""
    get_org_or_404(organization_id, db)
    membership = require_org_access(organization_id, db, user)
    require_role(membership, WRITE_ROLES, user.is_system_owner)
    return user, membership


def org_admin_only(organization_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    get_org_or_404(organization_id, db)
    membership = require_org_access(organization_id, db, user)
    require_role(membership, ["org_admin"], user.is_system_owner)
    return user, membership


def require_feature(feature_key: str):
    """Dependency factory: 403s if `feature_key` is disabled for the
    organization. A feature with no explicit OrganizationFeature row is
    enabled by default (matches organizations_router.list_features /
    owner_router.get_org_features, which use the same default). System
    Owner bypasses this, same as org-suspension checks."""

    def checker(organization_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
        if user.is_system_owner:
            return
        from app.tdss.models import OrganizationFeature

        row = (
            db.query(OrganizationFeature)
            .filter(OrganizationFeature.organization_id == organization_id, OrganizationFeature.feature_key == feature_key)
            .first()
        )
        if row is not None and not row.enabled:
            raise HTTPException(status.HTTP_403_FORBIDDEN, f"Feature '{feature_key}' is disabled for this organization")

    return checker
