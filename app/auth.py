import hashlib
import hmac
import secrets
from datetime import datetime, timedelta

from fastapi import Cookie, Depends, HTTPException, Response
from sqlalchemy import delete
from sqlalchemy.orm import Session as Db

from . import config
from .db import get_db
from .models import Session, User

_N, _R, _P = 2**14, 8, 1


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=_N, r=_R, p=_P)
    return f"scrypt${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, salt_hex, digest_hex = stored.split("$")
        digest = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt_hex), n=_N, r=_R, p=_P)
    except ValueError:
        return False
    return hmac.compare_digest(digest.hex(), digest_hex)


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def start_session(db: Db, user: User, response: Response) -> None:
    token = secrets.token_urlsafe(32)
    db.execute(delete(Session).where(Session.expires_at < datetime.now()))
    db.add(
        Session(
            token_hash=_hash_token(token),
            user_id=user.id,
            expires_at=datetime.now() + timedelta(days=config.SESSION_DAYS),
        )
    )
    db.commit()
    response.set_cookie(
        config.COOKIE_NAME,
        token,
        max_age=config.SESSION_DAYS * 86400,
        httponly=True,
        samesite="lax",
        secure=config.SECURE_COOKIE,
        path="/",
    )


def end_session(db: Db, token: str | None, response: Response) -> None:
    if token:
        db.execute(delete(Session).where(Session.token_hash == _hash_token(token)))
        db.commit()
    response.delete_cookie(config.COOKIE_NAME, path="/")


def end_other_sessions(db: Db, user: User, keep_token: str | None) -> None:
    stmt = delete(Session).where(Session.user_id == user.id)
    if keep_token:
        stmt = stmt.where(Session.token_hash != _hash_token(keep_token))
    db.execute(stmt)


def current_user(
    db: Db = Depends(get_db),
    token: str | None = Cookie(default=None, alias=config.COOKIE_NAME),
) -> User:
    if token:
        session = db.get(Session, _hash_token(token))
        if session and session.expires_at > datetime.now():
            user = db.get(User, session.user_id)
            if user:
                return user
    raise HTTPException(401, "Please log in")
