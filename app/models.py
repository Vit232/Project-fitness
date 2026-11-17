"""Database tables. Datetimes are naive server-local time: this is a single-user-scale
app where the server and the lifter share a timezone."""
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(80))
    password_hash: Mapped[str] = mapped_column(String(255))
    units: Mapped[str] = mapped_column(String(2), default="kg")
    default_rest_sec: Mapped[int] = mapped_column(Integer, default=90)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)


class Session(Base):
    __tablename__ = "sessions"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime)


class Exercise(Base):
    __tablename__ = "exercises"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(80))
    muscle_group: Mapped[str] = mapped_column(String(30))
    equipment: Mapped[str] = mapped_column(String(30), default="")
    kind: Mapped[str] = mapped_column(String(12), default="weight")  # weight | bodyweight | timed
    notes: Mapped[str] = mapped_column(Text, default="")
    archived: Mapped[bool] = mapped_column(Boolean, default=False)


class Plan(Base):
    __tablename__ = "plans"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(80))
    goal: Mapped[str] = mapped_column(String(40), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    days: Mapped[list["PlanDay"]] = relationship(
        back_populates="plan", cascade="all, delete-orphan", order_by="PlanDay.position"
    )


class PlanDay(Base):
    __tablename__ = "plan_days"
    id: Mapped[int] = mapped_column(primary_key=True)
    plan_id: Mapped[int] = mapped_column(ForeignKey("plans.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(80))
    weekday: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 0 = Monday
    position: Mapped[int] = mapped_column(Integer, default=0)
    plan: Mapped[Plan] = relationship(back_populates="days")
    exercises: Mapped[list["PlanExercise"]] = relationship(
        cascade="all, delete-orphan", order_by="PlanExercise.position"
    )


class PlanExercise(Base):
    __tablename__ = "plan_exercises"
    id: Mapped[int] = mapped_column(primary_key=True)
    plan_day_id: Mapped[int] = mapped_column(ForeignKey("plan_days.id", ondelete="CASCADE"), index=True)
    exercise_id: Mapped[int] = mapped_column(ForeignKey("exercises.id"), index=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    target_sets: Mapped[int] = mapped_column(Integer, default=3)
    rep_min: Mapped[int] = mapped_column(Integer, default=8)
    rep_max: Mapped[int] = mapped_column(Integer, default=12)
    target_weight: Mapped[float | None] = mapped_column(Float, nullable=True)
    rest_sec: Mapped[int | None] = mapped_column(Integer, nullable=True)
    exercise: Mapped[Exercise] = relationship()


class Workout(Base):
    __tablename__ = "workouts"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    plan_day_id: Mapped[int | None] = mapped_column(
        ForeignKey("plan_days.id", ondelete="SET NULL"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(80))
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, index=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    notes: Mapped[str] = mapped_column(Text, default="")
    rating: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sets: Mapped[list["WorkoutSet"]] = relationship(
        cascade="all, delete-orphan",
        order_by="(WorkoutSet.position, WorkoutSet.set_number)",
    )


class WorkoutSet(Base):
    __tablename__ = "workout_sets"
    id: Mapped[int] = mapped_column(primary_key=True)
    workout_id: Mapped[int] = mapped_column(ForeignKey("workouts.id", ondelete="CASCADE"), index=True)
    exercise_id: Mapped[int] = mapped_column(ForeignKey("exercises.id"), index=True)
    position: Mapped[int] = mapped_column(Integer, default=0)  # order of the exercise in the workout
    set_number: Mapped[int] = mapped_column(Integer, default=1)
    target_min: Mapped[int | None] = mapped_column(Integer, nullable=True)
    target_max: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reps: Mapped[int | None] = mapped_column(Integer, nullable=True)
    weight: Mapped[float | None] = mapped_column(Float, nullable=True)
    is_warmup: Mapped[bool] = mapped_column(Boolean, default=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class Measurement(Base):
    __tablename__ = "measurements"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    date: Mapped[date] = mapped_column(Date, index=True)
    weight: Mapped[float] = mapped_column(Float)
    body_fat: Mapped[float | None] = mapped_column(Float, nullable=True)
    notes: Mapped[str] = mapped_column(Text, default="")
