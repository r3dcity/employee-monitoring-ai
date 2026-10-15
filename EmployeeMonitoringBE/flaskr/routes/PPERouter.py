from flask import Blueprint, request, current_app as app, send_file
from flaskr.db import get_tenant_db
from flaskr.entities import PPE
from flaskr.middlewares.AuthMiddleware import auth_required
from flaskr.services.storage import resolve_stored_path

pperouter = Blueprint("pperouter", __name__, url_prefix="/ppe")

@pperouter.route('/image', methods=["GET"])
@auth_required
def get_ppe_image(current_user):
    try:
        db = get_tenant_db()
        ppe_name = request.args.get("text")
        if not ppe_name:
            return {"message": "PPE name is required"}, 400

        ppe = db.query(PPE).filter_by(name=ppe_name).first()
        if ppe is None:
            return {"message": f"PPE not found with name: {ppe_name}"}, 404

        # Older tenant databases store absolute Windows paths, newer ones only the file name
        path = resolve_stored_path(ppe.image, "PPE_PICTURES_PATH")
        if path is None:
            app.logger.warning("PPE image file not found for '%s': %s", ppe_name, ppe.image)
            return {"message": "PPE image not found"}, 404

        return send_file(path, mimetype='image/jpeg')
    except Exception as e:
        app.logger.error(f"Error getting PPE image: {str(e)}", exc_info=True)
        return {"message": "Something went wrong"}, 500

@pperouter.route('/', methods=['GET'])
@auth_required
def get_ppe(current_user):
    try:
        db = get_tenant_db()
        ppes = db.query(PPE).all()
        return {"ppe": [ppe.to_dict() for ppe in ppes]}
    except Exception as e:
        app.logger.error(e)
        return {"message": "Something went wrong"}, 500

@pperouter.route("/<ppe_id>", methods=["GET"])
@auth_required
def get_ppe_by_id(current_user, ppe_id):
    try:
        db = get_tenant_db()
        ppe = db.query(PPE).filter_by(id=ppe_id).first()
        if ppe == None:
            return {"message": "PPE not found"}, 404
        return ppe.to_dict()
    except Exception as e:
        app.logger.error(e)
        return {"message": "Something went wrong"}, 500