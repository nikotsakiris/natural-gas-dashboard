// frontend/app.js
// Renders chart + news list from DATA_SOURCE (sample now, API later)

(function () {
  function nowStr() {
    return new Date().toLocaleString();
  }

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function fmtLocalDate(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  function fmtLocalTime(ts) {
    const d = new Date(ts);
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }

  function ensureLabels(ev) {
    if (!ev) return ev;
    if (ev.t && (!ev.dateLabel || !ev.timeLabel)) {
      ev.dateLabel = ev.dateLabel || fmtLocalDate(ev.t);
      ev.timeLabel = ev.timeLabel || fmtLocalTime(ev.t);
    }
    if (!ev.url) ev.url = "#";
    return ev;
  }

  function eventId(ev) {
    // Prefer backend id (best), else synthesize stable id
    if (ev && ev.id) return String(ev.id);
    return `${ev.category || "OTHER"}|${ev.t || 0}|${(ev.title || "").length}`;
  }

  function getSelectedCategories() {
    const checks = Array.from(document.querySelectorAll(".filter__check"));
    const selected = new Set();
    for (const c of checks) if (c.checked) selected.add(c.dataset.cat);
    return selected;
  }

  let SELECTED_EVENT_ID = null;

  function highlightAndScrollToTop(selectedId) {
    const wrap = document.querySelector(".news-list-wrap");
    const el = document.querySelector(`.news-item[data-evid="${CSS.escape(selectedId)}"]`);
    if (!wrap || !el) return;

    // highlight
    document.querySelectorAll(".news-item").forEach((n) => n.classList.remove("news-item--selected"));
    el.classList.add("news-item--selected");

    // scroll so selected item sits at the top of the scroll container
    // (works reliably across browsers)
    const y = el.offsetTop;
    wrap.scrollTo({ top: y, behavior: "smooth" });
  }

  function renderNewsList(events) {
    const list = document.getElementById("newsList");
    const empty = document.getElementById("newsEmpty");
    list.innerHTML = "";

    if (!events.length) {
      empty.hidden = false;
      return;
    }
    empty.hidden = true;

    for (const raw of events) {
      const ev = ensureLabels({ ...raw });
      const id = eventId(ev);

      const li = document.createElement("li");
      li.className = "news-item";
      li.dataset.evid = id;
      if (SELECTED_EVENT_ID && SELECTED_EVENT_ID === id) {
        li.classList.add("news-item--selected");
      }

      const safeUrl = ev.url && ev.url !== "#" ? ev.url : null;

      li.innerHTML = `
        <div class="news-item__top">
          <span class="badge badge--${ev.category}">${ev.category}</span>
          <span class="news-time">${ev.dateLabel} ${ev.timeLabel}</span>
        </div>
        <p class="news-title">
          ${
            safeUrl
              ? `<a href="${safeUrl}" target="_blank" rel="noreferrer" onclick="event.stopPropagation()">${ev.title}</a>`
              : `${ev.title}`
          }
        </p>
        <div class="news-source">${ev.source ?? ""}</div>
      `;

      // Click news item: select + highlight + scroll-to-top + tell chart
      li.addEventListener("click", () => {
        SELECTED_EVENT_ID = id;
        highlightAndScrollToTop(id);

        if (window.GAS_CHART) {
          // Select this marker on the chart and show stem only for selected
          if (typeof window.GAS_CHART.selectEvent === "function") {
            window.GAS_CHART.selectEvent(id, ev.t);
          } else {
            // fallback: at least focus time
            window.GAS_CHART.focusTime(ev.t);
          }
        }
      });

      list.appendChild(li);
    }
  }

  function wireButtons(refreshFn) {
    const selectAll = document.getElementById("selectAllCats");
    const clearAll = document.getElementById("clearAllCats");
    const rangeSelect = document.getElementById("rangeSelect");
    const toggleMarkers = document.getElementById("toggleMarkers");

    if (selectAll) {
      selectAll.addEventListener("click", () => {
        document.querySelectorAll(".filter__check").forEach((c) => (c.checked = true));
        refreshFn();
      });
    }

    if (clearAll) {
      clearAll.addEventListener("click", () => {
        document.querySelectorAll(".filter__check").forEach((c) => (c.checked = false));
        refreshFn();
      });
    }

    document.querySelectorAll(".filter__check").forEach((c) => c.addEventListener("change", refreshFn));

    if (toggleMarkers) {
      toggleMarkers.addEventListener("change", (e) => {
        if (window.GAS_CHART) window.GAS_CHART.setShowMarkers(e.target.checked);
      });
    }

    if (rangeSelect) rangeSelect.addEventListener("change", refreshFn);
  }

  let ALL_PRICES = [];
  let ALL_EVENTS = [];

  async function loadFromDataSource() {
    const range = document.getElementById("rangeSelect").value;
    const series = "HENRY_HUB_SPOT";

    const prices = await window.DATA_SOURCE.getPrices({ range, series });
    let events = await window.DATA_SOURCE.getNews({ range, series });

    if (prices.length >= 2) {
      const t0 = prices[0].t;
      const t1 = prices[prices.length - 1].t;
      events = (events || []).filter((e) => e.t >= t0 && e.t <= t1);
    }

    ALL_PRICES = prices || [];
    ALL_EVENTS = (events || []).map((e) => ensureLabels({ ...e }));

    document.getElementById("lastUpdated").textContent = nowStr();
    document.getElementById("instrumentLabel").textContent = "Henry Hub Spot";

    return { prices: ALL_PRICES, events: ALL_EVENTS };
  }

  function refreshView() {
    const selectedCats = getSelectedCategories();
    const filteredEvents = (ALL_EVENTS || []).filter((e) => selectedCats.has(e.category));

    renderNewsList(filteredEvents);

    if (window.GAS_CHART) {
      window.GAS_CHART.setData({ prices: ALL_PRICES, events: filteredEvents });
      window.GAS_CHART.setShowMarkers(document.getElementById("toggleMarkers").checked);
    }

    // If something is selected but got filtered out, clear highlight
    if (SELECTED_EVENT_ID) {
      const exists = filteredEvents.some((e) => eventId(e) === SELECTED_EVENT_ID);
      if (!exists) SELECTED_EVENT_ID = null;
    }
  }

  async function regenerate() {
    try {
      await loadFromDataSource();
      refreshView();
    } catch (err) {
      console.error(err);
      ALL_PRICES = [];
      ALL_EVENTS = [];
      refreshView();
    }
  }

  // Hook for chart marker clicks → highlight list + scroll to top
  window.GAS_APP = {
    onEventClicked: (ev) => {
      const id = eventId(ev);
      SELECTED_EVENT_ID = id;
      highlightAndScrollToTop(id);
    },
  };

  window.addEventListener("load", () => {
    window.GAS_CHART = new window.GasChart("chart");
    wireButtons(regenerate);
    regenerate();
  });
})();
