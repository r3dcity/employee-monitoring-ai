from flask import Blueprint, request, jsonify, current_app as app, send_file
from flaskr.entities.Alert import Alert, AlertLevel, AlertStatus
from flaskr.entities.VideoCamera import VideoCamera
from flaskr.entities.Zone import Zone
from flaskr.db import get_tenant_db
from flaskr.middlewares.PermissionMiddleware import permission_required
from flaskr.services.storage import resolve_stored_path
from datetime import datetime
from sqlalchemy.exc import SQLAlchemyError

bp = Blueprint("alerts", __name__, url_prefix="/alerts")


# Creation of alerts are done only on the backend side
# so no need for a POST route


@bp.route("/", methods=["GET"])
@permission_required("GET_ALERTS")
def get_alerts(current_user):
    """
    Retrieves alerts, optionally filtering by status, level, zone, employee, and time range.
    Query Parameters:
        status (str): Filter by alert status (e.g., 'active', 'resolved').
        level (str): Filter by alert level (e.g., 'low', 'medium', 'high').
        zone_id (int): Filter by zone ID.
        employee_id (int): Filter by employee ID.
        start_time (str): Filter by start timestamp (ISO 8601 format, e.g., 'YYYY-MM-DDTHH:MM:SS').
        end_time (str): Filter by end timestamp (ISO 8601 format, e.g., 'YYYY-MM-DDTHH:MM:SS').
        limit (int), offset (int): Optional pagination. Alerts are returned newest first.
    Returns:
        JSON response with a list of alerts or an error message.
    """
    args = request.args
    db = get_tenant_db()
    try:
        # Join with VideoCamera and Zone to get their names
        query = db.query(Alert,
                         VideoCamera.name.label('camera_name'),
                         VideoCamera.location.label('camera_location'),
                         Zone.name.label('zone_name')) \
                .outerjoin(VideoCamera, Alert.camera_id == VideoCamera.id) \
                .outerjoin(Zone, Alert.zone_id == Zone.id)

        if 'status' in args:
            try:
                status_enum = AlertStatus(args['status'].lower())
                query = query.filter(Alert.status == status_enum)
            except ValueError:
                return jsonify({"error": f"Invalid status value: {args['status']}"}), 400

        if 'level' in args:
            try:
                level_enum = AlertLevel(args['level'].lower())
                query = query.filter(Alert.level == level_enum)
            except ValueError:
                return jsonify({"error": f"Invalid level value: {args['level']}"}), 400

        if 'zone_id' in args:
            try:
                zone_id = int(args['zone_id'])
                query = query.filter(Alert.zone_id == zone_id)
            except ValueError:
                return jsonify({"error": f"Invalid zone_id value: {args['zone_id']}"}), 400

        if 'employee_id' in args:
            try:
                employee_id = int(args['employee_id'])
                query = query.filter(Alert.employee_id == employee_id)
            except ValueError:
                return jsonify({"error": f"Invalid employee_id value: {args['employee_id']}"}), 400

        if 'start_time' in args:
            try:
                # Assuming ISO 8601 format from query param
                start_time = datetime.fromisoformat(args['start_time'])
                query = query.filter(Alert.timestamp >= start_time)
            except ValueError:
                return jsonify({"error": f"Invalid start_time format: {args['start_time']}. Use ISO 8601."}), 400

        if 'end_time' in args:
            try:
                # Assuming ISO 8601 format from query param
                end_time = datetime.fromisoformat(args['end_time'])
                query = query.filter(Alert.timestamp <= end_time)
            except ValueError:
                return jsonify({"error": f"Invalid end_time format: {args['end_time']}. Use ISO 8601."}), 400

        query = query.order_by(Alert.timestamp.desc(), Alert.id.desc())
        try:
            if 'limit' in args:
                query = query.limit(max(0, int(args['limit'])))
            if 'offset' in args:
                query = query.offset(max(0, int(args['offset'])))
        except ValueError:
            return jsonify({"error": "limit and offset must be integers"}), 400

        # Execute the query
        results = query.all()
        
        # Process results to include camera and zone information
        alerts_data = []
        for row in results:
            alert_dict = row[0].to_dict()  # Get dict from Alert object
            # Add camera and zone information
            alert_dict['camera_name'] = row[1]  # camera_name
            alert_dict['camera_location'] = row[2]  # camera_location
            alert_dict['zone_name'] = row[3]  # zone_name
            alerts_data.append(alert_dict)
        
        return jsonify({"alerts": alerts_data}), 200

    except SQLAlchemyError as e:
        # Log the error e
        app.logger.error(f"Database error in retrieving alerts: {str(e)}")
        return jsonify({"error": "Database error occurred"}), 500
    except Exception as e:
        # Log the error e
        app.logger.error(f"Unexpected error in retrieving alerts: {str(e)}")
        return jsonify({"error": "An unexpected error occurred"}), 500


@bp.route("/<int:alert_id>", methods=["GET"])
@permission_required("GET_ALERTS")
def get_alert_by_id(current_user, alert_id):
    """
    Retrieves a single alert by ID with all its details, including screenshot path.
    
    Args:
        alert_id (int): The ID of the alert to retrieve.
        
    Returns:
        JSON response with the alert details or an error message.
    """
    db = get_tenant_db()
    try:
        # Join with VideoCamera and Zone to get more information
        result = db.query(Alert,
                         VideoCamera.name.label('camera_name'),
                         VideoCamera.location.label('camera_location'),
                         Zone.name.label('zone_name')) \
                .outerjoin(VideoCamera, Alert.camera_id == VideoCamera.id) \
                .outerjoin(Zone, Alert.zone_id == Zone.id) \
                .filter(Alert.id == alert_id) \
                .first()
        
        if not result:
            return jsonify({"error": f"Alert with ID {alert_id} not found"}), 404
            
        alert = result[0]
        alert_data = alert.to_dict()
        
        # Add the additional information from the joins
        alert_data['camera_name'] = result[1]
        alert_data['camera_location'] = result[2]
        alert_data['zone_name'] = result[3]
        
        # Screenshots are served by the authenticated endpoint below
        if alert.screenshot:
            alert_data['screenshot_url'] = f"/alerts/screenshot/{alert.id}"

        return jsonify({"alert": alert_data}), 200
        
    except SQLAlchemyError as e:
        app.logger.error(f"Database error retrieving alert {alert_id}: {str(e)}")
        return jsonify({"error": "Database error occurred"}), 500
    except Exception as e:
        app.logger.error(f"Unexpected error retrieving alert {alert_id}: {str(e)}")
        return jsonify({"error": "An unexpected error occurred"}), 500


@bp.route("/<int:alert_id>", methods=["PUT"])
@permission_required("GET_ALERTS")
def update_alert(current_user, alert_id):
    """
    Updates an existing alert with provided data.
    
    Request Body (all fields optional):
    {
        "status": "active" or "resolved",
        "explanation": "Updated explanation text",
        "level": "low", "medium", or "high",
        "resolved_at": "2025-05-05T10:00:00" (ISO format, required if status is "resolved")
    }
    
    Args:
        alert_id (int): The ID of the alert to update
        
    Returns:
        JSON response with success message or error
    """
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "No data provided"}), 400
    db = get_tenant_db()

    try:
        # Find the alert to update
        alert = db.query(Alert).filter(Alert.id == alert_id).first()
        
        if not alert:
            return jsonify({"error": f"Alert with ID {alert_id} not found"}), 404
        
        # Update alert fields if provided in the request
        if "status" in data:
            try:
                new_status = AlertStatus(data["status"].lower())
                
                # If changing to resolved, require resolved_at timestamp
                if new_status == AlertStatus.RESOLVED and alert.status != AlertStatus.RESOLVED:
                    # If resolved_at not provided in request, use current time
                    if "resolved_at" in data:
                        try:
                            resolved_at = datetime.fromisoformat(data["resolved_at"])
                        except ValueError:
                            return jsonify({"error": "Invalid resolved_at format. Use ISO 8601 (YYYY-MM-DDTHH:MM:SS)."}), 400
                    else:
                        resolved_at = datetime.now()
                        
                    alert.resolved_at = resolved_at
                
                alert.status = new_status
            except ValueError:
                return jsonify({"error": f"Invalid status value: {data['status']}. Allowed values: active, resolved"}), 400
        
        if "level" in data:
            try:
                alert.level = AlertLevel(data["level"].lower())
            except ValueError:
                return jsonify({"error": f"Invalid level value: {data['level']}. Allowed values: low, medium, high"}), 400
        
        if "explanation" in data:
            alert.explanation = data["explanation"]
        
        # Commit changes to the database
        db.commit()
        
        return jsonify({
            "message": "Alert updated successfully",
            "alert": alert.to_dict()
        }), 200
        
    except SQLAlchemyError as e:
        db.rollback()
        app.logger.error(f"Database error updating alert {alert_id}: {str(e)}")
        return jsonify({"error": "Database error occurred"}), 500
    except Exception as e:
        db.rollback()
        app.logger.error(f"Unexpected error updating alert {alert_id}: {str(e)}")
        return jsonify({"error": "An unexpected error occurred"}), 500


@bp.route("/screenshot/<int:alert_id>", methods=["GET"])
@permission_required("GET_ALERTS")
def get_alert_screenshot(current_user, alert_id):
    """
    Retrieves and serves the screenshot for a specific alert
    
    Args:
        alert_id (int): The ID of the alert whose screenshot should be retrieved
        
    Returns:
        The screenshot file or an error response
    """
    db = get_tenant_db()
    try:
        # Get the alert
        alert = db.query(Alert).filter(Alert.id == alert_id).first()
        
        if not alert:
            return jsonify({"error": f"Alert with ID {alert_id} not found"}), 404
            
        if not alert.screenshot:
            return jsonify({"error": "This alert has no screenshot"}), 404
        path = resolve_stored_path(alert.screenshot, "ALERTS_SCREENSHOTS_PATH")
        if path is None:
            return jsonify({"error": "Screenshot file not found"}), 404
        return send_file(path, mimetype='image/jpeg')
        
    except SQLAlchemyError as e:
        app.logger.error(f"Database error retrieving screenshot for alert {alert_id}: {str(e)}")
        return jsonify({"error": "Database error occurred"}), 500
    except Exception as e:
        app.logger.error(f"Unexpected error retrieving screenshot for alert {alert_id}: {str(e)}")
        return jsonify({"error": "An unexpected error occurred"}), 500
