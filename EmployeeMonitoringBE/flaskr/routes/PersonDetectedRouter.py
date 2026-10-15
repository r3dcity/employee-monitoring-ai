from flask import Blueprint, current_app as app
from flaskr.db import get_tenant_db
from flaskr.middlewares.PermissionMiddleware import permission_required
from flaskr.entities.PersonDetected import PersonDetected

bp = Blueprint("persons-detected", __name__, url_prefix="/persons-detected")

# Person detected post is creating internally in the backend so no need for a route

# TODO: Add filtering/pagination
@bp.route("/", methods=["GET"])
@permission_required("GET_PERSONS_DETECTED")
def get_persons_detected(current_user):
    try:
        db = get_tenant_db()
        persons_detected = db.query(PersonDetected).all()
        return {"persons_detected": [person_detected.to_dict() for person_detected in persons_detected]}

    except Exception as e:
        app.logger.error(e)
        return {"message": "Something went wrong"}, 500
