from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.tdss.audit import write_audit
from app.tdss.deps import org_member, org_writer, require_feature
from app.tdss.models import DecisionProfile, RecommendationRun
from app.tdss.routers.notifications_router import notify_organization
from app.tdss.schemas import ActivateProfileRequest, DecisionProfileCreateRequest, DecisionProfileOut, DecisionProfileUpdateRequest
from app.tdss.services.ahp_service import build_matrix, calculate_weights, upper_triangle_pairs, pair_key

router = APIRouter(
    prefix="/api/tdss/organizations/{organization_id}/decision-profiles",
    tags=["tdss-decision-profiles"],
    dependencies=[Depends(require_feature("ahp_profiles"))],
)


@router.get("/criteria")
def get_criteria():
    """Returns the fixed 6 criteria and the pair keys the frontend must
    submit values for when building a new profile."""
    from app.tdss.models import CRITERIA

    return {"criteria": CRITERIA, "pairs": [pair_key(a, b) for a, b in upper_triangle_pairs()]}


@router.get("", response_model=list[DecisionProfileOut])
def list_profiles(organization_id: int, db: Session = Depends(get_db), ctx=Depends(org_member)):
    return (
        db.query(DecisionProfile)
        .filter(DecisionProfile.organization_id == organization_id)
        .order_by(DecisionProfile.created_at.desc())
        .all()
    )


@router.post("", response_model=DecisionProfileOut, status_code=status.HTTP_201_CREATED)
def create_profile(
    organization_id: int, data: DecisionProfileCreateRequest, db: Session = Depends(get_db), ctx=Depends(org_writer)
):
    user, _ = ctx
    try:
        matrix = build_matrix(data.pairwise)
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))

    result = calculate_weights(matrix)

    if not result["is_consistent"] and not data.save_as_draft_if_inconsistent:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Pairwise comparisons are inconsistent (CR={result['cr']:.3f} > 0.10). Revise the comparisons or save as draft.",
        )

    profile = DecisionProfile(
        organization_id=organization_id,
        name=data.name,
        description=data.description,
        status="draft" if not result["is_consistent"] else "inactive",
        pairwise_matrix=matrix,
        weights=result["weights"],
        lambda_max=result["lambda_max"],
        ci=result["ci"],
        cr=result["cr"],
        is_consistent=result["is_consistent"],
        created_by=user.id,
    )
    db.add(profile)
    db.flush()
    write_audit(db, organization_id=organization_id, user_id=user.id, action="create", entity_type="decision_profile", entity_id=profile.id)
    if not result["is_consistent"]:
        notify_organization(
            db,
            organization_id=organization_id,
            type_="ahp_profile_inconsistent",
            message=f"โปรไฟล์ '{profile.name}' ไม่ผ่านเกณฑ์ความสอดคล้อง (CR={result['cr']:.3f} > 0.10) — บันทึกเป็นฉบับร่าง",
            roles=["org_admin"],
        )
    db.commit()
    db.refresh(profile)
    return profile


@router.get("/{profile_id}", response_model=DecisionProfileOut)
def get_profile(organization_id: int, profile_id: int, db: Session = Depends(get_db), ctx=Depends(org_member)):
    profile = (
        db.query(DecisionProfile)
        .filter(DecisionProfile.id == profile_id, DecisionProfile.organization_id == organization_id)
        .first()
    )
    if not profile:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Decision profile not found")
    return profile


@router.put("/{profile_id}", response_model=DecisionProfileOut)
def update_profile(
    organization_id: int, profile_id: int, data: DecisionProfileUpdateRequest, db: Session = Depends(get_db), ctx=Depends(org_writer)
):
    user, _ = ctx
    profile = (
        db.query(DecisionProfile)
        .filter(DecisionProfile.id == profile_id, DecisionProfile.organization_id == organization_id)
        .first()
    )
    if not profile:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Decision profile not found")

    try:
        matrix = build_matrix(data.pairwise)
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))

    result = calculate_weights(matrix)
    if not result["is_consistent"] and not data.save_as_draft_if_inconsistent:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Pairwise comparisons are inconsistent (CR={result['cr']:.3f} > 0.10). Revise the comparisons or save as draft.",
        )

    was_active = profile.status == "active"
    profile.name = data.name
    profile.description = data.description
    profile.pairwise_matrix = matrix
    profile.weights = result["weights"]
    profile.lambda_max = result["lambda_max"]
    profile.ci = result["ci"]
    profile.cr = result["cr"]
    profile.is_consistent = result["is_consistent"]

    if not result["is_consistent"]:
        # An active profile that becomes inconsistent after editing can no
        # longer stay active — same rule as create/activate.
        profile.status = "draft"
        notify_organization(
            db,
            organization_id=organization_id,
            type_="ahp_profile_inconsistent",
            message=f"โปรไฟล์ '{profile.name}' ไม่ผ่านเกณฑ์ความสอดคล้องหลังแก้ไข (CR={result['cr']:.3f} > 0.10) — ถูกปรับเป็นฉบับร่าง",
            roles=["org_admin"],
        )
    elif was_active:
        profile.status = "active"
    elif profile.status == "draft":
        # No longer inconsistent — promote out of draft; still requires an
        # explicit /activate call to actually go live.
        profile.status = "inactive"

    write_audit(db, organization_id=organization_id, user_id=user.id, action="update", entity_type="decision_profile", entity_id=profile.id)
    db.commit()
    db.refresh(profile)
    return profile


@router.post("/{profile_id}/activate", response_model=DecisionProfileOut)
def set_active(
    organization_id: int, profile_id: int, data: ActivateProfileRequest, db: Session = Depends(get_db), ctx=Depends(org_writer)
):
    user, _ = ctx
    profile = (
        db.query(DecisionProfile)
        .filter(DecisionProfile.id == profile_id, DecisionProfile.organization_id == organization_id)
        .first()
    )
    if not profile:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Decision profile not found")

    if data.active:
        if not profile.is_consistent:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"Cannot activate an inconsistent profile (CR={profile.cr:.3f} > 0.10)",
            )
        # Only one active profile per organization at a time, to keep "which
        # profile is currently in effect" unambiguous for planners.
        db.query(DecisionProfile).filter(
            DecisionProfile.organization_id == organization_id, DecisionProfile.status == "active"
        ).update({"status": "inactive"})
        profile.status = "active"
    else:
        profile.status = "inactive"

    write_audit(
        db,
        organization_id=organization_id,
        user_id=user.id,
        action=f"set_active:{data.active}",
        entity_type="decision_profile",
        entity_id=profile.id,
    )
    db.commit()
    db.refresh(profile)
    return profile


@router.delete("/{profile_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_profile(organization_id: int, profile_id: int, db: Session = Depends(get_db), ctx=Depends(org_writer)):
    user, _ = ctx
    profile = (
        db.query(DecisionProfile)
        .filter(DecisionProfile.id == profile_id, DecisionProfile.organization_id == organization_id)
        .first()
    )
    if not profile:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Decision profile not found")
    in_use = db.query(RecommendationRun).filter(RecommendationRun.decision_profile_id == profile_id).first()
    if in_use:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Cannot delete a decision profile referenced by existing recommendation runs — set it to inactive instead to keep historical reports accurate",
        )
    db.delete(profile)
    write_audit(db, organization_id=organization_id, user_id=user.id, action="delete", entity_type="decision_profile", entity_id=profile_id)
    db.commit()
