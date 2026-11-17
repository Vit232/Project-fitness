from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import config, models  # noqa: F401  (models must be imported before create_all)
from .db import Base, SessionLocal, engine
from .routers import auth, exercises, measurements, plans, stats, workouts
from .seed import seed_demo


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(engine)
    if config.SEED_DEMO:
        with SessionLocal() as db:
            seed_demo(db)
    yield


app = FastAPI(title="RepLog", lifespan=lifespan)

for module in (auth, exercises, plans, workouts, measurements, stats):
    app.include_router(module.router)


@app.middleware("http")
async def revalidate_static(request: Request, call_next):
    response = await call_next(request)
    if not request.url.path.startswith("/api/"):
        # there is no build step and no hashed filenames, so always revalidate
        response.headers["Cache-Control"] = "no-cache"
    return response


@app.exception_handler(404)
async def not_found(request: Request, exc):
    if request.url.path.startswith("/api/"):
        return JSONResponse({"detail": getattr(exc, "detail", "Not found")}, status_code=404)
    return FileResponse(config.STATIC_DIR / "index.html")


app.mount("/static", StaticFiles(directory=config.STATIC_DIR), name="static")


@app.get("/", include_in_schema=False)
def index():
    return FileResponse(config.STATIC_DIR / "index.html")
