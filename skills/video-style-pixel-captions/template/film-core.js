/*
 * film-core.js: the shared engine of the Clipwing video-style skills.
 * Synced into the template of every video-style skill by scripts/build_video_styles.py; edit it here, not in a copy.
 *
 * A film is plain HTML: scenes are <section class="scene" data-at data-len>, and anything that moves carries
 * data-fx plus a time. Film.build() turns that markup into one paused GSAP timeline. Every time is in seconds;
 * inside a scene, times are local to the scene's start. Nothing here reads the clock or Math.random, so every
 * frame is a pure function of timeline time, as HyperFrames needs.
 *
 *   data-fx      effect name (see FX below; a style's kit.js adds its own)
 *   data-t       when it starts, scene-local (default 0)
 *   data-d       its duration (each effect has a default)
 *   data-out     scene-local time it leaves; data-outfx picks how (fade, drop, blur; default fade)
 *   data-each    run the effect on the element's children, data-each seconds apart
 *   data-path    cursor moves: [[t, x, y], [t, x, y, "click"], ...] in px of the scene
 *   data-cam     on a .cam wrapper: [[t, scale, fx, fy, d], ...] punch-ins on the point (fx, fy), which ends up centred
 */
(function () {
  const num = (v, d) => (v == null || v === "" ? d : parseFloat(v));
  const json = (v, d) => { try { return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const $$ = (root, sel) => Array.from(root.querySelectorAll(sel));

  // Deterministic noise: the same input gives the same output on every frame and every render.
  const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

  const FORMATS = {
    int: (v) => String(Math.round(v)),
    comma: (v) => Math.round(v).toLocaleString("en-US"),
    space: (v) => Math.round(v).toLocaleString("en-US").replace(/,/g, " "),
    dec1: (v) => v.toFixed(1),
    time: (v) => { const s = Math.max(0, Math.round(v)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); },
    clock: (v) => { const s = Math.max(0, Math.round(v)); return String(Math.floor(s / 3600)).padStart(2, "0") + ":" + String(Math.floor((s % 3600) / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0"); },
  };

  // Split an element's text into .w word spans, keeping inline tags (<mark>, <b>, <img>) as single units.
  function splitWords(el) {
    if (el.dataset.split === "done") return $$(el, ".w");
    const out = [];
    const walk = (node, into) => {
      Array.from(node.childNodes).forEach((child) => {
        if (child.nodeType === 3) {
          child.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) { into.appendChild(document.createTextNode(" ")); return; }
            const w = document.createElement("span");
            w.className = "w";
            w.textContent = part;
            into.appendChild(w);
            out.push(w);
          });
        } else if (child.nodeType === 1 && child.tagName === "BR") {
          into.appendChild(child.cloneNode());
        } else if (child.nodeType === 1 && child.classList.contains("ln")) {
          const line = child.cloneNode(false);
          into.appendChild(line);
          walk(child, line);
        } else if (child.nodeType === 1) {
          const w = document.createElement("span");
          w.className = "w";
          w.appendChild(child.cloneNode(true));
          into.appendChild(w);
          out.push(w);
        }
      });
    };
    const frag = document.createElement("span");
    walk(el, frag);
    el.innerHTML = "";
    Array.from(frag.childNodes).forEach((n) => el.appendChild(n));
    el.dataset.split = "done";
    return out;
  }

  // Built-in effects. Each gets (ctx, el, at, d) and adds tweens at absolute time `at`.
  const IN = { immediateRender: false };
  const FX = {
    fade: (c, el, at, d = 0.4) => c.from(el, { opacity: 0 }, { opacity: 1, duration: d, ease: "power2.out" }, at),
    rise: (c, el, at, d = 0.5) => c.from(el, { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: d, ease: "expo.out" }, at),
    drop: (c, el, at, d = 0.5) => c.from(el, { opacity: 0, y: -40 }, { opacity: 1, y: 0, duration: d, ease: "expo.out" }, at),
    left: (c, el, at, d = 0.6) => c.from(el, { opacity: 0, x: -220 }, { opacity: 1, x: 0, duration: d, ease: "expo.out" }, at),
    right: (c, el, at, d = 0.6) => c.from(el, { opacity: 0, x: 220 }, { opacity: 1, x: 0, duration: d, ease: "expo.out" }, at),
    pop: (c, el, at, d = 0.45) => c.from(el, { opacity: 0, scale: 0.4 }, { opacity: 1, scale: 1, duration: d, ease: "back.out(1.8)" }, at),
    zoom: (c, el, at, d = 0.6) => c.from(el, { opacity: 0, scale: 1.18 }, { opacity: 1, scale: 1, duration: d, ease: "expo.out" }, at),
    blur: (c, el, at, d = 0.2) => c.from(el, { opacity: 0, filter: "blur(8px)" }, { opacity: 1, filter: "blur(0px)", duration: d, ease: "power2.out" }, at),
    // A line of words. Variants: data-words="rise" (default), "blur", "ink" (grey to ink in place), "jump".
    words: (c, el, at, d) => {
      const ws = splitWords(el);
      const kind = el.dataset.words || c.opts.words || "rise";
      const step = num(el.dataset.step, kind === "ink" ? 0.09 : 0.08);
      const from = { rise: { opacity: 0, y: 34 }, blur: { opacity: 0, filter: "blur(6px)" }, ink: { opacity: 0.18 }, jump: { opacity: 0, yPercent: 70 } }[kind];
      const to = { rise: { opacity: 1, y: 0 }, blur: { opacity: 1, filter: "blur(0px)" }, ink: { opacity: 1 }, jump: { opacity: 1, yPercent: 0 } }[kind];
      const ease = kind === "jump" ? "back.out(1.6)" : kind === "ink" ? "none" : "expo.out";
      ws.forEach((w, i) => c.from(w, from, { ...to, duration: d || (kind === "blur" ? 0.16 : 0.4), ease }, at + i * step));
      // The accent: a <mark> inside the line lands last and draws its plate (styled by the kit's CSS).
      $$(el, "mark").forEach((m) => { if (c.opts.mark) c.opts.mark(c, m, at + ws.length * step + 0.05); });
      return ws.length * step + 0.4;
    },
    // Types the element's text. data-cps sets characters per second (default 30).
    type: (c, el, at) => {
      const text = el.dataset.text != null ? el.dataset.text : el.textContent;
      el.dataset.text = text;
      const cps = num(el.dataset.cps, 30);
      c.paint((t) => { el.textContent = text.slice(0, Math.max(0, Math.min(text.length, Math.round((t - at) * cps)))); });
      return text.length / cps;
    },
    // Counts from data-from to the number in the text. data-fmt: int, comma, space, dec1, time, clock.
    count: (c, el, at, d = 1.2) => {
      const to = num(el.dataset.to, parseFloat(el.textContent.replace(/[^0-9.\-]/g, "")) || 0);
      el.dataset.to = to;
      const from = num(el.dataset.from, 0);
      const fmt = FORMATS[el.dataset.fmt || "comma"] || FORMATS.comma;
      const pre = el.dataset.pre || "", suf = el.dataset.suf || "";
      c.paint((t) => {
        const p = Math.max(0, Math.min(1, (t - at) / d));
        el.textContent = pre + fmt(from + (to - from) * (1 - Math.pow(1 - p, 3))) + suf;
      });
    },
    "fill-x": (c, el, at, d = 0.8) => { c.set(el, { transformOrigin: "0% 50%" }, 0); c.from(el, { scaleX: 0 }, { scaleX: 1, duration: d, ease: "power2.inOut" }, at); },
    "grow-y": (c, el, at, d = 0.5) => { c.set(el, { transformOrigin: "50% 100%" }, 0); c.from(el, { scaleY: 0 }, { scaleY: 1, duration: d, ease: "back.out(1.4)" }, at); },
    // Draws an SVG stroke (path, line, polyline) from its start.
    draw: (c, el, at, d = 0.7) => {
      const len = el.getTotalLength ? el.getTotalLength() : 1000;
      c.set(el, { strokeDasharray: len, strokeDashoffset: len }, 0);
      c.tl.to(el, { strokeDashoffset: 0, duration: d, ease: "power2.inOut" }, at);
    },
    // A button press at `at`: quick squash and release. Not an entrance.
    press: (c, el, at) => c.tl.to(el, { keyframes: [{ scale: 0.92, duration: 0.08 }, { scale: 1, duration: 0.22, ease: "back.out(3)" }] }, at),
    // Adds a class from `at` on (state change: checked, active, done). data-class names it (default "on").
    state: (c, el, at) => {
      const cls = el.dataset.class || "on";
      c.paint((t) => el.classList.toggle(cls, t >= at));
    },
  };

  const OUT = {
    fade: (c, el, at, d = 0.25) => c.tl.to(el, { opacity: 0, duration: d, ease: "power2.in" }, at),
    drop: (c, el, at, d = 0.25) => c.tl.to(el, { opacity: 0, y: 30, duration: d, ease: "power3.in" }, at),
    up: (c, el, at, d = 0.25) => c.tl.to(el, { opacity: 0, y: -30, duration: d, ease: "power3.in" }, at),
    blur: (c, el, at, d = 0.2) => c.tl.to(el, { opacity: 0, filter: "blur(8px)", duration: d, ease: "power2.in" }, at),
    left: (c, el, at, d = 0.35) => c.tl.to(el, { opacity: 0, x: -260, duration: d, ease: "power3.in" }, at),
  };

  // Cursor: [[t, x, y], [t, x, y, "click"]]; moves between points with power2.inOut, never teleports after its first point.
  function cursor(c, el, base) {
    const pts = json(el.dataset.path, []);
    if (!pts.length) return;
    c.set(el, { x: pts[0][1], y: pts[0][2], opacity: 0 }, 0);
    c.tl.to(el, { opacity: 1, duration: 0.2 }, base + pts[0][0]);
    for (let i = 1; i < pts.length; i++) {
      const [t, x, y, act] = pts[i];
      const prev = pts[i - 1][0];
      const d = Math.max(0.15, Math.min(0.9, t - prev - 0.05));
      c.tl.to(el, { x, y, duration: d, ease: "power2.inOut" }, base + t - d);
      if (act === "click") c.tl.to(el, { keyframes: [{ scale: 0.85, duration: 0.07 }, { scale: 1, duration: 0.18 }] }, base + t);
    }
  }

  // Camera on a .cam wrapper: [[t, scale, fx, fy, d]]. (fx, fy) is the point of the unscaled frame brought to the centre.
  function camera(c, el, base) {
    const W = num(c.root.dataset.width, 1920), H = num(c.root.dataset.height, 1080);
    c.set(el, { transformOrigin: "0 0", scale: 1, x: 0, y: 0 }, 0);
    json(el.dataset.cam, []).forEach(([t, s, fx, fy, d = 0.8]) => c.tl.to(el, { scale: s, x: W / 2 - fx * s, y: H / 2 - fy * s, duration: d, ease: "power2.inOut" }, base + t));
  }

  function banner(root, text) {
    const b = document.createElement("div");
    b.textContent = text;
    b.style.cssText = "position:absolute;left:0;right:0;top:0;z-index:99999;padding:24px;background:#d00;color:#fff;font:700 32px sans-serif";
    root.appendChild(b);
  }

  /**
   * Build the film. opts:
   *   root         "#root" by default
   *   transition   (ctx, prev, next, t) => void: how scene `prev` gives way to `next` at time t (default hard cut)
   *   words        default word entrance for data-fx="words"
   *   mark         (ctx, markEl, at) => void: how the accent word lands (plate, colour)
   *   scene        (ctx, sceneEl, at, len) => void: style hook run once per scene (backgrounds, mascots, clocks)
   *   setup        (ctx) => void: run once before the scenes (clocks, corner labels, generated layers)
 *   fx           extra effects { name: (ctx, el, at, d) => void } from the style kit
   */
  function build(opts = {}) {
    const root = document.querySelector(opts.root || "#root");
    const tl = gsap.timeline({ paused: true });
    const inited = new Map();
    const fx = { ...FX, ...(opts.fx || {}) };
    const ctx = {
      tl, opts, root, hash, splitWords, num, json,
      set: (el, v, t) => tl.set(el, v, t),
      // An entrance: the first tween on each property of an element also pins its "from" value at time 0,
      // so the element waits in its start state until its effect begins, on any seek.
      from: (el, a, b, t) => {
        const seen = inited.get(el) || new Set();
        const first = Object.fromEntries(Object.entries(a).filter(([k]) => !seen.has(k)));
        Object.keys(a).forEach((k) => seen.add(k));
        inited.set(el, seen);
        if (Object.keys(first).length) tl.set(el, first, 0);
        return tl.fromTo(el, a, { ...b, ...IN }, t);
      },
      fx: (name, el, at, d) => fx[name](ctx, el, at, d),
      // Painters: pure functions of film time, called on every rendered frame (text, counters, states, canvases).
      paint: (fn) => painters.push(fn),
    };
    const painters = [];
    if (opts.setup) opts.setup(ctx);
    const scenes = $$(root, ".scene").sort((a, b) => num(a.dataset.at, 0) - num(b.dataset.at, 0));
    let end = 0;
    scenes.forEach((s) => { end = Math.max(end, num(s.dataset.at, 0) + num(s.dataset.len, 0)); });
    const declared = num(root.dataset.duration, 0);
    ctx.end = end;
    if (Math.abs(end - declared) > 0.01) banner(root, "Scenes end at " + end.toFixed(2) + " s but #root data-duration is " + declared);

    // Runs the camera, cursor and effects of everything under `scope` that belongs to it, with times from `base`.
    const own = (el) => (el.closest(".scene") || null);
    const animate = (scope, base) => {
      const mine = (el) => own(el) === (scope.classList && scope.classList.contains("scene") ? scope : null);
      $$(scope, ".cam[data-cam]").filter(mine).forEach((el) => camera(ctx, el, base));
      $$(scope, "[data-path]").filter(mine).forEach((el) => cursor(ctx, el, base));
      $$(scope, "[data-fx], [data-out]").filter(mine).forEach((el) => {
        const names = (el.dataset.fx || "").split(/\s+/).filter(Boolean);
        const t = base + num(el.dataset.t, 0);
        const d = el.dataset.d ? num(el.dataset.d) : undefined;
        const each = el.dataset.each;
        names.forEach((spec) => {
          // "name@1.2" runs that effect at its own time, so one element can assemble, blink and hop.
          const [name, ownT] = spec.split("@");
          const tt = ownT != null ? base + num(ownT, 0) : t;
          if (!fx[name]) { banner(root, "Unknown data-fx: " + name); return; }
          if (each != null) Array.from(el.children).forEach((k, j) => fx[name](ctx, k, tt + j * num(each, 0.1), d));
          else fx[name](ctx, el, tt, d);
        });
        if (el.dataset.out != null) (OUT[el.dataset.outfx || "fade"] || OUT.fade)(ctx, el, base + num(el.dataset.out), undefined);
      });
    };

    scenes.forEach((s, i) => {
      const at = num(s.dataset.at, 0), len = num(s.dataset.len, 0);
      // Two sets on one element at the same instant are unreliable in GSAP: a scene at 0 is simply shown.
      if (at > 0) { ctx.set(s, { opacity: 0 }, 0); ctx.set(s, { opacity: 1 }, at); }
      else ctx.set(s, { opacity: 1 }, 0);
      if (opts.scene) opts.scene(ctx, s, at, len, i);
      animate(s, at);
      const next = scenes[i + 1];
      if (next && opts.transition) opts.transition(ctx, s, next, num(next.dataset.at, 0));
      else if (next) ctx.set(s, { opacity: 0 }, num(next.dataset.at, 0));
    });
    // Layers outside every scene (a film strip, a phone, a dashboard that lives through several scenes)
    // animate on film time: their data-t and data-out are absolute seconds.
    animate(root, 0);

    // One tween over the whole film drives the painters, so any seek, forward or back, repaints the frame.
    const clock = { t: 0 };
    tl.fromTo(clock, { t: 0 }, { t: end, duration: end, ease: "none", immediateRender: false, onUpdate: () => painters.forEach((f) => f(clock.t)) }, 0);
    painters.forEach((f) => f(0));
    tl.seek(0);
    return tl;
  }

  window.Film = { build, FX, OUT, FORMATS, hash, splitWords };
})();
