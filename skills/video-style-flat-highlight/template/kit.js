/*
 * Flat Highlight kit: bright flat scenes that wipe up from the bottom, words that jump in,
 * one accent word on a brand plate, one white UI card per scene, a running timecode.
 * Needs film-core.js first. Usage in index.html: window.__timelines["main"] = FlatHighlight.build();
 */
(function () {
  const INK = "#151517";

  // Each scene's colour (data-bg) floods up from the bottom just before the scene starts.
  function scene(c, s, at, len, i) {
    const bg = document.createElement("div");
    bg.className = "flood";
    bg.style.background = s.dataset.bg || "var(--cream)";
    c.root.querySelector("#floods").appendChild(bg);
    if (i === 0) c.set(bg, { clipPath: "inset(0% 0 0 0)" }, 0);
    else if (s.dataset.in === "whip") c.from(bg, { x: 2400, skewX: -14, filter: "blur(18px)", clipPath: "inset(0% 0 0 0)" }, { x: 0, skewX: 0, filter: "blur(0px)", duration: 0.5, ease: "power3.out" }, at - 0.15);
    else c.from(bg, { clipPath: "inset(100% 0 0 0)" }, { clipPath: "inset(0% 0 0 0)", duration: 0.45, ease: "power3.inOut" }, at - 0.1);

    // Dark scenes flip the corner labels to light.
    const dark = s.classList.contains("dark");
    c.set(c.root.querySelector("#corner"), { color: dark ? "rgba(243,241,235,0.7)" : "rgba(21,21,23,0.85)" }, at);

    // The avatar (brand mark in a white circle) hops on every scene change after it first shows.
    const av = c.root.querySelector("#avatar");
    if (av && s.dataset.avatar !== "off" && i > 0) c.tl.to(av, { keyframes: [{ scale: 1.12, duration: 0.12 }, { scale: 1, duration: 0.25, ease: "back.out(3)" }] }, at + 0.05);
    if (av) c.set(av, { opacity: s.dataset.avatar === "off" ? 0 : 1 }, at);

    const kick = s.querySelector(".kick");
    if (kick) c.from(kick, { opacity: 0 }, { opacity: 1, duration: 0.3 }, at + 0.1);
  }

  // Scene change: the old scene lifts and fades just before the next flood; "whip" smears it off to the left.
  function transition(c, prev, next, t) {
    if (next.dataset.in === "whip") {
      c.tl.to(prev, { x: -1700, filter: "blur(28px)", duration: 0.45, ease: "power3.in" }, t - 0.6);
      c.set(prev, { opacity: 0 }, t);
    } else {
      c.tl.to(prev, { opacity: 0, y: -24, duration: 0.25, ease: "power2.in" }, t - 0.25);
    }
  }

  // The accent word: plate draws left to right under it, the word turns white.
  function mark(c, m, at) {
    c.set(m, { "--plate": "inset(0 100% 0 0)", color: INK }, 0);
    c.from(m, { "--plate": "inset(0 100% 0 0)" }, { "--plate": "inset(0 0% 0 0)", duration: 0.3, ease: "power2.out" }, at);
    c.from(m, { color: INK }, { color: "#FFFFFF", duration: 0.15 }, at + 0.1);
  }

  const fx = {
    // A UI card slides in from the right with a small turn and settles.
    card: (c, el, at, d = 0.6) => c.from(el, { x: 260, rotation: 4, opacity: 0 }, { x: 0, rotation: 0, opacity: 1, duration: d, ease: "back.out(1.3)" }, at),
    // A tick or chip pops in.
    tick: (c, el, at) => c.from(el, { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.35, ease: "back.out(2.4)" }, at),
    // Cut: a removed item (pause, filler, row) fades and its width closes, so the text around it closes up.
    cut: (c, el, at, d = 0.4) => {
      const w = el.offsetWidth, cs = getComputedStyle(el);
      c.set(el, { overflow: "hidden", whiteSpace: "nowrap", verticalAlign: cs.verticalAlign }, 0);
      c.from(el, { opacity: 1, width: w, paddingLeft: cs.paddingLeft, paddingRight: cs.paddingRight, marginRight: cs.marginRight },
        { opacity: 0, width: 0, paddingLeft: 0, paddingRight: 0, marginRight: 0, borderWidth: 0, duration: d, ease: "power3.inOut" }, at);
    },
  };

  // Running timecode in the top-right corner: "<NAME> 00:00:SS:FF".
  function timecode(c) {
    const el = c.root.querySelector("#tc");
    if (!el) return;
    const name = el.dataset.name || "";
    c.paint((t) => {
      const s = Math.floor(t), f = Math.floor((t - s) * 30);
      el.textContent = name + " 00:00:" + String(s).padStart(2, "0") + ":" + String(f).padStart(2, "0");
    });
  }

  window.FlatHighlight = {
    build() {
      return Film.build({ words: "jump", mark, scene, transition, fx, setup: timecode });
    },
  };
})();
