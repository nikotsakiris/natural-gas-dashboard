# backend/db.py
from __future__ import annotations

import os
import sqlite3
from contextlib import contextmanager
from typing import Iterator, Optional

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_DB_PATH = os.path.join(REPO_ROOT, "backend", "gas_dashboard.sqlite3")


def get_db_path() -> str:
    return os.getenv("GAS_DB_PATH", DEFAULT_DB_PATH)


@contextmanager
def connect(db_path: Optional[str] = None) -> Iterator[sqlite3.Connection]:
    path = db_path or get_db_path()
    conn = sqlite3.connect(path)
    try:
        conn.row_factory = sqlite3.Row
        # A little nicer for concurrent reads/writes
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA synchronous=NORMAL;")
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    with connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS prices (
              series TEXT NOT NULL,
              t_ms   INTEGER NOT NULL,
              price  REAL NOT NULL,
              source TEXT NOT NULL,
              inserted_at_ms INTEGER NOT NULL,
              PRIMARY KEY(series, t_ms)
            );
            """
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_prices_series_t ON prices(series, t_ms);")

        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS news (
              id     TEXT PRIMARY KEY,
              series TEXT NOT NULL,
              t_ms   INTEGER NOT NULL,
              category TEXT NOT NULL,
              source TEXT NOT NULL,
              title  TEXT NOT NULL,
              url    TEXT NOT NULL,
              inserted_at_ms INTEGER NOT NULL
            );
            """
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_news_series_t ON news(series, t_ms);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_news_category ON news(category);")
