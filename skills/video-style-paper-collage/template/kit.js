/*
 * Paper Collage kit: an explainer told as a collage on dark cardboard. Cut-out words and numbers, objects with
 * torn edges stuck down with tape, typewriter labels on paper strips, a thread pulled from one object to the next,
 * an ink blot. Each scene is a sheet: the next one slides up over it; inside a scene the camera pushes in slowly.
 * Needs film-core.js first. Usage in index.html: window.__timelines["main"] = PaperCollage.build();
 */
(function () {
  // A torn edge for every .torn element: a polygon with small seeded jags along all four sides.
  function tear(el, seed) {
    const pts = [], n = 18, j = +(el.dataset.jag || 1.6);
    const jag = (k) => (Film.hash(seed * 31 + k) * j).toFixed(2);
    for (let i = 0; i <= n; i++) pts.push(`${(i * 100) / n}% ${jag(i)}%`);
    for (let i = 1; i <= n; i++) pts.push(`${100 - jag(i + 40)}% ${(i * 100) / n}%`);
    for (let i = n - 1; i >= 0; i--) pts.push(`${(i * 100) / n}% ${100 - jag(i + 80)}%`);
    for (let i = n - 1; i > 0; i--) pts.push(`${jag(i + 120)}% ${(i * 100) / n}%`);
    el.style.clipPath = `polygon(${pts.join(",")})`;
  }

  function setup(c) {
    c.root.querySelectorAll(".torn").forEach((el, i) => tear(el, i + 1));
  }

  // Each scene is a sheet of cardboard. The camera (the scene's .stage) pushes in slowly all through it.
  function scene(c, s, at, len, i) {
    s.style.zIndex = String(10 + i);
    const stage = s.querySelector(".stage");
    if (stage) c.from(stage, { scale: 1 }, { scale: +(s.dataset.push || 1.06), duration: len + 0.6, ease: "none" }, at);
  }

  // The next sheet slides up over the old one, which drifts up a little behind it. No flashes, no fades.
  function transition(c, prev, next, t) {
    c.from(next, { yPercent: 100 }, { yPercent: 0, duration: 0.6, ease: "power3.inOut" }, t - 0.3);
    c.tl.to(prev, { yPercent: -18, duration: 0.6, ease: "power3.inOut" }, t - 0.3);
    c.set(prev, { opacity: 0 }, t + 0.31);
  }

  const fx = {
    // An object flies in with a turn and sticks: a short overshoot, then it lies still at its own rotation (--r).
    stick: (c, el, at, d = 0.55) => {
      const r = parseFloat(getComputedStyle(el).getPropertyValue("--r")) || 0;
      c.from(el, { opacity: 0, scale: 1.25, rotation: r + (c.hash(at) > 0.5 ? 8 : -8), y: -40 }, { opacity: 1, scale: 1, rotation: r, y: 0, duration: d, ease: "back.out(1.7)" }, at);
    },
    // Tape lands a beat after the object it holds.
    tape: (c, el, at) => c.from(el, { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.18, ease: "power2.out" }, at),
    // An ink blot spreads from nothing and stays.
    blot: (c, el, at, d = 0.5) => c.from(el, { scale: 0, opacity: 0.9 }, { scale: 1, opacity: 0.9, duration: d, ease: "expo.out" }, at),
    // Cut-out letters: each letter of the element lands on its own small turn, like letters cut from a paper.
    letters: (c, el, at) => {
      const text = el.textContent;
      el.textContent = "";
      [...text].forEach((ch, i) => {
        const s = document.createElement("span");
        s.className = "ch";
        s.textContent = ch;
        if (ch === " ") s.style.width = "0.3em";
        el.appendChild(s);
        const r = (c.hash(i + text.length) - 0.5) * 8;
        c.from(s, { opacity: 0, y: -30, rotation: r * 3 }, { opacity: 1, y: 0, rotation: r, duration: 0.3, ease: "back.out(2)" }, at + i * 0.05);
      });
    },
  };

  window.PaperCollage = {
    build() {
      return Film.build({ words: "rise", scene, transition, fx, setup });
    },
  };
})();
