from tests.conftest import exercise_id
from tests.test_crud_isolation import make_plan


def do_workout(client, day_id, reps, weight):
    """Runs one workout of a plan day, logging the same reps and weight on every set."""
    w = client.post("/api/workouts/start", json={"plan_day_id": day_id}).json()
    for s in w["sets"]:
        r = client.patch(f"/api/workouts/sets/{s['id']}", json={"reps": reps, "weight": weight, "completed": True})
        assert r.status_code == 200
    assert client.post(f"/api/workouts/{w['id']}/finish", json={"rating": 4}).status_code == 200
    return w


def test_start_from_plan_log_and_finish(client):
    plan = make_plan(client)
    w = client.post("/api/workouts/start", json={"plan_day_id": plan["days"][0]["id"]}).json()
    assert w["name"] == "Push" and w["finished_at"] is None
    assert [(s["set_number"], s["target_min"], s["target_max"], s["weight"], s["completed"]) for s in w["sets"]] == [
        (1, 6, 8, 60, False),
        (2, 6, 8, 60, False),
        (3, 6, 8, 60, False),
    ]
    assert w["exercises"][0]["rest_sec"] == 90  # the account default

    # starting again resumes the same workout rather than opening a second one
    assert client.post("/api/workouts/start", json={}).json()["id"] == w["id"]
    assert client.get("/api/workouts/active").json()["id"] == w["id"]

    first, second, _ = w["sets"]
    client.patch(f"/api/workouts/sets/{first['id']}", json={"reps": 8, "weight": 60, "completed": True})
    client.patch(f"/api/workouts/sets/{second['id']}", json={"reps": 7, "weight": 60, "completed": True})
    extra = client.post(f"/api/workouts/{w['id']}/sets", json={"exercise_id": first["exercise_id"]}).json()
    assert extra[0]["set_number"] == 4 and extra[0]["weight"] == 60 and extra[0]["target_max"] == 8

    done = client.post(f"/api/workouts/{w['id']}/finish", json={"rating": 5, "notes": "Solid"}).json()
    assert done["set_count"] == 2 and done["volume"] == 8 * 60 + 7 * 60 and done["rating"] == 5
    assert client.get("/api/workouts/active").json() is None
    # sets that were never done are dropped on finish
    assert len(client.get(f"/api/workouts/{w['id']}").json()["sets"]) == 2
    assert [x["id"] for x in client.get("/api/workouts").json()] == [w["id"]]


def test_next_workout_prefills_last_weights_and_shows_previous(client):
    plan = make_plan(client)
    day = plan["days"][0]["id"]
    do_workout(client, day, reps=8, weight=62.5)
    w = client.post("/api/workouts/start", json={"plan_day_id": day}).json()
    assert {s["weight"] for s in w["sets"]} == {62.5}
    assert w["exercises"][0]["previous"] == [{"reps": 8, "weight": 62.5}] * 3


def test_cannot_finish_empty_workout_and_can_discard(client):
    w = client.post("/api/workouts/start", json={"name": "Garage session"}).json()
    assert w["name"] == "Garage session" and w["sets"] == []
    assert client.post(f"/api/workouts/{w['id']}/finish", json={}).status_code == 400
    assert client.delete(f"/api/workouts/{w['id']}").status_code == 204
    assert client.get("/api/workouts/active").json() is None


def test_add_remove_exercise_and_delete_set_renumbers(client):
    w = client.post("/api/workouts/start", json={}).json()
    curl = exercise_id(client, "Dumbbell Curl")
    dip = exercise_id(client, "Dip")
    sets = client.post(f"/api/workouts/{w['id']}/sets", json={"exercise_id": curl, "count": 3}).json()
    client.post(f"/api/workouts/{w['id']}/sets", json={"exercise_id": dip, "count": 2})
    assert [s["set_number"] for s in sets] == [1, 2, 3]

    assert client.delete(f"/api/workouts/sets/{sets[0]['id']}").status_code == 204
    detail = client.get(f"/api/workouts/{w['id']}").json()
    assert [e["name"] for e in detail["exercises"]] == ["Dumbbell Curl", "Dip"]
    assert [s["set_number"] for s in detail["sets"] if s["exercise_id"] == curl] == [1, 2]

    assert client.delete(f"/api/workouts/{w['id']}/exercises/{dip}").status_code == 204
    detail = client.get(f"/api/workouts/{w['id']}").json()
    assert [e["name"] for e in detail["exercises"]] == ["Dumbbell Curl"]


def test_edit_finished_workout(client):
    plan = make_plan(client)
    w = do_workout(client, plan["days"][0]["id"], reps=8, weight=60)
    r = client.patch(f"/api/workouts/{w['id']}", json={"name": "Heavy push", "notes": "PR day", "rating": 5})
    assert r.json()["name"] == "Heavy push" and r.json()["rating"] == 5
    s = client.get(f"/api/workouts/{w['id']}").json()["sets"][0]
    client.patch(f"/api/workouts/sets/{s['id']}", json={"reps": 6})
    assert client.get(f"/api/workouts/{w['id']}").json()["volume"] == (6 + 8 + 8) * 60
