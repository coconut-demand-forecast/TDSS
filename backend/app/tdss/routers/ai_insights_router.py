from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.tdss.ai.dataset_builder import build_dataset_rows, compute_insights
from app.tdss.audit import write_audit
from app.tdss.auth import require_system_owner
from app.tdss.deps import org_admin_only, org_member
from app.tdss.pdf_utils import pdf_response
from app.tdss.schemas import AIInsightsOut

router = APIRouter(prefix="/api/tdss", tags=["tdss-ai"])


@router.get("/organizations/{organization_id}/ai-insights", response_model=AIInsightsOut)
def org_ai_insights(organization_id: int, db: Session = Depends(get_db), ctx=Depends(org_member)):
    return compute_insights(db, organization_id=organization_id)


@router.get("/organizations/{organization_id}/ai-insights/dataset.pdf")
def org_ai_dataset(organization_id: int, db: Session = Depends(get_db), ctx=Depends(org_admin_only)):
    user, _ = ctx
    rows = build_dataset_rows(db, organization_id=organization_id)
    write_audit(
        db, organization_id=organization_id, user_id=user.id, action="export_report:ai_dataset", entity_type="ai_dataset"
    )
    db.commit()
    return pdf_response(
        rows,
        title="AI Learning Dataset",
        subtitle="ข้อมูลดิบสำหรับฝึกโมเดล — 1 แถวต่อการอนุมัติ 1 ครั้ง",
        filename="ai_decision_dataset.pdf",
    )


@router.get("/owner/ai-insights", response_model=AIInsightsOut)
def owner_ai_insights(db: Session = Depends(get_db), owner=Depends(require_system_owner)):
    return compute_insights(db, organization_id=None)
