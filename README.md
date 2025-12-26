US Natural Gas Market Intelligence Dashboard
Overview

This project is a personal market-intelligence tool built to develop intuition around US natural gas price movements by directly linking news-driven events to observable price behavior.

The goal is not prediction or automation, but to answer a more fundamental question:

What types of news actually move natural gas prices, how quickly, and through which supply–demand channels?

This mirrors the way junior analysts on physical and financial energy desks build intuition: tracking balances, catalysts, and timing — day after day.

What the Tool Does

Pulls US natural gas price data (Henry Hub spot or NG futures, depending on configuration)

Ingests real-time news headlines related to US natural gas markets

Displays an interactive price chart with news events overlaid by timestamp

Categorizes headlines into fundamental drivers (e.g. storage, LNG exports, weather, outages, policy)

Computes post-event price reactions over configurable time windows (e.g. 1h, 6h, 1d)

The result is a lightweight dashboard that helps distinguish:

signal vs noise,

narrative vs fundamentals,

immediate vs delayed market reactions.

Why This Exists

Most market data platforms summarize information for you.
This tool forces manual interpretation:

Which headlines mattered?

Which didn’t?

Did the move make sense given balances and positioning?

Was price reacting to the news — or something else?

It’s designed to build market judgment, not replace it.

Key Market Drivers Tracked

Headlines are tagged into the following fundamental categories:

Storage (EIA weekly reports, inventory surprises)

LNG Exports (terminal outages, capacity changes, global demand)

Weather (HDD/CDD-driven demand shifts)

Pipeline & Production Outages

Policy & Regulation

Macro / Cross-commodity Spillovers

These categories reflect how natural gas traders and analysts typically frame the market.

Architecture (High-Level)

Backend: Python (data ingestion, processing, analytics)

Database: SQLite (time-series prices + news events)

API: Lightweight REST endpoints

Frontend: Minimal HTML/JS with TradingView Lightweight Charts

The system is intentionally simple and modular, emphasizing:

clean data pipelines,

reproducibility,

separation of ingestion, logic, and presentation.

Repository Structure
gas-market-dashboard/
├── backend/        # Data ingestion, processing, API
├── frontend/       # Chart + event overlay UI
├── data/           # Raw and processed datasets
├── scripts/        # Backfills, sanity checks
├── requirements.txt
└── README.md

How It’s Used

This tool is run daily to:

monitor price action,

review new headlines in context,

study how different catalysts affect price behavior,

build intuition around timing, magnitude, and relevance of market events.

It is not intended for automated trading or signal generation.

Disclaimer

This project is for educational and personal research purposes only.
It does not constitute trading advice, and no live trading decisions are executed using this system.



gas-market-dashboard/
│
├── README.md
├── requirements.txt
├── .env
├── .gitignore
│
├── data/
│   ├── raw/
│   ├── processed/
│   └── cache/
│
├── backend/
│   ├── main.py
│   ├── config.py
│   ├── scheduler.py
│   │
│   ├── ingestion/
│   │   ├── __init__.py
│   │   ├── prices.py
│   │   ├── news.py
│   │   └── storage.py
│   │
│   ├── processing/
│   │   ├── __init__.py
│   │   ├── tagger.py
│   │   ├── deduplicate.py
│   │   └── event_windows.py
│   │
│   ├── db/
│   │   ├── __init__.py
│   │   ├── models.py
│   │   └── database.py
│   │
│   └── api/
│       ├── __init__.py
│       ├── prices.py
│       ├── news.py
│       └── summary.py
│
├── frontend/
│   ├── index.html
│   ├── styles.css
│   ├── app.js
│   └── charts.js
│
└── scripts/
    ├── backfill_prices.py
    ├── backfill_news.py
    └── sanity_checks.py



