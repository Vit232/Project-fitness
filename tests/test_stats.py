from datetime import date, timedelta

from sqlalchemy import select

from app.db import SessionLocal
from app.models import User, Workout
from app.seed import DEMO_EMAIL, DEMO_PASSWORD, seed_demo
from fastapi.testclient import TestClient
from app.main import app
from tests.test_crud_isolation import make_plan
from tests.test_workout_flow import do_workout


def move_back(workout_id: int, days: int):
    """Pretend a workout happened `days` ago."""
    with SessionLocal() as db:
        w = db.get(Workout, workout_id)
        w.started_at -= timedelta(days=days)
        w.finished_at -= timedelta(days=days)
        db.commit()


def test_dashboard_numbers(client):
    plan = make_plan(client)
    push = plan["days"][0]["id"]
    old = do_workout(client, push, reps=6, weight=60)
    move_back(old["id"], 7)
    do_workout(client, push, reps=8, weight=60)

    d = client.get("/api/stats/dashboard").json()
    assert d["total_workouts"] == 2
    assert d["week"] == {"week_start": d["week"]["week_start"], "workouts": 1, "volume": 3 * 8 * 60, "sets": 3}
    assert d["last_week"]["volume"] == 3 * 6 * 60
    assert d["streak_weeks"] == 2
    assert d["planned_per_week"] == 2
    assert len(d["weeks"]) == 8
    # the second session beat the first, so it is a personal record
    assert [(p["exercise"], p["weight"], p["reps"]) for p in d["recent_prs"]] == [("Bench Press", 60, 8)]
    assert d["today"]["plan"]["name"] == "Push Pull"


def test_exercise_stats(client):
    plan = make_plan(client)
    bench = plan["days"][0]["exercises"][0]["exercise_id"]
    old = do_workout(client, plan["days"][0]["id"], reps=6, weight=60)
    move_back(old["id"], 3)
    do_workout(client, plan["days"][0]["id"], reps=5, weight=70)

    s = client.get(f"/api/stats/exercise/{bench}").json()
    assert [x["top_weight"] for x in s["sessions"]] == [60, 70]
    assert s["sessions"][0]["e1rm"] == 72.0  # 60 * (1 + 6/30)
    assert s["records"] == {"top_weight": 70, "top_reps": 6, "e1rm": 81.7, "volume": 1080, "sessions": 2}


def test_plan_review_suggests_more_weight_after_two_top_sessions(client):
    plan = make_plan(client)
    push = plan["days"][0]["id"]
    for days_ago in (14, 7):
        w = do_workout(client, push, reps=8, weight=60)  # 8 is the top of the 6-8 range
        move_back(w["id"], days_ago)

    r = client.get(f"/api/stats/plan-review/{plan['id']}").json()
    assert r["total_workouts"] == 2
    assert r["adherence_pct"] == 50  # one of two planned days, two weeks running
    bench, row = r["exercises"]
    assert bench["suggestion"]["kind"] == "increase" and "2.5" in bench["suggestion"]["text"]
    assert bench["sessions"] == 2
    assert row["suggestion"]["kind"] == "new"
    assert {m["muscle"]: m["sets_per_week"] for m in r["muscles"]} == {"Chest": 1.5}
    assert [d["done"] for d in r["days"]] == [2, 0]


def test_demo_seed_is_alive():
    with SessionLocal() as db:
        today = date.today()
        assert seed_demo(db, today) is not None
        assert seed_demo(db, today) is None  # safe to run twice
        user = db.scalar(select(User).where(User.email == DEMO_EMAIL))
        workouts = db.scalars(select(Workout).where(Workout.user_id == user.id)).all()
        assert 28 <= len(workouts) <= 32
        assert max(w.started_at.date() for w in workouts) < today

    c = TestClient(app)
    assert c.post("/api/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD}).status_code == 200
    d = c.get("/api/stats/dashboard").json()
    assert d["streak_weeks"] >= 7 and d["recent_prs"] and len(d["bodyweight"]) == 16
    plan = next(p for p in c.get("/api/plans").json() if p["is_active"])
    review = c.get(f"/api/stats/plan-review/{plan['id']}").json()
    assert 80 <= review["adherence_pct"] <= 100
    kinds = {e["name"]: e["suggestion"]["kind"] for e in review["exercises"]}
    assert kinds["Bench Press"] == "hold"
    assert kinds["Triceps Pushdown"] == "increase"
    assert kinds["Overhead Press"] == "decrease"
    assert kinds["Hanging Leg Raise"] == "stale"
    bench = next(e for e in review["exercises"] if e["name"] == "Bench Press")
    assert bench["change_pct"] > 0
