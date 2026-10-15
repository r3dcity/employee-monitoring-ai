from datetime import datetime
import re
import uuid

from flask import Blueprint, request, jsonify, g
from flask import current_app as app

from flaskr.entities.auth_db.User import User
from flaskr.db import get_users_db
from flaskr.entities.auth_db.EmailCodes import EmailCodes
from flaskr.entities.auth_db.Role import Role
from flaskr.entities.auth_db.RoleUser import RoleUser
from flaskr.entities.auth_db.InvitationCodes import InvitationCodes
from flaskr.entities.auth_db.Tenant import Tenant
from flaskr.services.AuthService import check_password, hash_password, create_access_token
from flaskr.services.EmailService import get_email_service
import flaskr.services.CodeGenerator as CodeGenerator
from flaskr.middlewares.AuthMiddleware import auth_required
from flaskr.middlewares.RoleMiddleware import role_required

bp = Blueprint("users", __name__, url_prefix="/users")


def validate_new_user_data(data):
    # Validate data existance
    if not isinstance(data, dict):
        return jsonify({"message": "No data provided"}), 400

    for field, label in (("email", "Email"), ("password", "Password"), ("phoneNumber", "Phone number")):
        if not isinstance(data.get(field), str) or not data.get(field):
            return jsonify({"message": f"{label} is required"}), 400

    # Validate email
    email = data["email"]
    if re.match(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$", email) is None:
        return jsonify({"message": "Invalid email format: " + email}), 400

    if len(data["password"]) < 8:
        return jsonify({"message": "Password must be at least 8 characters long"}), 400

    # Validate phone number
    if not re.search(r"^[0-9]{10}$", data["phoneNumber"]):  # Only romanian
        return jsonify({"message": "Invalid phone number"}), 400

    return None, 200


def parse_uuid(value):
    try:
        return uuid.UUID(str(value))
    except ValueError:
        return None


def purge_stale_registrations(db):
    """Remove accounts whose email verification code expired before they were verified.

    Replaces the old in-memory threading.Timer cleanup, which was lost on restart and
    used the request's database session from another thread.
    """
    expired_codes = db.query(EmailCodes).filter(EmailCodes.expires_at < datetime.now()).all()
    for code in expired_codes:
        user = code.user
        if user is not None and not user.is_verified:
            tenant = user.tenant
            db.delete(user)
            db.flush()
            if tenant is not None and not tenant.users:
                db.delete(tenant)
        else:
            db.delete(code)
    db.query(InvitationCodes).filter(InvitationCodes.expires_at < datetime.now()).delete(synchronize_session=False)
    db.commit()


def get_valid_invitation(db, code):
    if not code:
        return None
    return db.query(InvitationCodes).filter(
        InvitationCodes.code == code,
        InvitationCodes.expires_at >= datetime.now()
    ).first()


def get_tenant_security_guard(db, user_id):
    """Return a SECURITY user that belongs to the current tenant, or None."""
    user_id = parse_uuid(user_id)
    if user_id is None:
        return None
    return db.query(User).join(RoleUser).join(Role).filter(
        User.id == user_id,
        User.tenant_id == g.tenant_id,
        Role.name == "SECURITY"
    ).first()


def user_to_dict(user):
    return {
        "id": user.id,
        "email": user.email,
        "phoneNumber": user.phoneNumber,
        "roles": [role.name for role in user.roles],
        "tenant_id": user.tenant_id,
    }


@bp.route("/whoinvitedme", methods=["GET"])
def who_invited_me():
    try:
        code = request.args.get("code")
        if code is None:
            return jsonify({"message": "No code provided"}), 400

        db = get_users_db()
        invitation_code = get_valid_invitation(db, code)
        if invitation_code is None:
            return jsonify({"message": "Invalid or expired code"}), 400

        user = invitation_code.user
        if user is None:
            return jsonify({"message": "User not found"}), 404
        if user.tenant is None:
            return jsonify({"message": "Tenant not found"}), 404

        return jsonify({
            "user": {
                "email": user.email
            },
            "organization": {
                "name": user.tenant.name
            }
        }), 200
    except Exception as e:
        app.logger.error(e)
        return jsonify({"message": "Something went wrong"}), 500


@bp.route("/security/invitation", methods=["POST"])
@role_required("ADMIN")
def post_invitation(current_user):
    """Create a single-use invitation code. The code is generated on the server."""
    try:
        db = get_users_db()
        code = CodeGenerator.generate_invitation_code()
        db.add(InvitationCodes(code=code, user_id=current_user.id))
        db.commit()
        return jsonify({"message": "Invitation code created", "code": code}), 201
    except Exception as e:
        app.logger.error(e)
        return jsonify({"message": "Something went wrong"}), 500


@bp.route("/security", methods=["GET"])
@role_required("ADMIN")
def get_all_security_guards(current_user):
    try:
        db = get_users_db()
        security_guards = db.query(User).join(RoleUser).join(Role).filter(Role.name == "SECURITY").filter(User.tenant_id == g.tenant_id).all()
        return jsonify([{
            "id": guard.id,
            "email": guard.email,
            "phoneNumber": guard.phoneNumber
        } for guard in security_guards]), 200
    except Exception as e:
        app.logger.error(e)
        return jsonify({"message": "Something went wrong"}), 500


@bp.route("/security/<string:user_id>", methods=["DELETE"])
@role_required("ADMIN")
def delete_security_guard(current_user, user_id):
    try:
        db = get_users_db()
        user = get_tenant_security_guard(db, user_id)
        if user is None:
            return jsonify({"message": "User not found"}), 404

        db.delete(user)
        db.commit()
        return jsonify({"message": "User deleted"}), 200
    except Exception as e:
        app.logger.error(e)
        return jsonify({"message": "Something went wrong"}), 500


@bp.route("/security/<string:user_id>", methods=["GET"])
@role_required("ADMIN")
def get_security_guard(current_user, user_id):
    try:
        db = get_users_db()
        user = get_tenant_security_guard(db, user_id)
        if user is None:
            return jsonify({"message": "User not found"}), 404
        return jsonify({
            "id": user.id,
            "email": user.email,
            "phoneNumber": user.phoneNumber
        }), 200
    except Exception as e:
        app.logger.error(e)
        return jsonify({"message": "Something went wrong"}), 500


@bp.route("/security/register", methods=["POST"])
def register_security_guard():
    try:
        data = request.get_json(silent=True)

        message, code = validate_new_user_data(data)
        if code == 400:
            return message, code

        email = data["email"]
        db = get_users_db()
        invitation_code = get_valid_invitation(db, data.get("invitationCode"))
        if invitation_code is None:
            return jsonify({"message": "Invalid code or expired code."}), 400

        if db.query(User).filter_by(email=email).first() is not None:
            return jsonify({"message": "Email already in use"}), 400

        # The new guard joins the tenant of the admin who invited them
        invited_by_user = invitation_code.user
        if invited_by_user is None or invited_by_user.tenant_id is None:
            return jsonify({"message": "Invalid code or expired code."}), 400

        user = User(email=email, password=hash_password(data["password"]),
                    phoneNumber=data["phoneNumber"], tenant_id=invited_by_user.tenant_id)
        user.is_verified = True  # The invitation link proves the address was shared by an admin
        user.roles.append(db.query(Role).filter_by(name="SECURITY").one())
        db.add(user)
        db.delete(invitation_code)
        db.commit()
        return {"message": "User created successfully", "user": {
            "id": user.id,
            "email": user.email,
            "phoneNumber": user.phoneNumber,
            "tenant_id": user.tenant_id,
            "role": "SECURITY"
            }}, 201
    except Exception as e:
        app.logger.error(e)
        return jsonify({"message": "Something went wrong"}), 500


@bp.route("/register", methods=["POST"])
def register():
    try:
        data = request.get_json(silent=True)
        message, code = validate_new_user_data(data)
        if code == 400:
            return message, code
        organization = data.get("organization")
        if not isinstance(organization, str) or not organization.strip():
            return jsonify({"message": "Organization is required"}), 400

        email = data["email"]
        db = get_users_db()
        purge_stale_registrations(db)

        if db.query(User).filter_by(email=email).first() is not None:
            return jsonify({"message": "Email already in use"}), 400

        if db.query(Tenant).filter_by(name=organization).first() is not None:
            return jsonify({"message": "Organization already exists"}), 400

        tenant = Tenant(name=organization)
        db.add(tenant)
        db.flush()  # Ensure the tenant ID is generated

        user = User(email=email, password=hash_password(data["password"]),
                    phoneNumber=data["phoneNumber"], tenant_id=tenant.id)
        user.roles.append(db.query(Role).filter_by(name="ADMIN").one())
        db.add(user)
        db.flush()  # Ensure the user ID is generated
        verification_code = CodeGenerator.generate_email_verification_code()
        db.add(EmailCodes(user_id=user.id, code=verification_code))

        # Only keep the account if the verification email actually went out
        if not get_email_service().send_code_verification(email, verification_code):
            db.rollback()
            return jsonify({"message": "Could not send the verification email. Please try again later."}), 503

        db.commit()
        return jsonify({"message": "Please verify your email in maximum 5 minutes.", "user": {"id": user.id, "email": user.email}}), 201
    except Exception as e:
        get_users_db().rollback()
        app.logger.error(e)
        return jsonify({"message": "Something went wrong"}), 500


@bp.route("/verify-email", methods=["POST"])
def verify_email():
    data = request.get_json(silent=True)

    # Validate data existance
    if not isinstance(data, dict):
        return jsonify({"message": "No data provided"}), 400

    if "email" not in data:
        return jsonify({"message": "Email is required"}), 400

    if "code" not in data:
        return jsonify({"message": "Code is required"}), 400

    db = get_users_db()
    user = db.query(User).filter_by(email=data.get("email")).first()
    if user is None:
        return jsonify({"message": "Invalid email or code. There is a possibility that the code expired."}), 400

    email_verification = db.query(EmailCodes).filter(
        EmailCodes.user_id == user.id,
        EmailCodes.code == data.get("code"),
        EmailCodes.expires_at >= datetime.now()
    ).first()

    if email_verification is None:
        return jsonify({"message": "Invalid email or code. There is a possibility that the code expired."}), 400

    user.is_verified = True

    db.delete(email_verification)
    db.commit()
    return jsonify({"message": "Email verified"}), 200


@bp.route("/check-email", methods=["POST"])
def check_email():
    try:
        data = request.get_json(silent=True) or {}
        db = get_users_db()
        purge_stale_registrations(db)

        user = db.query(User).filter_by(email=data.get("email")).first()
        return jsonify({"exists": user is not None}), 200
    except Exception as e:
        app.logger.error(e)
        return jsonify({"message": "Something went wrong"}), 500


@bp.route("/login", methods=["POST"])
def login():
    try:
        data = request.get_json(silent=True)

        # Validate data existance
        if not isinstance(data, dict):
            return jsonify({"message": "No data provided"}), 400

        if "email" not in data:
            return jsonify({"message": "Email is required"}), 400

        if "password" not in data:
            return jsonify({"message": "Password is required"}), 400

        db = get_users_db()
        user = db.query(User).filter_by(email=data.get("email")).first()
        if user is None or not check_password(str(data.get("password")), user.password):
            return jsonify({"message": "Invalid email or password."}), 400

        if not user.is_verified:
            return jsonify({"message": "Please verify your email before logging in."}), 403

        return jsonify({"token": create_access_token(user), "user": user_to_dict(user)}), 200
    except Exception as e:
        app.logger.error(e)
        return jsonify({"message": "Something went wrong"}), 500


@bp.route("/refresh", methods=["POST"])
@auth_required
def refresh_token(current_user):
    """Issue a fresh token for a user whose current token is still valid (sliding session)."""
    return jsonify({"token": create_access_token(current_user), "user": user_to_dict(current_user)}), 200
