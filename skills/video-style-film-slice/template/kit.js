/*
 * Film Slice kit: one metaphor told in 3D. A long video is a film strip lying in perspective; a selection
 * frames a piece of it; the piece lifts off the strip and lands in front of the viewer as a finished clip.
 * Needs film-core.js first. Usage in index.html: window.__timelines["main"] = FilmSlice.build();
 *
 * The strip is a persistent layer (outside the scenes), so its times are absolute film seconds.
 */
(function () {
  // Fills every .strip[data-frames] with drawn frames: a hue per shot (shots change every few frames),
  // a speaker silhouette, and a timecode above each frame. No real footage needed.
  function drawStrip(root) {
    root.querySelectorAll(".strip[data-frames]").forEach((strip) => {
      const n = +strip.dataset.frames, start = +(strip.dataset.start || 0), step = +(strip.dataset.step || 6);
      const hues = (strip.dataset.hues || "232,262,200,18,160,330").split(",").map(Number);
      const keep = new Set((strip.dataset.keep || "").split(",").filter(Boolean).map(Number));
      const frames = [];
      for (let i = 0; i < n; i++) {
        const shot = Math.floor(i / 3);
        const h = hues[shot % hues.length];
        const f = document.createElement("div");
        f.className = "fr";
        f.style.setProperty("--i", i);
        f.style.background = `linear-gradient(${120 + Film.hash(shot) * 60}deg, hsl(${h} 45% 22%), hsl(${h} 60% 48%))`;
        f.style.setProperty("--sx", (38 + Film.hash(shot + 9) * 24).toFixed(1) + "%");
        const tc = document.createElement("span");
        tc.className = "tcl";
        const s = start + i * step;
        tc.textContent = Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
        f.appendChild(tc);
        if (keep.has(i)) f.classList.add("keep");
        strip.insertBefore(f, strip.firstChild);
        frames.push(f);
      }
      // Each selection (.seg with --from and --len) carries bright copies of the frames it covers, so it can lift off.
      strip.querySelectorAll(".seg").forEach((seg) => {
        const from = +getComputedStyle(seg).getPropertyValue("--from"), len = +getComputedStyle(seg).getPropertyValue("--len");
        for (let i = from; i < from + len; i++) {
          const copy = frames[i].cloneNode(true);
          copy.style.setProperty("--i", i - from);
          seg.insertBefore(copy, seg.firstChild);
        }
      });
    });
  }

  const fx = {
    // The strip slides in from the right and keeps drifting left slowly until data-out.
    "strip-in": (c, el, at, d = 1.4) => {
      c.from(el, { x: 1600, opacity: 0 }, { x: 0, opacity: 1, duration: d, ease: "expo.out" }, at);
      const until = el.dataset.out != null ? +el.dataset.out : c.end || 30;
      c.tl.to(el, { x: -+(el.dataset.drift || 160), duration: Math.max(0.1, until - at - d), ease: "none" }, at + d);
    },
    // A selection over frames: the frame draws from the left, its tag pops, and the frames outside dim.
    select: (c, el, at, d = 0.45) => {
      c.set(el, { transformOrigin: "0% 50%" }, 0);
      c.from(el, { scaleX: 0, opacity: 0 }, { scaleX: 1, opacity: 1, duration: d, ease: "power3.out" }, at);
      const strip = el.closest(".strip");
      if (strip && !strip.dataset.dimmed) {
        strip.dataset.dimmed = "1";
        c.from(strip, { "--dim": 1 }, { "--dim": 0.32, duration: 0.4, ease: "power2.out" }, at);
      }
    },
    // A selected piece leaves the strip: it rises toward the camera, stands up and fades as its flat copy lands.
    lift: (c, el, at, d = 0.7) => c.from(el, { z: 0, rotationX: 0, opacity: 1 }, { z: 260, rotationX: -48, y: -120, opacity: 0, duration: d, ease: "power3.in" }, at),
    // A flat clip card lands: from small and blurred to sharp, overlapping the lift so it reads as one move.
    land: (c, el, at, d = 0.6) => c.from(el, { scale: 0.55, y: -60, opacity: 0, filter: "blur(10px)" }, { scale: 1, y: 0, opacity: 1, filter: "blur(0px)", duration: d, ease: "expo.out" }, at),
    // Spread a stack of cards into a fan: children get rotations and offsets from data-spread (deg, px).
    fan: (c, el, at, d = 0.7) => {
      const kids = Array.from(el.children);
      const [deg, px] = (el.dataset.spread || "7,330").split(",").map(Number);
      kids.forEach((k, i) => {
        const o = i - (kids.length - 1) / 2;
        c.from(k, { x: 0, rotation: 0 }, { x: o * px, rotation: o * deg, duration: d, ease: "expo.inOut" }, at);
      });
    },
    // Handles of a range: slide in from the outside to their place.
    handle: (c, el, at, d = 0.5) => c.from(el, { x: el.dataset.side === "end" ? 140 : -140, opacity: 0 }, { x: 0, opacity: 1, duration: d, ease: "expo.out" }, at),
  };

  function scene(c, s, at) {
    const kick = s.querySelector(".kick");
    if (kick) c.from(kick, { opacity: 0 }, { opacity: 1, duration: 0.3 }, at + 0.1);
  }

  // Titles change in place: the old title blurs out as the next scene starts. The 3D layers carry the motion.
  function transition(c, prev, next, t) {
    c.tl.to(prev, { opacity: 0, filter: "blur(8px)", duration: 0.2, ease: "power2.in" }, t - 0.2);
  }

  function mark(c, m, at) {
    c.set(m, { color: "var(--text)" }, 0);
    c.from(m, { color: "var(--text)" }, { color: "var(--accent)", duration: 0.12 }, at - 0.25);
  }

  // Running timecode of the source, top right: counts the long video's time, not the film's.
  function setup(c) {
    drawStrip(c.root);
    const tc = c.root.querySelector("#tc");
    if (tc) {
      const rate = +(tc.dataset.rate || 60);
      c.paint((t) => { const s = Math.floor(t * rate); tc.textContent = String(Math.floor(s / 3600)).padStart(2, "0") + ":" + String(Math.floor(s / 60) % 60).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0"); });
    }
  }

  window.FilmSlice = {
    build() {
      return Film.build({ words: "blur", mark, scene, transition, fx, setup });
    },
  };
})();
