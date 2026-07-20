import datetime as dt

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.tdss.audit import write_audit
from app.tdss.deps import org_member, require_feature
from app.tdss.models import (
    DecisionProfile,
    RecommendationAlternative,
    RecommendationApproval,
    RecommendationRun,
    Route,
    TransportJob,
    Vehicle,
)
from app.tdss.pdf_utils import pdf_response

router = APIRouter(
    prefix="/api/tdss/organizations/{organization_id}/reports",
    tags=["tdss-reports"],
    dependencies=[Depends(require_feature("reports"))],
)


def _log_export(db: Session, organization_id: int, user_id: int, report: str) -> None:
    write_audit(db, organization_id=organization_id, user_id=user_id, action=f"export_report:{report}", entity_type="report")
    db.commit()


def _feasible_alts_in_range(db: Session, organization_id: int, date_from: dt.datetime | None, date_to: dt.datetime | None):
    q = (
        db.query(RecommendationAlternative)
        .join(RecommendationRun, RecommendationAlternative.run_id == RecommendationRun.id)
        .filter(RecommendationRun.organization_id == organization_id, RecommendationAlternative.feasible == True)  # noqa: E712
    )
    if date_from:
        q = q.filter(RecommendationRun.created_at >= date_from)
    if date_to:
        q = q.filter(RecommendationRun.created_at <= date_to)
    return q.all()


@router.get("/jobs.pdf")
def jobs_report(
    organization_id: int,
    status_filter: str | None = Query(default=None, alias="status"),
    date_from: dt.datetime | None = Query(default=None),
    date_to: dt.datetime | None = Query(default=None),
    db: Session = Depends(get_db),
    ctx=Depends(org_member),
):
    user, _ = ctx
    q = db.query(TransportJob).filter(TransportJob.organization_id == organization_id)
    if status_filter:
        q = q.filter(TransportJob.status == status_filter)
    if date_from:
        q = q.filter(TransportJob.created_at >= date_from)
    if date_to:
        q = q.filter(TransportJob.created_at <= date_to)
    jobs = q.order_by(TransportJob.created_at.desc()).all()

    rows = [
        {
            "เลขที่งาน": j.job_number,
            "ลูกค้า": j.customer_name,
            "ต้นทาง": j.origin,
            "ปลายทาง": j.destination,
            "น้ำหนัก (กก.)": j.shipment_weight_kg,
            "ปริมาตร (ลบ.ม.)": j.shipment_volume_m3,
            "ความสำคัญ": j.priority,
            "สถานะ": j.status,
            "กำหนดส่งมอบ": j.required_delivery_datetime,
            "สร้างเมื่อ": j.created_at,
        }
        for j in jobs
    ]
    _log_export(db, organization_id, user.id, "jobs")
    return pdf_response(rows, title="รายงานงานขนส่ง", subtitle=None, filename="transport_jobs_report.pdf")


@router.get("/vehicle-utilization.pdf")
def vehicle_utilization_report(
    organization_id: int,
    date_from: dt.datetime | None = Query(default=None),
    date_to: dt.datetime | None = Query(default=None),
    db: Session = Depends(get_db),
    ctx=Depends(org_member),
):
    user, _ = ctx
    alts = _feasible_alts_in_range(db, organization_id, date_from, date_to)
    rows = []
    for a in alts:
        vehicle = db.query(Vehicle).filter(Vehicle.id == a.vehicle_id).first()
        rows.append(
            {
                "ยานพาหนะ": vehicle.vehicle_code if vehicle else a.vehicle_id,
                "รหัสคำแนะนำ": a.run_id,
                "ใช้ความจุน้ำหนัก (%)": round(a.weight_utilization * 100, 1),
                "ใช้ความจุปริมาตร (%)": round(a.volume_utilization * 100, 1),
                "อันดับ": a.rank,
                "ถูกเลือก": a.id in [ap.selected_alternative_id for ap in db.query(RecommendationApproval).filter(RecommendationApproval.run_id == a.run_id)],
            }
        )
    _log_export(db, organization_id, user.id, "vehicle_utilization")
    return pdf_response(rows, title="รายงานการใช้ยานพาหนะ", subtitle=None, filename="vehicle_utilization_report.pdf")


@router.get("/cost-comparison.pdf")
def cost_comparison_report(
    organization_id: int,
    date_from: dt.datetime | None = Query(default=None),
    date_to: dt.datetime | None = Query(default=None),
    db: Session = Depends(get_db),
    ctx=Depends(org_member),
):
    user, _ = ctx
    alts = _feasible_alts_in_range(db, organization_id, date_from, date_to)
    rows = []
    for a in alts:
        vehicle = db.query(Vehicle).filter(Vehicle.id == a.vehicle_id).first()
        route = db.query(Route).filter(Route.id == a.route_id).first()
        rows.append(
            {
                "รหัสคำแนะนำ": a.run_id,
                "ยานพาหนะ": vehicle.vehicle_code if vehicle else a.vehicle_id,
                "เส้นทาง": route.route_code if route else a.route_id,
                "ต้นทุน (บาท)": a.cost,
                "อันดับ": a.rank,
            }
        )
    _log_export(db, organization_id, user.id, "cost_comparison")
    return pdf_response(rows, title="รายงานเปรียบเทียบต้นทุน", subtitle=None, filename="cost_comparison_report.pdf")


@router.get("/co2.pdf")
def co2_report(
    organization_id: int,
    date_from: dt.datetime | None = Query(default=None),
    date_to: dt.datetime | None = Query(default=None),
    db: Session = Depends(get_db),
    ctx=Depends(org_member),
):
    user, _ = ctx
    alts = _feasible_alts_in_range(db, organization_id, date_from, date_to)
    rows = []
    for a in alts:
        vehicle = db.query(Vehicle).filter(Vehicle.id == a.vehicle_id).first()
        rows.append(
            {
                "รหัสคำแนะนำ": a.run_id,
                "ยานพาหนะ": vehicle.vehicle_code if vehicle else a.vehicle_id,
                "CO2 โดยประมาณ (กก.)": a.co2_estimate,
                "อันดับ": a.rank,
            }
        )
    _log_export(db, organization_id, user.id, "co2")
    return pdf_response(rows, title="รายงานการปล่อย CO2", subtitle=None, filename="co2_report.pdf")


@router.get("/decision-profiles.pdf")
def decision_profile_report(
    organization_id: int,
    date_from: dt.datetime | None = Query(default=None),
    date_to: dt.datetime | None = Query(default=None),
    db: Session = Depends(get_db),
    ctx=Depends(org_member),
):
    user, _ = ctx
    q = db.query(DecisionProfile).filter(DecisionProfile.organization_id == organization_id)
    if date_from:
        q = q.filter(DecisionProfile.created_at >= date_from)
    if date_to:
        q = q.filter(DecisionProfile.created_at <= date_to)
    profiles = q.all()
    rows = [
        {
            "ชื่อโปรไฟล์": p.name,
            "สถานะ": p.status,
            "น้ำหนักเกณฑ์": p.weights,
            "Lambda max": p.lambda_max,
            "CI": p.ci,
            "CR": p.cr,
            "ผ่านเกณฑ์ความสอดคล้อง": p.is_consistent,
            "สร้างเมื่อ": p.created_at,
        }
        for p in profiles
    ]
    _log_export(db, organization_id, user.id, "decision_profiles")
    return pdf_response(rows, title="รายงานโปรไฟล์การตัดสินใจ (AHP)", subtitle=None, filename="decision_profiles_report.pdf")


@router.get("/recommendations/{run_id}.pdf")
def recommendation_report(organization_id: int, run_id: int, db: Session = Depends(get_db), ctx=Depends(org_member)):
    user, _ = ctx
    run = db.query(RecommendationRun).filter(RecommendationRun.id == run_id, RecommendationRun.organization_id == organization_id).first()
    if not run:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Recommendation run not found")

    approval = db.query(RecommendationApproval).filter(RecommendationApproval.run_id == run_id).first()
    rows = []
    for a in run.alternatives:
        vehicle = db.query(Vehicle).filter(Vehicle.id == a.vehicle_id).first()
        route = db.query(Route).filter(Route.id == a.route_id).first()
        rows.append(
            {
                "อันดับ": a.rank,
                "ยานพาหนะ": vehicle.vehicle_code if vehicle else a.vehicle_id,
                "เส้นทาง": route.route_code if route else a.route_id,
                "ต้นทุน (บาท)": a.cost,
                "เวลา (นาที)": a.duration_minutes,
                "CO2 (กก.)": a.co2_estimate,
                "คะแนนรวม": a.total_score,
                "เป็นไปได้": a.feasible,
                "ถูกเลือก": approval is not None and approval.selected_alternative_id == a.id,
                "เหตุผลการอนุมัติ": approval.reason if approval and approval.selected_alternative_id == a.id else "",
            }
        )
    _log_export(db, organization_id, user.id, "recommendation")
    return pdf_response(rows, title="รายงานผลการแนะนำ", subtitle=f"คำแนะนำจากงาน #{run.job_id}", filename=f"recommendation_report_run{run_id}.pdf")
