from flask import Blueprint, current_app as app, request
from flaskr.services.streaming import streams
from flask import g
from flaskr.middlewares.PermissionMiddleware import permission_required
from flaskr.db import get_tenant_db
from flaskr.entities.Employee import Employee
from flaskr.entities.Zone import Zone
from flaskr.entities.Blacklist import Blacklist

bp = Blueprint("blacklist", __name__, url_prefix="/blacklist")

def validate_data(data):
    if data is None:
        return {"message": "No data provided"}, 400

    if "employees" not in data:
        return {"message": "Employees list is required"}, 400

    if not isinstance(data["employees"], list):
        return {"message": "Employees must be a list"}, 400

    if len(data["employees"]) == 0:
        return {"message": "Employees list is empty"}, 400

    if "zone_id" not in data:
        return {"message": "Zone id is required"}, 400

    return None, 200

@bp.route("/", methods=["POST"])
@permission_required("CREATE_BLACKLIST")
def create_blacklist(current_user):
    try:
        data = request.get_json()
        message, code = validate_data(data)
        if code == 400:
            return message, code
        
        employees_ids = data["employees"]
        zone_id = data["zone_id"]

        db = get_tenant_db()

        employees = db.query(Employee.id).filter(Employee.id.in_(employees_ids)).all()
        correct_employee_ids = {employee.id for employee in employees}
        wrong_employees = set(employees_ids) - correct_employee_ids

        if wrong_employees:
            return {"message": "Some employee ids are wrong", "employees": list(wrong_employees)}, 400

        zone = db.query(Zone).filter_by(id=zone_id).first()
        if zone is None:
            return {"message": "Zone not found"}, 404
        
        existing_blacklist = db.query(Blacklist.employee_id).filter_by(zone_id=zone_id).all()
        existing_blacklist_ids = {entry.employee_id for entry in existing_blacklist}

        new_blacklist_entries = [
            Blacklist(employee_id=employee_id, zone_id=zone_id)
            for employee_id in correct_employee_ids
            if employee_id not in existing_blacklist_ids
        ]

        if new_blacklist_entries:
            db.bulk_save_objects(new_blacklist_entries)
            db.commit()
            # Camera workers reload their rules, faces and blacklists
            streams().notify_changed(g.tenant_id)

        return {"message": "Blacklist created successfully"}, 201

    except Exception as e:
        app.logger.error(e)
        return {"message": "Something went wrong"}, 500

@bp.route("/", methods=["DELETE"])
@permission_required("DELETE_BLACKLIST")
def delete_blacklist(current_user):
    try:
        data = request.get_json()
        message, code = validate_data(data)
        if code == 400:
            return message, code

        employees_ids = data["employees"]
        zone_id = data["zone_id"]

        db = get_tenant_db()

        entries = db.query(Blacklist.employee_id).filter(
            Blacklist.employee_id.in_(employees_ids),
            Blacklist.zone_id == zone_id
        ).all()
        correct_employee_ids = {entry.employee_id for entry in entries}
        wrong_employees = set(employees_ids) - correct_employee_ids

        if wrong_employees:
            return {"message": "Some employees are not blacklisted in this zone", "employees": list(wrong_employees)}, 400

        db.query(Blacklist).filter(Blacklist.employee_id.in_(correct_employee_ids), Blacklist.zone_id == zone_id).delete(synchronize_session=False)
        db.commit()
        # Camera workers reload their rules, faces and blacklists
        streams().notify_changed(g.tenant_id)

        return {"message": "Blacklist deleted successfully"}, 200
    except Exception as e:
        app.logger.error(e)
        return {"message": "Something went wrong"}, 500