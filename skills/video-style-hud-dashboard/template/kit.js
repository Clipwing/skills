/*
 * HUD Dashboard kit: the whole frame is a live control panel that never cuts. Counters roll, a log grows,
 * a point sphere turns and lights up nodes one by one. Scenes only change the small callout at the top;
 * the panels are persistent layers with absolute times.
 * Needs film-core.js first. Usage in index.html: window.__timelines["main"] = HudDashboard.build();
 */
(function () {
  // The sphere: <canvas class="sphere" data-points="2400" data-nodes='[[t, "LABEL"], ...]'>.
  // Points are a Fibonacci sphere (deterministic); each node lights at its time with a line from the hub and a label.
  function sphere(c, cv) {
    const g = cv.getContext("2d");
    const W = cv.width, H = cv.height, CX = W / 2, CY = H / 2, R = Math.min(W, H) * 0.4;
    const N = +(cv.dataset.points || 2400), P = [];
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y), th = i * 2.399963;
      const wob = 1 + 0.04 * Math.sin(i * 0.37) * Math.cos(i * 0.11);
      P.push([Math.cos(th) * r * wob, y * wob, Math.sin(th) * r * wob]);
    }
    const nodes = c.json(cv.dataset.nodes, []).map(([t, label], k) => ({ t, label, i: (k * 397 + 911) % N }));
    const spin = +(cv.dataset.spin || 0.12); // radians a second: 5-8 degrees, slow and constant
    const css = getComputedStyle(c.root);
    const accent = css.getPropertyValue("--accent").trim() || "#e85400";
    const glow = css.getPropertyValue("--glow").trim() || "#ffb070";
    const proj = (p, a) => {
      const ca = Math.cos(a), sa = Math.sin(a), el = 0.28, ce = Math.cos(el), se = Math.sin(el);
      const x = p[0] * ca - p[2] * sa; let z = p[0] * sa + p[2] * ca;
      const y2 = p[1] * ce - z * se; z = p[1] * se + z * ce;
      const f = 2.6 / (2.6 + z);
      return [CX + x * R * f, CY + y2 * R * f, z];
    };
    c.paint((t) => {
      const a = 0.4 + t * spin;
      g.clearRect(0, 0, W, H);
      for (let i = 0; i < N; i++) {
        const [x, y, z] = proj(P[i], a);
        g.fillStyle = `rgba(220,220,220,${(0.08 + ((1 - z) / 2) * 0.5).toFixed(3)})`;
        g.fillRect(x, y, 2.4, 2.4);
      }
      g.font = "600 26px 'Geist Mono', monospace";
      nodes.forEach((n) => {
        if (t < n.t) return;
        const k = Math.min(1, (t - n.t) / 0.4);
        const [x, y, z] = proj(P[n.i], a);
        g.globalAlpha = k * (z > 0.35 ? 0.35 : 1);
        g.strokeStyle = accent; g.lineWidth = 2;
        g.beginPath(); g.moveTo(CX, CY); g.lineTo(CX + (x - CX) * k, CY + (y - CY) * k); g.stroke();
        g.fillStyle = glow; g.beginPath(); g.arc(x, y, 6, 0, Math.PI * 2); g.fill();
        const w = g.measureText(n.label).width + 20;
        g.fillStyle = accent; g.fillRect(x + 12, y - 34, w, 36);
        g.fillStyle = "#0a0a0a"; g.fillText(n.label, x + 22, y - 8);
        g.globalAlpha = 1;
      });
      g.strokeStyle = accent; g.lineWidth = 3; g.strokeRect(CX - 14, CY - 14, 28, 28);
    });
  }

  const fx = {
    // A log: children are lines with data-at (absolute or scene-relative like the log itself); each appears on time,
    // and the list scrolls up so the newest line stays at the bottom of a box that shows data-rows lines.
    log: (c, el, at) => {
      const lines = Array.from(el.children), rows = +(el.dataset.rows || 5);
      const lh = lines[0] ? lines[0].offsetHeight : 40;
      c.paint((t) => {
        let shown = 0;
        lines.forEach((ln) => { if (t >= at + +(ln.dataset.at || 0)) shown++; });
        // Only the last `rows` lines that have appeared are visible; older ones have scrolled out of the box.
        lines.forEach((ln, i) => { ln.style.opacity = i < shown && i >= shown - rows ? 1 : 0; });
        el.style.transform = `translateY(${-Math.max(0, shown - rows) * lh}px)`;
      });
    },
    // Bars: children grow to their data-v (0-100) at data-at each (relative to the effect's time).
    bars: (c, el, at) => Array.from(el.children).forEach((b) => {
      c.set(b, { transformOrigin: "50% 100%" }, 0);
      c.from(b, { scaleY: 0 }, { scaleY: +(b.dataset.v || 100) / 100, duration: 0.5, ease: "power2.out" }, at + +(b.dataset.at || 0));
    }),
    // Tally: shows how many of the moments in data-ticks="1.2,2.4,..." (relative to the effect's time) have passed.
    // Use it for counts that must match events on screen (languages done, runs, files), where a smooth count lies.
    tally: (c, el, at) => {
      const ticks = el.dataset.ticks.split(",").map(Number), pre = el.dataset.pre || "", suf = el.dataset.suf || "";
      c.paint((t) => { el.textContent = pre + ticks.filter((k) => t >= at + k).length + suf; });
    },
    // Swap: of the children, the last one whose data-at (relative) has passed is shown; the rest are hidden.
    swap: (c, el, at) => {
      const kids = Array.from(el.children);
      c.paint((t) => {
        let cur = -1;
        kids.forEach((k, i) => { if (t >= at + +(k.dataset.at || 0)) cur = i; });
        kids.forEach((k, i) => { k.style.opacity = i === cur ? 1 : 0; });
      });
    },
    // Dim: the dashboard steps back for an end card (opacity down to data-to, default 0.12). Never cover it with a veil.
    dim: (c, el, at, d = 0.5) => c.from(el, { opacity: 1 }, { opacity: +(el.dataset.to || 0.12), duration: d, ease: "power2.inOut" }, at),
    // Flash: a value or panel lights up briefly when it changes (accent glow), then settles.
    flash: (c, el, at) => c.tl.to(el, { keyframes: [{ boxShadow: "0 0 0 2px var(--accent)", duration: 0.08 }, { boxShadow: "0 0 0 0px var(--accent)", duration: 0.5 }] }, at),
  };

  function setup(c) {
    c.root.querySelectorAll("canvas.sphere").forEach((cv) => sphere(c, cv));
  }

  // The callout at the top swaps in place; the dashboard never cuts.
  function transition(c, prev, next, t) {
    c.tl.to(prev, { opacity: 0, filter: "blur(6px)", duration: 0.18, ease: "power2.in" }, t - 0.18);
  }

  function mark(c, m, at) {
    c.set(m, { color: "var(--text)" }, 0);
    c.from(m, { color: "var(--text)" }, { color: "var(--accent)", duration: 0.12 }, at - 0.2);
  }

  window.HudDashboard = {
    build() {
      return Film.build({ words: "blur", mark, transition, fx, setup });
    },
  };
})();
