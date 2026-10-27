/*
 * Card Carousel kit: many cards of one kind (thumbnails, clips, templates) in 3D layouts that flow into each
 * other: a turning ring, an arc with a centre card, a focus on one card, a fan, an exit. One painter places
 * every card from the film time, so a spinning ring can morph into an arc with no tween fighting another.
 * Needs film-core.js first. Usage in index.html: window.__timelines["main"] = CardCarousel.build();
 *
 *   <div class="deck" data-layouts='[[0,"ring"],[4,"arc",3],[8,"focus",3],[12,"fan",3],[16,"out"]]' data-morph="0.9">
 *     <div class="card">…</div> × n
 *   </div>
 * Each layout step is [time, name, focus index]. Times are absolute (the deck lives outside the scenes).
 */
(function () {
  const lerp = (a, b, p) => a + (b - a) * p;
  const ease = (p) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
  // Distance of card i from the focus card, wrapped so the deck reads as a loop.
  const off = (i, f, n) => { let k = i - f; if (k > n / 2) k -= n; if (k < -n / 2) k += n; return k; };

  // Each layout gives a pose: x, y, z (px), ry, rz (deg), s (scale), o (opacity).
  const LAYOUTS = {
    ring: (i, n, f, t, o) => {
      const a = (2 * Math.PI * i) / n + (o.spin || 0.35) * t, R = o.radius || 900;
      // Cards on the far side stay visible but dim, so the ring reads as a ring, not a curved band.
      return { x: R * Math.sin(a), y: 0, z: R * Math.cos(a) - R, ry: (a * 180) / Math.PI, rz: 0, s: 1, o: 0.3 + 0.7 * ((Math.cos(a) + 1) / 2) };
    },
    arc: (i, n, f) => {
      const k = off(i, f, n), ak = Math.abs(k);
      return { x: k * 330, y: ak * ak * 10, z: -Math.pow(ak, 1.5) * 90, ry: -k * 14, rz: 0, s: k === 0 ? 1.25 : 1, o: ak > 4 ? 0 : 1 - ak * 0.14 };
    },
    focus: (i, n, f) => {
      const k = off(i, f, n), ak = Math.abs(k);
      return k === 0 ? { x: 0, y: -10, z: 160, ry: 0, rz: 0, s: 1.75, o: 1 } : { x: k * 460, y: 40, z: -420, ry: -k * 8, rz: 0, s: 1, o: ak > 3 ? 0 : 0.3 };
    },
    fan: (i, n, f) => {
      const k = off(i, f, n), ak = Math.abs(k);
      return { x: k * 250, y: ak * ak * 14 + 40, z: -ak * 30, ry: 0, rz: k * 9, s: 1.05, o: ak > 2 ? 0 : 1 };
    },
    out: (i, n, f) => ({ x: off(i, f, n) * 40, y: 120, z: -900, ry: 0, rz: 0, s: 0.8, o: 0 }),
  };

  function deck(c, el) {
    const cards = Array.from(el.querySelectorAll(":scope > .card"));
    const steps = c.json(el.dataset.layouts, [[0, "ring"]]);
    const morph = +(el.dataset.morph || 0.9);
    const opts = { spin: +(el.dataset.spin || 0.35), radius: +(el.dataset.radius || 900) };
    const n = cards.length;
    const pose = (step, i, t) => LAYOUTS[step[1]](i, n, step[2] || 0, t, opts);
    c.paint((t) => {
      let k = 0;
      while (k + 1 < steps.length && t >= steps[k + 1][0]) k++;
      const p = k > 0 ? ease(Math.min(1, (t - steps[k][0]) / morph)) : 1;
      cards.forEach((card, i) => {
        const b = pose(steps[k], i, t);
        const a = k > 0 && p < 1 ? pose(steps[k - 1], i, t) : b;
        const v = {};
        for (const key in b) v[key] = lerp(a[key], b[key], p);
        card.style.transform = `translate3d(${v.x}px, ${v.y}px, ${v.z}px) rotateY(${v.ry}deg) rotateZ(${v.rz}deg) scale(${v.s})`;
        card.style.opacity = v.o;
        card.style.zIndex = Math.round(1000 + v.z);
      });
    });
  }

  function setup(c) {
    c.root.querySelectorAll(".deck[data-layouts]").forEach((el) => deck(c, el));
  }

  function scene(c, s, at) {
    const kick = s.querySelector(".kick");
    if (kick) c.from(kick, { opacity: 0 }, { opacity: 1, duration: 0.3 }, at + 0.1);
  }

  // Titles blur out as the next scene starts; the deck carries the motion between scenes.
  function transition(c, prev, next, t) {
    c.tl.to(prev, { opacity: 0, filter: "blur(8px)", duration: 0.2, ease: "power2.in" }, t - 0.2);
  }

  function mark(c, m, at) {
    c.set(m, { color: "var(--text)" }, 0);
    c.from(m, { color: "var(--text)" }, { color: "var(--accent)", duration: 0.12 }, at - 0.2);
  }

  window.CardCarousel = {
    LAYOUTS,
    build() {
      return Film.build({ words: "blur", mark, scene, transition, setup });
    },
  };
})();
