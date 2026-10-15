"""Summaries of the alerts for non-technical users.

The statistics are always computed here; when an LLM is configured (Ollama, OLLAMA_URL /
OLLAMA_MODEL) it only receives these aggregated numbers, never the raw alert rows, so the
prompt stays small no matter how many alerts exist, and no screenshots or personal data
leave the server. Without an LLM (or if it fails) a plain text summary is built from the same
statistics.
"""
import json
import logging
import re
import urllib.request
from collections import Counter
from datetime import datetime, timedelta, timezone

from flaskr.entities.Alert import Alert, AlertLevel, AlertStatus
from flaskr.entities.VideoCamera import VideoCamera
from flaskr.entities.Zone import Zone

log = logging.getLogger(__name__)

PROMPT = """You are writing a short security briefing for a site manager who is not technical.
Using only the statistics below (JSON), write 4-6 short bullet points in plain text (no
markdown headings): overall status, the most common alert types and places, anything urgent
(active high priority alerts) and a short recommendation.

Statistics:
{stats}
"""


def label(enum_value):
    return enum_value.value.replace("_", " ") if enum_value else "unknown"


def alert_statistics(db, days=7, status=None):
    since = datetime.now(timezone.utc) - timedelta(days=days)
    query = db.query(Alert, VideoCamera.name, Zone.name) \
        .outerjoin(VideoCamera, Alert.camera_id == VideoCamera.id) \
        .outerjoin(Zone, Alert.zone_id == Zone.id) \
        .filter(Alert.timestamp >= since)
    if status:
        query = query.filter(Alert.status == AlertStatus(status))
    rows = query.order_by(Alert.timestamp.desc()).all()

    alerts = [row[0] for row in rows]
    places = Counter(" / ".join(p for p in (camera, zone) if p) or "unknown" for _, camera, zone in rows)
    urgent = [
        {"type": label(a.type), "where": " / ".join(p for p in (camera, zone) if p) or "unknown",
         "when": a.timestamp.isoformat() if a.timestamp else None}
        for a, camera, zone in rows
        if a.status == AlertStatus.ACTIVE and a.level == AlertLevel.HIGH
    ][:5]
    return {
        "period_days": days,
        "total": len(alerts),
        "active": sum(a.status == AlertStatus.ACTIVE for a in alerts),
        "resolved": sum(a.status == AlertStatus.RESOLVED for a in alerts),
        "by_level": dict(Counter(label(a.level) for a in alerts)),
        "by_type": dict(Counter(label(a.type) for a in alerts).most_common(5)),
        "top_places": dict(places.most_common(5)),
        "urgent_active": urgent,
    }


def text_summary(stats):
    if stats["total"] == 0:
        return f"- No alerts in the last {stats['period_days']} days."
    lines = [
        f"- {stats['total']} alerts in the last {stats['period_days']} days: "
        f"{stats['active']} still active, {stats['resolved']} resolved.",
    ]
    if stats["by_type"]:
        kind, count = next(iter(stats["by_type"].items()))
        lines.append(f"- Most common: {kind} ({count}).")
    if stats["top_places"]:
        place, count = next(iter(stats["top_places"].items()))
        lines.append(f"- Most alerts at: {place} ({count}).")
    if stats["urgent_active"]:
        lines.append(f"- {len(stats['urgent_active'])} high priority alert(s) still need attention, "
                     f"e.g. {stats['urgent_active'][0]['type']} at {stats['urgent_active'][0]['where']}.")
    else:
        lines.append("- No high priority alerts are waiting.")
    return "\n".join(lines)


def llm_summary(stats, url, model, timeout=60):
    body = json.dumps({"model": model, "prompt": PROMPT.format(stats=json.dumps(stats, indent=1)),
                       "stream": False}).encode()
    request = urllib.request.Request(f"{url.rstrip('/')}/api/generate", data=body,
                                     headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        text = json.loads(response.read()).get("response", "")
    # Reasoning models wrap their chain of thought in <think> tags
    return re.sub(r"<think>.*?</think>", "", text, flags=re.S).strip()


def summarize_alerts(db, config, days=7, status=None):
    stats = alert_statistics(db, days=days, status=status)
    if config.get("OLLAMA_URL") and stats["total"]:
        try:
            summary = llm_summary(stats, config["OLLAMA_URL"], config["OLLAMA_MODEL"])
            if summary:
                return {"summary": summary, "source": "llm", "stats": stats}
        except Exception as e:
            log.warning("LLM summary failed, using the statistics summary: %s", e)
    return {"summary": text_summary(stats), "source": "stats", "stats": stats}
