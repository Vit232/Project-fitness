from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, update
from sqlalchemy.orm import Session as Db

from ..auth import current_user
from ..db import get_db
from ..models import Exercise, Plan, PlanDay, PlanExercise, User
from ..schemas import PlanDayIn, PlanIn

router = APIRouter(prefix="/api/plans", tags=["plans"])


def day_out(d: PlanDay) -> dict:
    return {
        "id": d.id,
        "name": d.name,
        "weekday": d.weekday,
        "exercises": [
            {
                "exercise_id": pe.exercise_id,
                "name": pe.exercise.name,
                "muscle_group": pe.exercise.muscle_group,
                "kind": pe.exercise.kind,
                "target_sets": pe.target_sets,
                "rep_min": pe.rep_min,
                "rep_max": pe.rep_max,
                "target_weight": pe.target_weight,
                "rest_sec": pe.rest_sec,
            }
            for pe in d.exercises
        ],
    }


def plan_out(p: Plan) -> dict:
    return {
        "id": p.id,
        "name": p.name,
        "goal": p.goal,
        "description": p.description,
        "is_active": p.is_active,
        "created_at": p.created_at.isoformat(),
        "days": [day_out(d) for d in p.days],
    }


def owned_plan(db: Db, user: User, plan_id: int) -> Plan:
    p = db.get(Plan, plan_id)
    if not p or p.user_id != user.id:
        raise HTTPException(404, "Plan not found")
    return p


def _check_exercises(db: Db, user: User, days: list[PlanDayIn]) -> None:
    wanted = {pe.exercise_id for d in days for pe in d.exercises}
    if not wanted:
        return
    owned = set(
        db.scalars(
            select(Exercise.id).where(Exercise.user_id == user.id, Exercise.id.in_(wanted))
        )
    )
    if wanted - owned:
        raise HTTPException(400, "Plan refers to an exercise that does not exist")


def _apply_days(plan: Plan, days_in: list[PlanDayIn]) -> None:
    """Update days in place where an id is given so past workouts stay linked to them."""
    existing = {d.id: d for d in plan.days}
    result = []
    for position, d_in in enumerate(days_in):
        day = existing.get(d_in.id) if d_in.id else None
        if day is None:
            day = PlanDay()
        day.name = d_in.name.strip()
        day.weekday = d_in.weekday
        day.position = position
        day.exercises = [
            PlanExercise(position=i, **pe.model_dump()) for i, pe in enumerate(d_in.exercises)
        ]
        result.append(day)
    plan.days = result


@router.get("")
def list_plans(user: User = Depends(current_user), db: Db = Depends(get_db)):
    rows = db.scalars(
        select(Plan).where(Plan.user_id == user.id).order_by(Plan.is_active.desc(), Plan.created_at.desc())
    ).all()
    return [plan_out(p) for p in rows]


@router.post("", status_code=201)
def create_plan(body: PlanIn, user: User = Depends(current_user), db: Db = Depends(get_db)):
    _check_exercises(db, user, body.days)
    has_any = db.scalar(select(Plan.id).where(Plan.user_id == user.id).limit(1))
    plan = Plan(
        user_id=user.id,
        name=body.name.strip(),
        goal=body.goal,
        description=body.description,
        is_active=not has_any,  # the first plan becomes the active one
    )
    _apply_days(plan, body.days)
    db.add(plan)
    db.commit()
    return plan_out(plan)


@router.get("/{plan_id}")
def get_plan(plan_id: int, user: User = Depends(current_user), db: Db = Depends(get_db)):
    return plan_out(owned_plan(db, user, plan_id))


@router.put("/{plan_id}")
def update_plan(plan_id: int, body: PlanIn, user: User = Depends(current_user), db: Db = Depends(get_db)):
    plan = owned_plan(db, user, plan_id)
    _check_exercises(db, user, body.days)
    plan.name = body.name.strip()
    plan.goal = body.goal
    plan.description = body.description
    _apply_days(plan, body.days)
    db.commit()
    db.refresh(plan)
    return plan_out(plan)


@router.delete("/{plan_id}", status_code=204)
def delete_plan(plan_id: int, user: User = Depends(current_user), db: Db = Depends(get_db)):
    plan = owned_plan(db, user, plan_id)
    was_active = plan.is_active
    db.delete(plan)
    db.flush()
    if was_active:
        # never leave the lifter without an active plan while they still have one
        successor = db.scalar(
            select(Plan).where(Plan.user_id == user.id).order_by(Plan.created_at.desc()).limit(1)
        )
        if successor:
            successor.is_active = True
    db.commit()


@router.post("/{plan_id}/activate")
def activate_plan(plan_id: int, user: User = Depends(current_user), db: Db = Depends(get_db)):
    plan = owned_plan(db, user, plan_id)
    db.execute(update(Plan).where(Plan.user_id == user.id).values(is_active=False))
    plan.is_active = True
    db.commit()
    return plan_out(plan)


@router.post("/{plan_id}/duplicate", status_code=201)
def duplicate_plan(plan_id: int, user: User = Depends(current_user), db: Db = Depends(get_db)):
    src = owned_plan(db, user, plan_id)
    copy = Plan(
        user_id=user.id,
        name=f"{src.name} (copy)"[:80],
        goal=src.goal,
        description=src.description,
        is_active=False,
    )
    copy.days = [
        PlanDay(
            name=d.name,
            weekday=d.weekday,
            position=d.position,
            exercises=[
                PlanExercise(
                    exercise_id=pe.exercise_id,
                    position=pe.position,
                    target_sets=pe.target_sets,
                    rep_min=pe.rep_min,
                    rep_max=pe.rep_max,
                    target_weight=pe.target_weight,
                    rest_sec=pe.rest_sec,
                )
                for pe in d.exercises
            ],
        )
        for d in src.days
    ]
    db.add(copy)
    db.commit()
    return plan_out(copy)
