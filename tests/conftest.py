import os
import tempfile
from pathlib import Path

# must be set before the app is imported
_tmp = Path(tempfile.mkdtemp()) / "test.db"
os.environ["REPLOG_DATABASE_URL"] = f"sqlite:///{_tmp.as_posix()}"
os.environ["REPLOG_SEED_DEMO"] = "0"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.db import Base, engine  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture(autouse=True)
def fresh_db():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield


def register(email="sam@example.com", name="Sam", password="password1") -> TestClient:
    """A logged-in client for a brand new account."""
    client = TestClient(app)
    r = client.post("/api/auth/register", json={"name": name, "email": email, "password": password})
    assert r.status_code == 201, r.text
    return client


@pytest.fixture
def client():
    return register()


@pytest.fixture
def other():
    return register(email="riley@example.com", name="Riley")


def exercise_id(client: TestClient, name: str) -> int:
    return next(e["id"] for e in client.get("/api/exercises").json() if e["name"] == name)
