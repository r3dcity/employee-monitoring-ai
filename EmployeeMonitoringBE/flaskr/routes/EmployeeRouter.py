import io
import mimetypes
import os

import numpy as np
from flask import Blueprint, request, jsonify, current_app as app, send_file

from flaskr.middlewares.PermissionMiddleware import permission_required
from flaskr.db import get_tenant_db
from flaskr.entities.Employee import Employee
from flaskr.entities.Blacklist import Blacklist
from flaskr.ML.face_recognition import face_recognition_impl
from flaskr.services.storage import tenant_dir, relative_to_base, resolve_stored_path, allowed_image

bp = Blueprint("employees", __name__, url_prefix="/employees")

# Seeded permissions only distinguish creating/managing employees from deleting them,
# so CREATE_EMPLOYEE also covers reading and updating.
MANAGE_EMPLOYEES = "CREATE_EMPLOYEE"


def employee_to_dict(employee, include_picture=False):
    data = {
        "id": employee.id,
        "firstName": employee.firstName,
        "lastName": employee.lastName,
        "phoneNumber": employee.phoneNumber,
        "role": employee.role,
        "department": employee.department
    }
    if include_picture:
        data["profilePicture"] = bool(employee.profilePicture)
    return data


class FaceEncodingError(Exception):
    pass


def save_profile_picture(employee, profile_picture):
    """Save the upload under the tenant's folder and return (relative_path, encoded_face_bytes)."""
    extension = profile_picture.filename.rsplit('.', 1)[1].lower()
    path = tenant_dir("PROFILE_PICTURES_PATH") / f"{employee.id}.{extension}"
    profile_picture.save(path)
    try:
        encoded_face = face_recognition_impl.encode_picture(str(path))
    except Exception as e:
        path.unlink(missing_ok=True)
        raise FaceEncodingError(str(e))

    byte_io = io.BytesIO()
    np.save(byte_io, encoded_face)
    return relative_to_base(path, "PROFILE_PICTURES_PATH"), byte_io.getvalue()


def remove_picture(stored_path):
    # Legacy rows hold absolute paths into a folder shared by all tenants, where the same
    # file name may belong to another tenant's employee, so only per-tenant files are removed.
    if not stored_path or os.path.isabs(stored_path) or "\\" in stored_path:
        return
    path = resolve_stored_path(stored_path, "PROFILE_PICTURES_PATH")
    if path is not None:
        try:
            os.remove(path)
        except OSError as e:
            app.logger.warning("Could not remove profile picture %s: %s", path, e)


@bp.route("/", methods=["POST"])
@permission_required("CREATE_EMPLOYEE")
def create_employee(current_user):
    db = get_tenant_db()
    try:
        profile_picture = request.files.get("profile-picture")
        fields = {name: request.form.get(name) for name in ("firstName", "lastName", "phoneNumber", "role", "department")}

        labels = {"firstName": "First name", "lastName": "Last name", "phoneNumber": "Phone number",
                  "role": "Role", "department": "Department"}
        for name, value in fields.items():
            if not value:
                return jsonify({"message": f"{labels[name]} is required"}), 400
        if not profile_picture:
            return jsonify({"message": "Profile picture is required"}), 400
        if not allowed_image(profile_picture.filename):
            return jsonify({"message": "Profile picture must be a PNG or JPEG image"}), 400

        # Create employee first to get ID
        employee = Employee(**fields)
        db.add(employee)
        db.flush()  # Assigns ID to employee object

        try:
            employee.profilePicture, employee.encodedFace = save_profile_picture(employee, profile_picture)
        except FaceEncodingError as e:
            db.rollback()
            return jsonify({"message": f"Could not use this picture: {e}"}), 400

        db.commit()

        return {"message": "Employee created successfully. Face encoded successfully.",
                "employee": employee_to_dict(employee)}, 201

    except Exception as e:
        db.rollback()
        app.logger.error(e)
        return jsonify({"message": "Something went wrong"}), 500


# Get all employees
@bp.route("/", methods=["GET"])
@permission_required(MANAGE_EMPLOYEES)
def get_all_employees(current_user):
    try:
        db = get_tenant_db()
        employees = db.query(Employee).all()
        return jsonify([employee_to_dict(employee) for employee in employees]), 200
    except Exception as e:
        app.logger.error(e)
        return jsonify({"message": "Something went wrong"}), 500


# Get employee by ID
@bp.route("/<int:employee_id>", methods=["GET"])
@permission_required(MANAGE_EMPLOYEES)
def get_employee_by_id(current_user, employee_id):
    try:
        db = get_tenant_db()
        employee = db.get(Employee, employee_id)

        if not employee:
            return jsonify({"message": "Employee not found"}), 404

        return jsonify(employee_to_dict(employee, include_picture=True)), 200
    except Exception as e:
        app.logger.error(e)
        return jsonify({"message": "Something went wrong"}), 500


# Update employee by ID
@bp.route("/<int:employee_id>", methods=["PUT"])
@permission_required(MANAGE_EMPLOYEES)
def update_employee(current_user, employee_id):
    db = get_tenant_db()
    try:
        employee = db.get(Employee, employee_id)

        if not employee:
            return jsonify({"message": "Employee not found"}), 404

        # Update fields if provided
        for name in ("firstName", "lastName", "phoneNumber", "role", "department"):
            value = request.form.get(name)
            if value:
                setattr(employee, name, value)

        # Handle profile picture update
        profile_picture = request.files.get("profile-picture")
        if profile_picture:
            if not allowed_image(profile_picture.filename):
                return jsonify({"message": "Profile picture must be a PNG or JPEG image"}), 400
            old_picture = employee.profilePicture
            try:
                employee.profilePicture, employee.encodedFace = save_profile_picture(employee, profile_picture)
            except FaceEncodingError as e:
                db.rollback()
                return jsonify({"message": f"Could not use this picture: {e}"}), 400
            if old_picture and old_picture != employee.profilePicture:
                remove_picture(old_picture)

        db.commit()

        return jsonify({
            "message": "Employee updated successfully",
            "employee": employee_to_dict(employee)
        }), 200

    except Exception as e:
        db.rollback()
        app.logger.error(e)
        return jsonify({"message": "Something went wrong during update"}), 500


@bp.route("/<int:employee_id>", methods=["DELETE"])
@permission_required("DELETE_EMPLOYEE")
def delete_employee(current_user, employee_id):
    db = get_tenant_db()
    try:
        employee = db.get(Employee, employee_id)
        if not employee:
            return jsonify({"message": "Employee not found"}), 404

        picture = employee.profilePicture
        db.query(Blacklist).filter(Blacklist.employee_id == employee_id).delete(synchronize_session=False)
        # Alerts and detections keep their history; their employee reference is cleared
        db.delete(employee)
        db.commit()
        remove_picture(picture)
        return jsonify({"message": "Employee deleted"}), 200
    except Exception as e:
        db.rollback()
        app.logger.error(e)
        return jsonify({"message": "Something went wrong"}), 500


# Get employee profile picture
@bp.route("/<int:employee_id>/profile-picture", methods=["GET"])
@permission_required(MANAGE_EMPLOYEES)
def get_employee_profile_picture(current_user, employee_id):
    try:
        db = get_tenant_db()
        employee = db.get(Employee, employee_id)

        if not employee:
            return jsonify({"message": "Employee not found"}), 404

        path = resolve_stored_path(employee.profilePicture, "PROFILE_PICTURES_PATH")
        if path is None:
            return jsonify({"message": "Profile picture not found"}), 404

        return send_file(path, mimetype=mimetypes.guess_type(path.name)[0] or "image/jpeg")
    except Exception as e:
        app.logger.error(e)
        return jsonify({"message": "Something went wrong"}), 500
