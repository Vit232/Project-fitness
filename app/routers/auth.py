from fastapi import APIRouter, Cookie, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session as Db

from .. import config
from ..auth import (
    current_user,
    end_other_sessions,
    end_session,
    hash_password,
    start_session,
    verify_password,
)
from ..db import get_db
from ..models import User
from ..schemas import LoginIn, PasswordIn, ProfileIn, RegisterIn
from ..seed import add_starter_exercises

router = APIRouter(prefix="/api/auth", tags=["auth"])


def user_out(u: User) -> dict:
    return {
        "id": u.id,
        "email": u.email,
        "name": u.name,
        "units": u.units,
        "default_rest_sec": u.default_rest_sec,
    }


@router.post("/register", status_code=201)
def register(body: RegisterIn, response: Response, db: Db = Depends(get_db)):
    email = body.email.lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(409, "An account with this email already exists")
    user = User(email=email, name=body.name.strip(), password_hash=hash_password(body.password))
    db.add(user)
    db.flush()
    add_starter_exercises(db, user.id)
    start_session(db, user, response)
    return user_out(user)


@router.post("/login")
def login(body: LoginIn, response: Response, db: Db = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == body.email.strip().lower()))
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Wrong email or password")
    start_session(db, user, response)
    return user_out(user)


@router.post("/logout", status_code=204)
def logout(
    response: Response,
    db: Db = Depends(get_db),
    token: str | None = Cookie(default=None, alias=config.COOKIE_NAME),
):
    end_session(db, token, response)


@router.get("/me")
def me(user: User = Depends(current_user)):
    return user_out(user)


@router.patch("/me")
def update_me(body: ProfileIn, user: User = Depends(current_user), db: Db = Depends(get_db)):
    for field, value in body.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(user, field, value.strip() if isinstance(value, str) else value)
    db.commit()
    return user_out(user)


@router.post("/password", status_code=204)
def change_password(
    body: PasswordIn,
    user: User = Depends(current_user),
    db: Db = Depends(get_db),
    token: str | None = Cookie(default=None, alias=config.COOKIE_NAME),
):
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(400, "Current password is wrong")
    user.password_hash = hash_password(body.new_password)
    end_other_sessions(db, user, token)
    db.commit()
