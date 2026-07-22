import datetime as dt

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
)
from sqlalchemy.orm import relationship

from app.database import Base

# ---------------------------------------------------------------------------
# Roles (simple string enum, not a table — the practical set never changes
# per-org and a Membership row already scopes role to (user, organization)).
# ---------------------------------------------------------------------------
ROLE_ORG_ADMIN = "org_admin"
ROLE_PLANNER = "planner"
ROLE_VIEWER = "viewer"
ORG_ROLES = [ROLE_ORG_ADMIN, ROLE_PLANNER, ROLE_VIEWER]

# Roles allowed to create/edit/approve operational data (everything except Viewer).
WRITE_ROLES = [ROLE_ORG_ADMIN, ROLE_PLANNER]

CRITERIA = ["cost", "time", "utilization", "reliability", "co2", "suitability"]
# Saaty scale 1-9 Random Index table, RI[n] for matrix size n (n=1..10).
RANDOM_INDEX = {1: 0.0, 2: 0.0, 3: 0.58, 4: 0.9, 5: 1.12, 6: 1.24, 7: 1.32, 8: 1.41, 9: 1.45, 10: 1.49}

FEATURE_KEYS = [
    "transportation_planning",
    "ahp_profiles",
    "recommendation_engine",
    "reports",
    "google_maps_mode",
    "manual_route_mode",
]


class User(Base):
    __tablename__ = "tdss_users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    is_system_owner = Column(Boolean, default=False, nullable=False)
    status = Column(String, default="active", nullable=False)  # active | suspended | disabled
    created_at = Column(DateTime, default=dt.datetime.utcnow)

    memberships = relationship("Membership", back_populates="user", cascade="all, delete-orphan")


class Organization(Base):
    __tablename__ = "tdss_organizations"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    status = Column(String, default="active", nullable=False)  # active | suspended
    created_at = Column(DateTime, default=dt.datetime.utcnow)

    # Organization Information (org_admin editable)
    code = Column(String, nullable=True)
    contact = Column(String, nullable=True)
    address = Column(String, nullable=True)

    # Organization Settings (org_admin editable, each has a real functional effect)
    default_route_mode = Column(String, default="manual", nullable=False)  # manual | google_maps
    # use_alter=True breaks the Organization<->DecisionProfile circular FK
    # cycle for DDL purposes (both tables reference each other).
    default_decision_profile_id = Column(
        Integer, ForeignKey("tdss_decision_profiles.id", use_alter=True, name="fk_org_default_decision_profile"), nullable=True
    )
    notify_on_recommendation_completed = Column(Boolean, default=True, nullable=False)
    notify_on_job_approved = Column(Boolean, default=True, nullable=False)

    memberships = relationship("Membership", back_populates="organization", cascade="all, delete-orphan")
    features = relationship("OrganizationFeature", back_populates="organization", cascade="all, delete-orphan")


class Membership(Base):
    __tablename__ = "tdss_memberships"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("tdss_users.id"), nullable=False, index=True)
    organization_id = Column(Integer, ForeignKey("tdss_organizations.id"), nullable=False, index=True)
    role = Column(String, nullable=False)  # org_admin | planner | viewer
    status = Column(String, default="active", nullable=False)  # active | suspended | disabled
    created_at = Column(DateTime, default=dt.datetime.utcnow)

    user = relationship("User", back_populates="memberships")
    organization = relationship("Organization", back_populates="memberships")


class OrganizationFeature(Base):
    __tablename__ = "tdss_organization_features"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("tdss_organizations.id"), nullable=False, index=True)
    feature_key = Column(String, nullable=False)
    enabled = Column(Boolean, default=True, nullable=False)

    organization = relationship("Organization", back_populates="features")


class AuditLog(Base):
    __tablename__ = "tdss_audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("tdss_organizations.id"), nullable=True, index=True)
    user_id = Column(Integer, ForeignKey("tdss_users.id"), nullable=True, index=True)
    action = Column(String, nullable=False)
    entity_type = Column(String, nullable=False)
    entity_id = Column(Integer, nullable=True)
    details = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=dt.datetime.utcnow, index=True)


class Vehicle(Base):
    __tablename__ = "tdss_vehicles"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("tdss_organizations.id"), nullable=False, index=True)
    vehicle_code = Column(String, nullable=False)
    registration_number = Column(String, nullable=False)
    vehicle_type = Column(String, nullable=False)
    capacity_weight_kg = Column(Float, nullable=False)
    capacity_volume_m3 = Column(Float, nullable=False)
    fuel_type = Column(String, nullable=True)
    fuel_consumption_km_per_liter = Column(Float, nullable=True)  # distance per unit of fuel (unit depends on fuel_type — see fuel_reference.py)
    fuel_cost_per_unit = Column(Float, nullable=True)  # price per unit of fuel (baht/litre, baht/kg, or baht/kWh depending on fuel_type)
    cost_per_km = Column(Float, nullable=False)
    fixed_cost = Column(Float, default=0.0, nullable=False)
    co2_factor = Column(Float, nullable=False)  # kg CO2 per km
    status = Column(String, default="active", nullable=False)  # active | inactive
    created_at = Column(DateTime, default=dt.datetime.utcnow)
    updated_at = Column(DateTime, default=dt.datetime.utcnow, onupdate=dt.datetime.utcnow)


class Route(Base):
    __tablename__ = "tdss_routes"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("tdss_organizations.id"), nullable=False, index=True)
    route_code = Column(String, nullable=False)
    route_name = Column(String, nullable=False)
    origin = Column(String, nullable=False)
    destination = Column(String, nullable=False)
    distance_km = Column(Float, nullable=False)
    estimated_duration_minutes = Column(Integer, nullable=False)
    toll_cost = Column(Float, default=0.0, nullable=False)
    route_risk_level = Column(String, default="low", nullable=False)  # low | medium | high
    road_restrictions = Column(Text, nullable=True)
    mode = Column(String, default="manual", nullable=False)  # google_maps | manual
    status = Column(String, default="active", nullable=False)  # active | inactive
    created_at = Column(DateTime, default=dt.datetime.utcnow)
    updated_at = Column(DateTime, default=dt.datetime.utcnow, onupdate=dt.datetime.utcnow)


class Product(Base):
    """Product Master — one canonical catalog per organization. Referenced
    by TransportJobItem, which snapshots weight/volume at the time an item
    is added so historical job totals stay stable even if this record is
    edited later (see TransportJobItem below)."""

    __tablename__ = "tdss_products"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("tdss_organizations.id"), nullable=False, index=True)
    sku = Column(String, nullable=False)
    product_name = Column(String, nullable=False)
    unit = Column(String, nullable=False)  # หน่วยนับ, e.g. "ชิ้น", "กล่อง", "พาเลท"
    weight_per_unit_kg = Column(Float, nullable=False)
    width_cm = Column(Float, nullable=False)
    length_cm = Column(Float, nullable=False)
    height_cm = Column(Float, nullable=False)
    volume_per_unit_m3 = Column(Float, nullable=False)  # server-computed = width*length*height / 1,000,000 — see products_router.py
    status = Column(String, default="active", nullable=False)  # active | inactive
    created_at = Column(DateTime, default=dt.datetime.utcnow)
    updated_at = Column(DateTime, default=dt.datetime.utcnow, onupdate=dt.datetime.utcnow)


class DecisionProfile(Base):
    __tablename__ = "tdss_decision_profiles"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("tdss_organizations.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    status = Column(String, default="draft", nullable=False)  # draft | active | inactive
    pairwise_matrix = Column(JSON, nullable=False)  # 6x6 matrix, order = CRITERIA
    weights = Column(JSON, nullable=False)  # {criterion: weight}
    lambda_max = Column(Float, nullable=False)
    ci = Column(Float, nullable=False)
    cr = Column(Float, nullable=False)
    is_consistent = Column(Boolean, nullable=False)
    created_by = Column(Integer, ForeignKey("tdss_users.id"), nullable=True)
    created_at = Column(DateTime, default=dt.datetime.utcnow)


class TransportJob(Base):
    __tablename__ = "tdss_transport_jobs"

    id = Column(Integer, primary_key=True, index=True)
    organization_id = Column(Integer, ForeignKey("tdss_organizations.id"), nullable=False, index=True)
    job_number = Column(String, nullable=False, index=True)
    customer_name = Column(String, nullable=False)
    origin = Column(String, nullable=True)
    destination = Column(String, nullable=True)
    required_delivery_datetime = Column(DateTime, nullable=True)
    shipment_weight_kg = Column(Float, nullable=True)
    shipment_volume_m3 = Column(Float, nullable=True)
    number_of_stops = Column(Integer, default=1, nullable=False)
    priority = Column(String, default="normal", nullable=False)  # low | normal | high | urgent
    special_requirements = Column(Text, nullable=True)
    preferred_route_id = Column(Integer, ForeignKey("tdss_routes.id"), nullable=True)
    status = Column(String, default="draft", nullable=False)
    # draft | ready | planning | recommended | approved | completed | cancelled
    created_by = Column(Integer, ForeignKey("tdss_users.id"), nullable=True)
    created_at = Column(DateTime, default=dt.datetime.utcnow)
    updated_at = Column(DateTime, default=dt.datetime.utcnow, onupdate=dt.datetime.utcnow)


class TransportJobItem(Base):
    """A line item (product + quantity) attached to a TransportJob. Adding,
    editing, or deleting a row here causes jobs_router / job_items_router
    to recompute and overwrite the parent job's shipment_weight_kg /
    shipment_volume_m3 — those two columns remain the ONLY interface
    rule_engine.py / scoring_service.py read, so neither file (nor AHP,
    nor the AI/Random Forest pipeline) needed any change for this feature.

    weight_per_unit_kg / volume_per_unit_m3 are a snapshot of the Product's
    values at the moment this item was added, not a live reference — so a
    job's committed totals never silently change if someone edits the
    Product Master later."""

    __tablename__ = "tdss_job_items"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, ForeignKey("tdss_transport_jobs.id"), nullable=False, index=True)
    product_id = Column(Integer, ForeignKey("tdss_products.id"), nullable=False)
    quantity = Column(Float, nullable=False)
    weight_per_unit_kg = Column(Float, nullable=False)
    volume_per_unit_m3 = Column(Float, nullable=False)
    created_at = Column(DateTime, default=dt.datetime.utcnow)


class RecommendationRun(Base):
    __tablename__ = "tdss_recommendation_runs"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, ForeignKey("tdss_transport_jobs.id"), nullable=False, index=True)
    organization_id = Column(Integer, ForeignKey("tdss_organizations.id"), nullable=False, index=True)
    decision_profile_id = Column(Integer, ForeignKey("tdss_decision_profiles.id"), nullable=False)
    criteria_weights = Column(JSON, nullable=False)  # snapshot at run time
    candidate_route_ids = Column(JSON, nullable=False)
    candidate_vehicle_ids = Column(JSON, nullable=False)
    created_by = Column(Integer, ForeignKey("tdss_users.id"), nullable=True)
    created_at = Column(DateTime, default=dt.datetime.utcnow)

    alternatives = relationship(
        "RecommendationAlternative", back_populates="run", cascade="all, delete-orphan", order_by="RecommendationAlternative.rank"
    )
    approval = relationship("RecommendationApproval", back_populates="run", uselist=False, cascade="all, delete-orphan")


class RecommendationAlternative(Base):
    __tablename__ = "tdss_recommendation_alternatives"

    id = Column(Integer, primary_key=True, index=True)
    run_id = Column(Integer, ForeignKey("tdss_recommendation_runs.id"), nullable=False, index=True)
    vehicle_id = Column(Integer, ForeignKey("tdss_vehicles.id"), nullable=False)
    route_id = Column(Integer, ForeignKey("tdss_routes.id"), nullable=False)

    distance_km = Column(Float, nullable=False)
    duration_minutes = Column(Float, nullable=False)
    cost = Column(Float, nullable=False)
    weight_utilization = Column(Float, nullable=False)
    volume_utilization = Column(Float, nullable=False)
    reliability_score = Column(Float, nullable=False)
    co2_estimate = Column(Float, nullable=False)
    route_suitability = Column(Float, nullable=False)
    vehicle_suitability = Column(Float, nullable=False)

    raw_values = Column(JSON, nullable=False)
    normalized_values = Column(JSON, nullable=False)
    weighted_scores = Column(JSON, nullable=False)
    total_score = Column(Float, nullable=False)
    rank = Column(Integer, nullable=True)  # null if infeasible

    feasible = Column(Boolean, nullable=False)
    warnings = Column(JSON, nullable=True)
    rejection_reasons = Column(JSON, nullable=True)

    run = relationship("RecommendationRun", back_populates="alternatives")


class RecommendationApproval(Base):
    __tablename__ = "tdss_recommendation_approvals"

    id = Column(Integer, primary_key=True, index=True)
    run_id = Column(Integer, ForeignKey("tdss_recommendation_runs.id"), nullable=False, unique=True)
    selected_alternative_id = Column(Integer, ForeignKey("tdss_recommendation_alternatives.id"), nullable=False)
    approved_by = Column(Integer, ForeignKey("tdss_users.id"), nullable=False)
    approved_at = Column(DateTime, default=dt.datetime.utcnow)
    reason = Column(Text, nullable=True)  # required only when not selecting the top-ranked alternative

    run = relationship("RecommendationRun", back_populates="approval")


class Notification(Base):
    __tablename__ = "tdss_notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("tdss_users.id"), nullable=True, index=True)
    organization_id = Column(Integer, ForeignKey("tdss_organizations.id"), nullable=True, index=True)
    type = Column(String, nullable=False)
    message = Column(String, nullable=False)
    is_read = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=dt.datetime.utcnow, index=True)


class AIDecisionEvent(Base):
    """Additive, append-only log of every approval decision — the training
    dataset for the AI Learning module. Populated once per approval from
    select_alternative(); never mutates any existing table. `is_override`
    is the label used for the (future) Random Forest classifier: whether
    the planner followed the AHP top-ranked alternative or picked another."""

    __tablename__ = "tdss_ai_decision_events"

    id = Column(Integer, primary_key=True, index=True)
    run_id = Column(Integer, ForeignKey("tdss_recommendation_runs.id"), nullable=False, index=True)
    job_id = Column(Integer, ForeignKey("tdss_transport_jobs.id"), nullable=False, index=True)
    organization_id = Column(Integer, ForeignKey("tdss_organizations.id"), nullable=False, index=True)
    decision_profile_id = Column(Integer, ForeignKey("tdss_decision_profiles.id"), nullable=True)

    top_alternative_id = Column(Integer, ForeignKey("tdss_recommendation_alternatives.id"), nullable=True)
    top_vehicle_id = Column(Integer, ForeignKey("tdss_vehicles.id"), nullable=True)
    top_route_id = Column(Integer, ForeignKey("tdss_routes.id"), nullable=True)
    top_total_score = Column(Float, nullable=True)

    selected_alternative_id = Column(Integer, ForeignKey("tdss_recommendation_alternatives.id"), nullable=False)
    selected_vehicle_id = Column(Integer, ForeignKey("tdss_vehicles.id"), nullable=False)
    selected_route_id = Column(Integer, ForeignKey("tdss_routes.id"), nullable=False)
    selected_total_score = Column(Float, nullable=False)
    selected_rank = Column(Integer, nullable=True)

    is_override = Column(Boolean, nullable=False, default=False)
    vehicle_changed = Column(Boolean, nullable=False, default=False)
    route_changed = Column(Boolean, nullable=False, default=False)

    criteria_weights = Column(JSON, nullable=True)  # snapshot — ML feature source
    selected_raw_values = Column(JSON, nullable=True)  # snapshot — ML feature source
    reason = Column(Text, nullable=True)

    decided_by = Column(Integer, ForeignKey("tdss_users.id"), nullable=True)
    created_at = Column(DateTime, default=dt.datetime.utcnow, index=True)


class SystemSettings(Base):
    """Singleton row (id is always 1) for the few system-wide settings that
    actually affect the running application: the display name shown in the
    sidebar/login page, and an optional banner message shown to every
    logged-in user. No infrastructure/billing/monitoring fields — those
    would have no real effect in this app."""

    __tablename__ = "tdss_system_settings"

    id = Column(Integer, primary_key=True)
    app_display_name = Column(String, default="TDSS", nullable=False)
    banner_message = Column(String, nullable=True)
