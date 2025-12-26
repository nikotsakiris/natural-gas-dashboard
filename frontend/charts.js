// frontend/charts.js
// Minimal SVG time-series chart with event markers + tooltip (no external libs)

(function () {
  function getCssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#ccc";
  }

  const CATEGORY_COLORS = {
    STORAGE: getCssVar("--c-storage"),
    LNG: getCssVar("--c-lng"),
    WEATHER: getCssVar("--c-weather"),
    OUTAGES: getCssVar("--c-outages"),
    SUPPLY: getCssVar("--c-supply"),

    // Back-compat: if older rows still say POLICY, render them with the same color.
    POLICY: getCssVar("--c-supply"),

    MACRO: getCssVar("--c-macro"),
    OTHER: getCssVar("--c-other"),
    PRICE: "rgba(91,214,255,0.95)",
  };

  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  function clamp(x, a, b) {
    return Math.max(a, Math.min(b, x));
  }

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function fmtDate(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }

  function createEl(tag, attrs = {}) {
    const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    return el;
  }

  class GasChart {
    constructor(containerId) {
      this.container = document.getElementById(containerId);
      if (!this.container) throw new Error(`Chart container #${containerId} not found`);

      this.tooltip = document.createElement("div");
      this.tooltip.className = "tooltip";
      this.container.appendChild(this.tooltip);

      this.state = {
        prices: [],
        events: [],
        showMarkers: true,
      };

      this._focusTs = null;
      this._selectedEventId = null;

      window.addEventListener("resize", () => this.render());
    }

    setData({ prices, events }) {
      this.state.prices = prices || [];
      this.state.events = events || [];
      this.render();
    }

    setShowMarkers(show) {
      this.state.showMarkers = !!show;
      this.render();
    }

    focusTime(tsMs) {
      this._focusTs = tsMs;
      this.render();
    }

    // Optional API used by app.js (if present)
    selectEvent(eventId, tsMs) {
      this._selectedEventId = eventId != null ? String(eventId) : null;
      this._focusTs = tsMs != null ? tsMs : null;
      this.render();
    }

    _eventId(ev) {
      // Prefer a stable id from backend; otherwise synthesize one
      if (ev && ev.id) return String(ev.id);
      return `${ev.category || "OTHER"}|${ev.t || 0}|${hash(ev.title || "")}`;
    }

    render() {
      const { prices, events, showMarkers } = this.state;

      this.container.querySelectorAll("svg").forEach((n) => n.remove());
      this.tooltip.classList.remove("tooltip--show");

      const w = this.container.clientWidth;
      const h = this.container.clientHeight;
      if (w < 200 || h < 200 || prices.length < 2) return;

      const padL = 46, padR = 18, padT = 16, padB = 34;
      const innerW = w - padL - padR;
      const innerH = h - padT - padB;

      const times = prices.map(p => p.t);
      const vals = prices.map(p => p.p);

      const tMin = Math.min(...times);
      const tMax = Math.max(...times);

      const vMin0 = Math.min(...vals);
      const vMax0 = Math.max(...vals);
      const vPad = (vMax0 - vMin0) * 0.08 || 0.1;
      const vMin = vMin0 - vPad;
      const vMax = vMax0 + vPad;

      const x = (t) => padL + ((t - tMin) / (tMax - tMin)) * innerW;
      const y = (v) => padT + (1 - (v - vMin) / (vMax - vMin)) * innerH;

      const svg = createEl("svg", {
        viewBox: `0 0 ${w} ${h}`,
        preserveAspectRatio: "none",
      });
      this.container.appendChild(svg);

      const grid = createEl("g", { class: "grid" });
      const axis = createEl("g", { class: "axis" });

      // ----- Y AXIS -----
      const yTicks = 5;
      for (let i = 0; i <= yTicks; i++) {
        const frac = i / yTicks;
        const yy = padT + frac * innerH;
        grid.appendChild(createEl("line", { x1: padL, y1: yy, x2: w - padR, y2: yy }));

        const vTick = (vMax - frac * (vMax - vMin)).toFixed(2);
        const txt = createEl("text", { x: padL - 8, y: yy + 4, "text-anchor": "end" });
        txt.textContent = vTick;
        axis.appendChild(txt);
      }

      // ----- X AXIS: MONTHLY GRID + LABELS -----
      let cursor = new Date(new Date(tMin).getFullYear(), new Date(tMin).getMonth(), 1);
      if (cursor.getTime() < tMin) cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);

      while (cursor.getTime() <= tMax) {
        const ms = cursor.getTime();
        const xx = x(ms);

        grid.appendChild(createEl("line", {
          x1: xx, y1: padT, x2: xx, y2: h - padB
        }));

        const txt = createEl("text", {
          x: xx + 2,
          y: h - 12,
          "text-anchor": "start"
        });
        txt.textContent = MONTHS[cursor.getMonth()];
        axis.appendChild(txt);

        cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
      }

      svg.appendChild(grid);
      svg.appendChild(axis);

      // Y-axis unit label
      const yUnit = createEl("text", {
        x: padL + 10,
        y: padT + 40,
        "text-anchor": "end",
        "font-size": "11",
        fill: "rgba(230,237,246,0.55)"
      });
      yUnit.textContent = "$/MMBtu";
      svg.appendChild(yUnit);

      // ----- PRICE LINE + AREA -----
      let d = "";
      for (let i = 0; i < prices.length; i++) {
        const px = x(prices[i].t);
        const py = y(prices[i].p);
        d += (i === 0 ? "M" : "L") + px + " " + py + " ";
      }

      const areaD = `${d} L ${x(prices.at(-1).t)} ${padT + innerH} L ${x(prices[0].t)} ${padT + innerH} Z`;

      svg.appendChild(createEl("path", { d: areaD, class: "price-area" }));
      svg.appendChild(createEl("path", { d, class: "price-line" }));

      // ----- FOCUS LINE (optional) -----
      if (this._focusTs != null) {
        const fx = x(clamp(this._focusTs, tMin, tMax));
        svg.appendChild(createEl("line", {
          x1: fx, y1: padT, x2: fx, y2: padT + innerH,
          stroke: "rgba(255,255,255,0.25)",
          "stroke-dasharray": "4 4"
        }));
      }

      // ----- EVENT MARKERS ON PRICE LINE -----
      if (showMarkers && events?.length) {
        const markerLayer = createEl("g", { class: "markers" });

        for (const ev of events) {
          const idx = nearestIndex(times, ev.t);
          const p = prices[idx];
          if (!p) continue;

          const ex = x(ev.t);
          const ey = y(p.p);

          const id = this._eventId(ev);
          const isSelected = this._selectedEventId === id;

          const color = CATEGORY_COLORS[ev.category] || CATEGORY_COLORS.OTHER;

          const g = createEl("g", { class: "marker" });

          if (isSelected) {
            g.appendChild(createEl("line", {
              x1: ex, y1: ey + 7,
              x2: ex, y2: padT + innerH,
              stroke: "rgba(255,255,255,0.18)",
              "stroke-dasharray": "3 4"
            }));
          }

          const c = createEl("circle", {
            cx: ex,
            cy: ey,
            r: isSelected ? 7 : 6,
            fill: color,
            "fill-opacity": "0.95",
            stroke: isSelected ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.25)",
            "stroke-width": isSelected ? 2 : 1
          });

          g.appendChild(c);

          g.addEventListener("mouseenter", () => this.showTooltip(ev, ex, ey));
          g.addEventListener("mousemove", (e) => this.moveTooltip(e));
          g.addEventListener("mouseleave", () => this.hideTooltip());

          g.addEventListener("click", (e) => {
            e.stopPropagation();
            this._selectedEventId = id;
            this._focusTs = ev.t;
            if (window.GAS_APP && typeof window.GAS_APP.onEventClicked === "function") {
              window.GAS_APP.onEventClicked(ev);
            }
            this.render();
          });

          markerLayer.appendChild(g);
        }

        svg.appendChild(markerLayer);

        svg.addEventListener("click", () => {
          this._selectedEventId = null;
          this._focusTs = null;
          this.render();
        });
      }

      // ----- PRICE HOVER -----
      svg.addEventListener("mousemove", (e) => {
        const rect = this.container.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const tGuess = tMin + ((mx - padL) / innerW) * (tMax - tMin);
        const idx = nearestIndex(times, tGuess);
        const p = prices[idx];
        if (!p) return;

        this.showTooltip(
          { title: `Price: ${p.p.toFixed(3)}`, source: "Henry Hub", category: "PRICE", t: p.t },
          x(p.t),
          y(p.p)
        );
        this.moveTooltip(e);
      });

      svg.addEventListener("mouseleave", () => this.hideTooltip());
    }

    showTooltip(ev, xPx, yPx) {
      this.tooltip.innerHTML = `
        <div class="tooltip__title">${escapeHtml(ev.title)}</div>
        <div class="tooltip__meta">${escapeHtml(ev.category)} • ${escapeHtml(ev.source)} • ${fmtDate(new Date(ev.t))}</div>
      `;
      this.tooltip.classList.add("tooltip--show");
      this.tooltip.style.left = `${xPx + 14}px`;
      this.tooltip.style.top = `${yPx + 14}px`;
    }

    moveTooltip(e) {
      const rect = this.container.getBoundingClientRect();
      this.tooltip.style.left = `${clamp(e.clientX - rect.left + 14, 10, this.container.clientWidth - 20)}px`;
      this.tooltip.style.top = `${clamp(e.clientY - rect.top + 14, 10, this.container.clientHeight - 20)}px`;
    }

    hideTooltip() {
      this.tooltip.classList.remove("tooltip--show");
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, m => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
    }[m]));
  }

  function nearestIndex(arr, x) {
    let lo = 0, hi = arr.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (arr[mid] < x) lo = mid; else hi = mid;
    }
    return Math.abs(arr[lo] - x) <= Math.abs(arr[hi] - x) ? lo : hi;
  }

  function hash(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h;
  }

  window.GasChart = GasChart;
})();
