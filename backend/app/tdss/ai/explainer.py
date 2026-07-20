"""AI Analysis layer — sits *after* the AHP recommendation is computed and
turns its scores into a natural-language explanation. Rule-based/deterministic
by design (no external API, no cost, no latency risk): it reads the same
RecommendationAlternative objects the recommendation engine already produced
and never touches rule_engine / scoring_service / optimization_service /
recommendation_service.generate_recommendation.
"""

CRITERION_LABELS = {
    "cost": "ต้นทุน",
    "time": "เวลา",
    "utilization": "การใช้ความจุ",
    "reliability": "ความน่าเชื่อถือ",
    "co2": "การปล่อย CO2",
    "suitability": "ความเหมาะสม",
}


def generate_ai_analysis(top, all_feasible: list, criteria_weights: dict, vehicle_code: str = "?", route_code: str = "?") -> dict | None:
    if top is None or not all_feasible:
        return None

    strengths: list[str] = []
    cautions: list[str] = list(top.warnings or [])

    lowest_cost = min(a.cost for a in all_feasible)
    lowest_time = min(a.duration_minutes for a in all_feasible)
    lowest_co2 = min(a.co2_estimate for a in all_feasible)
    highest_reliability = max(a.reliability_score for a in all_feasible)

    if top.cost <= lowest_cost + 1e-6:
        strengths.append(f"ต้นทุนต่ำที่สุดในบรรดาทางเลือกที่เป็นไปได้ ({top.cost:,.0f} บาท)")
    if top.duration_minutes <= lowest_time + 1e-6:
        strengths.append(f"ใช้เวลาเดินทางน้อยที่สุด ({top.duration_minutes:,.0f} นาที)")
    if top.co2_estimate <= lowest_co2 + 1e-6:
        strengths.append(f"ปล่อย CO2 ต่ำที่สุด ({top.co2_estimate:,.1f} กก.)")
    if top.reliability_score >= highest_reliability - 1e-6:
        strengths.append("มีความน่าเชื่อถือของเส้นทางสูงที่สุดในบรรดาทางเลือกที่เป็นไปได้")
    if not strengths:
        strengths.append("มีคะแนนรวมถ่วงน้ำหนักสูงที่สุดเมื่อพิจารณาทุกเกณฑ์ประกอบกัน")

    avg_util = (top.weight_utilization + top.volume_utilization) / 2
    if avg_util >= 0.85:
        cautions.append(f"ใช้พื้นที่บรรทุกสูงถึง {avg_util * 100:.0f}% ควรตรวจสอบน้ำหนัก/ปริมาตรสินค้าจริงอีกครั้งก่อนยืนยัน")
    elif avg_util <= 0.3:
        cautions.append(f"ใช้พื้นที่บรรทุกเพียง {avg_util * 100:.0f}% อาจพิจารณารวมงานอื่นในเที่ยวเดียวกันเพื่อความคุ้มค่า")

    if criteria_weights:
        top_criterion = max(criteria_weights, key=criteria_weights.get)
        criterion_th = CRITERION_LABELS.get(top_criterion, top_criterion)
        vehicle_reason = (
            f"ยานพาหนะ {vehicle_code} ถูกเลือกเพราะให้คะแนนรวมสูงสุดภายใต้โปรไฟล์การตัดสินใจนี้ "
            f"ซึ่งให้น้ำหนักความสำคัญกับ{criterion_th}เป็นหลัก และมีความจุเพียงพอสำหรับสินค้า "
            f"(ใช้พื้นที่บรรทุกประมาณ {avg_util * 100:.0f}%)"
        )
        route_reason = (
            f"เส้นทาง {route_code} ถูกเลือกเพราะให้ผลรวมของระยะทาง เวลา และความเสี่ยงที่สมดุลที่สุดเมื่อเทียบกับ"
            f"ทางเลือกอื่น ภายใต้น้ำหนักเกณฑ์เดียวกันที่เน้น{criterion_th}"
        )
    else:
        vehicle_reason = f"ยานพาหนะ {vehicle_code} ได้คะแนนรวมสูงสุดในบรรดาทางเลือกที่เป็นไปได้"
        route_reason = f"เส้นทาง {route_code} ได้คะแนนรวมสูงสุดในบรรดาทางเลือกที่เป็นไปได้"

    return {
        "vehicle_reason": vehicle_reason,
        "route_reason": route_reason,
        "strengths": strengths,
        "cautions": cautions,
    }
