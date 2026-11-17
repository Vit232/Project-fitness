from collections import defaultdict
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session as Db, selectinload

from ..auth import current_user
from ..db import get_db
from ..models import Exercise, Measurement, Plan, User, Workout
from .exercises import exercise_out, owned_exercise
from .plans import day_out, owned_plan
from .workouts import active_workout, summary_out, volume_of

router = APIRouter(prefix="/api/stats", tags=["stats"])


def week_start(d: date) -> date:
    return d - timedelta(days=d.weekday())


def e1rm(weight: float | None, reps: int | None) -> float:
    """Estimated one-rep max (Epley)."""
    if not weight or not reps:
        return 0.0
    return weight * (1 + reps / 30)


def score(s) -> float:
    """How good a set is: estimated 1RM when loaded, otherwise just the reps."""
    return e1rm(s.weight, s.reps) if s.weight else float(s.reps or 0)


def work_sets(w: Workout, exercise_id: int | None = None):
    return [
        s
        for s in w.sets
        if s.completed_at and not s.is_warmup and (exercise_id is None or s.exercise_id == exercise_id)
    ]


def history(db: Db, user: User) -> list[Workout]:
    """All finished workouts, oldest first, with their sets loaded."""
    return list(
        db.scalars(
            select(Workout)
            .where(Workout.user_id == user.id, Workout.finished_at.is_not(None))
            .options(selectinload(Workout.sets))
            .order_by(Workout.started_at)
        )
    )


def exercise_map(db: Db, user: User) -> dict[int, Exercise]:
    return {e.id: e for e in db.scalars(select(Exercise).where(Exercise.user_id == user.id))}


def find_prs(workouts: list[Workout], exercises: dict[int, Exercise]) -> list[dict]:
    """A PR is a session whose best set beats every earlier session of that exercise."""
    best: dict[int, float] = {}
    prs = []
    for w in workouts:
        top = {}
        for s in work_sets(w):
            if s.exercise_id not in top or score(s) > score(top[s.exercise_id]):
                top[s.exercise_id] = s
        for ex_id, s in top.items():
            if ex_id in best and score(s) > best[ex_id] and ex_id in exercises:
                prs.append(
                    {
                        "exercise_id": ex_id,
                        "exercise": exercises[ex_id].name,
                        "kind": exercises[ex_id].kind,
                        "workout_id": w.id,
                        "date": w.started_at.isoformat(),
                        "weight": s.weight,
                        "reps": s.reps,
                    }
                )
            best[ex_id] = max(best.get(ex_id, 0), score(s))
    return prs


def _today_plan(db: Db, user: User, workouts: list[Workout], today: date):
    plan = db.scalar(select(Plan).where(Plan.user_id == user.id, Plan.is_active.is_(True)))
    if not plan or not plan.days:
        return None
    day_ids = {d.id for d in plan.days}
    done_today = {w.plan_day_id for w in workouts if w.started_at.date() == today}
    scheduled = [d for d in plan.days if d.weekday is not None]
    in_days = 0
    if scheduled:
        day = min(scheduled, key=lambda d: (d.weekday - today.weekday()) % 7)
        in_days = (day.weekday - today.weekday()) % 7
        todays = [d for d in scheduled if d.weekday == today.weekday()]
        if todays and all(d.id in done_today for d in todays):
            status = "done"
        else:
            status = "today" if in_days == 0 else "upcoming"
    else:
        # no fixed weekdays: rotate through the days in order
        last = next((w for w in reversed(workouts) if w.plan_day_id in day_ids), None)
        idx = 0
        if last:
            idx = (next(i for i, d in enumerate(plan.days) if d.id == last.plan_day_id) + 1) % len(plan.days)
        day = plan.days[idx]
        status = "done" if done_today & day_ids else "today"
    return {
        "plan": {"id": plan.id, "name": plan.name},
        "day": day_out(day),
        "status": status,
        "in_days": in_days,
        "day_count": len(plan.days),
    }


@router.get("/dashboard")
def dashboard(user: User = Depends(current_user), db: Db = Depends(get_db)):
    workouts = history(db, user)
    exercises = exercise_map(db, user)
    today = date.today()
    this_week = week_start(today)

    by_week: dict[date, list[Workout]] = defaultdict(list)
    for w in workouts:
        by_week[week_start(w.started_at.date())].append(w)

    weeks = []
    for i in range(7, -1, -1):
        start = this_week - timedelta(weeks=i)
        ws = by_week.get(start, [])
        weeks.append(
            {
                "week_start": start.isoformat(),
                "workouts": len(ws),
                "volume": round(sum(volume_of(w.sets) for w in ws)),
                "sets": sum(len(work_sets(w)) for w in ws),
            }
        )

    # weeks in a row with at least one workout; the current week does not break the streak
    streak = 0
    cursor = this_week if by_week.get(this_week) else this_week - timedelta(weeks=1)
    while by_week.get(cursor):
        streak += 1
        cursor -= timedelta(weeks=1)

    active = active_workout(db, user)
    weights = db.scalars(
        select(Measurement)
        .where(Measurement.user_id == user.id)
        .order_by(Measurement.date.desc(), Measurement.id.desc())
        .limit(16)
    ).all()
    today_plan = _today_plan(db, user, workouts, today)
    return {
        "today": today_plan,
        "active_workout": {"id": active.id, "name": active.name} if active else None,
        "week": weeks[-1],
        "last_week": weeks[-2],
        "planned_per_week": today_plan["day_count"] if today_plan else None,
        "streak_weeks": streak,
        "total_workouts": len(workouts),
        "weeks": weeks,
        "recent_workouts": [summary_out(w) for w in reversed(workouts[-5:])],
        "recent_prs": list(reversed(find_prs(workouts, exercises)))[:6],
        "bodyweight": [{"date": m.date.isoformat(), "weight": m.weight} for m in reversed(weights)],
    }


def _sessions(workouts: list[Workout], exercise_id: int) -> list[dict]:
    out = []
    for w in workouts:
        sets = work_sets(w, exercise_id)
        if not sets:
            continue
        top = max(sets, key=score)
        out.append(
            {
                "workout_id": w.id,
                "date": w.started_at.isoformat(),
                "sets": [{"reps": s.reps, "weight": s.weight} for s in sets],
                "top_weight": max((s.weight or 0) for s in sets),
                "top_reps": max((s.reps or 0) for s in sets),
                "e1rm": round(e1rm(top.weight, top.reps), 1),
                "volume": round(volume_of(sets), 1),
            }
        )
    return out


@router.get("/exercise/{exercise_id}")
def exercise_stats(exercise_id: int, user: User = Depends(current_user), db: Db = Depends(get_db)):
    ex = owned_exercise(db, user, exercise_id)
    sessions = _sessions(history(db, user), ex.id)
    records = None
    if sessions:
        records = {
            "top_weight": max(s["top_weight"] for s in sessions),
            "top_reps": max(s["top_reps"] for s in sessions),
            "e1rm": max(s["e1rm"] for s in sessions),
            "volume": max(s["volume"] for s in sessions),
            "sessions": len(sessions),
        }
    return {"exercise": exercise_out(ex), "sessions": sessions, "records": records}


def _suggest(pe, sessions: list[dict], today: date, step: float) -> dict:
    if not sessions:
        return {"kind": "new", "text": "Not trained yet under this plan."}
    last_date = datetime.fromisoformat(sessions[-1]["date"]).date()
    if (today - last_date).days > 21:
        return {"kind": "stale", "text": f"Not trained in {(today - last_date).days} days."}
    recent = sessions[-2:]

    def all_top(s):
        return len(s["sets"]) >= pe.target_sets and all((x["reps"] or 0) >= pe.rep_max for x in s["sets"])

    def any_short(s):
        return any((x["reps"] or 0) < pe.rep_min for x in s["sets"])

    unit = "seconds" if pe.exercise.kind == "timed" else "reps"
    if len(recent) == 2 and all(all_top(s) for s in recent):
        if pe.exercise.kind == "weight":
            return {
                "kind": "increase",
                "text": f"Hit {pe.rep_max} {unit} on every set twice in a row. Add {step:g} next time.",
            }
        return {
            "kind": "increase",
            "text": f"Hit {pe.rep_max} {unit} on every set twice in a row. Raise the target or add load.",
        }
    if len(recent) == 2 and all(any_short(s) for s in recent):
        return {
            "kind": "decrease",
            "text": f"Fell under {pe.rep_min} {unit} two sessions running. Drop the load a little.",
        }
    return {"kind": "hold", "text": "On track. Keep adding reps inside the range."}


@router.get("/plan-review/{plan_id}")
def plan_review(plan_id: int, user: User = Depends(current_user), db: Db = Depends(get_db)):
    plan = owned_plan(db, user, plan_id)
    workouts = history(db, user)
    exercises = exercise_map(db, user)
    today = date.today()
    this_week = week_start(today)
    day_ids = {d.id for d in plan.days}
    plan_workouts = [w for w in workouts if w.plan_day_id in day_ids]
    planned = len(plan.days)

    per_week: dict[date, int] = defaultdict(int)
    for w in plan_workouts:
        per_week[week_start(w.started_at.date())] += 1
    weeks = [
        {
            "week_start": (this_week - timedelta(weeks=i)).isoformat(),
            "planned": planned,
            "done": per_week.get(this_week - timedelta(weeks=i), 0),
        }
        for i in range(7, -1, -1)
    ]

    # adherence over finished weeks since the plan was first used
    adherence = None
    if plan_workouts and planned:
        first = week_start(plan_workouts[0].started_at.date())
        full_weeks = (this_week - first).days // 7
        if full_weeks > 0:
            done = sum(
                min(planned, per_week.get(first + timedelta(weeks=i), 0)) for i in range(full_weeks)
            )
            adherence = round(100 * done / (planned * full_weeks))

    # average weekly work sets per muscle group over the last four finished weeks
    since = this_week - timedelta(weeks=4)
    muscle_sets: dict[str, int] = defaultdict(int)
    for w in plan_workouts:
        if since <= w.started_at.date() < this_week:
            for s in work_sets(w):
                if s.exercise_id in exercises:
                    muscle_sets[exercises[s.exercise_id].muscle_group] += 1
    muscles = sorted(
        ({"muscle": m, "sets_per_week": round(n / 4, 1)} for m, n in muscle_sets.items()),
        key=lambda x: -x["sets_per_week"],
    )

    step = 2.5 if user.units == "kg" else 5
    rows, seen = [], set()
    for d in plan.days:
        for pe in d.exercises:
            if pe.exercise_id in seen:
                continue
            seen.add(pe.exercise_id)
            sessions = _sessions(plan_workouts, pe.exercise_id)
            loaded = pe.exercise.kind == "weight"
            series = [s["e1rm"] if loaded else s["top_reps"] for s in sessions]
            change = None
            if len(series) >= 2 and series[0]:
                change = round(100 * (series[-1] - series[0]) / series[0], 1)
            rows.append(
                {
                    "exercise_id": pe.exercise_id,
                    "name": pe.exercise.name,
                    "kind": pe.exercise.kind,
                    "muscle_group": pe.exercise.muscle_group,
                    "day": d.name,
                    "target_sets": pe.target_sets,
                    "rep_min": pe.rep_min,
                    "rep_max": pe.rep_max,
                    "sessions": len(sessions),
                    "series": series[-10:],
                    "last": sessions[-1] if sessions else None,
                    "change_pct": change,
                    "suggestion": _suggest(pe, sessions, today, step),
                }
            )

    days = []
    for d in plan.days:
        mine = [w for w in plan_workouts if w.plan_day_id == d.id]
        days.append(
            {
                "id": d.id,
                "name": d.name,
                "weekday": d.weekday,
                "done": len(mine),
                "last_done": mine[-1].started_at.isoformat() if mine else None,
            }
        )

    return {
        "plan": {"id": plan.id, "name": plan.name, "goal": plan.goal, "is_active": plan.is_active},
        "total_workouts": len(plan_workouts),
        "adherence_pct": adherence,
        "weeks": weeks,
        "muscles": muscles,
        "exercises": rows,
        "days": days,
    }
