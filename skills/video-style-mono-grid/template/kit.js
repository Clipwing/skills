/*
 * Mono Grid kit: a black-and-white editorial film in four panels. Each scene is a 2×2 grid of .pane elements;
 * on a scene change the panes are replaced one by one with a top-down wipe, so at least one panel moves every
 * second while the four still read as one thought. Words ink in place; nothing slides.
 * Needs film-core.js first. Usage in index.html: window.__timelines["main"] = MonoGrid.build();
 *
 *   <section class="scene" data-at data-len>
 *     <div class="pane light" data-cell="0">…</div>  cells: 0 top-left, 1 top-right, 2 bottom-left, 3 bottom-right
 *     <div class="pane dark" data-cell="1" data-keep>…</div>  data-keep: carry this cell over without a wipe
 *     <div class="pane light" data-cell="full">…</div>  one pane over the whole frame (end card)
 *   </section>
 */
(function () {
  const WIPE = 0.28, STAGGER = 0.14;
  const ORDER = [0, 3, 1, 2]; // diagonal order reads calmer than reading order

  // Scene change: the next scene is shown at t with its panes clipped away; each pane wipes in from the top
  // on its own beat. The previous scene stays underneath until the last wipe lands, so no frame is ever empty.
  function transition(c, prev, next, t) {
    const panes = Array.from(next.querySelectorAll(".pane"));
    let last = t;
    panes.forEach((p) => {
      if (p.hasAttribute("data-keep")) return;
      const cell = p.dataset.cell === "full" ? 0 : +p.dataset.cell;
      const at = t + ORDER.indexOf(cell) * STAGGER;
      c.from(p, { clipPath: "inset(0% 0% 100% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: WIPE, ease: "power3.inOut" }, at);
      last = Math.max(last, at + WIPE);
    });
    c.set(prev, { opacity: 0 }, last + 0.01);
  }

  // The next scene must paint above the previous one during the wipes.
  function scene(c, s, at, len, i) {
    s.style.zIndex = String(10 + i);
  }

  const fx = {
    // A scrolling list: rows move up linearly by data-speed px/s from the effect's time to the scene's end.
    scroll: (c, el, at) => {
      const s = el.closest(".scene");
      const end = s ? +s.dataset.at + +s.dataset.len : c.end;
      const speed = +(el.dataset.speed || 60);
      c.from(el, { y: 0 }, { y: -speed * (end - at), duration: end - at, ease: "none" }, at);
    },
    // A mosaic: the children (squares) flicker on in a seeded order, then off, revealing what is under them.
    mosaic: (c, el, at, d = 1.1) => {
      Array.from(el.children).forEach((sq, i) => {
        const on = at + c.hash(i) * d * 0.5, off = at + d * 0.5 + c.hash(i + 50) * d * 0.5;
        c.paint((t) => { sq.style.opacity = t >= on && t < off ? 1 : 0; });
      });
    },
    // Big numbers counting down in place (3, 2, 1): children shown one per data-every seconds.
    countdown: (c, el, at) => {
      const kids = Array.from(el.children), every = +(el.dataset.every || 0.6);
      c.paint((t) => kids.forEach((k, i) => { k.style.opacity = t >= at + i * every && t < at + (i + 1) * every ? 1 : 0; }));
    },
  };

  // Mosaic squares are generated: <div class="mosaic" data-cols="16" data-rows="9"> fills its box with squares.
  function setup(c) {
    c.root.querySelectorAll(".mosaic[data-cols]").forEach((m) => {
      const cols = +m.dataset.cols, rows = +m.dataset.rows;
      for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
        const sq = document.createElement("i");
        sq.style.cssText = `left:${(k * 100) / cols}%;top:${(r * 100) / rows}%;width:${100 / cols}%;height:${100 / rows}%;background:${(r + k) % 2 ? "#0c0c0c" : "#f1f2ee"}`;
        m.appendChild(sq);
      }
    });
  }

  window.MonoGrid = {
    build() {
      return Film.build({ words: "ink", scene, transition, fx, setup });
    },
  };
})();
