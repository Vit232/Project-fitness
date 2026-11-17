from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.orm import Session as Db, selectinload

from ..auth import current_user
from ..db import get_db
from ..models import Exercise, Plan, PlanDay, User, Workout, WorkoutSet
from ..schemas import FinishIn, SetCreate, SetPatch, StartIn, WorkoutPatch
from .exercises import owned_exercise

router = APIRouter(prefix="/api/workouts", tags=["workouts"])


def set_out(s: WorkoutSet) -> dict:
    return {
        "id": s.id,
        "exercise_id": s.exercise_id,
        "position": s.position,
        "set_number": s.set_number,
        "target_min": s.target_min,
        "target_max": s.target_max,
        "reps": s.reps,
        "weight": s.weight,
        "is_warmup": s.is_warmup,
        "completed": s.completed_at is not None,
    }


def volume_of(sets) -> float:
    return sum(
        (s.reps or 0) * (s.weight or 0) for s in sets if s.completed_at and not s.is_warmup
    )


def summary_out(w: Workout) -> dict:
    done = [s for s in w.sets if s.completed_at]
    end = w.finished_at or datetime.now()
    return {
        "id": w.id,
        "name": w.name,
        "plan_day_id": w.plan_day_id,
        "started_at": w.started_at.isoformat(),
        "finished_at": w.finished_at.isoformat() if w.finished_at else None,
        "duration_min": max(0, round((end - w.started_at).total_seconds() / 60)),
        "notes": w.notes,
        "rating": w.rating,
        "set_count": len(done),
        "exercise_count": len({s.exercise_id for s in done}),
        "volume": round(volume_of(w.sets), 1),
    }


def last_sets(db: Db, user_id: int, exercise_id: int, before: datetime, exclude_id: int | None) -> list[WorkoutSet]:
    """Completed sets of this exercise from the most recent finished workout before `before`."""
    stmt = (
        select(Workout.id)
        .join(WorkoutSet, WorkoutSet.workout_id == Workout.id)
        .where(
            Workout.user_id == user_id,
            Workout.finished_at.is_not(None),
            Workout.started_at < before,
            WorkoutSet.exercise_id == exercise_id,
            WorkoutSet.completed_at.is_not(None),
        )
        .order_by(Workout.started_at.desc())
        .limit(1)
    )
    if exclude_id:
        stmt = stmt.where(Workout.id != exclude_id)
    prev_id = db.scalar(stmt)
    if not prev_id:
        return []
    return list(
        db.scalars(
            select(WorkoutSet)
            .where(
                WorkoutSet.workout_id == prev_id,
                WorkoutSet.exercise_id == exercise_id,
                WorkoutSet.completed_at.is_not(None),
                WorkoutSet.is_warmup.is_(False),
            )
            .order_by(WorkoutSet.set_number)
        )
    )


def detail_out(db: Db, user: User, w: Workout) -> dict:
    ex_ids = list(dict.fromkeys(s.exercise_id for s in w.sets))
    exercises = {
        e.id: e for e in db.scalars(select(Exercise).where(Exercise.id.in_(ex_ids)))
    } if ex_ids else {}
    rest = {}
    if w.plan_day_id:
        day = db.get(PlanDay, w.plan_day_id)
        if day:
            rest = {pe.exercise_id: pe.rest_sec for pe in day.exercises}
    out = summary_out(w)
    out["sets"] = [set_out(s) for s in w.sets]
    out["exercises"] = [
        {
            "exercise_id": ex_id,
            "name": exercises[ex_id].name,
            "muscle_group": exercises[ex_id].muscle_group,
            "kind": exercises[ex_id].kind,
            "rest_sec": rest.get(ex_id) or user.default_rest_sec,
            "previous": [
                {"reps": s.reps, "weight": s.weight}
                for s in last_sets(db, user.id, ex_id, w.started_at, w.id)
            ],
        }
        for ex_id in ex_ids
    ]
    return out


def owned_workout(db: Db, user: User, workout_id: int) -> Workout:
    w = db.get(Workout, workout_id)
    if not w or w.user_id != user.id:
        raise HTTPException(404, "Workout not found")
    return w


def owned_set(db: Db, user: User, set_id: int) -> WorkoutSet:
    s = db.get(WorkoutSet, set_id)
    if not s or not db.scalar(
        select(Workout.id).where(Workout.id == s.workout_id, Workout.user_id == user.id)
    ):
        raise HTTPException(404, "Set not found")
    return s


def active_workout(db: Db, user: User) -> Workout | None:
    return db.scalar(
        select(Workout)
        .where(Workout.user_id == user.id, Workout.finished_at.is_(None))
        .order_by(Workout.started_at.desc())
        .limit(1)
    )


@router.get("")
def list_workouts(user: User = Depends(current_user), db: Db = Depends(get_db)):
    rows = db.scalars(
        select(Workout)
        .where(Workout.user_id == user.id, Workout.finished_at.is_not(None))
        .options(selectinload(Workout.sets))
        .order_by(Workout.started_at.desc())
    ).all()
    return [summary_out(w) for w in rows]


@router.get("/active")
def get_active(user: User = Depends(current_user), db: Db = Depends(get_db)):
    w = active_workout(db, user)
    return detail_out(db, user, w) if w else None


@router.post("/start")
def start_workout(body: StartIn, user: User = Depends(current_user), db: Db = Depends(get_db)):
    """Starts a workout. If one is already in progress, that one is returned instead."""
    existing = active_workout(db, user)
    if existing:
        return detail_out(db, user, existing)
    now = datetime.now()
    if body.plan_day_id:
        day = db.scalar(
            select(PlanDay)
            .join(Plan, Plan.id == PlanDay.plan_id)
            .where(PlanDay.id == body.plan_day_id, Plan.user_id == user.id)
        )
        if not day:
            raise HTTPException(404, "Plan day not found")
        w = Workout(user_id=user.id, plan_day_id=day.id, name=day.name, started_at=now)
        for position, pe in enumerate(day.exercises):
            prev = last_sets(db, user.id, pe.exercise_id, now, None)
            for n in range(1, pe.target_sets + 1):
                if prev:
                    weight = prev[min(n, len(prev)) - 1].weight
                else:
                    weight = pe.target_weight
                w.sets.append(
                    WorkoutSet(
                        exercise_id=pe.exercise_id,
                        position=position,
                        set_number=n,
                        target_min=pe.rep_min,
                        target_max=pe.rep_max,
                        weight=weight,
                    )
                )
    else:
        w = Workout(user_id=user.id, name=(body.name or "").strip() or "Quick workout", started_at=now)
    db.add(w)
    db.commit()
    return detail_out(db, user, w)


@router.get("/{workout_id}")
def get_workout(workout_id: int, user: User = Depends(current_user), db: Db = Depends(get_db)):
    return detail_out(db, user, owned_workout(db, user, workout_id))


@router.patch("/{workout_id}")
def update_workout(
    workout_id: int,
    body: WorkoutPatch,
    user: User = Depends(current_user),
    db: Db = Depends(get_db),
):
    w = owned_workout(db, user, workout_id)
    data = body.model_dump(exclude_unset=True)
    for field in ("name", "notes", "started_at"):
        if data.get(field) is not None:
            setattr(w, field, data[field])
    if "rating" in data:
        w.rating = data["rating"]
    if data.get("finished_at") is not None and w.finished_at is not None:
        w.finished_at = data["finished_at"]
    if w.finished_at and w.finished_at < w.started_at:
        raise HTTPException(400, "A workout cannot end before it starts")
    db.commit()
    return summary_out(w)


@router.post("/{workout_id}/finish")
def finish_workout(
    workout_id: int,
    body: FinishIn,
    user: User = Depends(current_user),
    db: Db = Depends(get_db),
):
    w = owned_workout(db, user, workout_id)
    if not any(s.completed_at for s in w.sets):
        raise HTTPException(400, "Log at least one set, or discard the workout")
    w.sets = [s for s in w.sets if s.completed_at]  # planned sets that were never done are dropped
    if w.finished_at is None:
        w.finished_at = datetime.now()
    if body.notes is not None:
        w.notes = body.notes
    if body.rating is not None:
        w.rating = body.rating
    db.commit()
    return summary_out(w)


@router.delete("/{workout_id}", status_code=204)
def delete_workout(workout_id: int, user: User = Depends(current_user), db: Db = Depends(get_db)):
    db.delete(owned_workout(db, user, workout_id))
    db.commit()


@router.post("/{workout_id}/sets", status_code=201)
def add_sets(
    workout_id: int,
    body: SetCreate,
    user: User = Depends(current_user),
    db: Db = Depends(get_db),
):
    """Adds one or more sets of an exercise, copying targets and weight from the set before it."""
    w = owned_workout(db, user, workout_id)
    owned_exercise(db, user, body.exercise_id)
    same = [s for s in w.sets if s.exercise_id == body.exercise_id]
    if same:
        last = same[-1]
        position, number = last.position, last.set_number
        weight, target_min, target_max = last.weight, last.target_min, last.target_max
    else:
        position = max((s.position for s in w.sets), default=-1) + 1
        number = 0
        prev = last_sets(db, user.id, body.exercise_id, w.started_at, w.id)
        weight, target_min, target_max = (prev[0].weight if prev else None), None, None
    now = datetime.now()
    created = []
    for i in range(body.count):
        s = WorkoutSet(
            workout_id=w.id,
            exercise_id=body.exercise_id,
            position=position,
            set_number=number + 1 + i,
            target_min=target_min,
            target_max=target_max,
            reps=body.reps,
            weight=body.weight if body.weight is not None else weight,
            completed_at=now if body.completed else None,
        )
        db.add(s)
        created.append(s)
    db.commit()
    return [set_out(s) for s in created]


@router.delete("/{workout_id}/exercises/{exercise_id}", status_code=204)
def remove_exercise(
    workout_id: int,
    exercise_id: int,
    user: User = Depends(current_user),
    db: Db = Depends(get_db),
):
    w = owned_workout(db, user, workout_id)
    db.execute(
        delete(WorkoutSet).where(WorkoutSet.workout_id == w.id, WorkoutSet.exercise_id == exercise_id)
    )
    db.commit()


@router.patch("/sets/{set_id}")
def update_set(set_id: int, body: SetPatch, user: User = Depends(current_user), db: Db = Depends(get_db)):
    s = owned_set(db, user, set_id)
    data = body.model_dump(exclude_unset=True)
    for field in ("reps", "weight"):
        if field in data:
            setattr(s, field, data[field])
    if data.get("is_warmup") is not None:
        s.is_warmup = data["is_warmup"]
    if data.get("completed") is True and s.completed_at is None:
        s.completed_at = datetime.now()
    elif data.get("completed") is False:
        s.completed_at = None
    db.commit()
    return set_out(s)


@router.delete("/sets/{set_id}", status_code=204)
def delete_set(set_id: int, user: User = Depends(current_user), db: Db = Depends(get_db)):
    s = owned_set(db, user, set_id)
    workout_id, exercise_id = s.workout_id, s.exercise_id
    db.delete(s)
    db.flush()
    # keep set numbers contiguous
    rest = db.scalars(
        select(WorkoutSet)
        .where(WorkoutSet.workout_id == workout_id, WorkoutSet.exercise_id == exercise_id)
        .order_by(WorkoutSet.set_number)
    ).all()
    for n, other in enumerate(rest, start=1):
        other.set_number = n
    db.commit()
