import datetime as dt

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------
class MembershipOut(BaseModel):
    organization_id: int
    organization_name: str
    organization_status: str
    role: str
    membership_status: str

    class Config:
        from_attributes = True


class UserOut(BaseModel):
    id: int
    name: str
    email: str
    is_system_owner: bool
    status: str
    memberships: list[MembershipOut] = []

    class Config:
        from_attributes = True


class RegisterRequest(BaseModel):
    name: str = Field(min_length=1)
    email: str = Field(min_length=3)
    password: str = Field(min_length=6)
    organization_name: str = Field(min_length=1)


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=6)


class UpdateProfileRequest(BaseModel):
    name: str = Field(min_length=1)


# ---------------------------------------------------------------------------
# Organizations / Users / Features
# ---------------------------------------------------------------------------
class OrganizationOut(BaseModel):
    id: int
    name: str
    status: str
    created_at: dt.datetime

    class Config:
        from_attributes = True


class OrganizationCreateRequest(BaseModel):
    name: str = Field(min_length=1)


class OrganizationUsageOut(BaseModel):
    vehicle_count: int
    route_count: int
    job_count: int
    user_count: int
    decision_profile_count: int


class OrganizationInfoOut(BaseModel):
    id: int
    name: str
    code: str | None
    status: str
    contact: str | None
    address: str | None
    created_at: dt.datetime
    features: list["FeatureOut"]
    usage: OrganizationUsageOut


class OrganizationInfoUpdateRequest(BaseModel):
    """Fields an Organization Admin may edit. Suspension status and
    platform-level feature access are intentionally absent — those stay
    System-Owner-only (see owner_router)."""

    name: str = Field(min_length=1)
    code: str | None = None
    contact: str | None = None
    address: str | None = None


class OrganizationSettingsOut(BaseModel):
    default_route_mode: str
    default_decision_profile_id: int | None
    notify_on_recommendation_completed: bool
    notify_on_job_approved: bool


class OrganizationSettingsUpdateRequest(BaseModel):
    default_route_mode: str
    default_decision_profile_id: int | None = None
    notify_on_recommendation_completed: bool
    notify_on_job_approved: bool


class OrgUserOut(BaseModel):
    user_id: int
    name: str
    email: str
    role: str
    membership_status: str
    user_status: str


class InviteUserRequest(BaseModel):
    name: str = Field(min_length=1)
    email: str = Field(min_length=3)
    password: str = Field(min_length=6)
    role: str


class UpdateMembershipRequest(BaseModel):
    role: str | None = None
    membership_status: str | None = None  # active | suspended | disabled


class FeatureOut(BaseModel):
    feature_key: str
    enabled: bool


class SetFeatureRequest(BaseModel):
    feature_key: str
    enabled: bool


# ---------------------------------------------------------------------------
# Vehicles
# ---------------------------------------------------------------------------
class VehicleBase(BaseModel):
    vehicle_code: str = Field(min_length=1)
    registration_number: str = Field(min_length=1)
    vehicle_type: str = Field(min_length=1)
    capacity_weight_kg: float = Field(gt=0)
    capacity_volume_m3: float = Field(gt=0)
    fuel_type: str | None = None
    fuel_consumption_km_per_liter: float | None = Field(default=None, gt=0)
    fuel_cost_per_unit: float | None = Field(default=None, gt=0)
    # Defaulted (not strictly required): once fuel_type + consumption + fuel
    # cost are all present, these legacy flat-rate fields are unused by
    # scoring (see scoring_service.fuel_based_transport_calc) — they remain
    # the fallback source of truth only when fuel data is absent/incomplete.
    cost_per_km: float = Field(ge=0, default=0)
    fixed_cost: float = Field(ge=0, default=0)
    co2_factor: float = Field(ge=0, default=0)


class VehicleCreateRequest(VehicleBase):
    pass


class VehicleUpdateRequest(VehicleBase):
    status: str | None = None


class VehicleOut(VehicleBase):
    id: int
    organization_id: int
    status: str
    created_at: dt.datetime
    updated_at: dt.datetime

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
class RouteBase(BaseModel):
    route_code: str = Field(min_length=1)
    route_name: str = Field(min_length=1)
    origin: str = Field(min_length=1)
    destination: str = Field(min_length=1)
    distance_km: float = Field(gt=0)
    estimated_duration_minutes: int = Field(gt=0)
    toll_cost: float = Field(ge=0, default=0)
    route_risk_level: str = "low"
    road_restrictions: str | None = None
    mode: str = "manual"


class RouteCreateRequest(RouteBase):
    pass


class RouteUpdateRequest(RouteBase):
    status: str | None = None


class RouteOut(RouteBase):
    id: int
    organization_id: int
    status: str
    created_at: dt.datetime
    updated_at: dt.datetime

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Decision Profiles (AHP)
# ---------------------------------------------------------------------------
class DecisionProfileCreateRequest(BaseModel):
    name: str = Field(min_length=1)
    description: str | None = None
    pairwise: dict[str, float]
    save_as_draft_if_inconsistent: bool = True


class DecisionProfileOut(BaseModel):
    id: int
    organization_id: int
    name: str
    description: str | None
    status: str
    pairwise_matrix: list[list[float]]
    weights: dict[str, float]
    lambda_max: float
    ci: float
    cr: float
    is_consistent: bool
    created_by: int | None
    created_at: dt.datetime

    class Config:
        from_attributes = True


class DecisionProfileUpdateRequest(BaseModel):
    name: str = Field(min_length=1)
    description: str | None = None
    pairwise: dict[str, float]
    save_as_draft_if_inconsistent: bool = True


class ActivateProfileRequest(BaseModel):
    active: bool


# ---------------------------------------------------------------------------
# Transport Jobs
# ---------------------------------------------------------------------------
class JobBase(BaseModel):
    customer_name: str = Field(min_length=1)
    origin: str | None = None
    destination: str | None = None
    required_delivery_datetime: dt.datetime | None = None
    shipment_weight_kg: float | None = Field(default=None, gt=0)
    shipment_volume_m3: float | None = Field(default=None, gt=0)
    number_of_stops: int = Field(default=1, ge=1)
    priority: str = "normal"
    special_requirements: str | None = None
    preferred_route_id: int | None = None


class JobCreateRequest(JobBase):
    pass


class JobUpdateRequest(BaseModel):
    """All fields optional — this is a partial update (PUT applies only the
    fields the client sends; see jobs_router.update_job's exclude_unset)."""

    customer_name: str | None = Field(default=None, min_length=1)
    origin: str | None = None
    destination: str | None = None
    required_delivery_datetime: dt.datetime | None = None
    shipment_weight_kg: float | None = Field(default=None, gt=0)
    shipment_volume_m3: float | None = Field(default=None, gt=0)
    number_of_stops: int | None = Field(default=None, ge=1)
    priority: str | None = None
    special_requirements: str | None = None
    preferred_route_id: int | None = None
    status: str | None = None


class JobOut(JobBase):
    id: int
    organization_id: int
    job_number: str
    status: str
    created_by: int | None
    created_at: dt.datetime
    updated_at: dt.datetime

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Planning / Recommendations
# ---------------------------------------------------------------------------
class GenerateRecommendationRequest(BaseModel):
    job_id: int
    route_ids: list[int] = Field(min_length=1)
    vehicle_ids: list[int] = Field(min_length=1)
    decision_profile_id: int


class AlternativeOut(BaseModel):
    id: int
    vehicle_id: int
    vehicle_code: str
    route_id: int
    route_code: str
    distance_km: float
    duration_minutes: float
    cost: float
    weight_utilization: float
    volume_utilization: float
    reliability_score: float
    co2_estimate: float
    route_suitability: float
    vehicle_suitability: float
    raw_values: dict
    normalized_values: dict
    weighted_scores: dict
    total_score: float
    rank: int | None
    feasible: bool
    warnings: list[str]
    rejection_reasons: list[str]


class ApprovalOut(BaseModel):
    selected_alternative_id: int
    approved_by: int
    approved_at: dt.datetime
    reason: str | None


class AIAnalysisOut(BaseModel):
    vehicle_reason: str
    route_reason: str
    strengths: list[str]
    cautions: list[str]


class RecommendationRunOut(BaseModel):
    id: int
    job_id: int
    decision_profile_id: int
    criteria_weights: dict[str, float]
    created_at: dt.datetime
    alternatives: list[AlternativeOut]
    explanations: list[str] = []
    ai_analysis: AIAnalysisOut | None = None
    approval: ApprovalOut | None = None


class SelectAlternativeRequest(BaseModel):
    alternative_id: int
    reason: str | None = None


# ---------------------------------------------------------------------------
# Audit log
# ---------------------------------------------------------------------------
class AuditLogOut(BaseModel):
    id: int
    organization_id: int | None
    user_id: int | None
    user_name: str | None = None
    action: str
    entity_type: str
    entity_id: int | None
    details: dict | None
    created_at: dt.datetime


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------
class NotificationOut(BaseModel):
    id: int
    type: str
    message: str
    is_read: bool
    created_at: dt.datetime

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Dashboard / Reports
# ---------------------------------------------------------------------------
class DashboardSummaryOut(BaseModel):
    total_jobs: int
    jobs_awaiting_planning: int
    recommendations_generated: int
    approved_plans: int
    avg_utilization_pct: float | None
    avg_estimated_cost: float | None
    estimated_cost_saving: float | None
    avg_reliability_pct: float | None
    avg_co2: float | None


class OwnerDashboardOut(BaseModel):
    total_organizations: int
    active_organizations: int
    suspended_organizations: int
    total_users: int
    total_jobs: int
    recommendation_runs: int


class SystemHealthOut(BaseModel):
    api_status: str
    database_connected: bool
    app_version: str
    environment: str
    total_organizations: int
    total_users: int
    total_jobs: int


class SystemSettingsOut(BaseModel):
    app_display_name: str
    banner_message: str | None


class SystemSettingsUpdateRequest(BaseModel):
    app_display_name: str = Field(min_length=1)
    banner_message: str | None = None


class OrganizationUsageRow(BaseModel):
    organization_id: int
    organization_name: str
    organization_status: str
    job_count: int
    recommendation_run_count: int
    active_user_count: int
    vehicle_count: int
    route_count: int
    report_export_count: int


# ---------------------------------------------------------------------------
# AI Insights
# ---------------------------------------------------------------------------
class AIInsightVehicleOut(BaseModel):
    vehicle_id: int
    vehicle_code: str
    override_count: int


class AIInsightRouteOut(BaseModel):
    route_id: int
    route_code: str
    change_count: int


class AIInsightTrendPoint(BaseModel):
    period: str
    match_rate_pct: float
    total_decisions: int


class AIInsightsOut(BaseModel):
    total_decisions: int
    match_rate_pct: float
    most_overridden_vehicle: AIInsightVehicleOut | None
    most_changed_route: AIInsightRouteOut | None
    trend: list[AIInsightTrendPoint]
