from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session as Db

from ..auth import current_user
from ..db import get_db
from ..models import Measurement, User
from ..schemas import MeasurementIn

router = APIRouter(prefix="/api/measurements", tags=["measurements"])


def measurement_out(m: Measurement) -> dict:
    return {
        "id": m.id,
        "date": m.date.isoformat(),
        "weight": m.weight,
        "body_fat": m.body_fat,
        "notes": m.notes,
    }


def _owned(db: Db, user: User, measurement_id: int) -> Measurement:
    m = db.get(Measurement, measurement_id)
    if not m or m.user_id != user.id:
        raise HTTPException(404, "Entry not found")
    return m


@router.get("")
def list_measurements(user: User = Depends(current_user), db: Db = Depends(get_db)):
    rows = db.scalars(
        select(Measurement)
        .where(Measurement.user_id == user.id)
        .order_by(Measurement.date.desc(), Measurement.id.desc())
    ).all()
    return [measurement_out(m) for m in rows]


@router.post("", status_code=201)
def create_measurement(body: MeasurementIn, user: User = Depends(current_user), db: Db = Depends(get_db)):
    m = Measurement(user_id=user.id, **body.model_dump())
    db.add(m)
    db.commit()
    return measurement_out(m)


@router.put("/{measurement_id}")
def update_measurement(
    measurement_id: int,
    body: MeasurementIn,
    user: User = Depends(current_user),
    db: Db = Depends(get_db),
):
    m = _owned(db, user, measurement_id)
    for field, value in body.model_dump().items():
        setattr(m, field, value)
    db.commit()
    return measurement_out(m)


@router.delete("/{measurement_id}", status_code=204)
def delete_measurement(measurement_id: int, user: User = Depends(current_user), db: Db = Depends(get_db)):
    db.delete(_owned(db, user, measurement_id))
    db.commit()
