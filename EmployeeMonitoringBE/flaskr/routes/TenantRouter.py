from flask import Blueprint, request, jsonify, current_app as app
from flaskr.db import get_users_db
from flaskr.entities.auth_db.Tenant import Tenant
from flaskr.entities.auth_db.User import User
from flaskr.middlewares.PermissionMiddleware import permission_required
from flaskr.db import setup_tenant_db

bp = Blueprint("tenant", __name__, url_prefix="/tenant")

@bp.route("/", methods=["POST"])
@permission_required("CREATE_TENANT")
def create_tenant(current_user):
    db = get_users_db()
    try:
        data = request.get_json(silent=True)

        if data == None:
            return jsonify({"message": "No data provided"}), 400
        if "name" not in data:
            return jsonify({"message": "Name is required"}), 400
        
        user = db.get(User, current_user.id)
        if user.tenant_id is not None:
            return {"message": "User already has a tenant"}, 400

        name = data.get("name")
        tenant = db.query(Tenant).filter_by(name=name).first()
        if tenant:
            return jsonify({"message": "Tenant already exists"}), 400
        
        tenant = Tenant(name=name)
        db.add(tenant)

        db.flush()

        setup_tenant_db(tenant.id)

        # Link the user only after the tenant database exists
        user.tenant_id = tenant.id
        current_user.tenant_id = tenant.id
        db.commit()
        return jsonify({"message": "Tenant created", "tenant_id": tenant.id}), 201
    except Exception as e:
        db.rollback()
        app.logger.error(e)
        return jsonify({"message": "Something went wrong"}), 500