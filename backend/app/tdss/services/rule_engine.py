"""Hard/soft rule filtering for candidate (vehicle, route) alternatives.

Hard rules produce rejection_reasons and make the alternative infeasible
(excluded from ranking/scoring). Soft rules produce warnings only — the
alternative stays feasible but the reason is surfaced to the planner.
"""

import datetime as dt

from app.tdss.models import Route, TransportJob, Vehicle


def check_alternative(job: TransportJob, vehicle: Vehicle, route: Route) -> dict:
    rejection_reasons: list[str] = []
    warnings: list[str] = []

    if vehicle.status != "active":
        rejection_reasons.append(f"ยานพาหนะ {vehicle.vehicle_code} ไม่ได้อยู่ในสถานะพร้อมใช้งาน")
    if route.status != "active":
        rejection_reasons.append(f"เส้นทาง {route.route_code} ไม่ได้อยู่ในสถานะใช้งาน")

    if job.shipment_weight_kg is not None and job.shipment_weight_kg > vehicle.capacity_weight_kg:
        rejection_reasons.append(
            f"น้ำหนักสินค้า ({job.shipment_weight_kg:,.0f} กก.) เกินความจุยานพาหนะ ({vehicle.capacity_weight_kg:,.0f} กก.)"
        )
    if job.shipment_volume_m3 is not None and job.shipment_volume_m3 > vehicle.capacity_volume_m3:
        rejection_reasons.append(
            f"ปริมาตรสินค้า ({job.shipment_volume_m3:,.1f} ลบ.ม.) เกินความจุยานพาหนะ ({vehicle.capacity_volume_m3:,.1f} ลบ.ม.)"
        )

    if job.required_delivery_datetime is not None:
        estimated_arrival = dt.datetime.utcnow() + dt.timedelta(minutes=route.estimated_duration_minutes)
        if estimated_arrival > job.required_delivery_datetime:
            rejection_reasons.append(
                f"เวลาที่ใช้เดินทางโดยประมาณเกินกำหนดส่งมอบ (ถึงประมาณ {estimated_arrival.strftime('%Y-%m-%d %H:%M')})"
            )

    if route.road_restrictions and job.special_requirements:
        warnings.append(f"เส้นทางมีข้อจำกัด ({route.road_restrictions}) — ตรวจสอบให้ตรงกับความต้องการพิเศษของสินค้าอีกครั้ง")
    elif route.road_restrictions:
        warnings.append(f"เส้นทางมีข้อจำกัด: {route.road_restrictions}")

    if route.route_risk_level == "high":
        warnings.append("เส้นทางนี้มีระดับความเสี่ยงสูง")

    return {
        "feasible": len(rejection_reasons) == 0,
        "warnings": warnings,
        "rejection_reasons": rejection_reasons,
    }
