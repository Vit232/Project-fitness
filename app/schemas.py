"""Request bodies. Responses are plain dicts built next to the routes that return them."""
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, model_validator

Units = Literal["kg", "lb"]
Kind = Literal["weight", "bodyweight", "timed"]
Name = Field(min_length=1, max_length=80)


class RegisterIn(BaseModel):
    name: str = Name
    email: EmailStr
    password: str = Field(min_length=8, max_length=200)


class LoginIn(BaseModel):
    email: str
    password: str


class ProfileIn(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    units: Units | None = None
    default_rest_sec: int | None = Field(default=None, ge=10, le=600)


class PasswordIn(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=200)


class ExerciseIn(BaseModel):
    name: str = Name
    muscle_group: str = Field(min_length=1, max_length=30)
    equipment: str = Field(default="", max_length=30)
    kind: Kind = "weight"
    notes: str = Field(default="", max_length=2000)


class ExercisePatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    muscle_group: str | None = Field(default=None, min_length=1, max_length=30)
    equipment: str | None = Field(default=None, max_length=30)
    kind: Kind | None = None
    notes: str | None = Field(default=None, max_length=2000)
    archived: bool | None = None


class PlanExerciseIn(BaseModel):
    exercise_id: int
    target_sets: int = Field(default=3, ge=1, le=20)
    rep_min: int = Field(default=8, ge=1, le=600)
    rep_max: int = Field(default=12, ge=1, le=600)
    target_weight: float | None = Field(default=None, ge=0, le=2000)
    rest_sec: int | None = Field(default=None, ge=0, le=900)

    @model_validator(mode="after")
    def _range(self):
        if self.rep_max < self.rep_min:
            self.rep_max = self.rep_min
        return self


class PlanDayIn(BaseModel):
    id: int | None = None  # present when updating an existing day, so its history stays linked
    name: str = Name
    weekday: int | None = Field(default=None, ge=0, le=6)
    exercises: list[PlanExerciseIn] = Field(default_factory=list, max_length=40)


class PlanIn(BaseModel):
    name: str = Name
    goal: str = Field(default="", max_length=40)
    description: str = Field(default="", max_length=2000)
    days: list[PlanDayIn] = Field(default_factory=list, max_length=14)


class StartIn(BaseModel):
    plan_day_id: int | None = None
    name: str | None = Field(default=None, max_length=80)


class WorkoutPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    notes: str | None = Field(default=None, max_length=2000)
    rating: int | None = Field(default=None, ge=1, le=5)
    started_at: datetime | None = None
    finished_at: datetime | None = None


class FinishIn(BaseModel):
    notes: str | None = Field(default=None, max_length=2000)
    rating: int | None = Field(default=None, ge=1, le=5)


class SetCreate(BaseModel):
    exercise_id: int
    count: int = Field(default=1, ge=1, le=10)
    reps: int | None = Field(default=None, ge=0, le=10000)
    weight: float | None = Field(default=None, ge=0, le=2000)
    completed: bool = False


class SetPatch(BaseModel):
    reps: int | None = Field(default=None, ge=0, le=10000)
    weight: float | None = Field(default=None, ge=0, le=2000)
    is_warmup: bool | None = None
    completed: bool | None = None


class MeasurementIn(BaseModel):
    date: date
    weight: float = Field(gt=0, le=1000)
    body_fat: float | None = Field(default=None, ge=1, le=75)
    notes: str = Field(default="", max_length=500)
