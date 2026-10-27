/*
 * Mascot Pastel kit: a friendly product promo. Every scene has its own pastel ground that flows into the next,
 * a two-line headline on the left with one accent word in a serif, a phone on the right whose screen keeps
 * changing, and a character who opens the film big and then rides along as an avatar in the corner.
 * Needs film-core.js first. Usage in index.html: window.__timelines["main"] = MascotPastel.build();
 */
(function () {
  // Ground: each scene's data-bg crossfades in over 0.45 s; colour to colour, never through white.
  function scene(c, s, at, len, i) {
    const layer = document.createElement("div");
    layer.className = "ground-layer";
    layer.style.background = s.dataset.bg || "#fff";
    c.root.querySelector("#grounds").appendChild(layer);
    if (i === 0) c.set(layer, { opacity: 1 }, 0);
    else c.from(layer, { opacity: 0 }, { opacity: 1, duration: 0.45, ease: "power2.inOut" }, at - 0.2);
    // The scene's accent colour drives the serif word and the avatar ring.
    if (s.dataset.accent) c.set(c.root, { "--scene-accent": s.dataset.accent }, Math.max(0, at - 0.2));
    const kick = s.querySelector(".kick");
    if (kick) c.from(kick, { opacity: 0 }, { opacity: 1, duration: 0.3 }, at + 0.1);
    // The avatar hops on every scene change while it is on screen.
    const av = c.root.querySelector("#avatar");
    if (av && i > 0) c.tl.to(av, { keyframes: [{ y: -16, duration: 0.14, ease: "power2.out" }, { y: 0, duration: 0.3, ease: "bounce.out" }] }, at + 0.05);
  }

  // Headline out, next headline in; the phone and the ground carry continuity.
  function transition(c, prev, next, t) {
    c.tl.to(prev, { opacity: 0, y: -20, duration: 0.25, ease: "power2.in" }, t - 0.25);
  }

  // The accent word is a serif in the scene's accent colour; it lands a beat after the rest of the line.
  function mark(c, m, at) {
    c.from(m, { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" }, at + 0.05);
  }

  const fx = {
    // A tile dragged into place from (data-dx, data-dy) px away, with a slight lift while it travels.
    drag: (c, el, at, d = 0.55) => c.from(el, { x: +(el.dataset.dx || 0), y: +(el.dataset.dy || 0), scale: 1.12, opacity: 1 }, { x: 0, y: 0, scale: 1, duration: d, ease: "power3.inOut" }, at),
    // A card falls in with a turn and lands at its own angle (--r).
    fall: (c, el, at, d = 0.6) => {
      const r = parseFloat(getComputedStyle(el).getPropertyValue("--r")) || 0;
      c.from(el, { y: -700, rotation: r * 3, opacity: 1 }, { y: 0, rotation: r, duration: d, ease: "bounce.out" }, at);
    },
    // The character waves: the arm (.arm inside) swings 3 times. Acting, not a loop on a title.
    wave: (c, el, at) => {
      const arm = el.querySelector(".arm");
      c.tl.to(arm, { keyframes: [{ rotation: -28, duration: 0.18 }, { rotation: 6, duration: 0.18 }, { rotation: -28, duration: 0.18 }, { rotation: 6, duration: 0.18 }, { rotation: 0, duration: 0.2 }], svgOrigin: arm.dataset.origin || "0 0" }, at);
    },
    // The eyes blink once.
    blink: (c, el, at) => {
      const eyes = el.querySelectorAll(".eye");
      c.tl.to(eyes, { scaleY: 0.1, transformOrigin: "50% 50%", duration: 0.06 }, at);
      c.tl.to(eyes, { scaleY: 1, duration: 0.09 }, at + 0.08);
    },
    // The big intro character shrinks into the corner avatar: it moves and scales toward data-to="x,y,scale".
    tocorner: (c, el, at, d = 0.7) => {
      const [x, y, s] = (el.dataset.to || "0,0,0.2").split(",").map(Number);
      c.tl.to(el, { x, y, scale: s, opacity: 0, duration: d, ease: "power3.inOut" }, at);
    },
  };

  window.MascotPastel = {
    build() {
      return Film.build({ words: "rise", mark, scene, transition, fx });
    },
  };
})();
