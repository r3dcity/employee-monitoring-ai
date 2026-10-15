import json
from types import SimpleNamespace

from flaskr.entities.Alert import AlertLevel, AlertType
from flaskr.entities.alert_system.AlertRule import Priority
from flaskr.services.rule_system.RuleInference import RuleInference
from flaskr.services.streaming.tracking import Face, FrameContext, Track, ZoneExit

CAMERA = 1


def rule(conditions, rule_id=1, operator="AND", cameras=(CAMERA,), zones=(), cooldown=0, active=True,
         priority=Priority.HIGH):
    return SimpleNamespace(
        id=rule_id, is_active=active, priority=priority, description=f"rule {rule_id}",
        cooldown_seconds=cooldown,
        conditions_json=json.dumps({"conditions": conditions, "logical_operator": operator}),
        camera_links=[SimpleNamespace(camera_id=c) for c in cameras],
        zone_links=[SimpleNamespace(zone_id=z) for z in zones],
    )


def obj(class_name="Person", first_seen=0.0, zones=(), zone_since=None, track_id="1"):
    zones = set(zones)
    return Track(track_id, class_name, (0, 0, 1, 1), first_seen=first_seen, last_seen=0,
                 zones=zones, zone_entered_at={z: (zone_since if zone_since is not None else first_seen) for z in zones})


def ctx(now=100.0, objects=(), exits=(), faces=(), face_active=False, blacklist=None):
    return FrameContext(timestamp=now, camera_id=CAMERA, objects=list(objects), exits=list(exits),
                        faces=list(faces), face_recognition_active=face_active, blacklist=blacklist or {})


def engine(*rules, zone_ids=(5, 6)):
    return RuleInference(list(rules), camera_id=CAMERA, camera_zone_ids=zone_ids)


def test_object_detected_with_count_and_dwell():
    e = engine(rule([{"type": "object_detected", "object_name": "person", "operator": ">=", "count": 2,
                      "dwell_time": 10}]))
    assert e.infer(ctx(objects=[obj(first_seen=95, track_id="a"), obj(first_seen=80, track_id="b")])) == []
    alerts = e.infer(ctx(objects=[obj(first_seen=50, track_id="a"), obj(first_seen=80, track_id="b")]))
    assert len(alerts) == 1
    assert alerts[0].level == AlertLevel.HIGH and alerts[0].camera_id == CAMERA


def test_rule_linked_only_to_zone_ignores_objects_outside_it():
    e = engine(rule([{"type": "object_detected", "object_name": "Person"}], cameras=(), zones=(5,)))
    assert e.infer(ctx(objects=[obj(zones=())])) == []
    assert len(e.infer(ctx(objects=[obj(zones=(5,))]))) == 1


def test_zone_conditions_use_rule_zones():
    e = engine(rule([{"type": "zone_entered"}], rule_id=1, zones=(5,)),
               rule([{"type": "time_in_zone", "operator": ">", "seconds": 30}], rule_id=2, zones=(5,)),
               rule([{"type": "zone_exited"}], rule_id=3, zones=(5,)))
    alerts = e.infer(ctx(now=100, objects=[obj(zones=(5,), zone_since=60)], exits=[ZoneExit("9", "Person", 5)]))
    assert sorted(a.rule_id for a in alerts) == [1, 2, 3]
    assert all(a.zone_id == 5 for a in alerts)


def test_zone_of_another_camera_is_ignored():
    e = engine(rule([{"type": "zone_entered"}], zones=(99,)))
    assert e.infer(ctx(objects=[obj(zones=(99,))])) == []


def test_ppe_missing_sets_alert_type_and_required_classes():
    e = engine(rule([{"type": "ppe_missing", "ppe_type": "helmet"}]))
    assert e.required_classes() == {"NO-Hardhat", "Person"}
    alerts = e.infer(ctx(objects=[obj("NO-Hardhat")]))
    assert alerts[0].type == AlertType.NO_HELMET_DETECTED


def test_and_or_logic():
    conditions = [{"type": "object_detected", "object_name": "Person"},
                  {"type": "object_detected", "object_name": "truck"}]
    frame = ctx(objects=[obj("Person")])
    assert engine(rule(conditions, operator="AND")).infer(frame) == []
    assert len(engine(rule(conditions, operator="OR")).infer(frame)) == 1


def test_cooldown_defaults_to_a_minute():
    e = engine(rule([{"type": "object_detected"}], cooldown=0))
    frame = lambda now: ctx(now=now, objects=[obj()])  # noqa: E731
    assert len(e.infer(frame(100))) == 1
    assert e.infer(frame(130)) == []
    assert len(e.infer(frame(161))) == 1


def test_inactive_rules_are_skipped():
    assert engine(rule([{"type": "object_detected"}], active=False)).infer(ctx(objects=[obj()])) == []


def test_face_recognition_for_selected_employees():
    e = engine(rule([{"type": "face_recognition", "employee_ids": [7], "dwell_time": 5}]))
    assert e.infer(ctx(faces=[Face(8, (0, 0, 1, 1), dwell=60)])) == []
    alerts = e.infer(ctx(faces=[Face(7, (0, 0, 1, 1), dwell=60)]))
    assert alerts[0].employee_id == 7 and alerts[0].type == AlertType.FACE_DETECTED


def test_unauthorized_person_needs_face_recognition():
    e = engine(rule([{"type": "unauthorized_person"}]))
    # Without face recognition nobody can be identified: no false alarm for every person
    assert e.infer(ctx(objects=[obj()], face_active=False)) == []
    alerts = e.infer(ctx(faces=[Face(None, (0, 0, 1, 1))], face_active=True))
    assert alerts[0].type == AlertType.UNAUTHORIZED_PERSON_DETECTED


def test_blacklisted_employee_in_zone_is_unauthorized():
    e = engine(rule([{"type": "unauthorized_person"}], zones=(5,)))
    known_in_zone = Face(7, (0, 0, 1, 1), zones={5})
    assert e.infer(ctx(faces=[known_in_zone], face_active=True, blacklist={5: {8}})) == []
    alerts = e.infer(ctx(faces=[known_in_zone], face_active=True, blacklist={5: {7}}))
    assert (alerts[0].employee_id, alerts[0].zone_id) == (7, 5)


def test_needs_faces():
    assert engine(rule([{"type": "unauthorized_person"}])).needs_faces()
    assert not engine(rule([{"type": "object_detected"}])).needs_faces()


def test_invalid_rule_is_skipped():
    bad = rule([])
    bad.conditions_json = "{oops"
    assert engine(bad).rules == []
