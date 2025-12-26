// frontend/app.js
(function () {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const rangeSelect = $("#rangeSelect");
  const markersToggle = $("#markersToggle");
  const newsList = $("#newsList");
  const newsEmpty = $("#newsEmpty");
  const statusText = $("#statusText");
  const reingestBtn = $("#reingestBtn");
  const selectAllCatsBtn = $("#selectAllCats");
  const clearAllCatsBtn = $("#clearAllCats");

  const chart = new window.GasChart("chart");

  // Global hook used by charts.js when a marker is clicked
  window.GAS_APP = {
    onEventClicked: (ev) => {
      selectNewsItem(ev);
    },
  };

  let state = {
    range: rangeSelect ? rangeSelect.value : "1M",
    selectedEventId: null,
    selectedEventTs: null,
    prices: [],
    news: [],
  };

  function setStatus(msg) {
    if (statusText) statusText.textContent = msg;
  }

  function apiPostJson(path, bodyObj) {
    return fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      cache: "no-store",
      body: JSON.stringify(bodyObj || {}),
    }).then(async (r) => {
      const txt = await r.text();
      let j = null;
      try { j = txt ? JSON.parse(txt) : null; } catch {}
      if (!r.ok) {
        const detail = (j && (j.detail || j.error)) ? (j.detail || j.error) : txt;
        throw new Error(detail || `HTTP ${r.status}`);
      }
      return j;
    });
  }

  async function apiGetJson(path) {
    const r = await fetch(path, { headers: { Accept: "application/json" }, cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status} for ${path}`);
    return await r.json();
  }

  // Back-compat mapping:
  // If DB still has POLICY, treat it as SUPPLY in the UI.
  function normalizeCategory(cat) {
    if (!cat) return "OTHER";
    if (cat === "POLICY") return "SUPPLY";
    return cat;
  }

  function getEnabledCategories() {
    // Reads whatever checkboxes exist; no hardcoding.
    const checks = $$(".filter__check");
    const enabled = new Set();
    for (const c of checks) {
      if (c && c.checked) {
        enabled.add((c.dataset.cat || "").trim());
      }
    }

    // If user enabled SUPPLY, also enable POLICY for back-compat rows (and vice versa)
    if (enabled.has("SUPPLY")) enabled.add("POLICY");
    if (enabled.has("POLICY")) enabled.add("SUPPLY");

    return enabled;
  }

  function formatTime(ts) {
    const d = new Date(ts);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${y}-${m}-${day} ${hh}:${mm}`;
  }

  function eventId(ev) {
    // Prefer backend ID
    if (ev && ev.id) return String(ev.id);
    // Fallback stable-ish ID
    return `${ev.category || "OTHER"}|${ev.t || 0}|${(ev.title || "").slice(0, 40)}`;
  }

  function renderNewsList() {
    if (!newsList) return;

    const enabled = getEnabledCategories();

    const filtered = (state.news || []).filter((ev) => enabled.has(normalizeCategory(ev.category)));

    newsList.innerHTML = "";

    if (!filtered.length) {
      if (newsEmpty) newsEmpty.hidden = false;
      return;
    }
    if (newsEmpty) newsEmpty.hidden = true;

    for (const ev of filtered) {
      const id = eventId(ev);
      const cat = normalizeCategory(ev.category);

      const li = document.createElement("li");
      li.className = "news-item";
      li.dataset.eventId = id;

      if (state.selectedEventId === id) {
        li.classList.add("news-item--selected");
      }

      li.innerHTML = `
        <div class="news-item__top">
          <span class="badge badge--${cat}">${cat}</span>
          <span class="news-time">${formatTime(ev.t)}</span>
        </div>
        <p class="news-title"></p>
        <div class="news-source"></div>
      `;

      const titleEl = li.querySelector(".news-title");
      titleEl.textContent = ev.title || "(untitled)";

      const srcEl = li.querySelector(".news-source");
      srcEl.textContent = ev.source || "";

      li.addEventListener("click", () => {
        state.selectedEventId = id;
        state.selectedEventTs = ev.t;

        // highlight list + focus chart
        highlightSelectedInList();
        chart.selectEvent(id, ev.t);

        // open link in new tab if present
        if (ev.url) window.open(ev.url, "_blank", "noopener,noreferrer");
      });

      newsList.appendChild(li);
    }
  }

  function highlightSelectedInList() {
    if (!newsList) return;

    const items = $$(".news-item");
    for (const it of items) it.classList.remove("news-item--selected");

    if (!state.selectedEventId) return;

    const sel = newsList.querySelector(`.news-item[data-event-id="${cssEscape(state.selectedEventId)}"]`);
    if (sel) {
      sel.classList.add("news-item--selected");
      // scroll selected into view near top
      sel.scrollIntoView({ block: "start", behavior: "smooth" });
    }
  }

  function selectNewsItem(ev) {
    const id = eventId(ev);
    state.selectedEventId = id;
    state.selectedEventTs = ev.t;
    renderNewsList();
    highlightSelectedInList();
  }

  async function refreshAll() {
    const r = state.range;

    setStatus("Loading…");
    try {
      const prices = await apiGetJson(`/api/prices?range=${encodeURIComponent(r)}&series=HENRY_HUB_SPOT`);
      const news = await apiGetJson(`/api/news?range=${encodeURIComponent(r)}&series=HENRY_HUB_SPOT`);

      // Normalize categories for UI consistency
      const newsNorm = (news || []).map((ev) => ({ ...ev, category: normalizeCategory(ev.category) }));

      state.prices = prices || [];
      state.news = newsNorm || [];

      chart.setData({ prices: state.prices, events: state.news });
      chart.setShowMarkers(markersToggle ? markersToggle.checked : true);

      renderNewsList();
      setStatus("Ready");
    } catch (e) {
      console.error(e);
      setStatus(`Error: ${e.message || e}`);
    }
  }

  async function onReingest() {
    setStatus("Re-ingesting…");
    try {
      const res = await apiPostJson("/api/reingest", {});
      const p = res?.prices_ingested ?? "?";
      const n = res?.news_ingested ?? "?";
      setStatus(`Re-ingested (prices: ${p}, news: ${n}). Refreshing…`);
      await refreshAll();
      setStatus("Ready");
    } catch (e) {
      console.error(e);
      setStatus(`Reingest failed: ${e.message || e}`);
    }
  }

  // ---------- Wire UI ----------
  if (rangeSelect) {
    rangeSelect.addEventListener("change", () => {
      state.range = rangeSelect.value;
      refreshAll();
    });
  }

  if (markersToggle) {
    markersToggle.addEventListener("change", () => {
      chart.setShowMarkers(markersToggle.checked);
    });
  }

  // Category filters: any change triggers rerender + chart redraw with filtered events
  $$(".filter__check").forEach((c) => {
    c.addEventListener("change", () => {
      // re-render list
      renderNewsList();

      // apply same filtering to markers
      const enabled = getEnabledCategories();
      const filteredEvents = (state.news || []).filter((ev) => enabled.has(normalizeCategory(ev.category)));
      chart.setData({ prices: state.prices, events: filteredEvents });

      highlightSelectedInList();
    });
  });

  if (selectAllCatsBtn) {
    selectAllCatsBtn.addEventListener("click", () => {
      $$(".filter__check").forEach((c) => (c.checked = true));
      // trigger rerender
      const enabled = getEnabledCategories();
      const filteredEvents = (state.news || []).filter((ev) => enabled.has(normalizeCategory(ev.category)));
      chart.setData({ prices: state.prices, events: filteredEvents });
      renderNewsList();
      highlightSelectedInList();
    });
  }

  if (clearAllCatsBtn) {
    clearAllCatsBtn.addEventListener("click", () => {
      $$(".filter__check").forEach((c) => (c.checked = false));
      chart.setData({ prices: state.prices, events: [] });
      renderNewsList();
      highlightSelectedInList();
    });
  }

  if (reingestBtn) {
    reingestBtn.addEventListener("click", onReingest);
  }

  // ---------- init ----------
  refreshAll();

  function cssEscape(s) {
    // minimal escape for attribute selector
    return String(s).replace(/"/g, '\\"');
  }
})();
