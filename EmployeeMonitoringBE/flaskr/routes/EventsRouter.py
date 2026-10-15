"""Live events for the browser (Server-Sent Events) and the MediaMTX auth callback.

SSE instead of WebSockets: it is plain HTTP (works through the nginx proxy as-is), the browser
reconnects automatically, and the data only flows server -> client.

  POST /events/ticket            -> {"url": "/events/stream?ticket=..."}
  GET  /events/stream?ticket=..&cameras=1,2   (or cameras=all)
       event: alert          new alert (always)
       event: camera_status  a camera went live/offline (always)
       event: detections     boxes for the overlay (only for the cameras listed in `cameras`)
"""
import hmac
import json
import uuid

from flask import Blueprint, Response, current_app, g, request, stream_with_context

from flaskr.db import get_users_db
from flaskr.entities.auth_db.User import User
from flaskr.middlewares.PermissionMiddleware import has_permission, permission_required
from flaskr.services.AuthService import TokenError, create_ticket, decode_ticket
from flaskr.services.streaming import streams
from flaskr.services.streaming.media_relay import parse_path_name

bp = Blueprint("events", __name__)

HEARTBEAT_SECONDS = 15


@bp.route("/events/ticket", methods=["POST"])
@permission_required("GET_ALERTS")
def events_ticket(current_user):
    return {"url": f"/events/stream?ticket={create_ticket(current_user, 'events')}"}, 200


@bp.route("/events/stream", methods=["GET"])
def events_stream():
    try:
        claims = decode_ticket(request.args.get("ticket"), "events")
    except TokenError as e:
        return {"message": e.message}, 401
    user = get_users_db().get(User, uuid.UUID(claims["user_id"]))
    if user is None or str(user.tenant_id) != claims.get("tenant_id") or not has_permission(user, "GET_ALERTS"):
        return {"message": "Forbidden"}, 403

    cameras_arg = request.args.get("cameras", "")
    all_cameras = cameras_arg == "all"
    cameras = {int(c) for c in cameras_arg.split(",") if c.strip().isdigit()}
    bus = streams().bus
    subscription = bus.subscribe(user.tenant_id)

    def generate():
        try:
            yield "retry: 3000\n\n"
            while True:
                event = subscription.get(timeout=HEARTBEAT_SECONDS)
                if event is None:
                    yield ": keep-alive\n\n"
                    continue
                if event["type"] == "detections" and not all_cameras and event["data"]["camera_id"] not in cameras:
                    continue
                yield f"id: {event['id']}\nevent: {event['type']}\ndata: {json.dumps(event['data'], default=str)}\n\n"
        finally:
            bus.unsubscribe(subscription)

    return Response(stream_with_context(generate()), mimetype="text/event-stream",
                    headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@bp.route("/health", methods=["GET"])
def health():
    return {"status": "ok"}, 200


@bp.route("/internal/media-auth", methods=["POST"])
def media_auth():
    """Called by MediaMTX for every read/publish/API request (authMethod: http).

    Allowed: the internal user (camera workers, API calls from this backend) and browsers
    reading a camera's WebRTC stream with a valid stream ticket for that camera.
    """
    body = request.get_json(silent=True) or {}
    config = current_app.config
    internal_password = config.get("MEDIA_INTERNAL_PASSWORD") or ""
    if internal_password and body.get("user") == config.get("MEDIA_INTERNAL_USER") and \
            hmac.compare_digest(str(body.get("password", "")), internal_password):
        return "", 200

    if body.get("action") not in ("read", "playback"):
        return "", 401
    target = parse_path_name(body.get("path") or "")
    query = dict(part.split("=", 1) for part in (body.get("query") or "").split("&") if "=" in part)
    try:
        claims = decode_ticket(query.get("ticket"), "stream")
    except TokenError:
        return "", 401
    if target is None or target != (claims.get("tenant_id"), claims.get("camera_id")):
        return "", 401
    user = get_users_db().get(User, uuid.UUID(claims["user_id"]))
    if user is None or not has_permission(user, "READ_VIDEO_STREAM"):
        return "", 401
    g.tenant_id = user.tenant_id
    return "", 200
