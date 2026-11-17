from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session as Db

from ..auth import current_user
from ..db import get_db
from ..models import Exercise, PlanExercise, User, WorkoutSet
from ..schemas import ExerciseIn, ExercisePatch

router = APIRouter(prefix="/api/exercises", tags=["exercises"])


def exercise_out(e: Exercise) -> dict:
    return {
        "id": e.id,
        "name": e.name,
        "muscle_group": e.muscle_group,
        "equipment": e.equipment,
        "kind": e.kind,
        "notes": e.notes,
        "archived": e.archived,
    }


def owned_exercise(db: Db, user: User, exercise_id: int) -> Exercise:
    e = db.get(Exercise, exercise_id)
    if not e or e.user_id != user.id:
        raise HTTPException(404, "Exercise not found")
    return e


@router.get("")
def list_exercises(user: User = Depends(current_user), db: Db = Depends(get_db)):
    rows = db.scalars(
        select(Exercise).where(Exercise.user_id == user.id).order_by(Exercise.name)
    ).all()
    return [exercise_out(e) for e in rows]


@router.post("", status_code=201)
def create_exercise(body: ExerciseIn, user: User = Depends(current_user), db: Db = Depends(get_db)):
    e = Exercise(user_id=user.id, **body.model_dump())
    e.name = e.name.strip()
    db.add(e)
    db.commit()
    return exercise_out(e)


@router.patch("/{exercise_id}")
def update_exercise(
    exercise_id: int,
    body: ExercisePatch,
    user: User = Depends(current_user),
    db: Db = Depends(get_db),
):
    e = owned_exercise(db, user, exercise_id)
    for field, value in body.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(e, field, value)
    db.commit()
    return exercise_out(e)


@router.delete("/{exercise_id}")
def delete_exercise(exercise_id: int, user: User = Depends(current_user), db: Db = Depends(get_db)):
    """Deletes the exercise, or archives it when workouts or plans still refer to it."""
    e = owned_exercise(db, user, exercise_id)
    in_use = db.scalar(
        select(WorkoutSet.id).where(WorkoutSet.exercise_id == e.id).limit(1)
    ) or db.scalar(select(PlanExercise.id).where(PlanExercise.exercise_id == e.id).limit(1))
    if in_use:
        e.archived = True
    else:
        db.delete(e)
    db.commit()
    return {"archived": bool(in_use)}
