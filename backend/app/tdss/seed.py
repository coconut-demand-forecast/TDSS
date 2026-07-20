"""Seeds demonstration data for TDSS: 1 System Owner, 2 Organizations, one
admin/planner/viewer per organization, vehicles, routes, a valid AHP
Decision Profile, sample jobs, and one full recommendation + approval.

Run with:  ./venv/Scripts/python.exe -m app.tdss.seed
Safe to re-run — skips entirely if the demo owner account already exists.
"""

from app.database import Base, SessionLocal, engine
from app.tdss import models as _models  # noqa: F401 registers tables
from app.tdss.auth import create_access_token, hash_password
from app.tdss.models import (
    DecisionProfile,
    Membership,
    Organization,
    ROLE_ORG_ADMIN,
    ROLE_PLANNER,
    ROLE_VIEWER,
    Route,
    TransportJob,
    User,
    Vehicle,
)
from app.tdss.services.ahp_service import build_matrix, calculate_weights, default_consistent_pairwise
from app.tdss.services.recommendation_service import generate_recommendation

OWNER_EMAIL = "owner@tdss.local"
DEMO_PASSWORD = "password123"


def run_seed():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        if db.query(User).filter(User.email == OWNER_EMAIL).first():
            print(f"Seed already applied (found {OWNER_EMAIL}) — skipping.")
            return

        owner = User(name="System Owner", email=OWNER_EMAIL, password_hash=hash_password(DEMO_PASSWORD), is_system_owner=True)
        db.add(owner)
        db.flush()

        orgs_spec = [
            {
                "name": "บริษัท โลจิสติกส์ตัวอย่าง จำกัด",
                "admin_email": "admin@orgone.local",
                "planner_email": "planner@orgone.local",
                "viewer_email": "viewer@orgone.local",
            },
            {
                "name": "บริษัท ขนส่งไทยพัฒนา จำกัด",
                "admin_email": "admin@orgtwo.local",
                "planner_email": "planner@orgtwo.local",
                "viewer_email": "viewer@orgtwo.local",
            },
        ]

        created_orgs = []
        for spec in orgs_spec:
            org = Organization(name=spec["name"])
            db.add(org)
            db.flush()

            for email, role, name in [
                (spec["admin_email"], ROLE_ORG_ADMIN, "ผู้ดูแลองค์กร"),
                (spec["planner_email"], ROLE_PLANNER, "นักวางแผน"),
                (spec["viewer_email"], ROLE_VIEWER, "ผู้เยี่ยมชม"),
            ]:
                u = User(name=name, email=email, password_hash=hash_password(DEMO_PASSWORD))
                db.add(u)
                db.flush()
                db.add(Membership(user_id=u.id, organization_id=org.id, role=role))

            created_orgs.append(org)

        db.flush()
        org1 = created_orgs[0]
        admin1 = db.query(User).filter(User.email == orgs_spec[0]["admin_email"]).first()
        planner1 = db.query(User).filter(User.email == orgs_spec[0]["planner_email"]).first()

        vehicles = [
            Vehicle(
                organization_id=org1.id,
                vehicle_code="TRK-001",
                registration_number="70-1234 ชลบุรี",
                vehicle_type="รถบรรทุก 6 ล้อ",
                capacity_weight_kg=5000,
                capacity_volume_m3=20,
                fuel_type="ดีเซล",
                fuel_consumption_km_per_liter=8,
                cost_per_km=15,
                fixed_cost=500,
                co2_factor=0.85,
            ),
            Vehicle(
                organization_id=org1.id,
                vehicle_code="TRK-002",
                registration_number="70-5678 ชลบุรี",
                vehicle_type="รถบรรทุก 10 ล้อ",
                capacity_weight_kg=12000,
                capacity_volume_m3=40,
                fuel_type="ดีเซล",
                fuel_consumption_km_per_liter=5,
                cost_per_km=25,
                fixed_cost=900,
                co2_factor=1.4,
            ),
            Vehicle(
                organization_id=org1.id,
                vehicle_code="PKP-001",
                registration_number="ฮค-4321 กรุงเทพมหานคร",
                vehicle_type="รถกระบะ",
                capacity_weight_kg=1500,
                capacity_volume_m3=6,
                fuel_type="ดีเซล",
                fuel_consumption_km_per_liter=14,
                cost_per_km=8,
                fixed_cost=200,
                co2_factor=0.4,
            ),
            Vehicle(
                organization_id=org1.id,
                vehicle_code="TRL-001",
                registration_number="70-9999 ชลบุรี",
                vehicle_type="รถหัวลาก",
                capacity_weight_kg=25000,
                capacity_volume_m3=60,
                fuel_type="ดีเซล",
                fuel_consumption_km_per_liter=3.5,
                cost_per_km=35,
                fixed_cost=1500,
                co2_factor=2.1,
                status="inactive",  # seeded example of an out-of-service vehicle
            ),
        ]
        db.add_all(vehicles)

        routes = [
            Route(
                organization_id=org1.id,
                route_code="RT-001",
                route_name="อมตะซิตี้ ชลบุรี → บางนา",
                origin="อมตะซิตี้ ชลบุรี",
                destination="ศูนย์กระจายสินค้า บางนา",
                distance_km=95,
                estimated_duration_minutes=110,
                toll_cost=120,
                route_risk_level="low",
                mode="manual",
            ),
            Route(
                organization_id=org1.id,
                route_code="RT-002",
                route_name="อมตะซิตี้ ชลบุรี → บางนา (เลี่ยงเมือง)",
                origin="อมตะซิตี้ ชลบุรี",
                destination="ศูนย์กระจายสินค้า บางนา",
                distance_km=110,
                estimated_duration_minutes=95,
                toll_cost=180,
                route_risk_level="low",
                road_restrictions="ห้ามรถบรรทุกเกิน 10 ล้อ ช่วง 06:00-09:00",
                mode="manual",
            ),
            Route(
                organization_id=org1.id,
                route_code="RT-003",
                route_name="อมตะซิตี้ ชลบุรี → บางนา (ผ่านเมือง)",
                origin="อมตะซิตี้ ชลบุรี",
                destination="ศูนย์กระจายสินค้า บางนา",
                distance_km=88,
                estimated_duration_minutes=150,
                toll_cost=0,
                route_risk_level="medium",
                mode="manual",
            ),
        ]
        db.add_all(routes)
        db.flush()

        pairwise = default_consistent_pairwise()
        matrix = build_matrix(pairwise)
        result = calculate_weights(matrix)
        profile = DecisionProfile(
            organization_id=org1.id,
            name="โปรไฟล์มาตรฐาน (ต้นทุนสำคัญที่สุด)",
            description="ให้น้ำหนักต้นทุนและเวลาเป็นหลัก รองลงมาคือ CO2 และความเหมาะสมของเส้นทาง/ยานพาหนะ",
            status="active",
            pairwise_matrix=matrix,
            weights=result["weights"],
            lambda_max=result["lambda_max"],
            ci=result["ci"],
            cr=result["cr"],
            is_consistent=result["is_consistent"],
            created_by=admin1.id,
        )
        db.add(profile)
        db.flush()

        jobs = [
            TransportJob(
                organization_id=org1.id,
                job_number="JOB-2026-0001",
                customer_name="บริษัท ค้าปลีกไทย จำกัด",
                origin="อมตะซิตี้ ชลบุรี",
                destination="ศูนย์กระจายสินค้า บางนา",
                shipment_weight_kg=3200,
                shipment_volume_m3=14.5,
                priority="normal",
                special_requirements="สินค้าแตกหักง่าย ต้องมีผ้าใบคลุม",
                status="ready",
                created_by=planner1.id,
            ),
            TransportJob(
                organization_id=org1.id,
                job_number="JOB-2026-0002",
                customer_name="ร้านสะดวกซื้อ 24 ชม.",
                origin="อมตะซิตี้ ชลบุรี",
                destination="ศูนย์กระจายสินค้า บางนา",
                shipment_weight_kg=900,
                shipment_volume_m3=4,
                priority="high",
                status="draft",
                created_by=planner1.id,
            ),
            TransportJob(
                organization_id=org1.id,
                job_number="JOB-2026-0003",
                customer_name="โรงงานอุตสาหกรรม เอบีซี",
                origin="อมตะซิตี้ ชลบุรี",
                destination="ศูนย์กระจายสินค้า บางนา",
                shipment_weight_kg=9500,
                shipment_volume_m3=35,
                priority="urgent",
                status="ready",
                created_by=planner1.id,
            ),
        ]
        db.add_all(jobs)
        db.commit()

        # Generate + approve one full recommendation run for JOB-2026-0001 so
        # the dashboard, reports, and recommendation history have real data.
        demo_job = jobs[0]
        db.refresh(demo_job)
        active_vehicles = [v for v in vehicles if v.status == "active"]
        run = generate_recommendation(
            db,
            job=demo_job,
            route_ids=[r.id for r in routes],
            vehicle_ids=[v.id for v in active_vehicles],
            profile=profile,
            created_by=planner1.id,
        )
        top = next(a for a in run.alternatives if a.rank == 1)
        from app.tdss.models import RecommendationApproval

        db.add(RecommendationApproval(run_id=run.id, selected_alternative_id=top.id, approved_by=admin1.id))
        demo_job.status = "approved"
        db.commit()

        print("Seed complete.")
        print("Demo credentials (all passwords: {}):".format(DEMO_PASSWORD))
        print(f"  System Owner : {OWNER_EMAIL}")
        for i, spec in enumerate(orgs_spec):
            print(f"  Org {i + 1} Admin  : {spec['admin_email']}")
            print(f"  Org {i + 1} Planner: {spec['planner_email']}")
            print(f"  Org {i + 1} Viewer : {spec['viewer_email']}")
    finally:
        db.close()


if __name__ == "__main__":
    run_seed()
