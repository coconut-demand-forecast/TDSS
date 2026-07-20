from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.tdss.audit import write_audit
from app.tdss.deps import org_member, org_writer
from app.tdss.models import OrganizationFeature, RecommendationAlternative, Route
from app.tdss.schemas import RouteCreateRequest, RouteOut, RouteUpdateRequest

router = APIRouter(prefix="/api/tdss/organizations/{organization_id}/routes", tags=["tdss-routes"])


def _check_mode_feature(db: Session, organization_id: int, mode: str) -> None:
    feature_key = "google_maps_mode" if mode == "google_maps" else "manual_route_mode"
    row = (
        db.query(OrganizationFeature)
        .filter(OrganizationFeature.organization_id == organization_id, OrganizationFeature.feature_key == feature_key)
        .first()
    )
    if row is not None and not row.enabled:
        raise HTTPException(status.HTTP_403_FORBIDDEN, f"Feature '{feature_key}' is disabled for this organization")


@router.get("", response_model=list[RouteOut])
def list_routes(
    organization_id: int,
    search: str | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    db: Session = Depends(get_db),
    ctx=Depends(org_member),
):
    q = db.query(Route).filter(Route.organization_id == organization_id)
    if search:
        like = f"%{search}%"
        q = q.filter((Route.route_code.ilike(like)) | (Route.route_name.ilike(like)) | (Route.origin.ilike(like)) | (Route.destination.ilike(like)))
    if status_filter:
        q = q.filter(Route.status == status_filter)
    return q.order_by(Route.created_at.desc()).all()


@router.post("", response_model=RouteOut, status_code=status.HTTP_201_CREATED)
def create_route(organization_id: int, data: RouteCreateRequest, db: Session = Depends(get_db), ctx=Depends(org_writer)):
    user, _ = ctx
    if data.mode not in ("manual", "google_maps"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "mode must be 'manual' or 'google_maps'")
    _check_mode_feature(db, organization_id, data.mode)
    route = Route(organization_id=organization_id, **data.model_dump())
    db.add(route)
    db.flush()
    write_audit(db, organization_id=organization_id, user_id=user.id, action="create", entity_type="route", entity_id=route.id)
    db.commit()
    db.refresh(route)
    return route


@router.get("/{route_id}", response_model=RouteOut)
def get_route(organization_id: int, route_id: int, db: Session = Depends(get_db), ctx=Depends(org_member)):
    route = db.query(Route).filter(Route.id == route_id, Route.organization_id == organization_id).first()
    if not route:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Route not found")
    return route


@router.put("/{route_id}", response_model=RouteOut)
def update_route(organization_id: int, route_id: int, data: RouteUpdateRequest, db: Session = Depends(get_db), ctx=Depends(org_writer)):
    user, _ = ctx
    route = db.query(Route).filter(Route.id == route_id, Route.organization_id == organization_id).first()
    if not route:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Route not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(route, k, v)
    write_audit(db, organization_id=organization_id, user_id=user.id, action="update", entity_type="route", entity_id=route.id)
    db.commit()
    db.refresh(route)
    return route


@router.post("/{route_id}/activate", response_model=RouteOut)
def activate_route(organization_id: int, route_id: int, db: Session = Depends(get_db), ctx=Depends(org_writer)):
    return _set_status(organization_id, route_id, "active", db, ctx)


@router.post("/{route_id}/deactivate", response_model=RouteOut)
def deactivate_route(organization_id: int, route_id: int, db: Session = Depends(get_db), ctx=Depends(org_writer)):
    return _set_status(organization_id, route_id, "inactive", db, ctx)


def _set_status(organization_id, route_id, new_status, db, ctx):
    user, _ = ctx
    route = db.query(Route).filter(Route.id == route_id, Route.organization_id == organization_id).first()
    if not route:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Route not found")
    route.status = new_status
    write_audit(db, organization_id=organization_id, user_id=user.id, action=f"set_status:{new_status}", entity_type="route", entity_id=route.id)
    db.commit()
    db.refresh(route)
    return route


@router.delete("/{route_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_route(organization_id: int, route_id: int, db: Session = Depends(get_db), ctx=Depends(org_writer)):
    user, _ = ctx
    route = db.query(Route).filter(Route.id == route_id, Route.organization_id == organization_id).first()
    if not route:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Route not found")
    in_use = db.query(RecommendationAlternative).filter(RecommendationAlternative.route_id == route_id).first()
    if in_use:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot delete a route referenced by existing recommendation runs — deactivate it instead")
    db.delete(route)
    write_audit(db, organization_id=organization_id, user_id=user.id, action="delete", entity_type="route", entity_id=route_id)
    db.commit()
