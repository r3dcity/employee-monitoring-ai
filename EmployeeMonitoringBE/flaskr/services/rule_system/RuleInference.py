"""Alert rule engine.

A rule (AlertRule) has a list of conditions combined with AND/OR, a priority, a cooldown and a
location: cameras and/or zones it is linked to.

Scope of a rule on a given camera:
  - linked to the camera   -> object conditions look at the whole frame
  - linked only to zones   -> object conditions only count objects inside those zones
Zone conditions (zone_entered, zone_exited, time_in_zone) use the condition's `zone_id` when
given, otherwise the rule's zones on this camera.

Condition types (object names are matched case-insensitively):
  object_detected   object_name, operator, count, dwell_time (s, optional)
  object_count      object_name, operator, value
  dwell_time        object_name, operator, value          longest time an object is visible
  face_recognition  employee_ids ([] = any known face), dwell_time (optional)
  unauthorized_person                                       unknown face, or a blacklisted
                                                            employee inside a zone
  ppe_missing       ppe_type: helmet | vest | mask
  zone_entered      object_name (default Person), zone_id (optional)   alias: zone_entry
  zone_exited       object_name, zone_id (optional)
  time_in_zone      object_name, operator, seconds, zone_id (optional)
"""
import json
import logging
from dataclasses import dataclass

from flaskr.entities.Alert import AlertLevel, AlertType

log = logging.getLogger(__name__)

DEFAULT_COOLDOWN_SECONDS = 60

PPE_VIOLATION_CLASSES = {
    "helmet": "NO-Hardhat",
    "hardhat": "NO-Hardhat",
    "vest": "NO-Safety Vest",
    "mask": "NO-Mask",
}
PPE_ALERT_TYPES = {
    "NO-Hardhat": AlertType.NO_HELMET_DETECTED,
    "NO-Safety Vest": AlertType.NO_VEST_DETECTED,
    "NO-Mask": AlertType.NO_MASK_DETECTED,
}
ZONE_CONDITIONS = {"zone_entered", "zone_entry", "zone_exited", "time_in_zone"}

OPERATORS = {
    ">": lambda a, b: a > b,
    "<": lambda a, b: a < b,
    ">=": lambda a, b: a >= b,
    "<=": lambda a, b: a <= b,
    "==": lambda a, b: a == b,
    "=": lambda a, b: a == b,
    "!=": lambda a, b: a != b,
}


def compare(actual, operator, expected):
    try:
        expected = float(expected)
    except (TypeError, ValueError):
        return False
    fn = OPERATORS.get(operator or ">=")
    if fn is None:
        log.warning("Unknown operator %r", operator)
        return False
    return fn(actual, expected)


def same_class(a, b):
    return str(a).lower() == str(b).lower()


@dataclass
class Evidence:
    """Why a condition matched: used to fill in the alert."""
    employee_id: object = None
    zone_id: object = None
    alert_type: AlertType = None


@dataclass
class TriggeredAlert:
    rule_id: int
    level: AlertLevel
    type: AlertType
    explanation: str
    camera_id: int
    timestamp: float
    employee_id: object = None
    zone_id: object = None


@dataclass
class ParsedRule:
    id: int
    level: AlertLevel
    description: str
    conditions: list
    operator: str
    cooldown: float
    whole_frame: bool
    zones: set


def parse_rule(rule, camera_id, camera_zone_ids):
    try:
        data = json.loads(rule.conditions_json) if isinstance(rule.conditions_json, str) else rule.conditions_json
        conditions = data["conditions"]
    except (TypeError, ValueError, KeyError):
        log.warning("Rule %s has invalid conditions, skipped", rule.id)
        return None
    operator = str(data.get("logical_operator") or data.get("logic") or "AND").upper()
    priority = getattr(rule.priority, "value", rule.priority) or "low"
    return ParsedRule(
        id=rule.id,
        level=AlertLevel(str(priority).lower()),
        description=rule.description or f"Rule {rule.id} triggered",
        conditions=[c for c in conditions if isinstance(c, dict)],
        operator="OR" if operator == "OR" else "AND",
        cooldown=rule.cooldown_seconds or DEFAULT_COOLDOWN_SECONDS,
        whole_frame=camera_id in {link.camera_id for link in rule.camera_links},
        zones={link.zone_id for link in rule.zone_links} & set(camera_zone_ids),
    )


class RuleInference:
    """Evaluates the active rules of one camera, frame by frame."""

    def __init__(self, rules, camera_id, camera_zone_ids=()):
        self.camera_id = camera_id
        self.rules = [parsed for rule in rules if rule.is_active
                      for parsed in [parse_rule(rule, camera_id, camera_zone_ids)] if parsed]
        self.last_triggered = {}

    # ---- what the detectors must look for -------------------------------------------------
    def required_classes(self):
        classes = set()
        for rule in self.rules:
            for c in rule.conditions:
                kind = c.get("type")
                if kind in ("object_detected", "object_count", "dwell_time") or kind in ZONE_CONDITIONS:
                    classes.add(c.get("object_name") or "Person")
                elif kind == "ppe_missing" and c.get("ppe_type") in PPE_VIOLATION_CLASSES:
                    classes.update({PPE_VIOLATION_CLASSES[c["ppe_type"]], "Person"})
        return classes

    def needs_faces(self):
        return any(c.get("type") in ("face_recognition", "unauthorized_person")
                   for rule in self.rules for c in rule.conditions)

    # ---- evaluation ------------------------------------------------------------------------
    def infer(self, ctx):
        alerts = []
        for rule in self.rules:
            last = self.last_triggered.get(rule.id)
            if last is not None and ctx.timestamp - last < rule.cooldown:
                continue

            results = [self._evaluate(rule, c, ctx) for c in rule.conditions]
            matched = [r for r in results if r is not None]
            if not results:
                continue
            triggered = len(matched) == len(results) if rule.operator == "AND" else bool(matched)
            if not triggered:
                continue

            self.last_triggered[rule.id] = ctx.timestamp
            evidence = Evidence()
            for item in matched:
                evidence.employee_id = evidence.employee_id if evidence.employee_id is not None else item.employee_id
                evidence.zone_id = evidence.zone_id if evidence.zone_id is not None else item.zone_id
                evidence.alert_type = evidence.alert_type or item.alert_type
            alerts.append(TriggeredAlert(
                rule_id=rule.id,
                level=rule.level,
                type=evidence.alert_type or AlertType.PERSON_DETECTED,
                explanation=rule.description,
                camera_id=self.camera_id,
                timestamp=ctx.timestamp,
                employee_id=evidence.employee_id,
                zone_id=evidence.zone_id,
            ))
        return alerts

    def _objects_in_scope(self, rule, ctx, object_name):
        objects = [o for o in ctx.objects if same_class(o.class_name, object_name)]
        if rule.whole_frame:
            return objects
        return [o for o in objects if o.zones & rule.zones]

    def _target_zones(self, rule, condition):
        zone_id = condition.get("zone_id")
        return {int(zone_id)} if zone_id not in (None, "") else rule.zones

    def _evaluate(self, rule, c, ctx):
        """Return Evidence when the condition holds, None otherwise."""
        kind = c.get("type")
        object_name = c.get("object_name") or "Person"
        now = ctx.timestamp

        if kind == "object_detected":
            objects = self._objects_in_scope(rule, ctx, object_name)
            min_dwell = float(c.get("dwell_time") or 0)
            if min_dwell > 0:
                objects = [o for o in objects if o.dwell(now) >= min_dwell]
            return Evidence() if compare(len(objects), c.get("operator", ">="), c.get("count", 1)) else None

        if kind == "object_count":
            count = len(self._objects_in_scope(rule, ctx, object_name))
            return Evidence() if compare(count, c.get("operator"), c.get("value", c.get("count"))) else None

        if kind == "dwell_time":
            dwell = max((o.dwell(now) for o in self._objects_in_scope(rule, ctx, object_name)), default=0.0)
            return Evidence() if compare(dwell, c.get("operator"), c.get("value")) else None

        if kind == "ppe_missing":
            violation = PPE_VIOLATION_CLASSES.get(c.get("ppe_type"))
            if violation and self._objects_in_scope(rule, ctx, violation):
                return Evidence(alert_type=PPE_ALERT_TYPES[violation])
            return None

        if kind == "face_recognition":
            wanted = set(c.get("employee_ids") or ([c["employee_id"]] if c.get("employee_id") else []))
            min_dwell = float(c.get("dwell_time") or 0)
            for face in ctx.faces:
                if face.employee_id is None or (wanted and face.employee_id not in wanted):
                    continue
                if not rule.whole_frame and not (face.zones & rule.zones):
                    continue
                if face.dwell >= min_dwell:
                    return Evidence(employee_id=face.employee_id, alert_type=AlertType.FACE_DETECTED)
            return None

        if kind == "unauthorized_person":
            if not ctx.face_recognition_active:
                return None  # without face recognition every person would look "unknown"
            for face in ctx.faces:
                if not rule.whole_frame and not (face.zones & rule.zones):
                    continue
                if face.employee_id is None:
                    return Evidence(alert_type=AlertType.UNAUTHORIZED_PERSON_DETECTED,
                                    zone_id=next(iter(face.zones & rule.zones), None))
                for zone_id in face.zones:
                    if face.employee_id in ctx.blacklist.get(zone_id, ()):
                        return Evidence(employee_id=face.employee_id, zone_id=zone_id,
                                        alert_type=AlertType.UNAUTHORIZED_PERSON_DETECTED)
            return None

        if kind in ("zone_entered", "zone_entry"):
            for zone_id in self._target_zones(rule, c):
                if any(zone_id in o.zones for o in ctx.objects if same_class(o.class_name, object_name)):
                    return Evidence(zone_id=zone_id)
            return None

        if kind == "zone_exited":
            zones = self._target_zones(rule, c)
            for exit_event in ctx.exits:
                if exit_event.zone_id in zones and same_class(exit_event.class_name, object_name):
                    return Evidence(zone_id=exit_event.zone_id)
            return None

        if kind == "time_in_zone":
            expected = c.get("seconds", c.get("value"))
            for zone_id in self._target_zones(rule, c):
                dwell = max((o.zone_dwell(zone_id, now) for o in ctx.objects
                             if zone_id in o.zones and same_class(o.class_name, object_name)), default=None)
                if dwell is not None and compare(dwell, c.get("operator", ">="), expected):
                    return Evidence(zone_id=zone_id)
            return None

        log.warning("Unknown condition type %r in rule %s", kind, rule.id)
        return None
