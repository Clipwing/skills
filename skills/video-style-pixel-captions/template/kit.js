/*
 * Pixel Captions kit: a vertical film where the captions are the hero. One phrase at a time in the lower third,
 * words light up from grey as they are said, one word sits on an accent plate. Above, a tiny pixel scene acts
 * the phrase out. Plot turns flip the whole background.
 * Needs film-core.js first. Usage in index.html: window.__timelines["main"] = PixelCaptions.build();
 */
(function () {
  const NS = "http://www.w3.org/2000/svg";
  // Mascot grids: "#" accent, "." light, "k" dark (eyes). Draw your own brand's mascot the same way.
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

  function drawPixels(root) {
    root.querySelectorAll("svg.pixel[data-grid]").forEach((svg) => {
      const grid = GRIDS[svg.dataset.grid];
      if (!grid) return;
      const w = Math.max(...grid.map((r) => r.length));
      const fill = { "#": "var(--accent)", ".": "#fff", k: "#111" };
      svg.setAttribute("viewBox", `0 0 ${w} ${grid.length}`);
      grid.forEach((row, y) => [...row].forEach((ch, x) => {
        if (!fill[ch]) return;
        const r = document.createElementNS(NS, "rect");
        r.setAttribute("x", x); r.setAttribute("y", y); r.setAttribute("width", 1.02); r.setAttribute("height", 1.02);
        r.setAttribute("fill", fill[ch]);
        svg.appendChild(r);
      }));
    });
  }

  // Background turns: each scene may set data-bg; the ground crossfades to it in 0.3 s (never through white).
  function scene(c, s, at, len, i) {
    const ground = c.root.querySelector("#turns");
    const layer = document.createElement("div");
    layer.className = "turn";
    // A scene without data-bg goes back to the pastel ground, painted as a layer of its own.
    layer.style.background = s.dataset.bg || "var(--ground)";
    ground.appendChild(layer);
    if (i === 0) c.set(layer, { opacity: 1 }, 0);
    else c.from(layer, { opacity: 0 }, { opacity: 1, duration: 0.3, ease: "power2.inOut" }, at - 0.15);
    // Captions switch colour on dark turns.
    s.classList.toggle("on-dark", s.dataset.ink === "light");
  }

  // Scenes flow: the outgoing scene's props slide away while the next arrive; the caption swaps phrase in place.
  function transition(c, prev, next, t) {
    const stage = prev.querySelector(".stage");
    if (stage) c.tl.to(stage, { x: -160, opacity: 0, duration: 0.3, ease: "power3.in" }, t - 0.3);
    const cap = prev.querySelector(".cap");
    if (cap) c.set(cap, { opacity: 0 }, t);
    c.set(prev, { opacity: 0 }, t);
  }

  const fx = {
    // The caption: the whole phrase is there at once in grey, each word turns ink on its beat, the <mark> word
    // gets the accent plate on its beat. data-beats="0.2,0.45,..." gives each word's time; else data-step apart.
    karaoke: (c, el, at) => {
      const ws = c.splitWords(el);
      const beats = el.dataset.beats ? el.dataset.beats.split(",").map(Number) : null;
      const step = +(el.dataset.step || 0.3);
      c.from(el, { opacity: 0 }, { opacity: 1, duration: 0.12 }, at);
      ws.forEach((w, i) => {
        const t = at + (beats ? beats[i] : i * step);
        c.paint((now) => w.classList.toggle("said", now >= t));
      });
    },
    // A stamp slams in: from 1.6× with a −6° turn, one short shake.
    stamp: (c, el, at) => {
      c.from(el, { scale: 1.6, rotation: -14, opacity: 0 }, { scale: 1, rotation: -6, opacity: 1, duration: 0.22, ease: "power4.in" }, at);
      c.tl.to(el, { keyframes: [{ x: -8, duration: 0.04 }, { x: 8, duration: 0.04 }, { x: 0, duration: 0.05 }] }, at + 0.22);
    },
    // Copies of the mascot appear in a wave: children of the element pop in 0.04 s apart.
    crowd: (c, el, at) => Array.from(el.children).forEach((k, i) => c.from(k, { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, ease: "back.out(1.6)" }, at + i * 0.04)),
    // Props drift in from the right and settle: the scene "flows" in rather than cutting.
    enter: (c, el, at, d = 0.5) => c.from(el, { x: 220, opacity: 0 }, { x: 0, opacity: 1, duration: d, ease: "expo.out" }, at),
    hop: (c, el, at) => {
      c.tl.to(el, { y: -26, duration: 0.14, ease: "steps(2)" }, at);
      c.tl.to(el, { y: 0, duration: 0.14, ease: "steps(2)" }, at + 0.16);
    },
    // Swap: children take turns being visible, one every data-every seconds (a style picker cycling).
    cycle: (c, el, at) => {
      const kids = Array.from(el.children), every = +(el.dataset.every || 0.8);
      c.paint((t) => {
        const k = t < at ? 0 : Math.min(kids.length - 1, Math.floor((t - at) / every));
        kids.forEach((n, i) => { n.style.opacity = i === k ? 1 : 0; });
      });
    },
  };

  window.PixelCaptions = {
    GRIDS,
    build() {
      return Film.build({ scene, transition, fx, setup: (c) => drawPixels(c.root) });
    },
  };
})();
