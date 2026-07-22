from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.tdss.audit import write_audit
from app.tdss.deps import org_member, org_writer
from app.tdss.models import Product, TransportJobItem
from app.tdss.schemas import ProductCreateRequest, ProductOut, ProductUpdateRequest

router = APIRouter(prefix="/api/tdss/organizations/{organization_id}/products", tags=["tdss-products"])


def _volume_per_unit_m3(width_cm: float, length_cm: float, height_cm: float) -> float:
    """Product dimensions are entered in centimetres (natural for parcel-scale
    goods); volume is always derived server-side — never trusted from the
    client — so it can't drift from width x length x height."""
    return round((width_cm * length_cm * height_cm) / 1_000_000, 6)


@router.get("", response_model=list[ProductOut])
def list_products(
    organization_id: int,
    search: str | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    db: Session = Depends(get_db),
    ctx=Depends(org_member),
):
    q = db.query(Product).filter(Product.organization_id == organization_id)
    if search:
        like = f"%{search}%"
        q = q.filter((Product.sku.ilike(like)) | (Product.product_name.ilike(like)))
    if status_filter:
        q = q.filter(Product.status == status_filter)
    return q.order_by(Product.created_at.desc()).all()


@router.post("", response_model=ProductOut, status_code=status.HTTP_201_CREATED)
def create_product(organization_id: int, data: ProductCreateRequest, db: Session = Depends(get_db), ctx=Depends(org_writer)):
    user, _ = ctx
    payload = data.model_dump()
    product = Product(
        organization_id=organization_id,
        volume_per_unit_m3=_volume_per_unit_m3(payload["width_cm"], payload["length_cm"], payload["height_cm"]),
        **payload,
    )
    db.add(product)
    db.flush()
    write_audit(db, organization_id=organization_id, user_id=user.id, action="create", entity_type="product", entity_id=product.id)
    db.commit()
    db.refresh(product)
    return product


@router.get("/{product_id}", response_model=ProductOut)
def get_product(organization_id: int, product_id: int, db: Session = Depends(get_db), ctx=Depends(org_member)):
    product = db.query(Product).filter(Product.id == product_id, Product.organization_id == organization_id).first()
    if not product:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found")
    return product


@router.put("/{product_id}", response_model=ProductOut)
def update_product(
    organization_id: int, product_id: int, data: ProductUpdateRequest, db: Session = Depends(get_db), ctx=Depends(org_writer)
):
    user, _ = ctx
    product = db.query(Product).filter(Product.id == product_id, Product.organization_id == organization_id).first()
    if not product:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(product, k, v)
    product.volume_per_unit_m3 = _volume_per_unit_m3(product.width_cm, product.length_cm, product.height_cm)
    write_audit(db, organization_id=organization_id, user_id=user.id, action="update", entity_type="product", entity_id=product.id)
    db.commit()
    db.refresh(product)
    return product


@router.post("/{product_id}/activate", response_model=ProductOut)
def activate_product(organization_id: int, product_id: int, db: Session = Depends(get_db), ctx=Depends(org_writer)):
    return _set_status(organization_id, product_id, "active", db, ctx)


@router.post("/{product_id}/deactivate", response_model=ProductOut)
def deactivate_product(organization_id: int, product_id: int, db: Session = Depends(get_db), ctx=Depends(org_writer)):
    return _set_status(organization_id, product_id, "inactive", db, ctx)


def _set_status(organization_id, product_id, new_status, db, ctx):
    user, _ = ctx
    product = db.query(Product).filter(Product.id == product_id, Product.organization_id == organization_id).first()
    if not product:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found")
    product.status = new_status
    write_audit(
        db, organization_id=organization_id, user_id=user.id, action=f"set_status:{new_status}", entity_type="product", entity_id=product.id
    )
    db.commit()
    db.refresh(product)
    return product


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_product(organization_id: int, product_id: int, db: Session = Depends(get_db), ctx=Depends(org_writer)):
    user, _ = ctx
    product = db.query(Product).filter(Product.id == product_id, Product.organization_id == organization_id).first()
    if not product:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found")
    in_use = db.query(TransportJobItem).filter(TransportJobItem.product_id == product_id).first()
    if in_use:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot delete a product referenced by existing job items — deactivate it instead")
    db.delete(product)
    write_audit(db, organization_id=organization_id, user_id=user.id, action="delete", entity_type="product", entity_id=product_id)
    db.commit()
