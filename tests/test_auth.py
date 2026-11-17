from fastapi.testclient import TestClient

from app.main import app
from tests.conftest import register


def test_register_logs_in_and_gives_starter_exercises(client):
    me = client.get("/api/auth/me").json()
    assert me["email"] == "sam@example.com"
    assert len(client.get("/api/exercises").json()) >= 50


def test_requires_login():
    anon = TestClient(app)
    for path in ("/api/auth/me", "/api/exercises", "/api/plans", "/api/workouts", "/api/stats/dashboard"):
        assert anon.get(path).status_code == 401


def test_login_logout():
    register()
    c = TestClient(app)
    assert c.post("/api/auth/login", json={"email": "sam@example.com", "password": "nope"}).status_code == 401
    assert c.post("/api/auth/login", json={"email": "SAM@example.com", "password": "password1"}).status_code == 200
    assert c.get("/api/auth/me").status_code == 200
    assert c.post("/api/auth/logout").status_code == 204
    assert c.get("/api/auth/me").status_code == 401


def test_duplicate_email_and_short_password(client):
    c = TestClient(app)
    dup = c.post("/api/auth/register", json={"name": "X", "email": "sam@example.com", "password": "password1"})
    assert dup.status_code == 409
    short = c.post("/api/auth/register", json={"name": "X", "email": "x@example.com", "password": "short"})
    assert short.status_code == 422


def test_change_password_signs_out_other_devices(client):
    phone = TestClient(app)
    phone.post("/api/auth/login", json={"email": "sam@example.com", "password": "password1"})
    bad = client.post("/api/auth/password", json={"current_password": "wrong", "new_password": "newpassword1"})
    assert bad.status_code == 400
    ok = client.post("/api/auth/password", json={"current_password": "password1", "new_password": "newpassword1"})
    assert ok.status_code == 204
    assert client.get("/api/auth/me").status_code == 200
    assert phone.get("/api/auth/me").status_code == 401


def test_update_profile(client):
    r = client.patch("/api/auth/me", json={"units": "lb", "default_rest_sec": 120})
    assert r.json()["units"] == "lb"
    assert client.get("/api/auth/me").json()["default_rest_sec"] == 120
