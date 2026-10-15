from flask import Blueprint, current_app as app, request, g
from flaskr.middlewares.PermissionMiddleware import permission_required
from werkzeug.utils import secure_filename
from flaskr.db import get_tenant_db
from flaskr.entities.Zone import Zone
from flaskr.entities.Blacklist import Blacklist
from flaskr.entities.Alert import Alert
from flaskr.entities.alert_system.RuleZoneLink import RuleZoneLink
from flaskr.routes.VideoCameraRouter import active_cameras, camera_locks, stream_key
from flaskr.services.storage import tenant_dir, relative_to_base
import cv2 as cv
import numpy as np

bp = Blueprint("zone", __name__, url_prefix="/zone")


"""
Context flow:
Users with required permission draw on a canvas
the zone that they want the detection to happen
That canvas is transformed in an image
Image is sent to the backend already masked
What does this mask mean?

Every pixel besides the ones drawn over by the user
are transformed in black ( this is done on the client
to save computation/time/resources from the server)

The endpoint receives as a multipart/form-data
name,
mask, ( image file (blob file))
video_camera_id, ( required to know on which videocamera
was the mask applied)

blacklist will be referenced later
"""

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in app.config["ALLOWED_EXTENSIONS"]



@bp.route("/", methods=["POST"])
@permission_required("CREATE_ZONE")
def create_zone(current_user):
    db = get_tenant_db()
    try:
        data = request.get_json(silent=True)
        if not isinstance(data, dict):
            return {"message": "No data provided"}, 400
        for field, label in (("zone_name", "Zone name"), ("camera_id", "Video camera id"),
                             ("points", "Points"), ("camera_name", "Camera name")):
            if field not in data:
                return {"message": f"{label} is required"}, 400

        zone_name = data.get("zone_name")
        camera_id = data.get("camera_id")
        camera_name = data.get("camera_name")
        points = data.get("points")
        if not isinstance(points, list) or len(points) < 3:
            return {"message": "A zone needs at least 3 points"}, 400

        if db.query(Zone).filter_by(name=zone_name).first():
            return {"message": "Zone with that name already exists"}, 400

        key = stream_key(g.tenant_id, camera_name)
        lock = camera_locks.get(key)
        if lock is None:
            return {"message": "Camera is not active"}, 409
        with lock:
            frame_bytes = active_cameras.get(key, {}).get("frame")

        if not frame_bytes:
            return {"message": "Camera is not active"}, 409

        # Decode the JPEG bytes back to numpy array
        nparr = np.frombuffer(frame_bytes, np.uint8)
        frame_snapshot = cv.imdecode(nparr, cv.IMREAD_COLOR)

        if frame_snapshot is None:
            return {"message": "Failed to decode camera frame"}, 400
        polygon = np.array([[p["x"], p["y"]] for p in points], dtype=np.int32)
        polygon = polygon.reshape((-1, 1, 2))
        mask = np.zeros_like(frame_snapshot)
        cv.fillPoly(mask, [polygon], (255, 255, 255))
        masked_frame = cv.bitwise_and(frame_snapshot, mask)
        success_encode, encoded_mask = cv.imencode('.png', masked_frame)
        if not success_encode:
            return {"message": "Failed to encode zone mask"}, 500

        filepath = tenant_dir("MASK_ZONES_PATH") / f"{secure_filename(zone_name)}.png"
        with open(filepath, "wb") as f:
            f.write(encoded_mask.tobytes())

        zone = Zone(
            name=zone_name,
            mask=relative_to_base(filepath, "MASK_ZONES_PATH"),
            video_camera_id=camera_id
        )
        db.add(zone)
        db.commit()
        return {"message": "Zone created sucessfuly.", "zone": {
            "id": zone.id,
            "name": zone.name,
            "video_camera_id": zone.video_camera_id
        }}, 201
    except (KeyError, TypeError, ValueError):
        return {"message": "Points must be a list of {x, y} coordinates"}, 400
    except Exception as e:
        db.rollback()
        app.logger.error(e)
        return {"message": "Something went wrong"}, 500

@bp.route("/", methods=["DELETE"])
@permission_required("DELETE_ZONE")
def delete_zone(current_user):
    try:
        data = request.get_json(silent=True) or {}
        if "zone_id" not in data:
            return {"message": "Zone id is required"}, 400
        zone_id = data["zone_id"]
        db = get_tenant_db()
        zone = db.get(Zone, zone_id)
        if zone is None:
            return {"message": "Zone not found"}, 404
        # Rows referencing the zone would otherwise block the delete with a foreign key error
        db.query(Blacklist).filter(Blacklist.zone_id == zone_id).delete(synchronize_session=False)
        db.query(RuleZoneLink).filter(RuleZoneLink.zone_id == zone_id).delete(synchronize_session=False)
        db.query(Alert).filter(Alert.zone_id == zone_id).update({Alert.zone_id: None}, synchronize_session=False)
        db.delete(zone)
        db.commit()
        return {"message": "Zone deleted sucessfuly"}, 200
    except Exception as e:
        app.logger.error(e)
        return {"message": "Something went wrong"}, 500