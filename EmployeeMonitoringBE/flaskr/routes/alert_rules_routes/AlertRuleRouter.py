from flask import Blueprint, request,jsonify, current_app as app
from flaskr.db import get_tenant_db
from flaskr.middlewares.PermissionMiddleware import permission_required
from sqlalchemy.exc import SQLAlchemyError
from flaskr.entities.alert_system.AlertRule import AlertRule, Priority
from flaskr.entities.alert_system.RuleCameraLink import RuleCameraLink
from flaskr.entities.alert_system.RuleZoneLink import RuleZoneLink
from flaskr.entities.VideoCamera import VideoCamera
from sqlalchemy.orm import joinedload, selectinload
from flaskr.entities.Zone import Zone
import json

bp = Blueprint("alert-rules", __name__, url_prefix="/alert-rules")

PRIORITY_BY_NUMBER = {1: Priority.LOW, 2: Priority.MEDIUM, 3: Priority.HIGH}


class RuleValidationError(Exception):
    pass


def parse_priority(value):
    """Accept 1/2/3 or 'low'/'medium'/'high'; anything else falls back to MEDIUM."""
    if isinstance(value, int):
        return PRIORITY_BY_NUMBER.get(value, Priority.MEDIUM)
    if isinstance(value, str):
        return Priority.__members__.get(value.upper(), Priority.MEDIUM)
    return Priority.MEDIUM


def normalize_conditions(value):
    """Validate the rule conditions (sent as a dict or a JSON string) and return them as a JSON string.

    The frontend historically used both "logic" and "logical_operator"; they are stored as
    "logical_operator".
    """
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except json.JSONDecodeError:
            raise RuleValidationError("conditions_json is not valid JSON")
    if not isinstance(value, dict) or not isinstance(value.get("conditions"), list):
        raise RuleValidationError("conditions_json must be an object with a 'conditions' list")
    if any(not isinstance(c, dict) or "type" not in c for c in value["conditions"]):
        raise RuleValidationError("Every condition needs a 'type'")
    operator = str(value.pop("logic", None) or value.get("logical_operator") or "AND").upper()
    if operator not in ("AND", "OR"):
        raise RuleValidationError("logical_operator must be AND or OR")
    value["logical_operator"] = operator
    return json.dumps(value)


def apply_location(db, alert_rule, location):
    if not isinstance(location, dict):
        raise RuleValidationError("location must be an object")
    camera_ids = set(location.get("cameras") or [])
    zone_ids = set(location.get("zones") or [])
    found_cameras = {c for (c,) in db.query(VideoCamera.id).filter(VideoCamera.id.in_(camera_ids))} if camera_ids else set()
    found_zones = {z for (z,) in db.query(Zone.id).filter(Zone.id.in_(zone_ids))} if zone_ids else set()
    if camera_ids - found_cameras:
        raise RuleValidationError(f"Unknown cameras: {sorted(camera_ids - found_cameras)}")
    if zone_ids - found_zones:
        raise RuleValidationError(f"Unknown zones: {sorted(zone_ids - found_zones)}")

    alert_rule.camera_links.clear()
    alert_rule.zone_links.clear()
    for camera_id in camera_ids:
        alert_rule.camera_links.append(RuleCameraLink(camera_id=camera_id))
    for zone_id in zone_ids:
        alert_rule.zone_links.append(RuleZoneLink(zone_id=zone_id))


"""
conditions_json:
{
    "logic": "AND",
    "conditions": [
    {
        "object_name": "Excavator",
        "dwell_time": 10,
        "min_count": 1,
        "action": {
            "notification": "email",
            "message": "Excavator detected",
            "recipient": {
                "security": [1, 2, 3],
                "employees": [1 , 2, 3]
            }
        }
    },
    {
        "object_name": "face_recognition",
        "dwell_time": 10,
        "employees": [1, 2, 3]  // at least one
        "action": {
            "notification": "sms",
            "message": "Excavator detected",
            "recipient": {
                "security": [1, 2, 3],
                "employees": [1 , 2, 3]
            }
        }
    }
    ]
}

"""

@bp.route("/", methods=["POST"])
@permission_required("CREATE_ALERT_RULES")
def create_alert_rule(current_user):
    """
    Create a new alert rule.
    Request Body:
        {
            "description": "string",
            "is_active": true, // optional, default is false
            "priority": 1, // 1 - low 2 - medium 3 - high
            "conditions_json": "{}",
            "cooldown_seconds": 60, // optional, default is 0 (no cooldown)
            "location": { // At least one camera or one zone
                "cameras": [1, 2],
                "zones": []
            }
        }
    Returns:
        JSON response with the created alert rule or an error message.
    """
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "No data provided"}), 400
    if "conditions_json" not in data:
        return jsonify({"error": "conditions_json is required"}), 400
    db = get_tenant_db()

    try:
        alert_rule = AlertRule(
            description=data.get("description"),
            is_active=bool(data.get("is_active", False)),
            priority=parse_priority(data.get("priority")),
            conditions_json=normalize_conditions(data["conditions_json"]),
            cooldown_seconds=int(data.get("cooldown_seconds") or 0),
        )
        apply_location(db, alert_rule, data.get("location") or {})

        db.add(alert_rule)
        db.commit()

        return jsonify({"message": "Alert rule created successfully", "alert_rule_id": alert_rule.id}), 201

    except (RuleValidationError, ValueError, TypeError) as e:
        db.rollback()
        return jsonify({"error": str(e)}), 400
    except SQLAlchemyError as e:
        db.rollback()
        app.logger.error(f"Error creating alert rule: {str(e)}")
        return jsonify({"error": "Database error occurred"}), 500

@bp.route("/", methods=["GET"])
@permission_required("READ_ALERT_RULES")
def get_alert_rules(current_user):
    """
    Get all alert rules.
    Returns:
        JSON response with the list of alert rules.
    """
    db = get_tenant_db()

    try:
        alert_rules = db.query(AlertRule).options(
            selectinload(AlertRule.camera_links), selectinload(AlertRule.zone_links)
        ).all()
        return jsonify([alert_rule.to_dict() for alert_rule in alert_rules]), 200

    except SQLAlchemyError as e:
        app.logger.error(f"Error fetching alert rules: {str(e)}")
        return jsonify({"error": "Database error occurred"}), 500

@bp.route("/<int:rule_id>", methods=["PUT"])
@permission_required("UPDATE_ALERT_RULES")
def update_alert_rule(current_user, rule_id):
    """
    Update an existing alert rule. Can update description, priority, conditions, active status, and location links.
    Request Body: (Include fields to update)
        {
            "description": "string",
            "is_active": true,
            "priority": "high", // or "medium", "low"
            "conditions_json": "{}",
            "location": {
                "cameras": [1, 2], // Overwrites existing camera links
                "zones": [3]       // Overwrites existing zone links
            }
        }
    Returns:
        JSON response confirming update or error.
    """
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "No data provided"}), 400
    db = get_tenant_db()

    try:
        alert_rule = db.get(AlertRule, rule_id)
        if not alert_rule:
            return jsonify({"error": "Alert rule not found"}), 404

        if "description" in data:
            alert_rule.description = data["description"]
        if "is_active" in data:
            alert_rule.is_active = bool(data["is_active"])
        if "cooldown_seconds" in data:
            alert_rule.cooldown_seconds = int(data["cooldown_seconds"] or 0)
        if "priority" in data:
            alert_rule.priority = parse_priority(data["priority"])
        if "conditions_json" in data:
            alert_rule.conditions_json = normalize_conditions(data["conditions_json"])
        if "location" in data:
            apply_location(db, alert_rule, data["location"])

        db.commit()
        return jsonify({"message": "Alert rule updated successfully"}), 200

    except (RuleValidationError, ValueError, TypeError) as e:
        db.rollback()
        return jsonify({"error": str(e)}), 400
    except SQLAlchemyError as e:
        db.rollback()
        app.logger.error(f"Error updating alert rule {rule_id}: {str(e)}")
        return jsonify({"error": "Database error occurred"}), 500
    except Exception as e:
        db.rollback()
        app.logger.error(f"Unexpected error updating alert rule {rule_id}: {str(e)}")
        return jsonify({"error": "An unexpected error occurred"}), 500

@bp.route("/<int:rule_id>", methods=["DELETE"])
@permission_required("DELETE_ALERT_RULES")
def delete_alert_rule(current_user, rule_id):
    """
    Delete an alert rule.
    Returns:
        JSON response confirming deletion or error.
    """
    db = get_tenant_db()
    try:
        alert_rule = db.query(AlertRule).filter(AlertRule.id == rule_id).first()
        if not alert_rule:
            return jsonify({"error": "Alert rule not found"}), 404

        db.delete(alert_rule)
        db.commit()
        return jsonify({"message": "Alert rule deleted successfully"}), 200

    except SQLAlchemyError as e:
        db.rollback()
        app.logger.error(f"Error deleting alert rule {rule_id}: {str(e)}")
        return jsonify({"error": "Database error occurred"}), 500
    except Exception as e:
        db.rollback()
        app.logger.error(f"Unexpected error deleting alert rule {rule_id}: {str(e)}")
        return jsonify({"error": "An unexpected error occurred"}), 500

@bp.route("/camera/<int:camera_id>", methods=["GET"])
@permission_required("READ_ALERT_RULES")
def get_alert_rules_for_camera(current_user, camera_id):
    """
    Get all alert rules associated with a specific camera.
    Returns:
        JSON response with the list of alert rules.
    """
    db = get_tenant_db()
    try:
        camera = db.query(VideoCamera.id).filter(VideoCamera.id == camera_id).first()
        if not camera:
            return jsonify({"error": "Camera not found"}), 404

        alert_rules = db.query(AlertRule)\
            .join(RuleCameraLink)\
            .filter(RuleCameraLink.camera_id == camera_id)\
            .options(joinedload(AlertRule.camera_links), joinedload(AlertRule.zone_links))\
            .all()

        rules_list = [rule.to_dict() for rule in alert_rules]

        return jsonify(rules_list), 200

    except SQLAlchemyError as e:
        app.logger.error(f"Error fetching alert rules for camera {camera_id}: {str(e)}")
        return jsonify({"error": "Database error occurred"}), 500
    except AttributeError:
        app.logger.error(f"AlertRule entity likely missing a 'to_dict' method.")
        rules_list_manual = []
        for rule in alert_rules:
             rules_list_manual.append({
                 "id": rule.id,
                 "description": rule.description,
                 "is_active": rule.is_active,
                 "priority": rule.priority.value if rule.priority else None,
                 "conditions_json": rule.conditions_json,
                 "created_at": rule.created_at.isoformat() if rule.created_at else None,
             })
        return jsonify(rules_list_manual), 200

    except Exception as e:
        app.logger.error(f"Unexpected error fetching alert rules for camera {camera_id}: {str(e)}")
        return jsonify({"error": "An unexpected error occurred"}), 500
