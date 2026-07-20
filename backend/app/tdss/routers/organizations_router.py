from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.tdss.audit import write_audit
from app.tdss.auth import hash_password
from app.tdss.deps import org_admin_only, org_member
from app.tdss.models import (
    FEATURE_KEYS,
    DecisionProfile,
    Membership,
    Organization,
    OrganizationFeature,
    ORG_ROLES,
    Route,
    TransportJob,
    User,
    Vehicle,
)
from app.tdss.schemas import (
    FeatureOut,
    InviteUserRequest,
    OrganizationInfoOut,
    OrganizationInfoUpdateRequest,
    OrganizationOut,
    OrganizationSettingsOut,
    OrganizationSettingsUpdateRequest,
    OrganizationUsageOut,
    OrgUserOut,
    UpdateMembershipRequest,
)

router = APIRouter(prefix="/api/tdss/organizations", tags=["tdss-organizations"])


@router.get("/{organization_id}", response_model=OrganizationOut)
def get_organization(organization_id: int, db: Session = Depends(get_db), ctx=Depends(org_member)):
    org = db.query(Organization).filter(Organization.id == organization_id).first()
    if not org:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Organization not found")
    return org


def _usage_out(db: Session, organization_id: int) -> OrganizationUsageOut:
    return OrganizationUsageOut(
        vehicle_count=db.query(Vehicle).filter(Vehicle.organization_id == organization_id).count(),
        route_count=db.query(Route).filter(Route.organization_id == organization_id).count(),
        job_count=db.query(TransportJob).filter(TransportJob.organization_id == organization_id).count(),
        user_count=db.query(Membership).filter(Membership.organization_id == organization_id, Membership.status == "active").count(),
        decision_profile_count=db.query(DecisionProfile).filter(DecisionProfile.organization_id == organization_id).count(),
    )


@router.get("/{organization_id}/info", response_model=OrganizationInfoOut)
def get_organization_info(organization_id: int, db: Session = Depends(get_db), ctx=Depends(org_member)):
    org = db.query(Organization).filter(Organization.id == organization_id).first()
    if not org:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Organization not found")
    rows = {f.feature_key: f.enabled for f in db.query(OrganizationFeature).filter(OrganizationFeature.organization_id == organization_id).all()}
    return OrganizationInfoOut(
        id=org.id,
        name=org.name,
        code=org.code,
        status=org.status,
        contact=org.contact,
        address=org.address,
        created_at=org.created_at,
        features=[FeatureOut(feature_key=key, enabled=rows.get(key, True)) for key in FEATURE_KEYS],
        usage=_usage_out(db, organization_id),
    )


@router.put("/{organization_id}/info", response_model=OrganizationInfoOut)
def update_organization_info(
    organization_id: int, data: OrganizationInfoUpdateRequest, db: Session = Depends(get_db), ctx=Depends(org_admin_only)
):
    """org_admin may edit name/code/contact/address only — suspension
    status and platform feature access stay System-Owner-only (owner_router)."""
    user, _ = ctx
    org = db.query(Organization).filter(Organization.id == organization_id).first()
    if not org:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Organization not found")
    org.name = data.name
    org.code = data.code
    org.contact = data.contact
    org.address = data.address
    write_audit(db, organization_id=organization_id, user_id=user.id, action="update_info", entity_type="organization", entity_id=org.id)
    db.commit()
    return get_organization_info(organization_id, db, ctx)


@router.get("/{organization_id}/settings", response_model=OrganizationSettingsOut)
def get_organization_settings(organization_id: int, db: Session = Depends(get_db), ctx=Depends(org_member)):
    org = db.query(Organization).filter(Organization.id == organization_id).first()
    if not org:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Organization not found")
    return OrganizationSettingsOut(
        default_route_mode=org.default_route_mode,
        default_decision_profile_id=org.default_decision_profile_id,
        notify_on_recommendation_completed=org.notify_on_recommendation_completed,
        notify_on_job_approved=org.notify_on_job_approved,
    )


@router.put("/{organization_id}/settings", response_model=OrganizationSettingsOut)
def update_organization_settings(
    organization_id: int, data: OrganizationSettingsUpdateRequest, db: Session = Depends(get_db), ctx=Depends(org_admin_only)
):
    user, _ = ctx
    org = db.query(Organization).filter(Organization.id == organization_id).first()
    if not org:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Organization not found")
    if data.default_route_mode not in ("manual", "google_maps"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "default_route_mode must be 'manual' or 'google_maps'")
    if data.default_decision_profile_id is not None:
        profile = (
            db.query(DecisionProfile)
            .filter(DecisionProfile.id == data.default_decision_profile_id, DecisionProfile.organization_id == organization_id)
            .first()
        )
        if not profile:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "default_decision_profile_id must reference a profile in this organization")

    org.default_route_mode = data.default_route_mode
    org.default_decision_profile_id = data.default_decision_profile_id
    org.notify_on_recommendation_completed = data.notify_on_recommendation_completed
    org.notify_on_job_approved = data.notify_on_job_approved
    write_audit(db, organization_id=organization_id, user_id=user.id, action="update_settings", entity_type="organization", entity_id=org.id)
    db.commit()
    return get_organization_settings(organization_id, db, ctx)


@router.get("/{organization_id}/users", response_model=list[OrgUserOut])
def list_org_users(organization_id: int, db: Session = Depends(get_db), ctx=Depends(org_member)):
    memberships = db.query(Membership).filter(Membership.organization_id == organization_id).all()
    return [
        OrgUserOut(
            user_id=m.user_id,
            name=m.user.name,
            email=m.user.email,
            role=m.role,
            membership_status=m.status,
            user_status=m.user.status,
        )
        for m in memberships
    ]


@router.post("/{organization_id}/users", response_model=OrgUserOut, status_code=status.HTTP_201_CREATED)
def invite_user(organization_id: int, data: InviteUserRequest, db: Session = Depends(get_db), ctx=Depends(org_admin_only)):
    """Practical local-development "invite": creates the user account
    directly with the given password (no email delivery in this round) and
    a membership in this organization. A real invite-by-email flow is a
    reasonable follow-up but out of scope here."""
    admin_user, _ = ctx
    if data.role not in ORG_ROLES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"role must be one of {ORG_ROLES}")

    user = db.query(User).filter(User.email == data.email).first()
    if user is None:
        user = User(name=data.name, email=data.email, password_hash=hash_password(data.password))
        db.add(user)
        db.flush()
    else:
        existing_membership = db.query(Membership).filter(Membership.user_id == user.id, Membership.organization_id == organization_id).first()
        if existing_membership:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "This user is already a member of this organization")

    membership = Membership(user_id=user.id, organization_id=organization_id, role=data.role)
    db.add(membership)
    write_audit(db, organization_id=organization_id, user_id=admin_user.id, action="invite_user", entity_type="user", entity_id=user.id, details={"role": data.role})
    db.commit()

    return OrgUserOut(user_id=user.id, name=user.name, email=user.email, role=data.role, membership_status="active", user_status=user.status)


@router.put("/{organization_id}/users/{user_id}", response_model=OrgUserOut)
def update_org_user(
    organization_id: int, user_id: int, data: UpdateMembershipRequest, db: Session = Depends(get_db), ctx=Depends(org_admin_only)
):
    admin_user, _ = ctx
    membership = db.query(Membership).filter(Membership.user_id == user_id, Membership.organization_id == organization_id).first()
    if not membership:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Membership not found")

    if data.role is not None:
        if data.role not in ORG_ROLES:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"role must be one of {ORG_ROLES}")
        membership.role = data.role
    if data.membership_status is not None:
        if data.membership_status not in ("active", "suspended", "disabled"):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "membership_status must be active, suspended, or disabled")
        membership.status = data.membership_status

    write_audit(
        db,
        organization_id=organization_id,
        user_id=admin_user.id,
        action="update_membership",
        entity_type="user",
        entity_id=user_id,
        details=data.model_dump(exclude_unset=True),
    )
    db.commit()
    db.refresh(membership)
    return OrgUserOut(
        user_id=membership.user_id,
        name=membership.user.name,
        email=membership.user.email,
        role=membership.role,
        membership_status=membership.status,
        user_status=membership.user.status,
    )


@router.get("/{organization_id}/features", response_model=list[FeatureOut])
def list_features(organization_id: int, db: Session = Depends(get_db), ctx=Depends(org_member)):
    rows = {f.feature_key: f.enabled for f in db.query(OrganizationFeature).filter(OrganizationFeature.organization_id == organization_id).all()}
    # Any feature key with no explicit row defaults to enabled.
    return [FeatureOut(feature_key=key, enabled=rows.get(key, True)) for key in FEATURE_KEYS]
