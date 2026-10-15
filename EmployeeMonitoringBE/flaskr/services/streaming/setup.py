"""Loading a camera's configuration from the tenant database, and saving alerts."""
import json
import logging
from datetime import datetime, timezone
from urllib.parse import quote

from sqlalchemy.orm import selectinload

from flaskr.db import get_tenant_db
from flaskr.entities.Alert import Alert, AlertStatus
from flaskr.entities.Blacklist import Blacklist
from flaskr.entities.Employee import Employee
from flaskr.entities.VideoCamera import VideoCamera
from flaskr.entities.Zone import Zone
from flaskr.entities.alert_system.AlertRule import AlertRule
from flaskr.entities.alert_system.RuleCameraLink import RuleCameraLink
from flaskr.entities.alert_system.RuleZoneLink import RuleZoneLink
from flaskr.services.rule_system.RuleInference import RuleInference
from flaskr.services.secrets_box import decrypt
from flaskr.services.storage import relative_to_base, tenant_dir
from flaskr.services.streaming.worker import CameraSetup, run_in_tenant

log = logging.getLogger(__name__)


def camera_source_url(camera):
    """RTSP URL of the camera itself (credentials URL-encoded, configurable path)."""
    credentials = ""
    if camera.username:
        credentials = f"{quote(camera.username, safe='')}:{quote(decrypt(camera.password) or '', safe='')}@"
    path = camera.stream_path or ""
    if path and not path.startswith("/"):
        path = "/" + path
    return f"rtsp://{credentials}{camera.ip}:{camera.port}{path}"


def load_camera_setup(app, tenant_id, camera_id, relay=None, face_loader=None):
    def load():
        db = get_tenant_db()
        camera = db.get(VideoCamera, camera_id)
        if camera is None:
            return None

        zones = db.query(Zone).filter(Zone.video_camera_id == camera_id).all()
        zone_ids = [z.id for z in zones]
        rules = db.query(AlertRule).options(
            selectinload(AlertRule.camera_links), selectinload(AlertRule.zone_links)
        ).filter(
            AlertRule.is_active.is_(True),
            AlertRule.camera_links.any(RuleCameraLink.camera_id == camera_id)
            | AlertRule.zone_links.any(RuleZoneLink.zone_id.in_(zone_ids or [-1]))
        ).all()
        engine = RuleInference(rules, camera_id=camera_id, camera_zone_ids=zone_ids)

        employees = db.query(Employee).all()
        names = {e.id: f"{e.firstName} {e.lastName}" for e in employees}
        known_faces = {}
        if engine.needs_faces() and face_loader is not None:
            for e in employees:
                if e.encodedFace:
                    known_faces[e.id] = face_loader(e.encodedFace)

        blacklist = {}
        for entry in db.query(Blacklist).filter(Blacklist.zone_id.in_(zone_ids or [-1])):
            blacklist.setdefault(entry.zone_id, set()).add(entry.employee_id)

        source_url = camera_source_url(camera)
        if relay is not None:
            try:
                source_url = relay.register_camera(tenant_id, camera_id, source_url)
            except Exception as e:
                log.warning("MediaMTX unavailable (%s); reading camera %s directly", e, camera_id)

        return CameraSetup(
            camera_id=camera_id,
            name=camera.name,
            source_url=source_url,
            engine=engine,
            zones={z.id: json.loads(z.points) for z in zones if z.points},
            known_faces=known_faces,
            employee_names=names,
            blacklist=blacklist,
        )

    return run_in_tenant(app, tenant_id, load)


def save_alert(app, tenant_id, triggered, jpeg):
    """Persist a TriggeredAlert (and its screenshot). Returns the alert as a dict."""
    def save():
        db = get_tenant_db()
        alert = Alert(
            type=triggered.type,
            level=triggered.level,
            timestamp=datetime.fromtimestamp(triggered.timestamp, tz=timezone.utc),
            status=AlertStatus.ACTIVE,
            explanation=triggered.explanation,
            camera_id=triggered.camera_id,
            employee_id=triggered.employee_id,
            zone_id=triggered.zone_id,
            alert_rule_id=triggered.rule_id,
        )
        db.add(alert)
        db.flush()
        if jpeg:
            path = tenant_dir("ALERTS_SCREENSHOTS_PATH") / f"alert_{alert.id}.jpg"
            path.write_bytes(jpeg)
            alert.screenshot = relative_to_base(path, "ALERTS_SCREENSHOTS_PATH")
        db.commit()
        data = alert.to_dict()
        camera = db.get(VideoCamera, triggered.camera_id)
        data["camera_name"] = camera.name if camera else None
        return data

    return run_in_tenant(app, tenant_id, save)
