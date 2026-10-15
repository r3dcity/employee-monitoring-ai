from .UserRouter import bp as users_bp
from .VideoCameraRouter import bp as video_cameras_bp
from .EmployeeRouter import bp as employees_bp
from .TenantRouter import bp as tenants_bp
from .super_admin_routes.RoleAndPermissionsRouter import bp as roles_bp
from .AlertRouter import bp as alerts_bp
from .BlacklistRouter import bp as blacklist_bp
from .ZoneRouter import bp as zones_bp
from .PersonDetectedRouter import bp as persons_detected_bp
from .PPERouter import pperouter as ppe_router
from .alert_rules_routes.AlertRuleRouter import bp as alert_rules_bp
from .EventsRouter import bp as events_bp


def register_blueprints(app):
    app.register_blueprint(users_bp)
    app.register_blueprint(video_cameras_bp)
    app.register_blueprint(employees_bp)
    app.register_blueprint(tenants_bp)
    app.register_blueprint(roles_bp)
    app.register_blueprint(alerts_bp)
    app.register_blueprint(blacklist_bp)
    app.register_blueprint(zones_bp)
    app.register_blueprint(persons_detected_bp)
    app.register_blueprint(ppe_router)
    app.register_blueprint(alert_rules_bp)
    app.register_blueprint(events_bp)