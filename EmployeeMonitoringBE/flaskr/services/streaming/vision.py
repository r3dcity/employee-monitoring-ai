"""Adapters around the computer vision libraries.

The camera worker only depends on these small interfaces, so tests can replace them with
fakes and the heavy libraries (OpenCV, ultralytics, dlib) are imported lazily.
"""
import io
import logging

import numpy as np

from flaskr.services.streaming.tracking import Detection

log = logging.getLogger(__name__)


def open_capture(url):
    import cv2
    capture = cv2.VideoCapture(url, cv2.CAP_FFMPEG)
    # Keep the decoder queue short: we always want the most recent frame
    capture.set(cv2.CAP_PROP_BUFFERSIZE, 1)
    return capture


def encode_jpeg(frame, quality=80):
    import cv2
    ok, buffer = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
    return buffer.tobytes() if ok else None


class YoloDetector:
    """YOLOv8 + ByteTrack. One instance per camera: the tracker keeps state between frames."""

    def __init__(self, model_path, confidence=0.5, device=None):
        from ultralytics import YOLO
        self.model = YOLO(model_path, task="detect")
        self.names = self.model.names
        self.confidence = confidence
        self.device = device

    def detect(self, frame):
        height, width = frame.shape[:2]
        results = self.model.track(frame, conf=self.confidence, iou=0.5, persist=True,
                                   tracker="bytetrack.yaml", verbose=False, device=self.device)
        detections = []
        for result in results:
            for index, box in enumerate(result.boxes):
                x1, y1, x2, y2 = (float(v) for v in box.xyxy[0])
                # Boxes the tracker has not confirmed yet have no id: give them a per-frame id
                track_id = str(int(box.id.item())) if box.id is not None else f"new-{index}"
                detections.append(Detection(
                    track_id=track_id,
                    class_name=self.names[int(box.cls[0])],
                    bbox=(x1 / width, y1 / height, x2 / width, y2 / height),
                    confidence=float(box.conf[0]),
                ))
        return detections


class FaceRecognizer:
    """face_recognition (dlib). HOG face detection on CPU, CNN only when dlib has CUDA."""

    def __init__(self, known_faces, scale=0.5, tolerance=0.6):
        import dlib
        import face_recognition
        self.fr = face_recognition
        self.model = "cnn" if getattr(dlib, "DLIB_USE_CUDA", False) else "hog"
        self.employee_ids = list(known_faces)
        self.encodings = [known_faces[e] for e in self.employee_ids]
        self.scale = scale
        self.tolerance = tolerance

    def recognize(self, frame):
        """Return [(employee_id or None, normalized bbox)]."""
        import cv2
        small = cv2.resize(frame, (0, 0), fx=self.scale, fy=self.scale)
        rgb = np.ascontiguousarray(small[:, :, ::-1])
        height, width = rgb.shape[:2]
        locations = self.fr.face_locations(rgb, model=self.model)
        encodings = self.fr.face_encodings(rgb, locations)
        faces = []
        for (top, right, bottom, left), encoding in zip(locations, encodings):
            employee_id = None
            if self.encodings:
                distances = self.fr.face_distance(self.encodings, encoding)
                best = int(np.argmin(distances))
                if distances[best] <= self.tolerance:
                    employee_id = self.employee_ids[best]
            faces.append((employee_id, (left / width, top / height, right / width, bottom / height)))
        return faces


def load_face_encoding(blob):
    return np.load(io.BytesIO(blob))


def draw_overlays(frame, tracks, faces, employee_names, zones):
    """Draw zones, tracked objects and faces on a copy of the frame (for MJPEG viewers)."""
    import cv2
    canvas = frame.copy()
    height, width = canvas.shape[:2]

    for points in zones.values():
        polygon = np.array([[int(p["x"] * width), int(p["y"] * height)] for p in points], dtype=np.int32)
        cv2.polylines(canvas, [polygon], True, (255, 200, 0), 2)

    def box(bbox):
        x1, y1, x2, y2 = bbox
        return (int(x1 * width), int(y1 * height)), (int(x2 * width), int(y2 * height))

    for track in tracks:
        violation = track.class_name.startswith("NO-")
        color = (0, 0, 255) if violation else (0, 200, 0)
        top_left, bottom_right = box(track.bbox)
        cv2.rectangle(canvas, top_left, bottom_right, color, 2)
        cv2.putText(canvas, f"{track.class_name} #{track.track_id}", (top_left[0], max(12, top_left[1] - 6)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)

    for face in faces:
        top_left, bottom_right = box(face.bbox)
        name = employee_names.get(face.employee_id, "Unknown")
        color = (255, 255, 255) if face.employee_id is not None else (0, 0, 255)
        cv2.rectangle(canvas, top_left, bottom_right, color, 2)
        cv2.putText(canvas, name, (top_left[0], bottom_right[1] + 16), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)
    return canvas
