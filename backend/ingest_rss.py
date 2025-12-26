# backend/ingest_rss.py
from __future__ import annotations

import time
import hashlib
from typing import List, Dict, Any
from urllib.parse import urlparse

import feedparser

from backend.db import connect, init_db
from backend.feeds import FEEDS

# Reuse your simple classifier if it exists, else fallback to "OTHER"
try:
    from backend.ingest_gdelt import classify  # type: ignore
except Exception:
    def classify(_: str) -> str:
        return "OTHER"


def make_id(url: str, published: str) -> str:
    h = hashlib.sha1(f"{published}|{url}".encode("utf-8")).hexdigest()
    return f"rss_{h}"


def to_ms(entry) -> int:
    # feedparser provides published_parsed/updated_parsed if available
    if getattr(entry, "published_parsed", None):
        return int(time.mktime(entry.published_parsed) * 1000)
    if getattr(entry, "updated_parsed", None):
        return int(time.mktime(entry.updated_parsed) * 1000)
    return int(time.time() * 1000)


def source_from_url(feed_url: str) -> str:
    try:
        host = urlparse(feed_url).netloc.replace("www.", "")
        return host or "RSS"
    except Exception:
        return "RSS"


def fetch_feed(feed_url: str, limit: int = 75) -> List[Dict[str, Any]]:
    d = feedparser.parse(feed_url)
    src = source_from_url(feed_url)
    out: List[Dict[str, Any]] = []

    for e in (d.entries or [])[:limit]:
        title = getattr(e, "title", "") or ""
        url = getattr(e, "link", "") or ""
        if not title or not url:
            continue

        t_ms = to_ms(e)
        published_key = str(getattr(e, "published", getattr(e, "updated", "")) or t_ms)

        out.append(
            {
                "id": make_id(url, published_key),
                "t_ms": t_ms,
                "category": classify(title),
                "source": src,
                "title": title,
                "url": url,
            }
        )

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
    if not FEEDS:
        raise SystemExit("No FEEDS configured in backend/feeds.py")

    series = "HENRY_HUB_SPOT"  # keep consistent with your frontend param
    total = 0

    for feed_url in FEEDS:
        items = fetch_feed(feed_url, limit=75)
        n = upsert_news(series, items)
        print(f"Ingested {n} items from {feed_url}")
        total += n
        time.sleep(0.5)  # be polite

    print(f"Done. Upserted total {total} items into SQLite.")


if __name__ == "__main__":
    main()
