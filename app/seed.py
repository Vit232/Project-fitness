"""Starter exercise library for every new account, plus the demo account's history."""
import random
from datetime import date, datetime, time, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session as Db

from .auth import hash_password
from .models import (
    Exercise,
    Measurement,
    Plan,
    PlanDay,
    PlanExercise,
    User,
    Workout,
    WorkoutSet,
)

DEMO_EMAIL = "demo@replog.app"
DEMO_PASSWORD = "demo1234"

# name, muscle group, equipment, kind
LIBRARY = [
    ("Bench Press", "Chest", "Barbell", "weight"),
    ("Incline Bench Press", "Chest", "Barbell", "weight"),
    ("Dumbbell Bench Press", "Chest", "Dumbbell", "weight"),
    ("Incline Dumbbell Press", "Chest", "Dumbbell", "weight"),
    ("Chest Fly", "Chest", "Machine", "weight"),
    ("Cable Crossover", "Chest", "Cable", "weight"),
    ("Push-Up", "Chest", "Bodyweight", "bodyweight"),
    ("Dip", "Chest", "Bodyweight", "bodyweight"),
    ("Deadlift", "Back", "Barbell", "weight"),
    ("Barbell Row", "Back", "Barbell", "weight"),
    ("Dumbbell Row", "Back", "Dumbbell", "weight"),
    ("Pull-Up", "Back", "Bodyweight", "bodyweight"),
    ("Chin-Up", "Back", "Bodyweight", "bodyweight"),
    ("Lat Pulldown", "Back", "Cable", "weight"),
    ("Seated Cable Row", "Back", "Cable", "weight"),
    ("T-Bar Row", "Back", "Barbell", "weight"),
    ("Back Extension", "Back", "Bodyweight", "bodyweight"),
    ("Overhead Press", "Shoulders", "Barbell", "weight"),
    ("Dumbbell Shoulder Press", "Shoulders", "Dumbbell", "weight"),
    ("Arnold Press", "Shoulders", "Dumbbell", "weight"),
    ("Lateral Raise", "Shoulders", "Dumbbell", "weight"),
    ("Cable Lateral Raise", "Shoulders", "Cable", "weight"),
    ("Rear Delt Fly", "Shoulders", "Dumbbell", "weight"),
    ("Face Pull", "Shoulders", "Cable", "weight"),
    ("Shrug", "Shoulders", "Dumbbell", "weight"),
    ("Barbell Curl", "Biceps", "Barbell", "weight"),
    ("Dumbbell Curl", "Biceps", "Dumbbell", "weight"),
    ("Hammer Curl", "Biceps", "Dumbbell", "weight"),
    ("Preacher Curl", "Biceps", "Machine", "weight"),
    ("Cable Curl", "Biceps", "Cable", "weight"),
    ("Triceps Pushdown", "Triceps", "Cable", "weight"),
    ("Skull Crusher", "Triceps", "Barbell", "weight"),
    ("Overhead Triceps Extension", "Triceps", "Dumbbell", "weight"),
    ("Close-Grip Bench Press", "Triceps", "Barbell", "weight"),
    ("Back Squat", "Quads", "Barbell", "weight"),
    ("Front Squat", "Quads", "Barbell", "weight"),
    ("Leg Press", "Quads", "Machine", "weight"),
    ("Leg Extension", "Quads", "Machine", "weight"),
    ("Bulgarian Split Squat", "Quads", "Dumbbell", "weight"),
    ("Walking Lunge", "Quads", "Dumbbell", "weight"),
    ("Goblet Squat", "Quads", "Dumbbell", "weight"),
    ("Hack Squat", "Quads", "Machine", "weight"),
    ("Romanian Deadlift", "Hamstrings", "Barbell", "weight"),
    ("Leg Curl", "Hamstrings", "Machine", "weight"),
    ("Seated Leg Curl", "Hamstrings", "Machine", "weight"),
    ("Good Morning", "Hamstrings", "Barbell", "weight"),
    ("Hip Thrust", "Glutes", "Barbell", "weight"),
    ("Glute Bridge", "Glutes", "Bodyweight", "bodyweight"),
    ("Cable Kickback", "Glutes", "Cable", "weight"),
    ("Standing Calf Raise", "Calves", "Machine", "weight"),
    ("Seated Calf Raise", "Calves", "Machine", "weight"),
    ("Plank", "Core", "Bodyweight", "timed"),
    ("Side Plank", "Core", "Bodyweight", "timed"),
    ("Hanging Leg Raise", "Core", "Bodyweight", "bodyweight"),
    ("Cable Crunch", "Core", "Cable", "weight"),
    ("Ab Wheel Rollout", "Core", "Other", "bodyweight"),
    ("Russian Twist", "Core", "Other", "bodyweight"),
    ("Farmer's Carry", "Core", "Dumbbell", "timed"),
    ("Kettlebell Swing", "Glutes", "Kettlebell", "weight"),
    ("Burpee", "Full body", "Bodyweight", "bodyweight"),
]


def add_starter_exercises(db: Db, user_id: int) -> dict[str, Exercise]:
    rows = {
        name: Exercise(user_id=user_id, name=name, muscle_group=muscle, equipment=equipment, kind=kind)
        for name, muscle, equipment, kind in LIBRARY
    }
    db.add_all(rows.values())
    db.flush()
    return rows


# exercise, sets, rep range, starting weight, weight step, rest seconds
UPPER_LOWER = [
    ("Upper A", 0, [
        ("Bench Press", 4, 6, 8, 70, 2.5, 150),
        ("Barbell Row", 4, 6, 8, 62.5, 2.5, 120),
        ("Overhead Press", 3, 8, 10, 40, 2.5, 120),
        ("Lat Pulldown", 3, 10, 12, 55, 2.5, 90),
        ("Dumbbell Curl", 3, 10, 12, 12, 2, 60),
        ("Triceps Pushdown", 3, 10, 12, 25, 2.5, 60),
    ]),
    ("Lower A", 1, [
        ("Back Squat", 4, 5, 7, 90, 2.5, 180),
        ("Romanian Deadlift", 3, 8, 10, 80, 2.5, 150),
        ("Leg Press", 3, 10, 12, 140, 10, 120),
        ("Leg Curl", 3, 10, 12, 40, 2.5, 90),
        ("Standing Calf Raise", 4, 12, 15, 60, 5, 60),
        ("Plank", 3, 45, 60, 0, 0, 60),
    ]),
    ("Upper B", 3, [
        ("Incline Dumbbell Press", 4, 8, 10, 26, 2, 120),
        ("Pull-Up", 4, 6, 10, 0, 0, 120),
        ("Seated Cable Row", 3, 10, 12, 55, 2.5, 90),
        ("Lateral Raise", 4, 12, 15, 8, 1, 60),
        ("Face Pull", 3, 12, 15, 20, 2.5, 60),
        ("Hammer Curl", 3, 10, 12, 14, 2, 60),
        ("Skull Crusher", 3, 10, 12, 25, 2.5, 60),
    ]),
    ("Lower B", 4, [
        ("Deadlift", 3, 4, 6, 120, 5, 180),
        ("Bulgarian Split Squat", 3, 8, 10, 16, 2, 120),
        ("Leg Extension", 3, 12, 15, 45, 2.5, 90),
        ("Hip Thrust", 3, 8, 10, 90, 5, 120),
        ("Seated Calf Raise", 3, 12, 15, 35, 2.5, 60),
        ("Hanging Leg Raise", 3, 10, 15, 0, 0, 60),
    ]),
]

FULL_BODY = [
    ("Full Body A", [("Back Squat", 3, 5, 5), ("Bench Press", 3, 5, 5), ("Barbell Row", 3, 8, 10), ("Plank", 3, 30, 45)]),
    ("Full Body B", [("Deadlift", 2, 5, 5), ("Overhead Press", 3, 5, 5), ("Chin-Up", 3, 6, 10), ("Walking Lunge", 3, 10, 12)]),
    ("Full Body C", [("Front Squat", 3, 6, 8), ("Dumbbell Bench Press", 3, 8, 10), ("Dumbbell Row", 3, 8, 10), ("Face Pull", 3, 12, 15)]),
]

NOTES = [
    "Felt strong today.",
    "Slept badly, kept it steady.",
    "Gym was packed, swapped the order around.",
    "Good pump. Last sets were a grind.",
    "Short on time, cut rest a little.",
]

WEEKS = 8
SKIPPED = {(2, 4), (5, 3)}  # (week index, weekday) sessions the demo user missed
DELOAD_WEEK = 4
# A few lifts go less smoothly in the last two weeks so the plan review has something to say.
LATE_WEEK = 6
TOPPED_OUT = {"Triceps Pushdown", "Seated Cable Row"}  # hitting every rep but not adding weight
TOO_HEAVY = {"Overhead Press"}  # jumped up in weight and now missing the rep range
DROPPED_FROM_WEEK = {"Hanging Leg Raise": 4}  # quietly skipped since then


def seed_demo(db: Db, today: date | None = None) -> User | None:
    """Creates the demo account with eight weeks of history ending yesterday."""
    if db.scalar(select(User).where(User.email == DEMO_EMAIL)):
        return None
    today = today or date.today()
    rng = random.Random(7)

    user = User(email=DEMO_EMAIL, name="Alex Carter", password_hash=hash_password(DEMO_PASSWORD))
    db.add(user)
    db.flush()
    ex = add_starter_exercises(db, user.id)

    plan = Plan(
        user_id=user.id,
        name="Upper / Lower Split",
        goal="Build muscle",
        description="Four days a week. Add reps until every set hits the top of the range, then add weight.",
        is_active=True,
        created_at=datetime.combine(today - timedelta(days=WEEKS * 7 + 2), time(20, 15)),
    )
    # per exercise: current weight and the reps the lifter can get on a fresh first set
    state = {}
    for pos, (day_name, weekday, items) in enumerate(UPPER_LOWER):
        day = PlanDay(name=day_name, weekday=weekday, position=pos)
        for i, (name, sets, lo, hi, start, step, rest) in enumerate(items):
            day.exercises.append(
                PlanExercise(
                    exercise_id=ex[name].id, position=i, target_sets=sets,
                    rep_min=lo, rep_max=hi, target_weight=start or None, rest_sec=rest,
                )
            )
            state[name] = {"weight": float(start), "reps": float(lo + (1 if hi - lo > 1 else 0))}
        plan.days.append(day)
    db.add(plan)

    old = Plan(
        user_id=user.id,
        name="Full Body 3x",
        goal="Get stronger",
        description="The beginner routine from the start of the year. Kept for reference.",
        is_active=False,
        created_at=datetime.combine(today - timedelta(days=300), time(9, 0)),
    )
    for pos, (day_name, items) in enumerate(FULL_BODY):
        day = PlanDay(name=day_name, weekday=None, position=pos)
        for i, (name, sets, lo, hi) in enumerate(items):
            day.exercises.append(
                PlanExercise(exercise_id=ex[name].id, position=i, target_sets=sets, rep_min=lo, rep_max=hi, rest_sec=120)
            )
        old.days.append(day)
    db.add(old)
    db.flush()

    days_by_weekday = {d.weekday: (d, items) for d, (_, _, items) in zip(plan.days, UPPER_LOWER)}
    start_day = today - timedelta(days=WEEKS * 7)
    for offset in range(WEEKS * 7):
        day_date = start_day + timedelta(days=offset)
        week = offset // 7
        if day_date.weekday() not in days_by_weekday or (week, day_date.weekday()) in SKIPPED:
            continue
        plan_day, items = days_by_weekday[day_date.weekday()]
        deload = week == DELOAD_WEEK
        clock = datetime.combine(day_date, time(18, 0)) + timedelta(minutes=rng.randint(0, 50))
        workout = Workout(
            user_id=user.id, plan_day_id=plan_day.id, name=plan_day.name, started_at=clock,
            rating=rng.choice([3, 4, 4, 4, 5]),
            notes="Deload week: lighter and fewer sets." if deload else (rng.choice(NOTES) if rng.random() < 0.3 else ""),
        )
        for position, (name, sets, lo, hi, _start, step, rest) in enumerate(items):
            if week >= DROPPED_FROM_WEEK.get(name, WEEKS):
                continue
            st = state[name]
            kind = ex[name].kind
            late = week >= LATE_WEEK
            if late and name in TOPPED_OUT:
                st["reps"] = hi + 1.5
            if late and name in TOO_HEAVY:
                if not st.get("bumped"):
                    st["weight"] += step
                    st["bumped"] = True
                st["reps"] = lo - 0.6
            n_sets = max(2, sets - 1) if deload else sets
            weight = st["weight"]
            if deload and weight:
                weight = round(weight * 0.9 / 2.5) * 2.5
            reps_done = []
            for n in range(n_sets):
                # later sets lose a rep or so to fatigue
                fatigue = n * (0.5 if kind != "timed" else 3) + rng.uniform(-0.4, 0.4)
                reps = int(round(max(lo - 1, min(hi, st["reps"] - fatigue))))
                if deload:
                    reps = min(reps, lo + 1)
                reps_done.append(reps)
                clock += timedelta(seconds=rng.randint(35, 60))
                workout.sets.append(
                    WorkoutSet(
                        exercise_id=ex[name].id, position=position, set_number=n + 1,
                        target_min=lo, target_max=hi, reps=reps,
                        weight=weight if kind == "weight" else None, completed_at=clock,
                    )
                )
                clock += timedelta(seconds=rest + rng.randint(-10, 25))
            if deload or (late and name in TOPPED_OUT | TOO_HEAVY):
                continue
            if all(r >= hi for r in reps_done):
                if step:
                    st["weight"] += step
                    st["reps"] = float(lo + 1)
                # bodyweight and timed moves just stay at the top of the range
            else:
                st["reps"] = min(hi + 1.5, st["reps"] + (rng.uniform(0.5, 1.1) if kind != "timed" else 4))
        workout.finished_at = clock + timedelta(minutes=rng.randint(2, 6))
        db.add(workout)

    # the plan's target weights follow what the lifter currently uses
    for d, (_, _, items) in zip(plan.days, UPPER_LOWER):
        for pe, (name, *_rest) in zip(d.exercises, items):
            if state[name]["weight"]:
                pe.target_weight = state[name]["weight"]

    bodyweight = 78.6
    for offset in range(WEEKS * 7):
        day_date = start_day + timedelta(days=offset)
        if day_date.weekday() in (0, 3):
            bodyweight -= rng.uniform(0.0, 0.25)
            db.add(
                Measurement(
                    user_id=user.id, date=day_date,
                    weight=round(bodyweight + rng.uniform(-0.3, 0.3), 1),
                    body_fat=round(18.4 - offset * 0.025 + rng.uniform(-0.2, 0.2), 1) if day_date.weekday() == 0 else None,
                    notes="Morning, before breakfast." if offset == 0 else "",
                )
            )
    db.commit()
    return user
