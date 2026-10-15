"""Optional MediaMTX relay.

Without a relay every consumer (the detection worker, each MJPEG viewer through the worker)
depends on one OpenCV connection to the camera and the browser only gets MJPEG.

With MediaMTX (https://github.com/bluenviron/mediamtx) configured:
  camera --RTSP--> MediaMTX --RTSP--> detection worker
                           --WebRTC (WHEP)--> browsers (sub-second latency, H.264, no re-encode)
The camera is pulled exactly once no matter how many people watch, and video never passes
through Python. Detections are sent to the browser separately (SSE) and drawn on a canvas.

Each camera is registered as a MediaMTX path through its control API. Reads are authorized by
MediaMTX calling back into the API (/internal/media-auth): browsers present a short-lived ticket,
the worker uses the internal credentials.
"""
import base64
import json
import logging
import urllib.error
import urllib.request
from urllib.parse import quote

log = logging.getLogger(__name__)


def path_name(tenant_id, camera_id):
    return f"t-{tenant_id}-cam-{camera_id}"


def parse_path_name(name):
    """Inverse of path_name: returns (tenant_id, camera_id) or None."""
    if not name.startswith("t-") or "-cam-" not in name:
        return None
    tenant_id, _, camera_id = name[2:].rpartition("-cam-")
    try:
        return tenant_id, int(camera_id)
    except ValueError:
        return None


class MediaRelay:
    def __init__(self, api_url, rtsp_url, internal_user, internal_password, timeout=5):
        self.api_url = api_url.rstrip("/")
        self.rtsp_url = rtsp_url.rstrip("/")
        self.user = internal_user
        self.password = internal_password
        self.timeout = timeout

    @classmethod
    def from_config(cls, config):
        if not config.get("MEDIAMTX_API_URL"):
            return None
        return cls(config["MEDIAMTX_API_URL"], config["MEDIAMTX_RTSP_URL"],
                   config["MEDIA_INTERNAL_USER"], config["MEDIA_INTERNAL_PASSWORD"])

    def _request(self, method, path, body=None):
        request = urllib.request.Request(
            f"{self.api_url}{path}", method=method,
            data=json.dumps(body).encode() if body is not None else None,
            headers={"Content-Type": "application/json"})
        token = base64.b64encode(f"{self.user}:{self.password}".encode()).decode()
        request.add_header("Authorization", f"Basic {token}")
        with urllib.request.urlopen(request, timeout=self.timeout) as response:
            return response.status

    def register_camera(self, tenant_id, camera_id, source_url):
        """Create or update the MediaMTX path that pulls this camera."""
        name = quote(path_name(tenant_id, camera_id))
        config = {"source": source_url, "sourceOnDemand": False, "rtspTransport": "tcp"}
        try:
            self._request("POST", f"/v3/config/paths/add/{name}", config)
        except urllib.error.HTTPError as e:
            if e.code != 400:  # 400: the path already exists -> update it
                raise
            self._request("PATCH", f"/v3/config/paths/patch/{name}", config)
        return self.read_url(tenant_id, camera_id)

    def unregister_camera(self, tenant_id, camera_id):
        try:
            self._request("DELETE", f"/v3/config/paths/delete/{quote(path_name(tenant_id, camera_id))}")
        except urllib.error.HTTPError as e:
            if e.code != 404:
                raise

    def read_url(self, tenant_id, camera_id):
        scheme, _, rest = self.rtsp_url.partition("://")
        credentials = f"{quote(self.user, safe='')}:{quote(self.password, safe='')}@"
        return f"{scheme}://{credentials}{rest}/{path_name(tenant_id, camera_id)}"
