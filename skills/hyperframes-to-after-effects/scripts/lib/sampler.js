// sampler.js: runs inside the HyperFrames page (added with page.addScriptTag). Defines window.__hf2ae:
//   prepare()      once after load: discovers the composition tree and rewrites what the sampler cannot see into real
//                  elements (::before/::after with content -> spans, one-sided borders -> line spans; layout unchanged)
//   sample()       one frame: every visible element of every visible composition, in that composition's own space
//   canvases(fps)  changed <canvas> pixels as PNG data URLs
// Entry types: box, text, svg, image, video, canvas, bake (painted by the browser into a PNG), comp (a nested
// composition placed in its parent), clip (overflow / clip-path geometry other entries are matted by).
(() => {
  const rgba = (s) => { const m = (s || "").match(/[\d.]+/g); if (!m) return [0, 0, 0, 0]; return [m[0] / 255, m[1] / 255, m[2] / 255, m.length > 3 ? +m[3] : 1]; };
  const mul = (P, E) => [P[0] * E[0] + P[2] * E[1], P[1] * E[0] + P[3] * E[1], P[0] * E[2] + P[2] * E[3], P[1] * E[2] + P[3] * E[3]];
  const ctx = document.createElement("canvas").getContext("2d");
  const ascentCache = {};
  const ascent = (cs) => {
    const f = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    if (!(f in ascentCache)) { ctx.font = f; const m = ctx.measureText("Hg"); ascentCache[f] = m.fontBoundingBoxAscent; }
    return ascentCache[f];
  };
  const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
  // top-left of an element's local box in the composition's space, given its composed linear transform L
  const placement = (rect, L, w, h, base) => {
    const xs = [0, w * L[0], h * L[2], w * L[0] + h * L[2]], ys = [0, w * L[1], h * L[3], w * L[1] + h * L[3]];
    return [rect.left - base.left - Math.min(...xs), rect.top - base.top - Math.min(...ys)];
  };
  const px = (v, ref) => (String(v).endsWith("%") ? (parseFloat(v) / 100) * ref : parseFloat(v) || 0);
  const radius = (cs, w, h) => Math.min(px(cs.borderTopLeftRadius.split(" ")[0], Math.min(w, h)), Math.min(w, h) / 2);
  const shadows = (s) => {
    if (!s || s === "none") return [];
    return s.split(/,(?![^(]*\))/).map((part) => {
      const col = part.match(/rgba?\([^)]*\)/), rest = part.replace(/rgba?\([^)]*\)/, "").trim();
      const inset = /\binset\b/.test(rest), n = rest.replace("inset", "").trim().split(/\s+/).map(parseFloat);
      return { x: n[0] || 0, y: n[1] || 0, blur: n[2] || 0, spread: n[3] || 0, c: rgba(col ? col[0] : "rgb(0,0,0)"), inset };
    });
  };
  const filterOf = (s) => {
    if (!s || s === "none") return { blur: 0, other: [] };
    let blur = 0; const other = [];
    for (const m of s.matchAll(/([a-z-]+)\(([^)]*)\)/g)) { if (m[1] === "blur") blur = parseFloat(m[2]) || 0; else other.push(m[1]); }
    return { blur, other };
  };
  const textCase = (t, tt) => (tt === "uppercase" ? t.toUpperCase() : tt === "lowercase" ? t.toLowerCase() : tt === "capitalize" ? t.replace(/\b\p{L}/gu, (c) => c.toUpperCase()) : t);
  // clip-path basic shapes in the element's local box: polygon / inset / circle / ellipse
  const clipShape = (s, w, h) => {
    if (!s || s === "none") return null;
    let m;
    if ((m = s.match(/^polygon\((.*)\)$/))) {
      const body = m[1].replace(/^(nonzero|evenodd)\s*,/, "");
      return { kind: "poly", pts: body.split(",").map((p) => { const [a, b] = p.trim().split(/\s+/); return [px(a, w), px(b, h)]; }) };
    }
    if ((m = s.match(/^inset\((.*)\)$/))) {
      const [box, round] = m[1].split(/\s+round\s+/);
      const v = box.trim().split(/\s+/); const t = px(v[0], h), r = px(v[1] ?? v[0], w), b = px(v[2] ?? v[0], h), l = px(v[3] ?? v[1] ?? v[0], w);
      return { kind: "rrect", x: l, y: t, w: Math.max(0, w - l - r), h: Math.max(0, h - t - b), r: round ? px(round.trim().split(/\s+/)[0], Math.min(w, h)) : 0 };
    }
    if ((m = s.match(/^(circle|ellipse)\((.*)\)$/))) {
      const [size, at] = m[2].split(/\s+at\s+/);
      const sz = (size || "").trim().split(/\s+/).filter(Boolean), c = (at || "50% 50%").trim().split(/\s+/);
      const ref = Math.hypot(w, h) / Math.SQRT2;
      const rx = m[1] === "circle" ? px(sz[0] || "50%", ref) : px(sz[0] || "50%", w), ry = m[1] === "circle" ? rx : px(sz[1] || "50%", h);
      const pos = (v, ref2) => (v === "center" ? ref2 / 2 : v === "left" || v === "top" ? 0 : v === "right" || v === "bottom" ? ref2 : px(v, ref2));
      return { kind: "ellipse", cx: pos(c[0], w), cy: pos(c[1] ?? "50%", h), rx, ry };
    }
    return { kind: "unsupported", css: s.slice(0, 60) };
  };
  const BLENDS = new Set(["multiply", "screen", "overlay", "darken", "lighten", "color-dodge", "color-burn", "hard-light", "soft-light", "difference", "exclusion", "hue", "saturation", "color", "luminosity"]);

  let tree = null; // [{ cid, el, parent }]
  const warnings = new Set();

  function prepare() {
    const all = [...document.querySelectorAll("[data-composition-id]")];
    const rootEl = all.find((el) => !el.parentElement.closest("[data-composition-id]"));
    tree = all.map((el) => ({ cid: el.getAttribute("data-composition-id"), el, parent: el === rootEl ? null : el.parentElement.closest("[data-composition-id]").getAttribute("data-composition-id") }));
    // duplicate composition ids (the same sub-composition mounted twice) get an instance suffix
    const seen = {};
    for (const c of tree) { seen[c.cid] = (seen[c.cid] || 0) + 1; if (seen[c.cid] > 1) c.cid += "#" + seen[c.cid]; }
    const style = document.createElement("style");
    style.textContent = ".__hf2ae-nops::before, .__hf2ae-nops::after { display: none !important; }";
    document.head.appendChild(style);
    let pseudo = 0, lines = 0;
    for (const el of [...rootEl.querySelectorAll("*")]) {
      if (el.namespaceURI !== "http://www.w3.org/1999/xhtml" || /^(SCRIPT|STYLE|TEMPLATE|VIDEO|AUDIO|CANVAS|IMG|IFRAME)$/.test(el.tagName)) continue;
      const made = [];
      for (const which of ["::before", "::after"]) {
        const ps = getComputedStyle(el, which);
        if (ps.content === "none" || ps.content === "normal" || ps.display === "none") continue;
        const text = ps.content.match(/^"(.*)"$/s)?.[1] ?? "";
        if (!text && ps.position !== "absolute") continue; // an empty in-flow pseudo is layout glue, nothing to see
        const s = document.createElement(text && ps.position !== "absolute" ? "span" : "span");
        s.className = "__hf2ae-pseudo";
        const copy = ["position", "display", "left", "top", "right", "bottom", "width", "height", "backgroundColor", "backgroundImage", "opacity",
          "borderRadius", "borderTop", "borderRight", "borderBottom", "borderLeft", "boxShadow", "transform", "transformOrigin", "color", "font",
          "letterSpacing", "textTransform", "zIndex", "margin", "padding", "filter", "mixBlendMode", "verticalAlign", "lineHeight"];
        for (const p of copy) s.style[p] = ps[p];
        s.style.pointerEvents = "none";
        if (text) s.textContent = text.replace(/\\"/g, '"').replace(/\\a /g, "\n");
        made.push([which, s]);
      }
      if (made.length) {
        el.classList.add("__hf2ae-nops");
        for (const [which, s] of made) which === "::before" ? el.prepend(s) : el.append(s);
        pseudo += made.length;
      }
      const cs = getComputedStyle(el);
      const side = (n) => ({ w: parseFloat(cs["border" + n + "Width"]) || 0, c: cs["border" + n + "Color"], s: cs["border" + n + "Style"] });
      const B = { Top: side("Top"), Right: side("Right"), Bottom: side("Bottom"), Left: side("Left") };
      const vis = (b) => b.w > 0 && b.s !== "none" && b.s !== "hidden" && rgba(b.c)[3] > 0.001;
      const uniform = ["Right", "Bottom", "Left"].every((n) => B[n].w === B.Top.w && B[n].s === B.Top.s && B[n].c === B.Top.c);
      if (uniform || !Object.values(B).some(vis)) continue;
      if (cs.position === "static") el.style.position = "relative";
      for (const n of ["Top", "Right", "Bottom", "Left"]) {
        const b = B[n];
        if (!vis(b)) continue;
        const s = document.createElement("span");
        s.className = "__hf2ae-border";
        const st = { position: "absolute", display: "block", background: b.c, pointerEvents: "none", margin: "0" };
        if (n === "Top" || n === "Bottom") Object.assign(st, { left: -B.Left.w + "px", width: `calc(100% + ${B.Left.w + B.Right.w}px)`, height: b.w + "px", [n.toLowerCase()]: -b.w + "px" });
        else Object.assign(st, { top: -B.Top.w + "px", height: `calc(100% + ${B.Top.w + B.Bottom.w}px)`, width: b.w + "px", [n.toLowerCase()]: -b.w + "px" });
        Object.assign(s.style, st);
        el.append(s);
        el.style["border" + n + "Color"] = "transparent";
        lines++;
      }
    }
    return { comps: tree.map((c) => ({ cid: c.cid, parent: c.parent, label: c.el.getAttribute("data-label") || c.el.getAttribute("data-composition-id"),
      src: c.el.getAttribute("data-composition-src"), w: +c.el.getAttribute("data-width") || c.el.offsetWidth, h: +c.el.getAttribute("data-height") || c.el.offsetHeight,
      start: (() => { const tl = (window.__timelines || {})[c.el.getAttribute("data-composition-id")]; const s = tl?.startTime?.(); return Number.isFinite(s) ? s : parseFloat(c.el.getAttribute("data-start")) || 0; })(),
      tlDur: (window.__timelines || {})[c.el.getAttribute("data-composition-id")]?.duration?.() || 0,
      dur: parseFloat(c.el.getAttribute("data-duration")) || 0 })), pseudo, lines };
  }

  function sample() {
    const out = {};
    for (const c of tree) out[c.cid] = { entries: [], visible: false, bg: null };
    const compOf = new Map(tree.map((c) => [c.el, c]));
    const walkComp = (c, opIn) => {
      const rec = out[c.cid];
      const cs = getComputedStyle(c.el);
      rec.visible = cs.visibility !== "hidden" && cs.display !== "none" && opIn > 0;
      if (!rec.visible) return;
      rec.bg = cs.backgroundColor;
      // the page shows through a transparent root: its colour comes from <body> or <html>
      if (!c.parent && rgba(rec.bg)[3] < 0.01) for (const p of [document.body, document.documentElement]) { const b = getComputedStyle(p).backgroundColor; if (rgba(b)[3] > 0.01) { rec.bg = b; break; } }
      if (cs.transform !== "none" && c.parent) warnings.add(`composition "${c.cid}" host is transformed: its content is exported flattened`);
      const base = c.el.getBoundingClientRect();
      let order = 0;
      const walk = (el, key, Lp, opp, blurp, zp, clip) => {
        const cs = getComputedStyle(el);
        if (cs.display === "none") return;
        let L = Lp;
        if (cs.transform && cs.transform !== "none") {
          const m = new DOMMatrix(cs.transform);
          if (!m.is2D) warnings.add("3D transforms are flattened to their 2D projection");
          L = mul(Lp, [m.a, m.b, m.c, m.d]);
        }
        const hidden = cs.visibility === "hidden";
        const op = opp * parseFloat(cs.opacity);
        const f = filterOf(cs.filter);
        const blur = Math.hypot(blurp, f.blur);
        // paint order key: the z-index of every positioned ancestor that sets one, outermost first (CSS stacking contexts),
        // compared element by element with a missing level as 0, then document order
        const z = cs.position !== "static" && cs.zIndex !== "auto" ? zp.concat(parseInt(cs.zIndex, 10) || 0) : zp;
        const isRoot = el === c.el;
        const nested = !isRoot && compOf.get(el);
        const rect = el.getBoundingClientRect();
        const w = el.offsetWidth ?? rect.width, h = el.offsetHeight ?? rect.height;
        const tag = el.tagName.toLowerCase();
        const blend = BLENDS.has(cs.mixBlendMode) ? cs.mixBlendMode : null;
        const common = (extra) => Object.assign({ n: order++, z, o: hidden ? 0 : op, L, clip, blur: Math.round(blur * 100) / 100, blend }, extra);
        if (nested) {
          const [x, y] = placement(rect, L, w, h, base);
          rec.entries.push(common({ k: key, t: "comp", cid: nested.cid, x, y, w, h }));
          walkComp(nested, hidden ? 0 : op);
          return;
        }
        if (f.other.length) warnings.add(`CSS filter ${f.other.join(", ")} is not converted (only blur is)`);
        if (tag === "svg") {
          const sw = parseFloat(cs.width) || rect.width, sh = parseFloat(cs.height) || rect.height;
          const clone = el.cloneNode(true); clone.setAttribute("width", sw); clone.setAttribute("height", sh); clone.style.color = cs.color;
          const src = new XMLSerializer().serializeToString(clone).replace(/currentColor/g, cs.color);
          const [x, y] = placement(rect, L, sw, sh, base);
          rec.entries.push(common({ k: key, t: "svg", x, y, w: sw, h: sh, svg: src, sig: hash(src) }));
          return;
        }
        if (tag === "canvas") {
          const sx = el.width ? w / el.width : 1, sy = el.height ? h / el.height : 1; // CSS size over backing size
          const Lc = mul(L, [sx, 0, 0, sy]);
          const [x, y] = placement(rect, Lc, el.width, el.height, base);
          if (!el.__hf2aeKey) el.__hf2aeKey = c.cid + "|" + key;
          rec.entries.push(common({ k: key, t: "canvas", L: Lc, x, y, w: el.width, h: el.height, ckey: el.__hf2aeKey }));
          return;
        }
        if (tag === "img" || tag === "video") {
          const [x, y] = placement(rect, L, w, h, base);
          const nw = tag === "img" ? el.naturalWidth : el.videoWidth, nh = tag === "img" ? el.naturalHeight : el.videoHeight;
          const op2 = cs.objectPosition.split(/\s+/);
          const e = common({ k: key, t: tag === "img" ? "image" : "video", x, y, w, h, src: el.currentSrc || el.src, nw, nh, fit: cs.objectFit,
            opos: [op2[0] || "50%", op2[1] || "50%"], r: radius(cs, w, h) });
          if (tag === "video") Object.assign(e, { start: parseFloat(el.getAttribute("data-start")) || 0, dur: parseFloat(el.getAttribute("data-duration")) || 0,
            mediaStart: parseFloat(el.getAttribute("data-media-start")) || 0, rate: parseFloat(el.getAttribute("data-playback-rate")) || 1,
            muted: el.muted || el.hasAttribute("muted"), audio: el.getAttribute("data-has-audio") === "true", vol: parseFloat(el.getAttribute("data-volume") ?? "1") });
          rec.entries.push(e);
          return;
        }
        const [x, y] = placement(rect, L, w, h, base);
        // clip-path clips the element itself and everything in it; overflow clips only what is inside (own text included)
        const cpAll = !isRoot ? clipShape(cs.clipPath, w, h) : null;
        const hasCp = cpAll && cpAll.kind !== "unsupported";
        const ownClip = (!isRoot && (hasCp || cs.overflow !== "visible" || cs.overflowX !== "visible")) ? "clip:" + key : clip;
        const boxClip = hasCp ? "clip:" + key : clip;
        if (!isRoot && w > 0 && h > 0) {
          const bg = rgba(cs.backgroundColor), bw = parseFloat(cs.borderTopWidth) || 0, bc = rgba(cs.borderTopColor);
          const ow = cs.outlineStyle !== "none" ? parseFloat(cs.outlineWidth) || 0 : 0, oc = rgba(cs.outlineColor);
          const sh = shadows(cs.boxShadow).filter((s) => !s.inset && s.c[3] > 0.001);
          const hasImage = cs.backgroundImage && cs.backgroundImage !== "none";
          const borderVisible = bw > 0 && cs.borderTopStyle !== "none" && bc[3] > 0.001;
          const visible = bg[3] > 0.001 || borderVisible || (ow > 0 && oc[3] > 0.001) || sh.length || hasImage;
          const r = radius(cs, w, h);
          // what a shape layer cannot carry is painted by the browser instead: images / gradients, inset or several shadows,
          // spread, elliptical or mixed corner radii
          const radii = [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius];
          const bake = visible && (hasImage || shadows(cs.boxShadow).some((s) => s.inset) || sh.length > 1 || sh.some((s) => s.spread) ||
            new Set(radii).size > 1 || radii.some((v) => v.trim().includes(" ")) || (cs.borderTopStyle !== "solid" && cs.borderTopStyle !== "dashed" && borderVisible));
          if (bake) {
            const props = ["backgroundColor", "backgroundImage", "backgroundSize", "backgroundPosition", "backgroundRepeat", "backgroundClip", "backgroundOrigin",
              "borderTop", "borderRight", "borderBottom", "borderLeft", "borderTopLeftRadius", "borderTopRightRadius", "borderBottomRightRadius", "borderBottomLeftRadius",
              "boxShadow", "outline", "outlineOffset"];
            const style = {}; for (const p of props) style[p] = cs[p];
            style.width = w + "px"; style.height = h + "px";
            const pad = Math.ceil(Math.max(0, ...sh.map((s) => Math.abs(s.x) + Math.abs(s.y) + s.blur * 2 + Math.max(0, s.spread)), ow + (parseFloat(cs.outlineOffset) || 0)));
            const sig = hash(JSON.stringify(style));
            rec.entries.push(common({ k: key, t: "bake", x, y, w, h, style, pad, sig, clip: boxClip }));
          } else if (visible) {
            const hard = sh.length === 1 && sh[0].blur === 0 ? sh[0] : null, soft = sh.length === 1 && sh[0].blur > 0 ? sh[0] : null;
            rec.entries.push(common({ k: key, t: "box", x, y, w, h, r, bg, bw: borderVisible ? bw : 0, bc, ds: cs.borderTopStyle === "dashed" ? 1 : 0,
              ow, oc, oo: parseFloat(cs.outlineOffset) || 0, sh: hard ? { x: hard.x, y: hard.y, c: hard.c } : null, soft, clip: boxClip }));
          }
          const cp = cpAll;
          if (cp && cp.kind === "unsupported") warnings.add(`clip-path ${cp.css} is not converted`);
          if (cp && cp.kind !== "unsupported") rec.entries.push({ k: "clip:" + key, t: "clip", n: -1, o: 1, L, x, y, w, h, shape: cp, clip });
          else if (cs.overflow !== "visible" || cs.overflowX !== "visible") rec.entries.push({ k: "clip:" + key, t: "clip", n: -1, o: 1, L, x, y, w, h, shape: { kind: "rrect", x: 0, y: 0, w, h, r }, clip });
        }
        // text nodes owned by this element, one entry per rendered line
        let ti = 0;
        for (const node of el.childNodes) {
          if (node.nodeType !== 3) continue;
          const s = node.textContent;
          if (!/\S/.test(s)) continue;
          const det = L[0] * L[3] - L[1] * L[2];
          if (Math.abs(det) < 1e-6) { ti++; continue; }
          const range = document.createRange();
          // split at rendered line breaks: group word ranges by their top
          const words = [...s.matchAll(/\S+/g)];
          const linesOut = [];
          let cur = null;
          for (const wd of words) {
            range.setStart(node, wd.index); range.setEnd(node, wd.index + wd[0].length);
            const rr = range.getClientRects()[0];
            if (!rr) continue;
            // in the element's unrotated frame, a new line starts lower down
            const ly = (-L[1] * (rr.left - base.left - x) + L[0] * (rr.top - base.top - y)) / det;
            if (!cur || ly > cur.ly + parseFloat(cs.fontSize) * 0.6) { cur = { a: wd.index, b: wd.index + wd[0].length, ly }; linesOut.push(cur); }
            else cur.b = wd.index + wd[0].length;
          }
          const lsPx = cs.letterSpacing === "normal" ? 0 : parseFloat(cs.letterSpacing);
          const fs = parseFloat(cs.fontSize);
          const stroke = parseFloat(cs.webkitTextStrokeWidth) || 0;
          const tsh = shadows(cs.textShadow)[0] || null;
          linesOut.forEach((ln, li) => {
            range.setStart(node, ln.a); range.setEnd(node, ln.b);
            const rr = range.getBoundingClientRect();
            if (rr.width === 0) return;
            const vx = rr.left - base.left - x, vy = rr.top - base.top - y;
            const lx = (L[3] * vx - L[2] * vy) / det, lyy = (-L[1] * vx + L[0] * vy) / det;
            const txt = textCase(s.slice(ln.a, ln.b).replace(/\s+/g, " "), cs.textTransform);
            ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
            const im = ctx.measureText(txt);
            const col = rgba(cs.color);
            rec.entries.push(common({ k: key + "#t" + ti + (linesOut.length > 1 || li ? "." + li : ""), t: "text", o: (hidden ? 0 : op) * col[3], x, y, lx, ly: lyy + ascent(cs), txt,
              ff: cs.fontFamily, fw: cs.fontWeight, fst: cs.fontStyle, fs, ls: lsPx / fs, tw: im.actualBoundingBoxLeft + im.actualBoundingBoxRight + lsPx * (txt.length - 1),
              col, stroke: stroke ? { w: stroke, c: rgba(cs.webkitTextStrokeColor) } : null, tsh: tsh && tsh.c[3] > 0.001 ? tsh : null, clip: ownClip }));
          });
          ti++;
        }
        const counts = {};
        for (const ch of el.children) {
          if (/^(SCRIPT|STYLE|TEMPLATE|AUDIO|LINK|META)$/.test(ch.tagName)) continue;
          const cls = ((ch.getAttribute("class") || "").split(/\s+/)[0] || "").replace(/^__hf2ae-/, "hf2ae-");
          const sig = ch.tagName.toLowerCase() + (ch.id ? "#" + ch.id : cls ? "." + cls : "");
          counts[sig] = (counts[sig] || 0) + 1;
          walk(ch, key + "/" + sig + ":" + (counts[sig] - 1), L, op, blur, z, ownClip);
        }
      };
      walk(c.el, c.cid, [1, 0, 0, 1], 1, 0, [], null);
    };
    const root = tree.find((c) => !c.parent);
    walkComp(root, 1);
    return out;
  }

  // changed canvas pixels (keyed by first sighting), null when unchanged since the last call
  function canvases() {
    const res = {};
    for (const cv of document.querySelectorAll("canvas")) {
      if (!cv.__hf2aeKey || !cv.width || !cv.height) continue;
      let url;
      try { url = cv.toDataURL("image/png"); } catch { warnings.add("a canvas is tainted (cross-origin pixels) and cannot be exported"); continue; }
      const h = hash(url);
      if (cv.__hf2aeHash === h) { res[cv.__hf2aeKey] = null; continue; }
      cv.__hf2aeHash = h;
      res[cv.__hf2aeKey] = url;
    }
    return res;
  }

  // every <audio> with its owning composition and authored timing (composition-local seconds)
  function audio() {
    return [...document.querySelectorAll("audio")].map((a) => {
      const owner = a.closest("[data-composition-id]");
      const c = tree.find((t) => t.el === owner);
      return { id: a.id, src: a.currentSrc || a.src || a.querySelector("source")?.src, cid: c ? c.cid : null,
        start: parseFloat(a.getAttribute("data-start")) || 0, dur: parseFloat(a.getAttribute("data-duration")) || 0,
        mediaStart: parseFloat(a.getAttribute("data-media-start")) || 0, vol: parseFloat(a.getAttribute("data-volume") ?? "1"),
        fx: a.hasAttribute("data-fx-chain") || a.hasAttribute("data-automation"), label: a.getAttribute("data-label") || a.id };
    });
  }

  // @font-face rules the page declares: family alias -> real files (resolved URLs)
  function fontFaces() {
    const out = [];
    const visit = (rules) => {
      for (const r of rules) {
        if (r.type === CSSRule.FONT_FACE_RULE) {
          const st = r.style;
          const src = [...(st.getPropertyValue("src").matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g))].map((m) => new URL(m[1], r.parentStyleSheet.href || location.href).href);
          out.push({ family: st.getPropertyValue("font-family").replace(/^["']|["']$/g, "").trim(), weight: st.getPropertyValue("font-weight") || "400",
            style: st.getPropertyValue("font-style") || "normal", src });
        } else if (r.cssRules) visit(r.cssRules);
      }
    };
    for (const ss of document.styleSheets) { try { visit(ss.cssRules); } catch {} }
    return out;
  }

  window.__hf2ae = { prepare, sample, canvases, audio, fontFaces, warnings: () => [...warnings] };
})();
