from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import Base, engine
from app.tdss import models as tdss_models  # noqa: F401 — registers tables on Base
from app.tdss.routers import (
    ai_insights_router,
    audit_router,
    auth_router,
    dashboard_router,
    decision_profiles_router,
    job_items_router,
    jobs_router,
    notifications_router,
    organizations_router,
    owner_router,
    planning_router,
    products_router,
    reports_router,
    routes_router,
    system_settings_router,
    vehicles_router,
)

Base.metadata.create_all(bind=engine)

app = FastAPI(title="TDSS API")

origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router.router)
app.include_router(organizations_router.router)
app.include_router(vehicles_router.router)
app.include_router(routes_router.router)
app.include_router(products_router.router)
app.include_router(decision_profiles_router.router)
app.include_router(jobs_router.router)
app.include_router(job_items_router.router)
app.include_router(planning_router.router)
app.include_router(dashboard_router.router)
app.include_router(reports_router.router)
app.include_router(audit_router.org_audit_router)
app.include_router(audit_router.owner_audit_router)
app.include_router(owner_router.router)
app.include_router(notifications_router.router)
app.include_router(system_settings_router.router)
app.include_router(ai_insights_router.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
