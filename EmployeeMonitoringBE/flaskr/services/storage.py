"""Helpers for files stored on disk (profile pictures, alert screenshots, zone masks, PPE images).

New files are stored per tenant and referenced in the database by a path relative to the
configured base directory. Older rows may still hold absolute (Windows) paths, so
`resolve_stored_path` accepts both.
"""
import os
from pathlib import Path, PureWindowsPath

from flask import current_app, g


def tenant_dir(config_key):
    """Directory for the current tenant under the configured base path, created on demand."""
    path = Path(current_app.config[config_key]) / str(g.tenant_id)
    path.mkdir(parents=True, exist_ok=True)
    return path


def relative_to_base(path, config_key):
    return Path(path).relative_to(current_app.config[config_key]).as_posix()


def resolve_stored_path(stored, config_key):
    """Return an existing absolute path for a stored file reference, or None."""
    if not stored:
        return None
    base = Path(current_app.config[config_key])
    candidates = [base / stored]
    if os.path.isabs(stored) or PureWindowsPath(stored).is_absolute():
        candidates.insert(0, Path(stored))
        # Legacy absolute paths from another machine: fall back to the file name
        candidates.append(base / PureWindowsPath(stored).name)
    for candidate in candidates:
        if candidate.is_file():
            return candidate
    return None


def allowed_image(filename):
    return '.' in filename and \
        filename.rsplit('.', 1)[1].lower() in current_app.config["ALLOWED_EXTENSIONS"]
