# RepLog

A personal gym tracker: build a plan, count reps and log sets on your phone during the workout, and review how the plan is going.

## Run it

```powershell
.\run.ps1
```

Then open http://localhost:8000. The script prints the address to use from a phone on the same Wi-Fi.

Demo login: `demo@replog.app` / `demo1234` (eight weeks of sample training). Or create your own account.

The first run creates `.venv` and installs the dependencies. It needs Python 3.12 (`winget install Python.Python.3.12`).

## What is where

- `app/` — FastAPI backend. `routers/` holds the API, `models.py` the tables, `seed.py` the starter exercises and demo data.
- `app/static/` — the frontend. Plain JavaScript modules with Preact, no build step.
- `data/replog.db` — the SQLite database. Delete this file to start over; the demo account is recreated on the next start.
- `tests/` — backend tests: `.\.venv\Scripts\python.exe -m pytest`

## Limits to know about

- The app runs on your PC, so your phone only reaches it on the same network. Using it at the gym needs hosting or a tunnel such as Tailscale.
- Over plain `http` on a phone, the browser will not keep the screen awake during a workout. That needs HTTPS.
- Changing kg/lb changes the label only. Logged numbers are not converted.
- Times are stored in the server's local time.

## Settings (environment variables)

| Variable | Default | Meaning |
|---|---|---|
| `REPLOG_DATABASE_URL` | `sqlite:///data/replog.db` | Where the data lives |
| `REPLOG_SECURE_COOKIE` | off | Set to `1` when serving over HTTPS |
| `REPLOG_SEED_DEMO` | `1` | Set to `0` to skip creating the demo account |
