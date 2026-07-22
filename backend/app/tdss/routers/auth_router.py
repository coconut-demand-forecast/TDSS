from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.tdss.auth import create_access_token, get_current_user, hash_password, verify_password
from app.tdss.models import ROLE_ORG_ADMIN, Membership, Organization, User
from app.tdss.routers.notifications_router import notify
from app.tdss.schemas import (
    ChangePasswordRequest,
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    UpdateProfileRequest,
    UserOut,
)

router = APIRouter(prefix="/api/tdss/auth", tags=["tdss-auth"])


def _user_out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        name=user.name,
        email=user.email,
        is_system_owner=user.is_system_owner,
        status=user.status,
        memberships=[
            {
                "organization_id": m.organization_id,
                "organization_name": m.organization.name,
                "organization_status": m.organization.status,
                "role": m.role,
                "membership_status": m.status,
            }
            for m in user.memberships
        ],
    )


@router.post("/register", response_model=TokenResponse)
def register(data: RegisterRequest, db: Session = Depends(get_db)):
    """Registers a new user AND a new organization, making the user that
    organization's admin. This is the practical "sign up your company"
    entry point — joining an *existing* organization happens via the
    Organization Admin inviting a user (see /api/tdss/organizations/{id}/users).

    The new organization starts as "pending" — not usable — until a System
    Owner approves it (POST /api/tdss/owner/organizations/{id}/activate, the
    same endpoint already used to reactivate a suspended org). This keeps
    self-service signup from granting immediate, unreviewed access."""
    existing = db.query(User).filter(User.email == data.email).first()
    if existing:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Email already registered")

    user = User(name=data.name, email=data.email, password_hash=hash_password(data.password))
    db.add(user)
    db.flush()

    org = Organization(name=data.organization_name, status="pending")
    db.add(org)
    db.flush()

    membership = Membership(user_id=user.id, organization_id=org.id, role=ROLE_ORG_ADMIN)
    db.add(membership)

    for owner in db.query(User).filter(User.is_system_owner == True).all():  # noqa: E712
        notify(
            db,
            user_id=owner.id,
            organization_id=None,
            type_="org_pending_approval",
            message=f"องค์กรใหม่ \"{org.name}\" สมัครใช้งานและรอการอนุมัติ",
        )

    db.commit()
    db.refresh(user)

    token = create_access_token(user.id)
    return TokenResponse(access_token=token, user=_user_out(user))


@router.post("/login", response_model=TokenResponse)
def login(data: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email).first()
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    if user.status != "active":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Account is not active")

    token = create_access_token(user.id)
    return TokenResponse(access_token=token, user=_user_out(user))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return _user_out(user)


@router.put("/me", response_model=UserOut)
def update_profile(data: UpdateProfileRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    user.name = data.name
    db.commit()
    db.refresh(user)
    return _user_out(user)


@router.post("/change-password")
def change_password(data: ChangePasswordRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not verify_password(data.current_password, user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is incorrect")
    user.password_hash = hash_password(data.new_password)
    db.commit()
    return {"status": "ok"}
