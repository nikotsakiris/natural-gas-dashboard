# backend/ingest_gdelt.py
from __future__ import annotations

import time
import hashlib
import random
import requests
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Any

from backend.db import connect, init_db

GDELT_DOC = "https://api.gdeltproject.org/api/v2/doc/doc"

KEYWORDS_BY_CAT = {
    "STORAGE": ["storage", "eia storage", "injection"],
    "LNG": ["lng", "liquefied", "natural gas export"],
    "WEATHER": ["cold", "heat","winter storm","hurricane","freeze","arctic","polar vortex"],
    "OUTAGES": ["pipeline", "maintenance", "outage", "capacity", "force majeure"],
    "SUPPLY": ["production","output","dry gas","lower 48","associated gas","marcellus","utica","haynesville","permian","eagle ford","rig count","gas rig","drilling","completion","frac spread","shut-in","takeaway capacity","pipeline constraint","flaring","breakeven"],
    "MACRO": ["rates", "inflation", "dollar", "risk-off", "recession"]
}


def classify(title: str) -> str:
    t = title.lower()
    for cat, kws in KEYWORDS_BY_CAT.items():
        for kw in kws:
            if kw in t:
                return cat
    return "OTHER"


def _hash_id(url: str, published: str) -> str:
    h = hashlib.sha1(f"{published}|{url}".encode("utf-8")).hexdigest()
    return f"gdelt_{h}"


def _gdelt_request(params: Dict[str, str], max_retries: int = 10) -> Dict[str, Any]:
    """
    Polite GDELT requester:
    - retries on 429/5xx
    - retries if body is not valid JSON (even if HTTP 200)
    - respects Retry-After if present
    - exponential backoff + jitter
    """
    headers = {
        "User-Agent": "Gas-News-Price-Tracker/0.1 (personal project)",
        "Accept": "application/json",
    }

    for attempt in range(max_retries):
        r = requests.get(GDELT_DOC, params=params, headers=headers, timeout=30)

        # Retry on obvious retry codes
        if r.status_code in (429, 500, 502, 503, 504):
            retry_after = r.headers.get("Retry-After")
            sleep_s = float(retry_after) if retry_after else min(60.0, (2 ** attempt)) + random.random()
            print(f"[GDELT] HTTP {r.status_code}. Sleeping {sleep_s:.1f}s then retrying... (attempt {attempt+1}/{max_retries})")
            time.sleep(sleep_s)
            continue

        # For other non-200, fail fast with a preview
        if r.status_code != 200:
            preview = (r.text or "")[:200].replace("\n", " ")
            raise requests.HTTPError(f"GDELT HTTP {r.status_code}: {preview}", response=r)

        # HTTP 200: try JSON, but handle non-JSON bodies (common during syntax errors / throttling)
        try:
            return r.json()
        except Exception:
            ctype = r.headers.get("Content-Type", "")
            preview = (r.text or "")[:220].replace("\n", " ").strip()
            print(f"[GDELT] 200 but non-JSON (Content-Type={ctype!r}). Preview: {preview!r}")

            # Treat as retryable, but this also helps surface query syntax errors as the preview
            sleep_s = min(60.0, (2 ** attempt)) + random.random()
            print(f"[GDELT] Sleeping {sleep_s:.1f}s then retrying... (attempt {attempt+1}/{max_retries})")
            time.sleep(sleep_s)
            continue

    raise requests.HTTPError("GDELT: exceeded max retries due to non-JSON / throttling responses.")


def fetch_news(hours_back: int = 24, maxrecords: int = 25) -> List[Dict[str, Any]]:
    """
    Fetch recent US natural gas-related headlines via GDELT DOC 2.0.

    IMPORTANT: GDELT's parser is picky about parentheses. This query avoids parentheses entirely.
    """
    # Expanded query with NO parentheses to avoid:
    # "Parentheses may only be used around OR'd statements."
    query = 'natural gas'


    start = (datetime.now(timezone.utc) - timedelta(hours=hours_back)).strftime("%Y%m%d%H%M%S")

    params = {
        "query": query,
        "mode": "ArtList",
        "format": "json",
        "maxrecords": str(maxrecords),
        "startdatetime": start,
        "sort": "hybridrel",
    }

    j = _gdelt_request(params)
    arts = j.get("articles", []) if isinstance(j, dict) else []

    out: List[Dict[str, Any]] = []
    for a in arts:
        title = a.get("title") or ""
        url = a.get("url") or ""
        source = a.get("sourceCountry") or a.get("sourceCollection") or a.get("source") or "GDELT"
        seendate = a.get("seendate") or a.get("datetime") or ""

        if not title or not url or not seendate:
            continue

        # seendate is usually "YYYYMMDDHHMMSS"
        try:
            dt = datetime.strptime(seendate, "%Y%m%d%H%M%S").replace(tzinfo=timezone.utc)
            t_ms = int(dt.timestamp() * 1000)
        except Exception:
            continue

        out.append(
            {
                "id": _hash_id(url, seendate),
                "t_ms": t_ms,
                "category": classify(title),
                "source": str(source),
                "title": title,
                "url": url,
            }
        )

    out.sort(key=lambda x: x["t_ms"])
    return out


def upsert_news(series: str, items: List[Dict[str, Any]]) -> int:
    now_ms = int(time.time() * 1000)
    rows = [
        (it["id"], series, it["t_ms"], it["category"], it["source"], it["title"], it["url"], now_ms)
        for it in items
    ]
    with connect() as conn:
        cur = conn.executemany(
            """
            INSERT OR REPLACE INTO news(id, series, t_ms, category, source, title, url, inserted_at_ms)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?);
            """,
            rows,
        )
        return cur.rowcount if cur.rowcount is not None else len(rows)


def main():
    init_db()

    # Attach news to the “series” label your UI queries
    series = "NG_FUTURES"

    items = fetch_news(hours_back=24, maxrecords=25)
    n = upsert_news(series, items)
    print(f"Upserted {n} news items for {series}.")


if __name__ == "__main__":
    main()
