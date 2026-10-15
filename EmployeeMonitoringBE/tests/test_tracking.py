from flaskr.services.streaming.tracking import Detection, FaceDwell, TrackState, point_in_polygon

SQUARE = [{"x": 0.0, "y": 0.0}, {"x": 0.5, "y": 0.0}, {"x": 0.5, "y": 0.5}, {"x": 0.0, "y": 0.5}]


def person(track_id, x1, y1, x2, y2):
    return Detection(track_id, "Person", (x1, y1, x2, y2))


def test_point_in_polygon():
    assert point_in_polygon(0.25, 0.25, SQUARE)
    assert not point_in_polygon(0.75, 0.25, SQUARE)


def test_counts_are_per_frame_and_dwell_accumulates():
    state = TrackState(ttl=2)
    visible, _ = state.update([person("1", 0.1, 0.1, 0.2, 0.3), person("2", 0.6, 0.1, 0.7, 0.3)], now=0)
    assert len(visible) == 2

    visible, _ = state.update([person("1", 0.1, 0.1, 0.2, 0.3)], now=5)
    assert [t.track_id for t in visible] == ["1"]          # only what is visible now
    assert visible[0].dwell(5) == 5                         # first_seen kept


def test_short_gap_keeps_track_long_gap_drops_it():
    state = TrackState(ttl=2)
    state.update([person("1", 0.1, 0.1, 0.2, 0.3)], now=0)
    state.update([], now=1)                                  # missed one detection
    visible, _ = state.update([person("1", 0.1, 0.1, 0.2, 0.3)], now=1.5)
    assert visible[0].dwell(1.5) == 1.5

    state.update([], now=10)                                 # gone for a while
    visible, _ = state.update([person("1", 0.1, 0.1, 0.2, 0.3)], now=11)
    assert visible[0].dwell(11) == 0


def test_zone_entry_dwell_and_exit():
    state = TrackState(ttl=2)
    state.set_zones({7: SQUARE})
    visible, exits = state.update([person("1", 0.6, 0.1, 0.7, 0.3)], now=0)   # outside
    assert visible[0].zones == set() and exits == []

    visible, _ = state.update([person("1", 0.1, 0.1, 0.2, 0.3)], now=1)       # feet at y=0.3 -> inside
    assert visible[0].zones == {7}
    visible, _ = state.update([person("1", 0.1, 0.1, 0.2, 0.3)], now=4)
    assert visible[0].zone_dwell(7, 4) == 3

    _, exits = state.update([person("1", 0.6, 0.1, 0.7, 0.3)], now=5)          # walks out
    assert [(e.track_id, e.zone_id) for e in exits] == [("1", 7)]


def test_disappearing_inside_a_zone_counts_as_exit():
    state = TrackState(ttl=1)
    state.set_zones({7: SQUARE})
    state.update([person("1", 0.1, 0.1, 0.2, 0.3)], now=0)
    _, exits = state.update([], now=5)
    assert [e.zone_id for e in exits] == [7]


def test_zone_uses_feet_position():
    state = TrackState()
    state.set_zones({7: SQUARE})
    # head inside the zone, feet (bottom of the box) below it
    visible, _ = state.update([person("1", 0.1, 0.4, 0.2, 0.9)], now=0)
    assert visible[0].zones == set()


def test_face_dwell():
    faces = FaceDwell(ttl=2)
    faces.update([1], now=0)
    faces.update([1], now=3)
    assert faces.dwell(1, 3) == 3
    faces.update([], now=10)
    assert faces.dwell(1, 10) == 0
