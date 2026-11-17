import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = Path(__file__).resolve().parent / "static"

(BASE_DIR / "data").mkdir(exist_ok=True)  # git does not keep empty folders, so a fresh clone has none
DATABASE_URL = os.environ.get(
    "REPLOG_DATABASE_URL", f"sqlite:///{(BASE_DIR / 'data' / 'replog.db').as_posix()}"
)
# Set to 1 when serving over HTTPS so the session cookie is never sent in clear text.
SECURE_COOKIE = os.environ.get("REPLOG_SECURE_COOKIE") == "1"
SEED_DEMO = os.environ.get("REPLOG_SEED_DEMO", "1") == "1"
SESSION_DAYS = 30
COOKIE_NAME = "replog_session"
