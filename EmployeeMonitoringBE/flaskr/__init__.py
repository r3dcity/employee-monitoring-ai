from flask import Flask, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
import os


def create_app(test_config=None):
    # static_folder=None: uploads (faces, screenshots) are only served through authenticated routes
    app = Flask(__name__, instance_relative_config=True, static_folder=None)

    load_dotenv()

    # Frontend origins allowed to call the API (comma separated)
    cors_origins = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
    CORS(
        app,
        resources={r"/*": {
            "origins": [origin.strip() for origin in cors_origins if origin.strip()],
            "supports_credentials": True,
            "allow_headers": ["Content-Type", "Authorization"],
            "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
        }},
        expose_headers=["Content-Type", "Authorization"]
    )

    # Uploaded/generated files (faces, alert screenshots, zone masks)
    static_dir = os.getenv("STORAGE_PATH") or os.path.join(app.root_path, "static")
    app.config.from_mapping(
        SECRET_KEY=os.getenv("SECRET_KEY"),
        JWT_SECRET=os.getenv("JWT_SECRET"),
        JWT_EXPIRES_MINUTES=int(os.getenv("JWT_EXPIRES_MINUTES", 60 * 8)),
        GENERAL_DATABASE_URL=os.getenv("GENERAL_DATABASE_URL"),
        USERS_DATABASE_URL=os.getenv("USERS_DATABASE_URL"),
        ALERTS_SCREENSHOTS_PATH=os.path.join(static_dir, "alert_screenshots"),
        PROFILE_PICTURES_PATH=os.path.join(static_dir, "profile_pictures"),
        MASK_ZONES_PATH=os.path.join(static_dir, "mask_zones"),
        # Bundled with the code, not user data
        PPE_PICTURES_PATH=os.path.join(app.root_path, "static", "ppe_pictures"),
        PPE_MODEL_PATH=os.path.join(app.root_path, "ML", "PPE_model", "my_model.pt"),
        ALLOWED_EXTENSIONS=["png", "jpg", "jpeg"],
        MAX_CONTENT_LENGTH=10 * 1024 * 1024,
    )
    if test_config is not None:
        app.config.from_mapping(test_config)

    from flaskr.db import init_app
    init_app(app)

    from flaskr.routes import register_blueprints
    register_blueprints(app)

    from flaskr.init_auth_db import seed_command
    app.cli.add_command(seed_command)

    @app.errorhandler(413)
    def file_too_large(e):
        return jsonify({"message": "Uploaded file is too large"}), 413

    @app.before_request
    def handle_preflight():
        from flask import request
        if request.method == "OPTIONS":
            return "", 200

    return app
