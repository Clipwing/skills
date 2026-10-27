/*
 * Dark Pixel kit: a dark, technical promo with one bright accent, a pixel mascot drawn from a text grid,
 * pixel-stripe shutters between sections, a browser window driven by a cursor, stepped progress bars.
 * Needs film-core.js first. Usage in index.html: window.__timelines["main"] = DarkPixel.build();
 */
(function () {
  const NS = "http://www.w3.org/2000/svg";

  // Mascots as text grids: "#" accent, "." light, "k" dark (eyes, blink with .eyes). Add your own.
  const GRIDS = {
    wing: [
      "################",
      "################",
      "##########..####",
      "#########....###",
      "#########....###",
      "##..#####....###",
      "#....###.....###",
      "#.....#......###",
      "#............###",
      "#..kk....kk..###",
      "#..kk....kk..###",
      "#............###",
      "#............###",
      "#............###",
      "################",
      "################",
    ],
  };

  // Draws every <svg class="pixel" data-grid="wing"> from its grid, once, before the timeline is built.
  function drawPixels(root) {
    root.querySelectorAll("svg.pixel[data-grid]").forEach((svg) => {
      const grid = GRIDS[svg.dataset.grid];
      if (!grid) return;
      const fill = { "#": "var(--accent)", ".": "var(--text)", k: "var(--bg)" };
      svg.setAttribute("viewBox", `0 0 ${grid[0].length} ${grid.length}`);
      const body = document.createElementNS(NS, "g"), eyes = document.createElementNS(NS, "g");
      eyes.setAttribute("class", "eyes");
      grid.forEach((row, y) => [...row].forEach((ch, x) => {
        if (!fill[ch]) return;
        const r = document.createElementNS(NS, "rect");
        r.setAttribute("x", x); r.setAttribute("y", y); r.setAttribute("width", 1.02); r.setAttribute("height", 1.02);
        r.setAttribute("fill", fill[ch]);
        (ch === "k" ? eyes : body).appendChild(r);
      }));
      svg.appendChild(body); svg.appendChild(eyes);
    });
  }

  // Stepped progress bars: <div class="blocks" data-n="12"> gets n cells; data-fx="blocks" fills them one by one.
  function drawBlocks(root) {
    root.querySelectorAll(".blocks[data-n]").forEach((b) => {
      for (let i = 0; i < +b.dataset.n; i++) b.appendChild(document.createElement("i"));
    });
  }

  // Shutter: horizontal accent stripes with a stepped pixel edge sweep across the cut as a wave, top to bottom.
  // Each stripe crosses on its own beat, so the frame is never fully covered (a full-frame flash reads as a glitch).
  function shutter(c, t) {
    const sh = c.root.querySelector("#shutter");
    const bars = Array.from(sh.children);
    c.set(sh, { opacity: 1 }, t - 0.45);
    bars.forEach((b, i) => {
      const dir = i % 2 ? 1 : -1, start = t - 0.45 + i * 0.045;
      c.from(b, { xPercent: 100 * dir }, { xPercent: 0, duration: 0.24, ease: "steps(6)" }, start);
      c.tl.to(b, { xPercent: -100 * dir, duration: 0.24, ease: "steps(6)" }, start + 0.3);
    });
    c.set(sh, { opacity: 0 }, t + 0.45);
  }

  function setup(c) {
    drawPixels(c.root);
    drawBlocks(c.root);
    const sh = c.root.querySelector("#shutter");
    for (let i = 0; i < 12; i++) sh.appendChild(document.createElement("i"));
    c.set(sh, { opacity: 0 }, 0);
  }

  function scene(c, s, at) {
    const kick = s.querySelector(".kick");
    if (kick) c.from(kick, { opacity: 0 }, { opacity: 1, duration: 0.3 }, at + 0.1);
    // A slow push on text-only scenes keeps them alive without moving the landed title itself.
    if (s.dataset.push) c.from(s.querySelector(".stage") || s, { scale: 1 }, { scale: +s.dataset.push, duration: +s.dataset.len, ease: "none" }, at);
  }

  // Hard cuts between scenes; data-in="shutter" on the next scene runs the pixel shutter over the cut.
  function transition(c, prev, next, t) {
    c.set(prev, { opacity: 0 }, t);
    if (next.dataset.in === "shutter") shutter(c, t);
  }

  // Accent words simply take the accent colour as they land.
  function mark(c, m, at) {
    c.set(m, { color: "var(--text)" }, 0);
    c.from(m, { color: "var(--text)" }, { color: "var(--accent)", duration: 0.12 }, at - 0.25);
  }

  const fx = {
    // Mascot builds itself from flying pixels.
    assemble: (c, el, at, d = 0.45) => {
      el.querySelectorAll("rect").forEach((r, i) => c.from(r,
        { x: (c.hash(i) - 0.5) * 60, y: (c.hash(i + 999) - 0.5) * 40 - 10, opacity: 0 },
        { x: 0, y: 0, opacity: 1, duration: d, ease: "power3.out" }, at + c.hash(i + 31) * 0.3));
    },
    // Mascot leaves as a dither: pixels drop out in a seeded order.
    dissolve: (c, el, at, d = 0.6) => {
      el.querySelectorAll("rect").forEach((r, i) => c.tl.to(r, { opacity: 0, duration: 0.05 }, at + c.hash(i + 7) * d));
    },
    // Two-step pixel hop.
    hop: (c, el, at) => {
      c.tl.to(el, { y: -20, duration: 0.12, ease: "steps(2)" }, at);
      c.tl.to(el, { y: 0, duration: 0.12, ease: "steps(2)" }, at + 0.14);
    },
    blink: (c, el, at) => {
      const eyes = el.querySelector(".eyes");
      c.tl.to(eyes, { scaleY: 0.12, transformOrigin: "50% 62%", duration: 0.06, ease: "none" }, at);
      c.tl.to(eyes, { scaleY: 1, duration: 0.08, ease: "none" }, at + 0.09);
    },
    // Fills the cells of a .blocks bar one at a time over d seconds.
    blocks: (c, el, at, d = 1.2) => {
      const cells = Array.from(el.children);
      c.paint((t) => cells.forEach((cell, i) => cell.classList.toggle("on", t >= at + (i + 1) * (d / cells.length))));
    },
    // A window opens: scale from 0.96 with a quick fade, no bounce.
    open: (c, el, at, d = 0.35) => c.from(el, { opacity: 0, scale: 0.96 }, { opacity: 1, scale: 1, duration: d, ease: "power3.out" }, at),
  };

  window.DarkPixel = {
    GRIDS,
    build() {
      return Film.build({ words: "rise", mark, scene, transition, fx, setup });
    },
  };
})();
