import csv
import io

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.tdss.ai.dataset_builder import build_dataset_rows, compute_insights
from app.tdss.audit import write_audit
from app.tdss.auth import require_system_owner
from app.tdss.deps import org_admin_only, org_member
from app.tdss.schemas import AIInsightsOut

router = APIRouter(prefix="/api/tdss", tags=["tdss-ai"])


@router.get("/organizations/{organization_id}/ai-insights", response_model=AIInsightsOut)
def org_ai_insights(organization_id: int, db: Session = Depends(get_db), ctx=Depends(org_member)):
    return compute_insights(db, organization_id=organization_id)


@router.get("/organizations/{organization_id}/ai-insights/dataset.csv")
def org_ai_dataset(organization_id: int, db: Session = Depends(get_db), ctx=Depends(org_admin_only)):
    user, _ = ctx
    rows = build_dataset_rows(db, organization_id=organization_id)
    buf = io.StringIO()
    if rows:
        writer = csv.DictWriter(buf, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)
    buf.seek(0)
    write_audit(
        db, organization_id=organization_id, user_id=user.id, action="export_report:ai_dataset", entity_type="ai_dataset"
    )
    db.commit()
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="ai_decision_dataset.csv"'},
    )


@router.get("/owner/ai-insights", response_model=AIInsightsOut)
def owner_ai_insights(db: Session = Depends(get_db), owner=Depends(require_system_owner)):
    return compute_insights(db, organization_id=None)
