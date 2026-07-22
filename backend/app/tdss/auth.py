import datetime as dt

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.tdss.models import Membership, User

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer_scheme = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)


def create_access_token(user_id: int) -> str:
    expire = dt.datetime.utcnow() + dt.timedelta(minutes=settings.jwt_expire_minutes)
    payload = {"sub": str(user_id), "exp": expire}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    try:
        payload = jwt.decode(credentials.credentials, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        user_id = int(payload.get("sub"))
    except (JWTError, TypeError, ValueError):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token")

    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found")
    if user.status != "active":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "User account is not active")
    return user


def get_membership(db: Session, user: User, organization_id: int) -> Membership | None:
    return (
        db.query(Membership)
        .filter(Membership.user_id == user.id, Membership.organization_id == organization_id, Membership.status == "active")
        .first()
    )


def require_org_access(organization_id: int, db: Session, user: User) -> Membership | None:
    """Returns the active Membership for (user, organization_id), or None if the
    user is the System Owner (who bypasses org scoping). Raises 403 otherwise."""
    if user.is_system_owner:
        return None
    membership = get_membership(db, user, organization_id)
    if membership is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No access to this organization")

    from app.tdss.models import Organization

    org = db.query(Organization).filter(Organization.id == organization_id).first()
    if org is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Organization is suspended")
    if org.status == "pending":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Organization is pending approval by the System Owner")
    if org.status != "active":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Organization is suspended")
    return membership


def require_role(membership: Membership | None, roles: list[str], is_owner: bool) -> None:
    """Owner always passes. Otherwise membership.role must be in roles."""
    if is_owner:
        return
    if membership is None or membership.role not in roles:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient role for this action")


def require_system_owner(user: User = Depends(get_current_user)) -> User:
    if not user.is_system_owner:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "System Owner access required")
    return user
