# backend/feeds.py

# Broad market feed list (free + reliable).
# You can add/remove without touching the rest of the pipeline.

FEEDS = [
    # --- EIA (authoritative energy releases) ---
    "https://www.eia.gov/rss/todayinenergy.xml",                 # Today in Energy
    "https://www.eia.gov/rss/press_rss.xml",                     # Press Releases
    "https://www.eia.gov/about/new/WNtest3.php",                 # What's New
    "https://www.eia.gov/petroleum/gasdiesel/includes/gas_diesel_rss.xml",  # Gasoline & Diesel Update
    "https://www.eia.gov/petroleum/heatingoilpropane/includes/hopu_rss.xml",# Heating Oil & Propane Update

    # --- NOAA/NHC (weather shocks that can move energy demand/logistics) ---
    "https://www.nhc.noaa.gov/gtwo.xml",                         # Graphical Tropical Weather Outlook

    # --- Google News RSS (broad market headlines) ---
    # Natural Gas / US gas market
    "https://news.google.com/rss/search?q=%22natural+gas%22+OR+%22Henry+Hub%22+OR+%22NYMEX+natural+gas%22&hl=en-US&gl=US&ceid=US:en",
]
