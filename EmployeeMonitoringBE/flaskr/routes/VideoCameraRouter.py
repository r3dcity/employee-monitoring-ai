"""Cameras: CRUD, live status and playback.

Video processing does not happen here: every camera has a background worker (see
services/streaming) that runs whether or not anybody is watching. This router only:
  - manages cameras and tells the supervisor to start/stop/restart their workers,
  - hands out short-lived playback tickets,
  - serves the annotated MJPEG fallback stream from the worker's frame hub.
"""
import ipaddress
import re
import time
import uuid

from flask import Blueprint, Response, current_app, g, request

from flaskr.db import get_tenant_db, get_users_db
from flaskr.entities.Alert import Alert
from flaskr.entities.VideoCamera import VideoCamera
from flaskr.entities.auth_db.User import User
from flaskr.middlewares.PermissionMiddleware import has_permission, permission_required
from flaskr.services.AuthService import TokenError, create_ticket, decode_ticket
from flaskr.services.secrets_box import encrypt
from flaskr.services.streaming import streams
from flaskr.services.streaming.media_relay import path_name

bp = Blueprint("video-cameras", __name__, url_prefix="/video-cameras")

HOSTNAME = re.compile(r"^[A-Za-z0-9]([A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$")


def is_valid_port(port):
    try:
        return 0 < int(port) <= 65535
    except (TypeError, ValueError):
        return False


def is_valid_host(host):
    try:
        ipaddress.ip_address(host)
        return True
    except ValueError:
        return bool(isinstance(host, str) and HOSTNAME.match(host))


def camera_to_dict(camera):
    live = streams().status(g.tenant_id, camera.id)
    return {
        "id": camera.id,
        "ip": camera.ip,
        "port": camera.port,
        "username": camera.username,
        "name": camera.name,
        "location": camera.location,
        "stream_path": camera.stream_path,
        # "live" when frames are coming in; connecting / offline / error otherwise
        "status": "active" if live["status"] == "live" else "inactive",
        "stream_status": live["status"],
        "stream_error": live["error"],
    }


def validate_camera_data(data, partial=False):
    if not isinstance(data, dict):
        return "No input data provided"
    if not partial:
        for field in ("ip", "port", "username", "password", "name", "location"):
            if field not in data:
                return f"'{field}' is a required field"
    if "port" in data and not is_valid_port(data["port"]):
        return "Invalid port number"
    if "ip" in data and not is_valid_host(data["ip"]):
        return "Invalid IP address or host name"
    if "stream_path" in data and data["stream_path"] and not str(data["stream_path"]).startswith("/"):
        return "The stream path must start with '/'"
    return None


@bp.route("/", methods=["POST"])
@permission_required("CREATE_VIDEO_CAMERA")
def create_video_camera(current_user):
    data = request.get_json(silent=True)
    error = validate_camera_data(data)
    if error:
        return {"message": error}, 400

    db = get_tenant_db()
    try:
        if db.query(VideoCamera).filter(VideoCamera.name == data["name"]).first():
            return {"message": "Camera with that name already exists"}, 400

        camera = VideoCamera(
            ip=data["ip"],
            port=str(data["port"]),
            username=data["username"],
            password=encrypt(data["password"]),
            name=data["name"],
            location=data["location"],
            stream_path=data.get("stream_path") or "/stream1",
            status=VideoCamera.CameraStatus.INACTIVE
        )
        db.add(camera)
        db.commit()
        streams().ensure(g.tenant_id, camera.id)
        return {"message": "Camera created successfully", "camera": camera_to_dict(camera)}, 201
    except Exception as e:
        db.rollback()
        current_app.logger.error(e)
        return {"message": "Internal server error"}, 500


@bp.route("/<int:camera_id>", methods=["PUT"])
@permission_required("CREATE_VIDEO_CAMERA")
def update_video_camera(current_user, camera_id):
    data = request.get_json(silent=True)
    error = validate_camera_data(data, partial=True)
    if error:
        return {"message": error}, 400

    db = get_tenant_db()
    camera = db.get(VideoCamera, camera_id)
    if camera is None:
        return {"message": "Camera not found"}, 404
    if "name" in data and data["name"] != camera.name and \
            db.query(VideoCamera).filter(VideoCamera.name == data["name"]).first():
        return {"message": "Camera with that name already exists"}, 400

    for field in ("ip", "username", "name", "location", "stream_path"):
        if field in data:
            setattr(camera, field, data[field])
    if "port" in data:
        camera.port = str(data["port"])
    if data.get("password"):
        camera.password = encrypt(data["password"])
    db.commit()
    # The address or credentials may have changed: reconnect
    streams().restart(g.tenant_id, camera.id)
    return {"message": "Camera updated", "camera": camera_to_dict(camera)}, 200


@bp.route("/", methods=["GET"])
@permission_required("READ_VIDEO_CAMERA")
def get_cameras_list(current_user):
    cameras = get_tenant_db().query(VideoCamera).order_by(VideoCamera.id).all()
    return {"cameras": [camera_to_dict(camera) for camera in cameras]}, 200


@bp.route("/<int:camera_id>", methods=["GET"])
@permission_required("READ_VIDEO_CAMERA")
def get_camera_by_id(current_user, camera_id):
    camera = get_tenant_db().get(VideoCamera, camera_id)
    if not camera:
        return {"message": "Camera not found"}, 404
    return {"camera": camera_to_dict(camera)}, 200


@bp.route("/<int:camera_id>", methods=["DELETE"])
@permission_required("CREATE_VIDEO_CAMERA")
def delete_camera(current_user, camera_id):
    db = get_tenant_db()
    try:
        camera = db.get(VideoCamera, camera_id)
        if not camera:
            return {"message": "Camera not found"}, 404

        # Alerts keep their history but no longer point at the deleted camera
        db.query(Alert).filter(Alert.camera_id == camera.id).update({Alert.camera_id: None}, synchronize_session=False)
        db.delete(camera)
        db.commit()
        streams().stop(g.tenant_id, camera_id)
        return {"message": "Camera deleted successfully"}, 200
    except Exception as e:
        db.rollback()
        current_app.logger.error(e)
        return {"message": "Internal server error"}, 500


@bp.route("/<int:camera_id>/playback", methods=["GET"])
@permission_required("READ_VIDEO_STREAM")
def get_playback(current_user, camera_id):
    """Where the browser can watch this camera, with a ticket valid for one minute.

    webrtc: WHEP endpoint on MediaMTX (only when the relay is configured)
    mjpeg:  annotated MJPEG stream from this API (always available)
    """
    if get_tenant_db().get(VideoCamera, camera_id) is None:
        return {"message": "Camera not found"}, 404
    ticket = create_ticket(current_user, "stream", camera_id=camera_id)
    playback = {"mjpeg": f"/video-cameras/{camera_id}/stream.mjpeg?ticket={ticket}", "webrtc": None}
    if current_app.config.get("MEDIAMTX_API_URL"):
        base = current_app.config["MEDIAMTX_WEBRTC_URL"].rstrip("/")
        playback["webrtc"] = f"{base}/{path_name(g.tenant_id, camera_id)}/whep?ticket={ticket}"
    return playback, 200


def stream_ticket_user(camera_id):
    """Validate a stream ticket from the query string. Returns (user, error)."""
    try:
        claims = decode_ticket(request.args.get("ticket"), "stream")
    except TokenError as e:
        return None, ({"message": e.message}, 401)
    if claims.get("camera_id") != camera_id:
        return None, ({"message": "Ticket is for another camera"}, 403)
    user, error = authenticate_ticket_user(claims)
    if error:
        return None, error
    if not has_permission(user, "READ_VIDEO_STREAM"):
        return None, ({"message": "Forbidden"}, 403)
    return user, None


def authenticate_ticket_user(claims):
    user = get_users_db().get(User, uuid.UUID(claims["user_id"]))
    if user is None or str(user.tenant_id) != claims.get("tenant_id"):
        return None, ({"message": "Invalid ticket"}, 401)
    g.tenant_id = user.tenant_id
    return user, None


@bp.route("/<int:camera_id>/stream.mjpeg", methods=["GET"])
def stream_mjpeg(camera_id):
    user, error = stream_ticket_user(camera_id)
    if error:
        return error
    supervisor = streams()
    if supervisor.ensure(g.tenant_id, camera_id) is None:
        return {"message": "Camera not found"}, 404
    hub = supervisor.hub
    key = f"{g.tenant_id}:{camera_id}"

    def frames():
        hub.add_viewer(key)
        try:
            seq = 0
            idle_since = time.monotonic()
            while True:
                seq, jpeg = hub.wait_next(key, seq, timeout=5)
                if jpeg is None:
                    # No frames for a while (camera offline): end the response, the client retries
                    if time.monotonic() - idle_since > 30:
                        return
                    continue
                idle_since = time.monotonic()
                yield b"--frame\r\nContent-Type: image/jpeg\r\n\r\n" + jpeg + b"\r\n"
        finally:
            hub.remove_viewer(key)

    return Response(frames(), mimetype="multipart/x-mixed-replace; boundary=frame",
                    headers={"Cache-Control": "no-store"})
