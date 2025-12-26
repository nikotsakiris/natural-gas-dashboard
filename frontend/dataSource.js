// frontend/dataSource.js
// Single abstraction layer: switch between SAMPLE and API without changing the UI.

(function () {
  const MODE = "API"; // <- change from "SAMPLE" to "API" later

  const CATS = ["STORAGE", "LNG", "WEATHER", "OUTAGES", "POLICY", "MACRO", "OTHER"];

  const SAMPLE_HEADLINES = [
    { category: "LNG", source: "Reuters", title: "Freeport LNG output declines amid operational issue" },
    { category: "WEATHER", source: "NOAA", title: "Colder-than-normal forecast lifts heating demand expectations" },
    { category: "STORAGE", source: "EIA", title: "Weekly storage report surprises vs consensus estimates" },
    { category: "OUTAGES", source: "Pipeline Notice", title: "Major pipeline maintenance reduces capacity temporarily" },
    { category: "POLICY", source: "DOE", title: "Regulatory update prompts reassessment of LNG export outlook" },
    { category: "MACRO", source: "WSJ", title: "Risk sentiment shifts across commodities amid rate expectations" },
    { category: "LNG", source: "Bloomberg", title: "European gas firm; US LNG netbacks improve" },
    { category: "OTHER", source: "Industry", title: "Producer commentary highlights basin constraints into Q1" },
    { category: "WEATHER", source: "Private Met Desk", title: "HDD forecast revision increases near-term demand risk" },
    { category: "STORAGE", source: "Analyst Note", title: "Storage tightness narrative returns as injections lag average" },
  ];

  function pad(n) { return String(n).padStart(2, "0"); }
  function fmtTime(d) { return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
  function fmtDateShort(d) { return `${d.getMonth() + 1}/${d.getDate()}`; }

  function randn() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  function generatePriceSeries({ days, pointsPerDay, startPrice }) {
    const n = days * pointsPerDay;
    const dt = (24 * 3600 * 1000) / pointsPerDay;
    const t0 = Date.now() - days * 24 * 3600 * 1000;

    const prices = [];
    let p = startPrice;

    for (let i = 0; i < n; i++) {
      const t = t0 + i * dt;

      // mean reversion + noise
      const drift = (2.75 - p) * 0.002;
      const vol = 0.015 + 0.01 * Math.sin((2 * Math.PI * i) / (pointsPerDay * 7));
      p = Math.max(1.5, p + drift + vol * randn());

      prices.push({ t: Math.floor(t), p });
    }
    return prices;
  }

  function generateEvents(prices, count) {
    if (!prices || prices.length < 2) return [];
    const tMin = prices[0].t;
    const tMax = prices[prices.length - 1].t;

    const events = [];
    for (let i = 0; i < count; i++) {
      const base = SAMPLE_HEADLINES[i % SAMPLE_HEADLINES.length];
      const t = tMin + Math.random() * (tMax - tMin);
      const d = new Date(t);

      events.push({
        id: `ev_${i}_${Math.floor(t)}`,
        t: Math.floor(t),
        category: base.category,
        source: base.source,
        title: base.title,
        url: "#",
        timeLabel: fmtTime(d),
        dateLabel: fmtDateShort(d),
      });
    }

    events.sort((a, b) => a.t - b.t);
    return events;
  }

  function rangeToDays(range) {
    return (
      range === "1D" ? 1 :
      range === "5D" ? 5 :
      range === "1M" ? 30 :
      range === "3M" ? 90 :
      range === "6M" ? 180 :
      range === "1Y" ? 365 :
      30
    );
  }

  async function apiGetJson(path) {
    const res = await fetch(path, { headers: { "Accept": "application/json" } });
    if (!res.ok) throw new Error(`API ${res.status}: ${path}`);
    return await res.json();
  }

  async function getPrices({ range, series }) {
    if (MODE === "API") {
      // later: your backend will implement this
      return await apiGetJson(`/api/prices?range=${encodeURIComponent(range)}&series=${encodeURIComponent(series)}`);
    }

    // SAMPLE
    const days = rangeToDays(range);
    const pointsPerDay = (days <= 5) ? 48 : 24;
    const startPrice = (series === "HENRY_HUB_SPOT") ? 2.55 : 2.75;
    return generatePriceSeries({ days, pointsPerDay, startPrice });
  }

  async function getNews({ range, series }) {
    if (MODE === "API") {
      // later: your backend will implement this
      return await apiGetJson(`/api/news?range=${encodeURIComponent(range)}&series=${encodeURIComponent(series)}`);
    }

    // SAMPLE: event count scales with range
    const days = rangeToDays(range);
    const prices = await getPrices({ range, series });
    const count = Math.max(10, Math.floor(days / 3));
    return generateEvents(prices, count);
  }

  window.DATA_SOURCE = {
    MODE,
    CATS,
    getPrices,
    getNews,
  };
})();
