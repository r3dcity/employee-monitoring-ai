"""Per-camera object state built from tracker output.

The detector (YOLO + ByteTrack) gives, for each frame, boxes with a stable track id. This module
turns that into what the rule engine needs:

- which objects are visible *now* (counts are per frame, never cumulative),
- how long each object has been visible (dwell time),
- which zones each object is in, for how long, and which zones it just left.

Everything is in normalized coordinates (0..1), so zones drawn in the browser line up with any
stream resolution. No OpenCV here: this is plain Python and unit-tested.
"""
from dataclasses import dataclass, field


def point_in_polygon(x, y, polygon):
    """Ray casting test. polygon: [{"x": .., "y": ..}, ...] with normalized coordinates."""
    inside = False
    n = len(polygon)
    for i in range(n):
        x1, y1 = polygon[i]["x"], polygon[i]["y"]
        x2, y2 = polygon[(i + 1) % n]["x"], polygon[(i + 1) % n]["y"]
        if (y1 > y) != (y2 > y):
            x_cross = x1 + (y - y1) * (x2 - x1) / (y2 - y1)
            if x < x_cross:
                inside = not inside
    return inside


def anchor_point(bbox):
    """Point used to decide which zone a box is in: bottom centre (the feet of a person)."""
    x1, y1, x2, y2 = bbox
    return (x1 + x2) / 2, y2


@dataclass
class Detection:
    track_id: str
    class_name: str
    bbox: tuple          # (x1, y1, x2, y2), normalized
    confidence: float = 1.0


@dataclass
class Track:
    track_id: str
    class_name: str
    bbox: tuple
    first_seen: float
    last_seen: float
    zones: set = field(default_factory=set)
    zone_entered_at: dict = field(default_factory=dict)  # zone_id -> timestamp

    def dwell(self, now):
        return now - self.first_seen

    def zone_dwell(self, zone_id, now):
        entered = self.zone_entered_at.get(zone_id)
        return 0.0 if entered is None else now - entered


@dataclass
class ZoneExit:
    track_id: str
    class_name: str
    zone_id: int


class TrackState:
    """Keeps the tracks of one camera between frames.

    A track that has not been seen for `ttl` seconds is dropped (and counts as having left its
    zones). Short gaps, e.g. a missed detection or an occlusion, keep the original first_seen
    so dwell times do not reset.
    """

    def __init__(self, ttl=2.0):
        self.ttl = ttl
        self.tracks = {}
        self.zones = {}  # zone_id -> polygon

    def set_zones(self, zones):
        """zones: {zone_id: [{"x":..,"y":..}, ...]}; polygons with < 3 points are ignored."""
        self.zones = {zone_id: points for zone_id, points in zones.items() if points and len(points) >= 3}

    def zones_containing(self, bbox):
        x, y = anchor_point(bbox)
        return {zone_id for zone_id, polygon in self.zones.items() if point_in_polygon(x, y, polygon)}

    def update(self, detections, now):
        """Apply one frame of detections. Returns (visible_tracks, zone_exits)."""
        exits = []
        seen = set()
        for det in detections:
            seen.add(det.track_id)
            zones = self.zones_containing(det.bbox)
            track = self.tracks.get(det.track_id)
            if track is None:
                track = Track(det.track_id, det.class_name, det.bbox, first_seen=now, last_seen=now)
                self.tracks[det.track_id] = track
            track.bbox = det.bbox
            track.last_seen = now
            for zone_id in zones - track.zones:
                track.zone_entered_at[zone_id] = now
            for zone_id in track.zones - zones:
                track.zone_entered_at.pop(zone_id, None)
                exits.append(ZoneExit(track.track_id, track.class_name, zone_id))
            track.zones = zones

        for track_id, track in list(self.tracks.items()):
            if track_id not in seen and now - track.last_seen > self.ttl:
                exits.extend(ZoneExit(track_id, track.class_name, zone_id) for zone_id in track.zones)
                del self.tracks[track_id]

        visible = [self.tracks[track_id] for track_id in seen]
        return visible, exits


@dataclass
class Face:
    employee_id: object   # None for an unknown face
    bbox: tuple           # normalized
    zones: set = field(default_factory=set)
    dwell: float = 0.0


class FaceDwell:
    """Remembers since when each employee has been continuously visible."""

    def __init__(self, ttl=3.0):
        self.ttl = ttl
        self.first_seen = {}
        self.last_seen = {}

    def update(self, employee_ids, now):
        for employee_id in employee_ids:
            self.first_seen.setdefault(employee_id, now)
            self.last_seen[employee_id] = now
        for employee_id in list(self.last_seen):
            if now - self.last_seen[employee_id] > self.ttl:
                self.first_seen.pop(employee_id, None)
                self.last_seen.pop(employee_id, None)

    def dwell(self, employee_id, now):
        first = self.first_seen.get(employee_id)
        return 0.0 if first is None else now - first


@dataclass
class FrameContext:
    """Everything the rule engine knows about one processed frame."""
    timestamp: float
    camera_id: int
    objects: list = field(default_factory=list)      # visible Track objects
    exits: list = field(default_factory=list)        # ZoneExit events of this frame
    faces: list = field(default_factory=list)        # Face objects
    face_recognition_active: bool = False
    blacklist: dict = field(default_factory=dict)    # zone_id -> set(employee ids not allowed)
