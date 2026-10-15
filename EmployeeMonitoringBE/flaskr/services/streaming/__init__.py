from flask import current_app


def streams():
    """The StreamSupervisor of the running app (see services/streaming/supervisor.py)."""
    return current_app.extensions["streams"]
