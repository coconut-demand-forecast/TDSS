from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.tdss.audit import write_audit
from app.tdss.deps import org_member, org_writer
from app.tdss.models import RecommendationAlternative, TransportJob, Vehicle
from app.tdss.schemas import VehicleCreateRequest, VehicleOut, VehicleUpdateRequest

router = APIRouter(prefix="/api/tdss/organizations/{organization_id}/vehicles", tags=["tdss-vehicles"])


@router.get("", response_model=list[VehicleOut])
def list_vehicles(
    organization_id: int,
    search: str | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    vehicle_type: str | None = Query(default=None),
    db: Session = Depends(get_db),
    ctx=Depends(org_member),
):
    q = db.query(Vehicle).filter(Vehicle.organization_id == organization_id)
    if search:
        like = f"%{search}%"
        q = q.filter((Vehicle.vehicle_code.ilike(like)) | (Vehicle.registration_number.ilike(like)))
    if status_filter:
        q = q.filter(Vehicle.status == status_filter)
    if vehicle_type:
        q = q.filter(Vehicle.vehicle_type == vehicle_type)
    return q.order_by(Vehicle.created_at.desc()).all()


@router.post("", response_model=VehicleOut, status_code=status.HTTP_201_CREATED)
def create_vehicle(organization_id: int, data: VehicleCreateRequest, db: Session = Depends(get_db), ctx=Depends(org_writer)):
    user, _ = ctx
    vehicle = Vehicle(organization_id=organization_id, **data.model_dump())
    db.add(vehicle)
    db.flush()
    write_audit(db, organization_id=organization_id, user_id=user.id, action="create", entity_type="vehicle", entity_id=vehicle.id)
    db.commit()
    db.refresh(vehicle)
    return vehicle


@router.get("/{vehicle_id}", response_model=VehicleOut)
def get_vehicle(organization_id: int, vehicle_id: int, db: Session = Depends(get_db), ctx=Depends(org_member)):
    vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id, Vehicle.organization_id == organization_id).first()
    if not vehicle:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Vehicle not found")
    return vehicle


@router.put("/{vehicle_id}", response_model=VehicleOut)
def update_vehicle(
    organization_id: int, vehicle_id: int, data: VehicleUpdateRequest, db: Session = Depends(get_db), ctx=Depends(org_writer)
):
    user, _ = ctx
    vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id, Vehicle.organization_id == organization_id).first()
    if not vehicle:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Vehicle not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(vehicle, k, v)
    write_audit(db, organization_id=organization_id, user_id=user.id, action="update", entity_type="vehicle", entity_id=vehicle.id)
    db.commit()
    db.refresh(vehicle)
    return vehicle


@router.post("/{vehicle_id}/activate", response_model=VehicleOut)
def activate_vehicle(organization_id: int, vehicle_id: int, db: Session = Depends(get_db), ctx=Depends(org_writer)):
    return _set_status(organization_id, vehicle_id, "active", db, ctx)


@router.post("/{vehicle_id}/deactivate", response_model=VehicleOut)
def deactivate_vehicle(organization_id: int, vehicle_id: int, db: Session = Depends(get_db), ctx=Depends(org_writer)):
    return _set_status(organization_id, vehicle_id, "inactive", db, ctx)


def _set_status(organization_id, vehicle_id, new_status, db, ctx):
    user, _ = ctx
    vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id, Vehicle.organization_id == organization_id).first()
    if not vehicle:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Vehicle not found")
    vehicle.status = new_status
    write_audit(
        db, organization_id=organization_id, user_id=user.id, action=f"set_status:{new_status}", entity_type="vehicle", entity_id=vehicle.id
    )
    db.commit()
    db.refresh(vehicle)
    return vehicle


@router.delete("/{vehicle_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_vehicle(organization_id: int, vehicle_id: int, db: Session = Depends(get_db), ctx=Depends(org_writer)):
    user, _ = ctx
    vehicle = db.query(Vehicle).filter(Vehicle.id == vehicle_id, Vehicle.organization_id == organization_id).first()
    if not vehicle:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Vehicle not found")
    in_use = db.query(RecommendationAlternative).filter(RecommendationAlternative.vehicle_id == vehicle_id).first()
    if in_use:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot delete a vehicle referenced by existing recommendation runs — deactivate it instead")
    db.delete(vehicle)
    write_audit(db, organization_id=organization_id, user_id=user.id, action="delete", entity_type="vehicle", entity_id=vehicle_id)
    db.commit()
