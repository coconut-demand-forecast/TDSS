from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.tdss.audit import write_audit
from app.tdss.deps import org_member, org_writer, require_feature
from app.tdss.models import Product, TransportJob, TransportJobItem
from app.tdss.schemas import JobItemCreateRequest, JobItemOut, JobItemUpdateRequest

router = APIRouter(
    prefix="/api/tdss/organizations/{organization_id}/jobs/{job_id}/items",
    tags=["tdss-job-items"],
    dependencies=[Depends(require_feature("transportation_planning"))],
)


def _get_job(db: Session, organization_id: int, job_id: int) -> TransportJob:
    job = db.query(TransportJob).filter(TransportJob.id == job_id, TransportJob.organization_id == organization_id).first()
    if not job:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Job not found")
    return job


def _recompute_job_totals(db: Session, job: TransportJob) -> None:
    """Sum every line item's weight/volume back into the job's
    shipment_weight_kg / shipment_volume_m3 — the same two columns
    rule_engine.py and scoring_service.py already read, so recommendation
    scoring needs no changes at all to pick up product-based totals.
    If a job's last item is removed, its last-known totals are left in
    place rather than reset to zero/None (fewer surprises than silently
    clearing a value the planner may still want)."""
    items = db.query(TransportJobItem).filter(TransportJobItem.job_id == job.id).all()
    if not items:
        return
    job.shipment_weight_kg = round(sum(i.quantity * i.weight_per_unit_kg for i in items), 3)
    job.shipment_volume_m3 = round(sum(i.quantity * i.volume_per_unit_m3 for i in items), 6)


def _to_item_out(item: TransportJobItem, product: Product | None) -> dict:
    return {
        "id": item.id,
        "job_id": item.job_id,
        "product_id": item.product_id,
        "quantity": item.quantity,
        "weight_per_unit_kg": item.weight_per_unit_kg,
        "volume_per_unit_m3": item.volume_per_unit_m3,
        "total_weight_kg": round(item.quantity * item.weight_per_unit_kg, 3),
        "total_volume_m3": round(item.quantity * item.volume_per_unit_m3, 6),
        "sku": product.sku if product else "(สินค้าถูกลบแล้ว)",
        "product_name": product.product_name if product else "(สินค้าถูกลบแล้ว)",
        "unit": product.unit if product else "-",
        "created_at": item.created_at,
    }


@router.get("", response_model=list[JobItemOut])
def list_job_items(organization_id: int, job_id: int, db: Session = Depends(get_db), ctx=Depends(org_member)):
    job = _get_job(db, organization_id, job_id)
    items = db.query(TransportJobItem).filter(TransportJobItem.job_id == job.id).order_by(TransportJobItem.created_at).all()
    products = {p.id: p for p in db.query(Product).filter(Product.id.in_([i.product_id for i in items])).all()}
    return [_to_item_out(i, products.get(i.product_id)) for i in items]


@router.post("", response_model=JobItemOut, status_code=status.HTTP_201_CREATED)
def add_job_item(organization_id: int, job_id: int, data: JobItemCreateRequest, db: Session = Depends(get_db), ctx=Depends(org_writer)):
    user, _ = ctx
    job = _get_job(db, organization_id, job_id)
    if job.status in ("completed", "cancelled"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Cannot edit a job in status '{job.status}'")
    product = db.query(Product).filter(Product.id == data.product_id, Product.organization_id == organization_id).first()
    if not product:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found")
    if product.status != "active":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot add an inactive product to a job")

    item = TransportJobItem(
        job_id=job.id,
        product_id=product.id,
        quantity=data.quantity,
        weight_per_unit_kg=product.weight_per_unit_kg,
        volume_per_unit_m3=product.volume_per_unit_m3,
    )
    db.add(item)
    db.flush()
    _recompute_job_totals(db, job)
    write_audit(db, organization_id=organization_id, user_id=user.id, action="add_item", entity_type="job", entity_id=job.id, details={"product_id": product.id, "quantity": data.quantity})
    db.commit()
    db.refresh(item)
    return _to_item_out(item, product)


@router.put("/{item_id}", response_model=JobItemOut)
def update_job_item(organization_id: int, job_id: int, item_id: int, data: JobItemUpdateRequest, db: Session = Depends(get_db), ctx=Depends(org_writer)):
    user, _ = ctx
    job = _get_job(db, organization_id, job_id)
    if job.status in ("completed", "cancelled"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Cannot edit a job in status '{job.status}'")
    item = db.query(TransportJobItem).filter(TransportJobItem.id == item_id, TransportJobItem.job_id == job.id).first()
    if not item:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Job item not found")
    item.quantity = data.quantity
    _recompute_job_totals(db, job)
    write_audit(db, organization_id=organization_id, user_id=user.id, action="update_item", entity_type="job", entity_id=job.id, details={"item_id": item.id, "quantity": data.quantity})
    db.commit()
    db.refresh(item)
    product = db.query(Product).filter(Product.id == item.product_id).first()
    return _to_item_out(item, product)


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_job_item(organization_id: int, job_id: int, item_id: int, db: Session = Depends(get_db), ctx=Depends(org_writer)):
    user, _ = ctx
    job = _get_job(db, organization_id, job_id)
    if job.status in ("completed", "cancelled"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Cannot edit a job in status '{job.status}'")
    item = db.query(TransportJobItem).filter(TransportJobItem.id == item_id, TransportJobItem.job_id == job.id).first()
    if not item:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Job item not found")
    db.delete(item)
    db.flush()
    _recompute_job_totals(db, job)
    write_audit(db, organization_id=organization_id, user_id=user.id, action="remove_item", entity_type="job", entity_id=job.id, details={"item_id": item_id})
    db.commit()
