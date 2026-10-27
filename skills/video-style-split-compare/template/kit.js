/*
 * Split Compare kit: before and after, on one frame. A compare slider (one picture over another, split by a
 * handle that sweeps), side-by-side panes with BEFORE / AFTER tags, and scene changes made by the same seam:
 * a vertical line crosses the frame and the next scene opens behind it.
 * Needs film-core.js first. Usage in index.html: window.__timelines["main"] = SplitCompare.build();
 */
(function () {
  const SEAM = 0.65;
  const ease = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

  // Scene change: the next scene opens from the left behind a seam that crosses the frame.
  function transition(c, prev, next, t) {
    c.from(next, { clipPath: "inset(0% 100% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: SEAM, ease: "power3.inOut" }, t - SEAM / 2);
    const seam = c.root.querySelector("#seam");
    // The seam is hidden by CSS (opacity 0) and only shown while it crosses.
    c.set(seam, { opacity: 1 }, t - SEAM / 2);
    c.from(seam, { x: 0 }, { x: +c.root.dataset.width, duration: SEAM, ease: "power3.inOut" }, t - SEAM / 2);
    c.set(seam, { opacity: 0 }, t + SEAM / 2);
    c.set(prev, { opacity: 0 }, t + SEAM / 2 + 0.01);
  }

  function scene(c, s, at, len, i) {
    s.style.zIndex = String(10 + i);
    const kick = s.querySelector(".kick");
    if (kick) c.from(kick, { opacity: 0 }, { opacity: 1, duration: 0.3 }, at + 0.15);
  }

  // The accent word gets an underline drawn left to right (the style's "after" mark).
  function mark(c, m, at) {
    c.from(m, { "--u": 0 }, { "--u": 1, duration: 0.35, ease: "power2.out" }, at);
  }

  const fx = {
    // A compare slider: .compare > .before, .after, .handle. data-sweep='[[t, pct], …]' (times relative to the
    // effect) moves the split; the after layer shows to the right of the handle.
    compare: (c, el, at) => {
      const after = el.querySelector(".after"), handle = el.querySelector(".handle");
      const pts = c.json(el.dataset.sweep, [[0, 50]]);
      c.paint((t) => {
        const lt = t - at;
        let p = pts[0][1];
        for (let k = 1; k < pts.length; k++) {
          const [t0, v0] = pts[k - 1], [t1, v1] = pts[k];
          if (lt >= t1) p = v1;
          else if (lt > t0) { p = v0 + (v1 - v0) * ease((lt - t0) / (t1 - t0)); break; }
          else break;
        }
        after.style.clipPath = `inset(0% 0% 0% ${p}%)`;
        handle.style.left = `${p}%`;
      });
    },
    // A frame changes shape (e.g. 16:9 into 9:16): from data-from="w,h" to its own size, centred.
    reshape: (c, el, at, d = 0.9) => {
      const [w, h] = (el.dataset.from || "0,0").split(",").map(Number);
      const W = el.offsetWidth, H = el.offsetHeight;
      c.from(el, { scaleX: w / W, scaleY: h / H }, { scaleX: 1, scaleY: 1, duration: d, ease: "expo.inOut" }, at);
    },
  };

  window.SplitCompare = {
    build() {
      return Film.build({ words: "rise", mark, scene, transition, fx });
    },
  };
})();
