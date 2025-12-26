# backend/sample_data.py
from __future__ import annotations

import math
import random
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import List, Dict, Any


SAMPLE_HEADLINES = [
    {"category": "LNG", "source": "Reuters", "title": "Freeport LNG output declines amid operational issue"},
    {"category": "WEATHER", "source": "NOAA", "title": "Colder-than-normal forecast lifts heating demand expectations"},
    {"category": "STORAGE", "source": "EIA", "title": "Weekly storage report surprises vs consensus estimates"},
    {"category": "OUTAGES", "source": "Pipeline Notice", "title": "Major pipeline maintenance reduces capacity temporarily"},
    {"category": "POLICY", "source": "DOE", "title": "Regulatory update prompts reassessment of LNG export outlook"},
    {"category": "MACRO", "source": "WSJ", "title": "Risk sentiment shifts across commodities amid rate expectations"},
    {"category": "LNG", "source": "Bloomberg", "title": "European gas firm; US LNG netbacks improve"},
    {"category": "OTHER", "source": "Industry", "title": "Producer commentary highlights basin constraints into Q1"},
    {"category": "WEATHER", "source": "Private Met Desk", "title": "HDD forecast revision increases near-term demand risk"},
    {"category": "STORAGE", "source": "Analyst Note", "title": "Storage tightness narrative returns as injections lag average"},
]


def range_to_days(rng: str) -> int:
    return {
        "1D": 1,
        "5D": 5,
        "1M": 30,
        "3M": 90,
        "6M": 180,
        "1Y": 365,
    }.get(rng, 30)


def fmt_time_label(ts_ms: int) -> str:
    d = datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc).astimezone()
    return f"{d.hour:02d}:{d.minute:02d}"


def fmt_date_label(ts_ms: int) -> str:
    d = datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc).astimezone()
    return f"{d.month}/{d.day}"


def randn() -> float:
    # Box–Muller
    u = 0.0
    v = 0.0
    while u == 0.0:
        u = random.random()
    while v == 0.0:
        v = random.random()
    return math.sqrt(-2.0 * math.log(u)) * math.cos(2.0 * math.pi * v)


def generate_prices(range_: str, series: str) -> List[Dict[str, Any]]:
    days = range_to_days(range_)
    points_per_day = 48 if days <= 5 else 24
    start_price = 2.55 if series == "HENRY_HUB_SPOT" else 2.75

    n = days * points_per_day
    dt_ms = int((24 * 3600 * 1000) / points_per_day)
    t0_ms = int(time.time() * 1000) - days * 24 * 3600 * 1000

    p = start_price
    out = []
    for i in range(n):
        t = t0_ms + i * dt_ms
        drift = (2.75 - p) * 0.002
        vol = 0.015 + 0.01 * math.sin((2 * math.pi * i) / (points_per_day * 7))
        p = max(1.5, p + drift + vol * randn())
        out.append({"t": int(t), "p": float(p)})

    return out


def generate_news(range_: str, series: str, prices: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    days = range_to_days(range_)
    count = max(10, days // 3)

    if not prices or len(prices) < 2:
        return []

    t_min = prices[0]["t"]
    t_max = prices[-1]["t"]

    events = []
    for i in range(count):
        base = SAMPLE_HEADLINES[i % len(SAMPLE_HEADLINES)]
        t = int(t_min + random.random() * (t_max - t_min))
        events.append(
            {
                "id": f"ev_{i}_{t}",
                "t": t,
                "category": base["category"],
                "source": base["source"],
                "title": base["title"],
                "url": "#",
                "timeLabel": fmt_time_label(t),
                "dateLabel": fmt_date_label(t),
            }
        )

    events.sort(key=lambda e: e["t"])
    return events
