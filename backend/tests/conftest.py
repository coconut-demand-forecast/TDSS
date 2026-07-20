import datetime as dt

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.main import app

TEST_DB_URL = "sqlite:///./test_tdss.db"


@pytest.fixture()
def db_session():
    engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = TestingSessionLocal()

    def override_get_db():
        try:
            yield session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    yield session
    session.close()
    Base.metadata.drop_all(bind=engine)
    app.dependency_overrides.clear()


@pytest.fixture()
def client(db_session):
    return TestClient(app)


def make_job(**overrides):
    from app.tdss.models import TransportJob

    defaults = dict(
        organization_id=1,
        job_number="JOB-TEST-1",
        customer_name="Test Customer",
        origin="A",
        destination="B",
        shipment_weight_kg=1000,
        shipment_volume_m3=5,
        status="ready",
    )
    defaults.update(overrides)
    return TransportJob(**defaults)


def make_vehicle(**overrides):
    from app.tdss.models import Vehicle

    defaults = dict(
        organization_id=1,
        vehicle_code="V1",
        registration_number="70-1234",
        vehicle_type="truck_6wheel",
        capacity_weight_kg=5000,
        capacity_volume_m3=20,
        fuel_type="diesel",
        fuel_consumption_km_per_liter=8,
        cost_per_km=15,
        fixed_cost=500,
        co2_factor=0.8,
        status="active",
    )
    defaults.update(overrides)
    return Vehicle(**defaults)


def make_route(**overrides):
    from app.tdss.models import Route

    defaults = dict(
        organization_id=1,
        route_code="R1",
        route_name="A to B",
        origin="A",
        destination="B",
        distance_km=100,
        estimated_duration_minutes=120,
        toll_cost=50,
        route_risk_level="low",
        mode="manual",
        status="active",
    )
    defaults.update(overrides)
    return Route(**defaults)
