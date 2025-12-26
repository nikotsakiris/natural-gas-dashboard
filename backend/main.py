# backend/main.py
from __future__ import annotations

import os
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from backend.db import connect, init_db

app = FastAPI(title="Gas Market Dashboard API", version="0.3.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def _startup():
    init_db()


def _range_to_days(r: str) -> int:
    return {"1D": 1, "5D": 5, "1M": 30, "3M": 90, "6M": 180, "1Y": 365}.get(r, 30)


@app.get("/api/prices")
def api_prices(
    range: str = Query("1M", pattern="^(1D|5D|1M|3M|6M|1Y)$"),
    series: str = Query("HENRY_HUB_SPOT", pattern="^(NG_FUTURES|HENRY_HUB_SPOT)$"),
):
    # Temporary convenience: treat NG_FUTURES as Henry Hub until you add real futures
    if series == "NG_FUTURES":
        series = "HENRY_HUB_SPOT"

    days = _range_to_days(range)

    with connect() as conn:
        row = conn.execute("SELECT MAX(t_ms) AS tmax FROM prices WHERE series = ?;", (series,)).fetchone()
        if not row or row["tmax"] is None:
            return []
        tmax = int(row["tmax"])
        tmin = tmax - days * 24 * 3600 * 1000

        rows = conn.execute(
            """
            SELECT t_ms, price
            FROM prices
            WHERE series = ? AND t_ms BETWEEN ? AND ?
            ORDER BY t_ms ASC;
            """,
            (series, tmin, tmax),
        ).fetchall()

    return [{"t": int(r["t_ms"]), "p": float(r["price"])} for r in rows]


@app.get("/api/news")
def api_news(
    range: str = Query("1M", pattern="^(1D|5D|1M|3M|6M|1Y)$"),
    series: str = Query("NG_FUTURES", pattern="^(NG_FUTURES|HENRY_HUB_SPOT)$"),
):
    # Your RSS ingestion stores under NG_FUTURES by default; keep it.
    days = _range_to_days(range)

    with connect() as conn:
        row = conn.execute("SELECT MAX(t_ms) AS tmax FROM news WHERE series = ?;", (series,)).fetchone()
        if not row or row["tmax"] is None:
            return []
        tmax = int(row["tmax"])
        tmin = tmax - days * 24 * 3600 * 1000

        rows = conn.execute(
            """
            SELECT id, t_ms, category, source, title, url
            FROM news
            WHERE series = ? AND t_ms BETWEEN ? AND ?
            ORDER BY t_ms ASC;
            """,
            (series, tmin, tmax),
        ).fetchall()

    return [
        {
            "id": r["id"],
            "t": int(r["t_ms"]),
            "category": r["category"],
            "source": r["source"],
            "title": r["title"],
            "url": r["url"],
        }
        for r in rows
    ]


# Serve frontend from backend
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRONTEND_DIR = os.path.join(REPO_ROOT, "frontend")
if os.path.isdir(FRONTEND_DIR):
    app.mount("/frontend", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")

    @app.get("/")
    def root():
        return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))
