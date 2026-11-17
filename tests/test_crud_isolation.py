from datetime import date

from tests.conftest import exercise_id


def make_plan(client, name="Push Pull"):
    bench = exercise_id(client, "Bench Press")
    row = exercise_id(client, "Barbell Row")
    body = {
        "name": name,
        "goal": "Build muscle",
        "days": [
            {"name": "Push", "weekday": 0, "exercises": [{"exercise_id": bench, "target_sets": 3, "rep_min": 6, "rep_max": 8, "target_weight": 60}]},
            {"name": "Pull", "weekday": 2, "exercises": [{"exercise_id": row, "target_sets": 2, "rep_min": 8, "rep_max": 10}]},
        ],
    }
    r = client.post("/api/plans", json=body)
    assert r.status_code == 201, r.text
    return r.json()


def test_exercise_crud(client):
    r = client.post("/api/exercises", json={"name": "Zercher Squat", "muscle_group": "Quads", "equipment": "Barbell"})
    ex = r.json()
    assert r.status_code == 201 and ex["kind"] == "weight"
    r = client.patch(f"/api/exercises/{ex['id']}", json={"notes": "Elbows high"})
    assert r.json()["notes"] == "Elbows high"
    assert client.delete(f"/api/exercises/{ex['id']}").json() == {"archived": False}
    assert all(e["id"] != ex["id"] for e in client.get("/api/exercises").json())


def test_exercise_in_use_is_archived_not_deleted(client):
    plan = make_plan(client)
    bench = plan["days"][0]["exercises"][0]["exercise_id"]
    assert client.delete(f"/api/exercises/{bench}").json() == {"archived": True}
    kept = next(e for e in client.get("/api/exercises").json() if e["id"] == bench)
    assert kept["archived"] is True


def test_plan_crud_keeps_day_ids(client):
    plan = make_plan(client)
    assert plan["is_active"] is True  # first plan becomes active
    push_id = plan["days"][0]["id"]

    plan["name"] = "Push Pull v2"
    plan["days"][0]["name"] = "Push day"
    plan["days"].pop(1)
    plan["days"].append({"name": "Legs", "weekday": 4, "exercises": []})
    updated = client.put(f"/api/plans/{plan['id']}", json=plan).json()
    assert updated["name"] == "Push Pull v2"
    assert [d["name"] for d in updated["days"]] == ["Push day", "Legs"]
    assert updated["days"][0]["id"] == push_id
    assert updated["days"][0]["exercises"][0]["target_weight"] == 60

    copy = client.post(f"/api/plans/{plan['id']}/duplicate").json()
    assert copy["name"].endswith("(copy)") and copy["is_active"] is False
    client.post(f"/api/plans/{copy['id']}/activate")
    active = [p["id"] for p in client.get("/api/plans").json() if p["is_active"]]
    assert active == [copy["id"]]

    assert client.delete(f"/api/plans/{plan['id']}").status_code == 204
    assert len(client.get("/api/plans").json()) == 1

    # deleting the active plan hands the role to a remaining one
    spare = make_plan(client, "Spare")
    assert spare["is_active"] is False
    client.delete(f"/api/plans/{copy['id']}")
    assert [(p["name"], p["is_active"]) for p in client.get("/api/plans").json()] == [("Spare", True)]


def test_measurement_crud(client):
    today = date.today().isoformat()
    m = client.post("/api/measurements", json={"date": today, "weight": 80.5}).json()
    r = client.put(f"/api/measurements/{m['id']}", json={"date": today, "weight": 80.1, "body_fat": 17})
    assert r.json()["weight"] == 80.1 and r.json()["body_fat"] == 17
    assert client.delete(f"/api/measurements/{m['id']}").status_code == 204
    assert client.get("/api/measurements").json() == []


def test_users_cannot_touch_each_others_data(client, other):
    plan = make_plan(client)
    bench = plan["days"][0]["exercises"][0]["exercise_id"]
    workout = client.post("/api/workouts/start", json={"plan_day_id": plan["days"][0]["id"]}).json()
    set_id = workout["sets"][0]["id"]
    m = client.post("/api/measurements", json={"date": date.today().isoformat(), "weight": 80}).json()

    assert other.get("/api/plans").json() == []
    assert other.get("/api/measurements").json() == []
    assert other.get("/api/workouts/active").json() is None
    attempts = [
        other.get(f"/api/plans/{plan['id']}"),
        other.put(f"/api/plans/{plan['id']}", json={"name": "Mine now", "days": []}),
        other.delete(f"/api/plans/{plan['id']}"),
        other.post(f"/api/plans/{plan['id']}/activate"),
        other.post(f"/api/plans/{plan['id']}/duplicate"),
        other.patch(f"/api/exercises/{bench}", json={"name": "Hacked"}),
        other.delete(f"/api/exercises/{bench}"),
        other.get(f"/api/workouts/{workout['id']}"),
        other.patch(f"/api/workouts/{workout['id']}", json={"name": "Hacked"}),
        other.delete(f"/api/workouts/{workout['id']}"),
        other.post(f"/api/workouts/{workout['id']}/finish", json={}),
        other.post(f"/api/workouts/{workout['id']}/sets", json={"exercise_id": bench}),
        other.patch(f"/api/workouts/sets/{set_id}", json={"reps": 99}),
        other.delete(f"/api/workouts/sets/{set_id}"),
        other.post("/api/workouts/start", json={"plan_day_id": plan["days"][0]["id"]}),
        other.put(f"/api/measurements/{m['id']}", json={"date": m["date"], "weight": 1}),
        other.delete(f"/api/measurements/{m['id']}"),
        other.get(f"/api/stats/exercise/{bench}"),
        other.get(f"/api/stats/plan-review/{plan['id']}"),
    ]
    assert [r.status_code for r in attempts] == [404] * len(attempts)

    # a plan cannot point at someone else's exercise either
    r = other.post("/api/plans", json={"name": "Sneaky", "days": [{"name": "A", "exercises": [{"exercise_id": bench}]}]})
    assert r.status_code == 400
    assert client.get(f"/api/plans/{plan['id']}").json()["name"] == "Push Pull"
