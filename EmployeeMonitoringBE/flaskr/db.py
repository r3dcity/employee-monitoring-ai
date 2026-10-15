from sqlalchemy import create_engine, inspect, text
from flaskr.entities.auth_db.AuthBaseEntity import AuthBaseEntity
from flaskr.entities.BaseEntity import Entity
from flask import current_app, g
from sqlalchemy_utils import database_exists, create_database
import threading
from sqlalchemy.orm import Session, sessionmaker, configure_mappers

from flaskr.entities.PPE import PPE
# Registry stores engines and session factories
engine_registry = {}
session_factory_registry = {}
registry_lock = threading.Lock()

PPE_ITEMS = {
    "Excavator": "excavator.jpg",
    "Gloves": "gloves.jpg",
    "Hardhat": "hardhat.jpg",
    "Ladder": "ladder.jpg",
    "Mask": "mask.jpg",
    "NO-Hardhat": "no-hardhat.jpg",
    "NO-Mask": "no-mask.jpg",
    "NO-Safety Vest": "no-safety-vest.jpg",
    "Person": "person.jpg",
    "SUV": "suv.jpg",
    "Safety Cone": "safety-cone.jpg",
    "Safety Vest": "safety-vest.jpg",
    "bus": "bus.jpg",
    "dump truck": "dump-truck.jpg",
    "fire hydrant": "fire-hydrant.jpg",
    "machinery": "machinery.jpg",
    "mini-van": "mini-van.jpg",
    "sedan": "sedan.jpg",
    "semi": "semi.jpg",
    "trailer": "trailer.jpg",
    "truck": "truck.jpg",
    "truck and trailer": "truck-and-trailer.jpg",
    "van": "van.jpg",
    "vehicle": "vehicle.jpg",
    "wheel loader": "wheel-loader.jpg"
}


class RoutingSession(Session):
    def get_bind(self, mapper=None, clause=None, **kwargs):
        if mapper and issubclass(mapper.class_, AuthBaseEntity):
            return engine_registry["users"]
        if mapper and issubclass(mapper.class_, Entity):
            tenant_id = g.get('tenant_id')
            if tenant_id and tenant_id in engine_registry:
                return engine_registry[tenant_id]
        return super().get_bind(mapper=mapper, clause=clause, **kwargs)


def setup_users_db(app):
    """Initialize central users database"""
    user_db_url = app.config['USERS_DATABASE_URL']
    engine = create_engine(user_db_url)

    if not database_exists(engine.url):
        create_database(engine.url)

    AuthBaseEntity.metadata.create_all(bind=engine)

    with registry_lock:
        engine_registry['users'] = engine
        session_factory_registry['users'] = sessionmaker(
            autoflush=False,
            bind=engine,
            class_=RoutingSession
        )


def upgrade_tenant_schema(engine):
    """Add columns introduced after a tenant database was created.

    create_all() only creates missing tables, never missing columns. This keeps existing
    databases working until schema changes are handled by proper migrations.
    """
    zone_columns = {column["name"] for column in inspect(engine).get_columns("zones")}
    if "points" not in zone_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE zones ADD COLUMN points TEXT"))


def setup_tenant_db(tenant_id):
    """Create (if needed) the tenant database and register its session factory.

    Safe to call concurrently: the whole setup runs under the registry lock and
    is skipped when another thread already registered the tenant.
    """
    if tenant_id is None:
        raise ValueError("Cannot set up a tenant database without a tenant id")

    app = current_app
    with registry_lock:
        if tenant_id in session_factory_registry:
            return

        engine = create_engine(f"{app.config['GENERAL_DATABASE_URL']}/{tenant_id}")
        first_time_created = False
        if not database_exists(engine.url):
            create_database(engine.url)
            first_time_created = True

        Entity.metadata.create_all(bind=engine)
        upgrade_tenant_schema(engine)
        configure_mappers()
        factory = sessionmaker(autoflush=False, bind=engine, class_=RoutingSession)

        if first_time_created:
            with factory() as session:
                # Store only the file name; PPERouter resolves it against PPE_PICTURES_PATH
                for ppe_name, ppe_image in PPE_ITEMS.items():
                    session.add(PPE(name=ppe_name, image=ppe_image))
                session.commit()

        engine_registry[tenant_id] = engine
        session_factory_registry[tenant_id] = factory

    app.logger.info("Tenant database ready: %s", tenant_id)


def get_users_db() -> RoutingSession:
    """Get central users database session"""
    if 'users_db_session' not in g:
        g.users_db_session = session_factory_registry['users']()

    return g.users_db_session


def get_tenant_db() -> RoutingSession:
    """Get appropriate database session based on current tenant"""
    if 'tenant_db_session' not in g:
        tenant_id = g.get('tenant_id')
        if tenant_id is None:
            raise RuntimeError("No tenant associated with the current user")
        if tenant_id not in session_factory_registry:
            setup_tenant_db(tenant_id)

        g.tenant_db_session = session_factory_registry[tenant_id]()

    return g.tenant_db_session


def close_session(e=None):
    """Close database sessions at the end of the request / app context"""
    for key in ('users_db_session', 'tenant_db_session'):
        session = g.pop(key, None)
        if session is not None:
            session.close()


def init_app(app):
    app.teardown_appcontext(close_session)
    setup_users_db(app)
