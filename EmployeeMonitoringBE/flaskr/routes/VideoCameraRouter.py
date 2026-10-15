from flask import current_app, Blueprint, request, Response, g
from flaskr.db import get_tenant_db
from flaskr.middlewares.AuthMiddleware import authenticate
from flaskr.middlewares.PermissionMiddleware import permission_required, has_permission
from flaskr.entities.VideoCamera import VideoCamera
from flaskr.entities.Employee import Employee
from flaskr.entities.Alert import Alert
from flaskr.entities.alert_system.AlertRule import AlertRule
import cv2 as cv
import numpy as np
import face_recognition
import io
from threading import Thread, Lock
import time
from ultralytics import YOLO
from flaskr.services.rule_system.RuleInference import RuleInference
from flaskr.services.alert_manager.AlertManager import AlertManager
from flaskr.entities.Zone import Zone
from sqlalchemy.orm import joinedload
from collections import defaultdict
from flaskr.entities.alert_system.RuleCameraLink import RuleCameraLink
from flaskr.entities.alert_system.RuleZoneLink import RuleZoneLink

bp = Blueprint("video-cameras", __name__, url_prefix="/video-cameras")

active_cameras = {}  # stream key: {"frame": bytes, "clients": count, "running": bool, "filters": [], "thread": Thread, "generation": int}
camera_locks = {}    # stream key: Lock
registry_lock = Lock()  # guards creation of entries in active_cameras / camera_locks

detected_objects = {}

def stream_key(tenant_id, camera_name):
    """Streams are shared per tenant + camera; camera names are only unique inside a tenant."""
    return f"{tenant_id}:{camera_name}"

def is_valid_port(port):
    return 0 <= int(port) <= 65535

def validate_stream_token(token):
    """<img> tags cannot send headers, so the stream takes the token as a query parameter."""
    user, error = authenticate(token)
    if error:
        return error
    if not has_permission(user, "READ_VIDEO_STREAM"):
        return {"message": "Forbidden"}, 403
    return user, 200


@bp.route("/", methods=["POST"])
@permission_required("CREATE_VIDEO_CAMERA")
def create_video_camera(current_user):
    try:
        data = request.get_json()
        if not data:
            return {"message": "No input data provided"}, 400

        required_fields = ["ip", "port", "username", "password", "name", "location"]
        for field in required_fields:
            if field not in data:
                return {"message": f"'{field}' is a required field"}, 400

        if not is_valid_port(data.get("port")):
            return {"message": "Invalid port number"}, 400

        ip = data.get("ip")
        port = data.get("port")
        username = data.get("username")
        password = data.get("password")
        name = data.get("name")
        location = data.get("location")

        db = get_tenant_db()
        if db.query(VideoCamera).filter(VideoCamera.name == name).first():
            return {"message": "Camera with that name already exists"}, 400

        camera = VideoCamera(
            ip=ip,
            port=port,
            username=username,
            password=password,
            name=name,
            location=location,
            status=VideoCamera.CameraStatus.INACTIVE
        )

        db.add(camera)
        db.flush()
        db.commit()
        return {"message": "Camera created successfully", "camera": {
            "id": camera.id,
            "ip": camera.ip,
            "port": camera.port
        }}, 201
    except Exception as e:
        print(e)
        return {"message": "Internal server error"}, 500

def is_current_worker(key, generation):
    entry = active_cameras.get(key)
    return entry is not None and entry["running"] and entry["generation"] == generation


def process_camera_frames(camera_name, rtsp_url, filters, known_face_encodings, known_face_names,
                          app_instance, tenant_id, generation):
    """Thread entry point. Whatever happens inside, the stream entry is marked as stopped
    afterwards (unless a newer worker already replaced this one), so no zombie "running"
    entries are left behind."""
    key = stream_key(tenant_id, camera_name)
    try:
        _process_camera_frames(camera_name, rtsp_url, filters, known_face_encodings, known_face_names,
                               app_instance, tenant_id, generation)
    except Exception:
        app_instance.logger.exception("Camera worker for %s crashed", camera_name)
    finally:
        lock = camera_locks.get(key)
        if lock is not None:
            with lock:
                entry = active_cameras.get(key)
                if entry is not None and entry["generation"] == generation:
                    entry["running"] = False
                    entry["cap"] = None
                    entry["frame"] = None
        print(f"Camera stream processing stopped for {camera_name}")


def _process_camera_frames(camera_name, rtsp_url,
                          filters,
                          known_face_encodings,
                          known_face_names,
                          app_instance,
                          tenant_id,
                          generation):
    key = stream_key(tenant_id, camera_name)
    with app_instance.app_context():
        g.tenant_id = tenant_id
        print(f"Starting stream processing for {camera_name} in tenant {tenant_id}")

        db = get_tenant_db()
        camera = db.query(VideoCamera).filter_by(name=camera_name).first()
        if not camera:
            print(f"ERROR: Camera '{camera_name}' not found in tenant DB.")
            return
        camera_id = camera.id

        rules = db.query(AlertRule).options(
                joinedload(AlertRule.camera_links),
                joinedload(AlertRule.zone_links)
            ).filter(
                (AlertRule.camera_links.any(RuleCameraLink.camera_id == camera_id)) |
                (AlertRule.zone_links.any(RuleZoneLink.zone_id.in_(
                    db.query(Zone.id).filter(Zone.video_camera_id == camera_id)
                )))
            ).all()

        print(f"Found {len(rules)} rules relevant to camera {camera_name} (ID: {camera_id})")

        rule_inference = RuleInference(rules=rules)
        alert_manager = AlertManager(app_instance, tenant_id)

        model = None
        yolo_active_filters = [f for f in filters if f != "face_recognition"]
        if len(yolo_active_filters) != 0:
            model_path = app_instance.config["PPE_MODEL_PATH"]
            try:
                model = YOLO(model_path, task='detect')
                print(f"YOLO model loaded successfully from {model_path}")
                yolo_labels = model.names
                print("YOLO labels:", yolo_labels)
            except Exception as e:
                print(f"Error loading YOLO model: {e}")


        cap = cv.VideoCapture(rtsp_url)
        #cap = cv.VideoCapture(0)
        cap.set(cv.CAP_PROP_BUFFERSIZE, 2)
        if not cap.isOpened():
            print(f"Could not open stream for camera: {camera_name}")
            cap.release()
            return

        object_dwell_times_local = defaultdict(dict)
        last_cleanup_time = time.time()
        cleanup_interval = 30

        while is_current_worker(key, generation):
            with camera_locks[key]:
                if active_cameras[key]["clients"] <= 0:
                    active_cameras[key]["running"] = False
                    print(f"No more clients for camera {camera_name}, stopping stream")
                    break

            success, frame = cap.read()
            if not success:
                print(f"Failed to read frame for camera: {camera_name}. Retrying...")
                time.sleep(0.5)
                continue

            current_time = time.time()
            current_frame_ids = set()
            results = None

            try:
                if "face_recognition" in filters and known_face_encodings:
                    small_frame = cv.resize(frame, (0, 0), fx=0.25, fy=0.25)
                    rgb_small_frame = np.ascontiguousarray(small_frame[:, :, ::-1])
                    face_locations = face_recognition.face_locations(rgb_small_frame, model="cnn")
                    face_encodings = face_recognition.face_encodings(rgb_small_frame, face_locations)

                    face_names = []
                    for face_encoding in face_encodings:
                        matches = face_recognition.compare_faces(known_face_encodings, face_encoding)
                        name = "Unknown"

                        if len(known_face_encodings) > 0:
                            face_distances = face_recognition.face_distance(known_face_encodings, face_encoding)
                            best_match_index = np.argmin(face_distances)
                            if matches[best_match_index]:
                                name = known_face_names[best_match_index]
                        face_names.append(name)
                        if key not in detected_objects:
                            detected_objects[key] = {}
                        if "face_recognition" not in detected_objects[key]:
                            detected_objects[key]["face_recognition"] = {}
                        if name not in detected_objects[key]["face_recognition"]:
                            detected_objects[key]["face_recognition"][name] = {
                                "first_seen": time.time(),
                                "last_seen": time.time(),
                                "dwell_time": 0
                            }
                        else:
                            detected_objects[key]["face_recognition"][name]["last_seen"] = time.time()
                            detected_objects[key]["face_recognition"][name]["dwell_time"] = time.time() - detected_objects[key]["face_recognition"][name]["first_seen"]

                    for (top, right, bottom, left), name in zip(face_locations, face_names):
                        top *= 4
                        right *= 4
                        bottom *= 4
                        left *= 4
                        cv.rectangle(frame, (left, top), (right, bottom), (0, 0, 255), 2)
                        cv.rectangle(frame, (left, bottom - 35), (right, bottom), (0, 0, 255), cv.FILLED)
                        font = cv.FONT_HERSHEY_DUPLEX
                        cv.putText(frame, name, (left + 6, bottom - 6), font, 1.0, (255, 255, 255), 1)
            except Exception as e:
                print(f"Error in face recognition: {e}")

            if model is not None:
                try:
                    class_indices = []
                    for idx, name in yolo_labels.items():
                        if name in yolo_active_filters:
                            class_indices.append(idx)

                    results = model.track(frame, conf=0.5, iou=0.5, classes=class_indices, persist=True, tracker="bytetrack.yaml")

                    for result in results:
                        boxes = result.boxes
                        for box in boxes:
                            box_id = str(box.id.item())
                            current_frame_ids.add(box_id)
                            x1, y1, x2, y2 = map(int, box.xyxy[0])
                            conf = box.conf[0]
                            cls = int(box.cls[0])
                            label = f"{yolo_labels[cls]} {conf:.2f}"
                            cv.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
                            cv.putText(frame, "#" + box_id + " " + label, (x1, y1 - 10), cv.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 2)

                            if key not in detected_objects:
                                detected_objects[key] = {}
                                if box_id not in detected_objects[key]:
                                    detected_objects[key][box_id] = {
                                        "timestamp": time.time(),
                                        "name": yolo_labels[cls],
                                        "first_seen": current_time,
                                        "last_seen": current_time,
                                        "dwell_time": 0,
                                    }
                                else:
                                    detected_objects[key][box_id]["last_seen"] = current_time
                                    detected_objects[key][box_id]["dwell_time"] = current_time - detected_objects[key][box_id]["first_seen"]
                except Exception as e:
                    print(f"Error in YOLO detection: {e}")

            # Create a proper frame context with all required fields before inference
            frame_context = {
                "timestamp": current_time,
                "camera_id": camera_id,
                "detected_objects": {},  # Will be populated with object counts
                "detected_persons": [],  # Will store recognized person IDs
                "dwell_times": {},       # For tracking how long objects have been present
                "zones_entered": {},     # For zone detection
                "ppe_status": {}         # For PPE compliance tracking
            }

            # Add face recognition data to frame context if applicable
            # if "face_recognition" in filters and key in detected_objects and "face_recognition" in detected_objects[key]:
            #     recognized_persons = []
            #     for name, data in detected_objects[key]["face_recognition"].items():
            #         if name != "Unknown":
            #             # If we have a known person, add their ID to detected_persons
            #             # This is a simplified approach - you might need to look up actual employee IDs
            #             name_parts = name.split(" ")
            #             if len(name_parts) >= 2:
            #                 first_name, last_name = name_parts[0], name_parts[1]
            #                 employee = db.query(Employee).filter_by(firstName=first_name, lastName=last_name).first()
            #                 if employee:
            #                     recognized_persons.append(employee.id)
            #     frame_context["detected_persons"] = recognized_persons

            if "face_recognition" in filters:
                recognized_persons = []
                # Process the face_names that were just detected in this frame
                if 'face_names' in locals() and face_names:
                    for name in face_names:
                        if name != "Unknown":
                            # Look up employee ID for recognized person
                            name_parts = name.split(" ")
                            if len(name_parts) >= 2:
                                first_name = " ".join(name_parts[:-1]).strip()
                                last_name = name_parts[-1]
                                employee = db.query(Employee).filter_by(firstName=first_name, lastName=last_name).first()
                                if employee:
                                    recognized_persons.append(employee.id)
                                    print(f"Added recognized person to frame context: {name} (ID: {employee.id})")
                frame_context["detected_persons"] = recognized_persons
                print(f"Frame context detected_persons: {frame_context['detected_persons']}")

            # Process detected objects from YOLO
            if key in detected_objects:
                object_counts = {}
                for box_id, obj_data in detected_objects[key].items():
                    if box_id != "face_recognition":  # Skip the face recognition entry
                        obj_name = obj_data.get("name")
                        if obj_name:
                            # Count objects by type
                            object_counts[obj_name] = object_counts.get(obj_name, 0) + 1
                            # Add to dwell times
                            frame_context["dwell_times"][box_id] = {
                                "class_name": obj_name,
                                "dwell_time": obj_data.get("dwell_time", 0)
                            }
                frame_context["detected_objects"] = object_counts

            # IMPORTANT: Direct population of detected objects from YOLO results
            # This ensures that even newly detected objects in the current frame are included
            if model is not None and results:
                # Get detection counts directly from the current frame
                for result in results:
                    for box in result.boxes:
                        cls = int(box.cls[0])
                        cls_name = yolo_labels[cls]
                        # Add or increment the count for this object type
                        frame_context["detected_objects"][cls_name] = frame_context["detected_objects"].get(cls_name, 0) + 1

                print(f"Current frame detections: {frame_context['detected_objects']}")

            # Set the enriched frame context for inference
            alerts = rule_inference.infer(frame_context)

            for alert in alerts:
                res = alert_manager.process_alert(alert, frame)
                if res:
                    # signal the alert to the frontend
                    pass

            if current_time - last_cleanup_time > cleanup_interval:
                disappeared_ids = []
                for box_id, data in object_dwell_times_local.items():
                    if box_id not in current_frame_ids:
                        disappeared_ids.append(box_id)
                for box_id in disappeared_ids:
                    del object_dwell_times_local[box_id]
                last_cleanup_time = current_time

            success_encode, jpeg_frame = cv.imencode('.jpg', frame)
            if not success_encode:
                print(f"Failed to encode frame for camera: {camera_name}")
                continue
            frame_bytes = jpeg_frame.tobytes()
            with camera_locks[key]:
                if is_current_worker(key, generation):
                    active_cameras[key]["frame"] = frame_bytes

        # The capture is only ever released by the thread that reads from it
        cap.release()

@bp.route("/", methods=["GET"])
@permission_required("READ_VIDEO_CAMERA")
def get_cameras_list(current_user):
    db = get_tenant_db()
    cameras = db.query(VideoCamera).all()
    cameras_list = []
    for camera in cameras:
        key = stream_key(g.tenant_id, camera.name)
        if key not in active_cameras:
            status = "inactive"
        else:
            status = "active" if active_cameras[key]["running"] else "inactive"

        camera_info = {
            "id": camera.id,
            "ip": camera.ip,
            "port": camera.port,
            "username": camera.username,
            "name": camera.name,
            "location": camera.location,
            "status": status,
              "filters": active_cameras[key]["filters"] if key in active_cameras else {
            "face_recognition": False,
            }
        }
        cameras_list.append(camera_info)

    return {"cameras": cameras_list}, 200

@bp.route("/<int:camera_id>", methods=["GET"])
@permission_required("READ_VIDEO_CAMERA")
def get_camera_by_id(current_user, camera_id):
    db = get_tenant_db()
    camera = db.query(VideoCamera).filter_by(id=camera_id).first()
    if not camera:
        return {"message": "Camera not found"}, 404

    key = stream_key(g.tenant_id, camera.name)
    if key not in active_cameras:
        status = "inactive"
    else:
        status = "active" if active_cameras[key]["running"] else "inactive"

    camera_info = {
        "id": camera.id,
        "ip": camera.ip,
        "port": camera.port,
        "username": camera.username,
        "name": camera.name,
        "location": camera.location,
        "status": status,
        "filters": active_cameras[key]["filters"] if key in active_cameras else {
            "face_recognition": False,
        }
    }
    return {"camera": camera_info}, 200

@bp.route("/<string:camera_name>/stream", methods=["GET"])
def get_camera(camera_name):
    res, code = validate_stream_token(request.args.get("token"))
    if code != 200:
        return res, code

    valid_filters = [
        "Excavator", "Gloves", "Hardhat", "Ladder", "Mask", "NO-Hardhat", "NO-Mask", "NO-Safety Vest",
        "Person", "SUV", "Safety Cone", "Safety Vest", "bus", "dump truck", "fire hydrant", "machinery",
        "mini-van", "sedan", "semi", "trailer", "truck", "truck and trailer", "van", "vehicle", "wheel loader","face_recognition"
    ]
    activated_filters = []
    for arg in request.args:
        if arg in valid_filters:
            if request.args.get(arg).lower() == "true":
                activated_filters.append(arg)

    db = get_tenant_db()
    camera = db.query(VideoCamera).filter_by(name=camera_name).first()
    if not camera:
        return {"message": "Camera not found"}, 404

    known_face_encodings = []
    known_face_names = []
    if "face_recognition" in activated_filters:
        try:
            employees = db.query(Employee).all()
            known_face_encodings = [np.load(io.BytesIO(employee.encodedFace)) for employee in employees if hasattr(employee, 'encodedFace') and employee.encodedFace]
            known_face_names = [f"{employee.firstName} {employee.lastName}" for employee in employees if hasattr(employee, 'encodedFace') and employee.encodedFace]
            print(f"Loaded {len(known_face_encodings)} face encodings for recognition")
        except Exception as e:
            print(f"Error loading face data: {e}")
            return {"message": "Internal server error"}, 500

    rtsp_url = f"rtsp://{camera.username}:{camera.password}@{camera.ip}:{camera.port}/stream2"
    key = stream_key(g.tenant_id, camera_name)
    with registry_lock:
        if key not in active_cameras:
            active_cameras[key] = {
                "frame": None,
                "clients": 0,
                "running": False,
                "filters": activated_filters,
                "thread": None,
                "cap": None,
                "generation": 0
            }
            camera_locks[key] = Lock()

    with camera_locks[key]:
        entry = active_cameras[key]
        entry["clients"] += 1
        print(f"New client connected to camera {camera_name}. Total clients: {entry['clients']}")

        # A viewer without filters (e.g. a dashboard thumbnail) joins the running stream as-is
        # instead of switching off detection for everybody else.
        if entry["running"] and activated_filters and entry["filters"] != activated_filters:
            print(f"Restarting camera stream for {camera_name} due to filter change")
            # The old worker sees the newer generation and exits on its own
            entry["running"] = False
            entry["frame"] = None

        if not entry["running"]:
            entry["generation"] += 1
            entry["running"] = True
            entry["filters"] = activated_filters
            process_thread = Thread(target=process_camera_frames,
                                    args=(camera_name, rtsp_url, activated_filters,
                                          known_face_encodings, known_face_names,
                                          current_app._get_current_object(), g.tenant_id,
                                          entry["generation"]),
                                    daemon=True)
            entry["thread"] = process_thread
            process_thread.start()

    def generate_frames_for_client():
        try:
            while True:
                with camera_locks[key]:
                    entry = active_cameras.get(key)
                    if entry is None or not entry["running"]:
                        break

                    frame = entry["frame"]

                if frame is not None:
                    yield (b'--frame\r\n'
                          b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n\r\n')
                else:
                    time.sleep(0.1)
                    continue

                time.sleep(0.066)
        finally:
            with camera_locks[key]:
                if key in active_cameras:
                    active_cameras[key]["clients"] -= 1
                    remaining = active_cameras[key]["clients"]
                    print(f"Client disconnected from camera {camera_name}. Remaining clients: {remaining}")

    return Response(generate_frames_for_client(), mimetype='multipart/x-mixed-replace; boundary=frame')

@bp.route("/<int:camera_id>", methods=["DELETE"])
@permission_required("CREATE_VIDEO_CAMERA")
def delete_camera(current_user, camera_id):
    db = get_tenant_db()
    try:
        if not camera_id:
            return {"message": "No camera ID provided"}, 400

        camera = db.query(VideoCamera).filter_by(id=camera_id).first()
        if not camera:
            return {"message": "Camera not found"}, 404

        key = stream_key(g.tenant_id, camera.name)
        # Alerts keep their history but no longer point at the deleted camera
        db.query(Alert).filter(Alert.camera_id == camera.id).update({Alert.camera_id: None}, synchronize_session=False)
        db.delete(camera)
        db.commit()

        # Only signal the worker; it releases its own capture (VideoCapture is not thread-safe)
        if key in camera_locks:
            with camera_locks[key]:
                if key in active_cameras:
                    active_cameras[key]["running"] = False
        return {"message": "Camera deleted successfully"}, 200

    except Exception as e:
        db.rollback()
        current_app.logger.error(e)
        return {"message": "Internal server error"}, 500
