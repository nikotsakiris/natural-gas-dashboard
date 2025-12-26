# backend/ingest_eia.py
from __future__ import annotations
from dotenv import load_dotenv


import os
import time
import requests
from datetime import datetime
from typing import List, Tuple

from backend.db import connect, init_db
load_dotenv()


EIA_BASE = "https://api.eia.gov/v2"
DEFAULT_SERIES_ID = "NG.RNGWHHD.D"  # Henry Hub spot, daily (APIv1 series id)


def _parse_date_to_ms(s: str) -> int:
    # EIA series responses often use YYYYMMDD or YYYY-MM-DD; support both.
    s = s.strip()
    if "-" in s:
        dt = datetime.strptime(s, "%Y-%m-%d")
    else:
        dt = datetime.strptime(s, "%Y%m%d")
    return int(dt.timestamp() * 1000)


def fetch_series(api_key: str, series_id: str) -> List[Tuple[int, float]]:
    url = f"{EIA_BASE}/seriesid/{series_id}"
    r = requests.get(url, params={"api_key": api_key}, timeout=30)
    r.raise_for_status()
    j = r.json()

    # EIA v2 seriesid response shape can include either "response" or "data" depending on series
    # We handle a few common shapes defensively.
    data = None
    if isinstance(j, dict):
        if "response" in j and isinstance(j["response"], dict):
            data = j["response"].get("data")
        if data is None and "data" in j:
            data = j.get("data")
    if not isinstance(data, list):
        raise RuntimeError(f"Unexpected EIA response shape keys={list(j.keys())[:10]}")

    out = []
    for row in data:
        # Common keys: "period" + "value"
        period = row.get("period") or row.get("date") or row.get("time")
        value = row.get("value") or row.get("price")
        if period is None or value is None:
            continue
        try:
            t_ms = _parse_date_to_ms(str(period))
            p = float(value)
            out.append((t_ms, p))
        except Exception:
            continue

    out.sort(key=lambda x: x[0])
    return out


def upsert_prices(series: str, points: List[Tuple[int, float]], source: str) -> int:
    now_ms = int(time.time() * 1000)
    rows = [(series, t, p, source, now_ms) for (t, p) in points]

    with connect() as conn:
        cur = conn.executemany(
            """
            INSERT OR REPLACE INTO prices(series, t_ms, price, source, inserted_at_ms)
            VALUES (?, ?, ?, ?, ?);
            """,
            rows,
        )
        return cur.rowcount if cur.rowcount is not None else len(rows)


def main():
    init_db()

    api_key = os.getenv("EIA_API_KEY", "").strip()
    if not api_key:
        raise SystemExit("Missing EIA_API_KEY env var.")

    series_id = os.getenv("EIA_HH_SERIES_ID", DEFAULT_SERIES_ID).strip()
    points = fetch_series(api_key, series_id)

    # Your app’s “series” label used everywhere else
    series_label = "HENRY_HUB_SPOT"
    n = upsert_prices(series_label, points, source=f"EIA:{series_id}")
    print(f"Upserted {n} price rows for {series_label} from {series_id}.")


if __name__ == "__main__":
    main()
