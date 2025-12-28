# backend/main.py
from __future__ import annotations

import os
import time
from pathlib import Path

from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from backend.db import connect, init_db

app = FastAPI(title="Gas Market Dashboard API", version="0.4.0")

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


@app.post("/api/reingest")
def api_reingest():
    """
    Runs BOTH ingestors:
      - EIA prices ingest (Henry Hub spot)
      - RSS news ingest
    Returns how many rows were upserted.
    """
    init_db()
    t0 = time.time()
    try:
        # ---- PRICES (EIA) ----
        from backend.ingest_eia import fetch_series, upsert_prices, DEFAULT_SERIES_ID

        api_key = os.getenv("EIA_API_KEY", "").strip()
        if not api_key:
            raise HTTPException(status_code=500, detail="Missing EIA_API_KEY env var.")

        eia_series_id = os.getenv("EIA_HH_SERIES_ID", DEFAULT_SERIES_ID).strip()
        price_points = fetch_series(api_key, eia_series_id)

        prices_series = "HENRY_HUB_SPOT"
        prices_count = upsert_prices(prices_series, price_points, source=f"EIA:{eia_series_id}")

        # ---- NEWS (RSS) ----
        from backend.ingest_rss import fetch_feed, upsert_news
        from backend.feeds import FEEDS

        news_series = "HENRY_HUB_SPOT"
        news_count = 0
        if FEEDS:
            for feed_url in FEEDS:
                items = fetch_feed(feed_url, limit=75)
                news_count += upsert_news(news_series, items)
                time.sleep(0.25)  # light politeness

        return {
            "ok": True,
            "prices_ingested": int(prices_count),
            "news_ingested": int(news_count),
            "elapsed_s": round(time.time() - t0, 2),
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


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
        row = conn.execute(
            "SELECT MAX(t_ms) AS tmax FROM prices WHERE series = ?;",
            (series,),
        ).fetchone()
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
    series: str = Query("HENRY_HUB_SPOT", pattern="^(NG_FUTURES|HENRY_HUB_SPOT)$"),
):
    # If you later ingest separate futures news, this will matter.
    # For now, keep both options valid.
    if series == "NG_FUTURES":
        series = "HENRY_HUB_SPOT"

    days = _range_to_days(range)

    with connect() as conn:
        row = conn.execute(
            "SELECT MAX(t_ms) AS tmax FROM news WHERE series = ?;",
            (series,),
        ).fetchone()
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


# -------------------------
# Serve frontend (STATIC)
# -------------------------
# You were mounting it at /frontend, but your index.html loads /styles.css, /app.js, etc.
# So those must be served at the ROOT path ("/"), not "/frontend".
#
# This also keeps /api/* working because /api routes are defined above and take precedence.
BASE_DIR = Path(__file__).resolve().parent          # .../backend
FRONTEND_DIR = (BASE_DIR.parent / "frontend").resolve()

if FRONTEND_DIR.is_dir():
    # Serve index.html at "/" and static assets at "/styles.css", "/app.js", etc.
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
