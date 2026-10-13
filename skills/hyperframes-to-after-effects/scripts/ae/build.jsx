// build.jsx: builds an editable After Effects project from a hyperframes-to-after-effects export folder.
// Run through scripts/hf2ae.mjs (it writes a small wrapper that sets HF2AE before evaluating this file):
//   HF2AE = { out: "<export folder>", aep: "<file to save>", intoOpen: false }
// Progress: <out>/ae_status.txt (current step), <out>/ae_build_log.txt (per composition, timings, problems).
// ExtendScript is ES3: no let/const, arrow functions, Array.map/indexOf or JSON.
// Never writes Source Text keyframes: they make every later scripted edit in the project crawl (see text recipes).
(function () {
  var CFG = $.global.HF2AE;
  var OUT = CFG.out.replace(/\\/g, "/").replace(/\/$/, "") + "/";
  var T0 = new Date().getTime();
  function sec() { return ((new Date().getTime() - T0) / 1000).toFixed(1) + "s"; }
  function writeFile(p, s, mode) { var f = new File(p); f.encoding = "UTF-8"; f.open(mode || "w"); f.write(s); f.close(); }
  function log(s) { writeFile(OUT + "ae_build_log.txt", "[" + sec() + "] " + s + "\n", "a"); }
  function status(s) { writeFile(OUT + "ae_status.txt", "[" + sec() + "] " + s); }
  function readJSON(p) { var f = new File(p); f.encoding = "UTF-8"; f.open("r"); var s = f.read(); f.close(); return eval("(" + s + ")"); }

  writeFile(OUT + "ae_build_log.txt", "");
  log("start, After Effects " + app.version);
  app.beginSuppressDialogs();
  try { build(); log("DONE"); status("DONE"); }
  catch (e) { log("FAILED: " + e.toString() + (e.line ? " (line " + e.line + ")" : "")); status("FAILED: " + e.toString()); }
  finally { app.endSuppressDialogs(false); }

  function build() {
    var M = readJSON(OUT + "manifest.json");
    var FPS = M.fps;
    var proj = app.project;
    if (!CFG.intoOpen && proj.numItems > 0) throw new Error("After Effects has a project open with items in it; save and close it (File > Close Project), or build with --into-open");
    var aepFile = new File(CFG.aep);
    proj.save(aepFile);
    log("saving to " + aepFile.fsName);

    var HOLD = KeyframeInterpolationType.HOLD, LINEAR = KeyframeInterpolationType.LINEAR;
    function folder(name, parent) { var f = proj.items.addFolder(name); if (parent) f.parentFolder = parent; return f; }
    var projName = M.project.replace(/\\/g, "/").split("/").pop();
    var fRoot = folder(projName + " (HyperFrames)"), fComps = folder("Compositions", fRoot), fFoot = folder("Footage", fRoot),
      fSeq = folder("Sequences", fRoot), fAudio = folder("Audio", fRoot), fSolids = folder("Solids", fRoot);

    // ------------------------------------------------------------ helpers
    function cssRGB(s) { var m = String(s).match(/[\d.]+/g); if (!m) return null; return { c: [m[0] / 255, m[1] / 255, m[2] / 255], a: m.length > 3 ? +m[3] : 1 }; }
    function isStatic(tr) { return tr.v !== undefined; }
    function first(tr) { return tr.v !== undefined ? tr.v : tr.k[0][1]; }
    function anyOf(tr, fn) { if (!tr) return false; if (tr.v !== undefined) return fn(tr.v); for (var i = 0; i < tr.k.length; i++) if (fn(tr.k[i][1])) return true; return false; }
    function apply(prop, tr, map, hold) {
      if (!tr) return;
      if (tr.v !== undefined) { prop.setValue(map(tr.v)); return; }
      var times = [], vals = [];
      for (var i = 0; i < tr.k.length; i++) { times.push(tr.k[i][0] / FPS); vals.push(map(tr.k[i][1])); }
      prop.setValuesAtTimes(times, vals);
      if (hold) holdAll(prop);
    }
    function holdAll(prop) { for (var j = 1; j <= prop.numKeys; j++) prop.setInterpolationTypeAtKey(j, HOLD, HOLD); }
    // position split into X / Y so nothing curves in space; scale multiplied by [mx, my] (footage scale, fit)
    function transform(layer, L, mul, anchor) {
      var tg = layer.property("ADBE Transform Group");
      tg.property("ADBE Anchor Point").setValue(anchor || [0, 0]);
      tg.property("ADBE Position").dimensionsSeparated = true;
      apply(tg.property("ADBE Position_0"), L.pos, function (v) { return v[0]; });
      apply(tg.property("ADBE Position_1"), L.pos, function (v) { return v[1]; });
      var m = mul || [1, 1];
      apply(tg.property("ADBE Scale"), L.scale, function (v) { return [v[0] * m[0], v[1] * m[1]]; });
      apply(tg.property("ADBE Rotate Z"), L.rot, function (v) { return v[0]; });
      apply(tg.property("ADBE Opacity"), L.op, function (v) { return v[0]; });
    }
    // CSS blur(σ) -> Gaussian Blur; mix-blend-mode -> blending mode
    var BLEND = { "multiply": "MULTIPLY", "screen": "SCREEN", "overlay": "OVERLAY", "darken": "DARKEN", "lighten": "LIGHTEN", "color-dodge": "COLOR_DODGE",
      "color-burn": "COLOR_BURN", "hard-light": "HARD_LIGHT", "soft-light": "SOFT_LIGHT", "difference": "DIFFERENCE", "exclusion": "EXCLUSION",
      "hue": "HUE", "saturation": "SATURATION", "color": "COLOR", "luminosity": "LUMINOSITY" };
    var BLUR_K = 2.0; // After Effects Blurriness per CSS blur px (calibrated by verify)
    function effects(layer, L) {
      if (L.blur && anyOf(L.blur, function (v) { return v[0] > 0.05; })) {
        var gb = layer.property("ADBE Effect Parade").addProperty("ADBE Gaussian Blur 2");
        apply(gb.property("ADBE Gaussian Blur 2-0001"), L.blur, function (v) { return v[0] * BLUR_K; });
        gb.property("ADBE Gaussian Blur 2-0003").setValue(0);
      }
      if (L.blend && BLEND[L.blend]) layer.blendingMode = BlendingMode[BLEND[L.blend]];
      if (L.soft) { // soft shadow [x, y, blur, r, g, b, a] -> Drop Shadow
        var ds = layer.property("ADBE Effect Parade").addProperty("ADBE Drop Shadow");
        apply(ds.property("ADBE Drop Shadow-0001"), L.soft, function (v) { return [v[3], v[4], v[5]]; });
        apply(ds.property("ADBE Drop Shadow-0002"), L.soft, function (v) { return v[6] * 255; });
        apply(ds.property("ADBE Drop Shadow-0003"), L.soft, function (v) { return (Math.atan2(v[0], -v[1]) * 180) / Math.PI; });
        apply(ds.property("ADBE Drop Shadow-0004"), L.soft, function (v) { return Math.sqrt(v[0] * v[0] + v[1] * v[1]); });
        apply(ds.property("ADBE Drop Shadow-0005"), L.soft, function (v) { return v[2]; });
      }
    }
    function rectGroup(contents, name) {
      var g = contents.addProperty("ADBE Vector Group"); g.name = name;
      var c = g.property("ADBE Vectors Group");
      return { g: g, c: c, r: c.addProperty("ADBE Vector Shape - Rect") };
    }
    // a rounded rectangle as a bezier Shape (masks have no roundness of their own)
    function rrectShape(x, y, w, h, r) {
      r = Math.max(0, Math.min(r, w / 2, h / 2));
      var s = new Shape(), k = 0.5523 * r;
      if (r < 0.01) { s.vertices = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]; s.closed = true; return s; }
      s.vertices = [[x + r, y], [x + w - r, y], [x + w, y + r], [x + w, y + h - r], [x + w - r, y + h], [x + r, y + h], [x, y + h - r], [x, y + r]];
      s.inTangents = [[-k, 0], [0, 0], [0, -k], [0, 0], [k, 0], [0, 0], [0, k], [0, 0]];
      s.outTangents = [[0, 0], [k, 0], [0, 0], [0, k], [0, 0], [-k, 0], [0, 0], [0, -k]];
      s.closed = true; return s;
    }
    function ellipseShape(cx, cy, rx, ry) {
      var s = new Shape(), kx = 0.5523 * rx, ky = 0.5523 * ry;
      s.vertices = [[cx, cy - ry], [cx + rx, cy], [cx, cy + ry], [cx - rx, cy]];
      s.inTangents = [[-kx, 0], [0, -ky], [kx, 0], [0, ky]];
      s.outTangents = [[kx, 0], [0, ky], [-kx, 0], [0, -ky]];
      s.closed = true; return s;
    }
    function polyShape(pts) { var s = new Shape(); s.vertices = pts.length ? pts : [[0, 0]]; s.closed = true; return s; }

    // ------------------------------------------------------------ fonts: the real face when After Effects has it,
    // else the closest installed face of the same kind (and its width is fitted to the original, per text layer)
    var AEF = [];
    try { var all = app.fonts.allFonts; for (var a = 0; a < all.length; a++) for (var b = 0; b < all[a].length; b++) AEF.push(all[a][b]); } catch (eF) {}
    function styleWeight(s) {
      s = String(s).toLowerCase().replace(/[\s_-]/g, "");
      var w = 400;
      if (/thin|hairline/.test(s)) w = 100; else if (/extralight|ultralight/.test(s)) w = 200; else if (/light/.test(s)) w = 300;
      else if (/semibold|demibold/.test(s)) w = 600; else if (/extrabold|ultrabold/.test(s)) w = 800; else if (/black|heavy/.test(s)) w = 900;
      else if (/bold/.test(s)) w = 700; else if (/medium/.test(s)) w = 500;
      return w;
    }
    function faceIn(family, weight, italic) {
      var best = null, bs = 1e9, fam = String(family).toLowerCase();
      for (var i = 0; i < AEF.length; i++) {
        var f = AEF[i];
        if (String(f.familyName).toLowerCase() !== fam && String(f.nativeFamilyName || "").toLowerCase() !== fam) continue;
        var it = /italic|oblique/i.test(f.styleName);
        var s = Math.abs(styleWeight(f.styleName) - weight) + (it !== italic ? 1000 : 0) + (f.isSubstitute ? 5000 : 0);
        if (s < bs) { bs = s; best = f; }
      }
      return best;
    }
    var FALLBACK = { sans: ["Inter", "Helvetica Neue", "Helvetica", "Arial", "Segoe UI", "Roboto"], serif: ["Playfair Display", "Georgia", "Times New Roman", "Times"],
      mono: ["JetBrains Mono", "Roboto Mono", "SF Mono", "Menlo", "Consolas", "Courier New"] };
    var FONTS = {}, fontNotes = [];
    for (var fi = 0; fi < M.fonts.length; fi++) {
      var R = M.fonts[fi], face = faceIn(R.family, R.weight, R.italic), sub = false;
      if (!face && R.cssFamily !== R.family) face = faceIn(R.cssFamily, R.weight, R.italic);
      if (!face) {
        var list = FALLBACK[R.category] || FALLBACK.sans;
        for (var li = 0; li < list.length && !face; li++) face = faceIn(list[li], R.weight, R.italic);
        sub = true;
      }
      FONTS[R.css] = { ps: face ? face.postScriptName : "ArialMT", sub: sub || !face, name: face ? face.familyName + " " + face.styleName : "Arial" };
      if (sub) fontNotes.push(R.family + " " + R.style + " -> " + FONTS[R.css].name + (R.file ? " (install " + R.file + " to use the original)" : ""));
    }
    if (fontNotes.length) log("fonts substituted (width fitted per layer): " + fontNotes.join("; "));

    // ------------------------------------------------------------ footage (imported once each)
    var footage = {};
    function importFile(rel, opts) {
      var key = rel + (opts && opts.seq ? "#seq" : "");
      if (footage[key]) return footage[key];
      var io = new ImportOptions(new File(OUT + rel));
      if (opts && opts.seq) { io.sequence = true; io.forceAlphabetical = true; }
      var it = proj.importFile(io);
      it.parentFolder = opts && opts.folder ? opts.folder : fFoot;
      if (opts && opts.seq && opts.fps) it.mainSource.conformFrameRate = opts.fps;
      footage[key] = it; return it;
    }

    // ------------------------------------------------------------ text
    function jsStr(s) { return '"' + String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, "\\r") + '"'; }
    function srcOf(layer) { return layer.property("ADBE Text Properties").property("ADBE Text Document"); }
    function makeText(comp, L, txt) {
      var D = L.doc0, F = FONTS[D.ff + "|" + D.fw + "|" + D.fst] || { ps: "ArialMT", sub: true };
      var layer = comp.layers.addText(txt || " ");
      var sp = srcOf(layer), td = sp.value;
      td.resetCharStyle(); td.resetParagraphStyle();
      td.text = txt || " ";
      try { td.font = F.ps; } catch (e) {}
      td.fontSize = D.fs;
      td.applyFill = true; td.fillColor = D.col;
      if (L.stroke) { td.applyStroke = true; td.strokeColor = [L.stroke.c[0], L.stroke.c[1], L.stroke.c[2]]; td.strokeWidth = L.stroke.w; td.strokeOverFill = false; }
      else td.applyStroke = false;
      td.tracking = Math.round(D.ls * 1000);
      td.justification = ParagraphJustification.LEFT_JUSTIFY;
      // a substitute face is fitted to the width the text had in the film; measure the string the film measured
      var fitK = 1;
      if (F.sub && D.tw > 0 && D.txt) {
        td.text = D.txt; sp.setValue(td);
        var rw = layer.sourceRectAtTime(0, false).width;
        if (rw > 0) fitK = D.tw / rw;
        td.text = txt || " ";
      }
      sp.setValue(td);
      transform(layer, L);
      apply(layer.property("ADBE Transform Group").property("ADBE Anchor Point"), L.anchor, function (v) { return [v[0], v[1]]; });
      effects(layer, L);
      layer.comment = "font: " + F.ps + (F.sub ? " (stands in for " + D.ff.split(",")[0] + ")" : "");
      // so words set side by side keep their spaces
      if (F.sub && txt) {
        var k = fitK;
        if (k > 0.6 && k < 1.4 && Math.abs(k - 1) > 0.005) {
          var sc = layer.property("ADBE Transform Group").property("ADBE Scale");
          if (sc.numKeys === 0) { var sv = sc.value; sc.setValue([sv[0] * k, sv[1]]); }
          else for (var j = 1; j <= sc.numKeys; j++) { var kv = sc.keyValue(j); sc.setValueAtKey(j, [kv[0] * k, kv[1]]); }
          layer.comment += ", width x" + k.toFixed(3);
        }
      }
      layer.name = (txt || "text").substr(0, 40);
      return layer;
    }
    function trim(layer, from, to) { layer.inPoint = from / FPS; if (to !== null && to !== undefined) layer.outPoint = to / FPS; return { l: layer, trimmed: true }; }
    function animator(layer, name) {
      var an = layer.property("ADBE Text Properties").property("ADBE Text Animators").addProperty("ADBE Text Animator");
      an.name = name;
      return { an: an, sel: an.property("ADBE Text Selectors").addProperty("ADBE Text Selector"), props: an.property("ADBE Text Animator Properties") };
    }
    function colourAnimator(layer, colors) {
      var fc = animator(layer, "Colour").props.addProperty("ADBE Text Fill Color");
      var t = [], v = [];
      for (var i = 0; i < colors.length; i++) { t.push(colors[i][0] / FPS); v.push(colors[i][1]); }
      fc.setValuesAtTimes(t, v);
      for (var j = 0; j < colors.length; j++) if (colors[j][2]) fc.setInterpolationTypeAtKey(j + 1, LINEAR, HOLD);
    }
    function textLayers(comp, L) {
      var P = L.plan, out = [], lay, i;
      if (P.mode === "static") out.push({ l: makeText(comp, L, P.txt) });
      else if (P.mode === "counter") {
        lay = makeText(comp, L, L.doc0.txt);
        var src;
        if (P.linear) src = "// the number follows time\nvar v = Math.floor(" + P.linear.a.toFixed(6) + " + " + P.linear.b.toFixed(6) + " * time + 1e-6);\n";
        else {
          var sl = lay.property("ADBE Effect Parade").addProperty("ADBE Slider Control"); sl.name = "Count";
          var spp = sl.property("ADBE Slider Control-0001"), ts = [], vs = [];
          for (i = 0; i < P.keys.length; i++) { ts.push(P.keys[i][0] / FPS); vs.push(P.keys[i][1]); }
          spp.setValuesAtTimes(ts, vs); holdAll(spp);
          src = "// the Count slider drives the number\nvar v = Math.round(effect(\"Count\")(1));\n";
        }
        var rad = [], pads = [], parts = [];
        for (i = 0; i < P.rad.length; i++) { rad.push(P.rad[i] === null ? 0 : P.rad[i]); pads.push(P.pads[i]); }
        for (i = 0; i < P.parts.length; i++) parts.push(jsStr(P.parts[i]));
        src += "var rad = [" + rad.join(",") + "], pads = [" + pads.join(",") + "], parts = [" + parts.join(",") + "];\n" +
          "var g = [];\nfor (var i = rad.length - 1; i > 0; i--) { g[i] = v % rad[i]; v = Math.floor(v / rad[i]); }\ng[0] = v;\n" +
          "var s = parts[0];\nfor (i = 0; i < g.length; i++) { var t = String(g[i]); while (t.length < pads[i]) t = \"0\" + t; s += t + parts[i + 1]; }\ns;";
        srcOf(lay).expression = src;
        out.push({ l: lay });
      } else if (P.mode === "typing") {
        for (i = 0; i < P.before.length; i++) if (P.before[i][0] !== "") { lay = makeText(comp, L, P.before[i][0]); out.push(trim(lay, P.before[i][1], P.before[i][2])); }
        lay = makeText(comp, L, P.final);
        out.push(trim(lay, P.from, null));
        var ty = animator(lay, "Typing");
        ty.props.addProperty("ADBE Text Opacity").setValue(0);
        var st = ty.sel.property("ADBE Text Percent Start"), tt = [], tv = [];
        for (i = 0; i < P.keys.length; i++) { tt.push(P.keys[i][0] / FPS); tv.push(100 * P.keys[i][1] / P.final.length); }
        st.setValuesAtTimes(tt, tv); holdAll(st);
      } else if (P.mode === "split") {
        for (i = 0; i < P.parts.length; i++) if (P.parts[i][0] !== "") { lay = makeText(comp, L, P.parts[i][0]); out.push(trim(lay, P.parts[i][1], P.parts[i][2])); }
      } else if (P.mode === "table") {
        lay = makeText(comp, L, P.rows[P.rows.length - 1][1]);
        var rows = [];
        for (i = 0; i < P.rows.length; i++) rows.push("[" + (P.rows[i][0] / FPS).toFixed(4) + ", " + jsStr(P.rows[i][1]) + "]");
        srcOf(lay).expression = "// [time, text] steps: edit the strings or times\nvar K = [" + rows.join(",\n  ") + "];\n" +
          "var s = K[0][1];\nfor (var i = 0; i < K.length && K[i][0] <= time + 0.0001; i++) s = K[i][1];\ns;";
        out.push({ l: lay });
      }
      if (P.colors) for (i = 0; i < out.length; i++) colourAnimator(out[i].l, P.colors);
      return out;
    }

    // ------------------------------------------------------------ shapes
    function boxLayer(comp, L) {
      var layer = comp.layers.addShape();
      var contents = layer.property("ADBE Root Vectors Group");
      var main = rectGroup(contents, "Box");
      var bw0 = first(L.border)[0];
      apply(main.r.property("ADBE Vector Rect Size"), L.size, function (v) { return [Math.max(0, v[0] - bw0), Math.max(0, v[1] - bw0)]; });
      apply(main.r.property("ADBE Vector Rect Position"), L.size, function (v) { return [v[0] / 2, v[1] / 2]; });
      apply(main.r.property("ADBE Vector Rect Roundness"), L.r, function (v) { return Math.max(0, v[0] - bw0 / 2); });
      if (anyOf(L.border, function (v) { return v[0] > 0 && v[4] > 0.001; })) {
        var st = main.c.addProperty("ADBE Vector Graphic - Stroke");
        apply(st.property("ADBE Vector Stroke Width"), L.border, function (v) { return v[0]; });
        apply(st.property("ADBE Vector Stroke Color"), L.border, function (v) { return [v[1], v[2], v[3]]; });
        apply(st.property("ADBE Vector Stroke Opacity"), L.border, function (v) { return v[0] > 0 ? v[4] * 100 : 0; });
        if (anyOf(L.dash, function (v) { return v === 1; })) {
          var ds = st.property("ADBE Vector Stroke Dashes");
          ds.addProperty("ADBE Vector Stroke Dash 1").setValue(10);
          apply(ds.addProperty("ADBE Vector Stroke Gap 1"), L.dash, function (v) { return v === 1 ? 7 : 0; }, true);
        }
      }
      if (anyOf(L.bg, function (v) { return v[3] > 0.001; })) {
        var fl = main.c.addProperty("ADBE Vector Graphic - Fill");
        apply(fl.property("ADBE Vector Fill Color"), L.bg, function (v) { return [v[0], v[1], v[2]]; });
        apply(fl.property("ADBE Vector Fill Opacity"), L.bg, function (v) { return v[3] * 100; });
      }
      if (anyOf(L.outline, function (v) { return v[0] > 0 && v[4] > 0.001; })) {
        var o = first(L.outline), ol = rectGroup(contents, "Outline");
        apply(ol.r.property("ADBE Vector Rect Size"), L.size, function (v) { return [v[0] + 2 * o[5] + o[0], v[1] + 2 * o[5] + o[0]]; });
        apply(ol.r.property("ADBE Vector Rect Position"), L.size, function (v) { return [v[0] / 2, v[1] / 2]; });
        apply(ol.r.property("ADBE Vector Rect Roundness"), L.r, function (v) { return v[0] + o[5] + o[0] / 2; });
        var os = ol.c.addProperty("ADBE Vector Graphic - Stroke");
        apply(os.property("ADBE Vector Stroke Width"), L.outline, function (v) { return Math.max(0.01, v[0]); });
        apply(os.property("ADBE Vector Stroke Color"), L.outline, function (v) { return [v[1], v[2], v[3]]; });
        apply(os.property("ADBE Vector Stroke Opacity"), L.outline, function (v) { return v[0] > 0 ? v[4] * 100 : 0; });
      }
      if (L.shadow) { // hard offset shadow: a copy of the box under it
        var sh = rectGroup(contents, "Shadow");
        apply(sh.r.property("ADBE Vector Rect Size"), L.size, function (v) { return [v[0], v[1]]; });
        apply(sh.r.property("ADBE Vector Rect Position"), L.size, function (v) { return [v[0] / 2, v[1] / 2]; });
        apply(sh.r.property("ADBE Vector Rect Roundness"), L.r, function (v) { return v[0]; });
        var sf = sh.c.addProperty("ADBE Vector Graphic - Fill");
        apply(sf.property("ADBE Vector Fill Color"), L.shadow, function (v) { return [v[2], v[3], v[4]]; });
        apply(sf.property("ADBE Vector Fill Opacity"), L.shadow, function (v) { return v[5] * 100; });
        apply(sh.g.property("ADBE Vector Transform Group").property("ADBE Vector Position"), L.shadow, function (v) { return [v[0], v[1]]; });
      }
      transform(layer, L);
      effects(layer, L);
      return layer;
    }

    // ------------------------------------------------------------ footage layers
    function fitOf(L) { // object-fit -> footage scale [sx, sy] and the box offset of the scaled content
      var nw = L.nw || L.w, nh = L.nh || L.h, sx = L.w / nw, sy = L.h / nh, s;
      if (L.fit === "contain" || L.fit === "scale-down") { s = Math.min(sx, sy); if (L.fit === "scale-down") s = Math.min(1, s); sx = sy = s; }
      else if (L.fit === "cover") { s = Math.max(sx, sy); sx = sy = s; }
      else if (L.fit === "none") { sx = sy = 1; }
      var cw = nw * sx, ch = nh * sy;
      function off(v, free) { v = String(v); if (v === "left" || v === "top") return 0; if (v === "right" || v === "bottom") return free; if (v === "center") return free / 2; if (/%$/.test(v)) return free * parseFloat(v) / 100; return parseFloat(v) || 0; }
      // footage pixels per natural pixel (a rasterised SVG is larger than its natural size)
      var kx = L.fileW ? nw / L.fileW : 1, ky = L.fileH ? nh / L.fileH : 1;
      return { sx: sx * kx, sy: sy * ky, ox: off(L.opos[0], L.w - cw), oy: off(L.opos[1], L.h - ch), cw: cw, ch: ch };
    }
    function footageLayer(comp, L, item) {
      var layer = comp.layers.add(item), f = fitOf(L);
      transform(layer, L, [f.sx, f.sy], [-f.ox / f.sx, -f.oy / f.sy]);
      // crop to the element box (cover / fixed size) and round its corners
      if (f.cw > L.w + 0.5 || f.ch > L.h + 0.5 || f.ox < -0.5 || f.oy < -0.5 || L.r > 0.5) {
        var mk = layer.property("ADBE Mask Parade").addProperty("ADBE Mask Atom");
        mk.name = "Element box";
        mk.property("ADBE Mask Shape").setValue(rrectShape(-f.ox / f.sx, -f.oy / f.sy, L.w / f.sx, L.h / f.sy, (L.r || 0) / f.sx));
      }
      effects(layer, L);
      return layer;
    }
    function seqLayer(comp, L, dur) {
      var item = L.pngs > 1 ? importFile(L.dir + "/f_00000.png", { seq: true, fps: L.seqFps, folder: fSeq }) : importFile(L.dir + "/f_00000.png", { folder: fSeq });
      var layer = comp.layers.add(item);
      if (L.pngs > 1 && L.seq && L.seq.length) {
        // a frame that holds reuses its PNG: Time Remap maps each sequence frame to its PNG; keys only where the step changes.
        // After Effects' two default keys are overwritten in place, never removed (removing them can loop forever)
        layer.timeRemapEnabled = true;
        var tr = layer.property("ADBE Time Remapping"), seq = L.seq, n = seq.length, sf = L.seqFps;
        var times = [], vals = [];
        for (var f = 0; f < n; f++) {
          var steady = f > 0 && f < n - 1 && seq[f] - seq[f - 1] === seq[f + 1] - seq[f];
          if (!steady) { times.push(f / sf); vals.push(Math.max(0, seq[f]) / sf); }
        }
        tr.setValuesAtTimes(times, vals);
        for (var j = 1; j <= tr.numKeys; j++) {
          var fr = Math.min(n - 1, Math.max(0, Math.round(tr.keyTime(j) * sf))), want = Math.max(0, seq[fr]) / sf;
          if (Math.abs(tr.keyValue(j) - want) > 1e-4) tr.setValueAtKey(j, want);
        }
      }
      layer.outPoint = dur;
      var m = L.scaleMul || 1;
      transform(layer, L, [m, m], L.offset ? [-L.offset[0] / m, -L.offset[1] / m] : null); // the PNG starts pad px before the box
      effects(layer, L);
      return layer;
    }

    // ------------------------------------------------------------ compositions
    var COMP = {}, META = {};
    for (var ci = 0; ci < M.comps.length; ci++) {
      var mc = M.comps[ci];
      var cc = proj.items.addComp(mc.parent ? mc.label : projName, mc.w || M.width, mc.h || M.height, 1, Math.max(1, mc.frames) / FPS, FPS);
      cc.parentFolder = mc.parent ? fComps : fRoot;
      var bg = cssRGB(mc.bg);
      cc.bgColor = bg && bg.a > 0.01 ? bg.c : [0, 0, 0];
      COMP[mc.cid] = cc; META[mc.cid] = mc;
    }
    var totals = { layers: 0, failed: 0 };
    for (var cj = 0; cj < M.comps.length; cj++) {
      var meta = M.comps[cj], comp = COMP[meta.cid], C = readJSON(OUT + meta.file), dur = comp.duration;
      status(meta.cid + ": building");
      var bgc = cssRGB(meta.bg);
      if (bgc && bgc.a > 0.01) {
        var solid = comp.layers.addSolid(bgc.c, meta.label + " background", comp.width, comp.height, 1, dur);
        solid.source.parentFolder = fSolids; solid.name = "Background"; solid.locked = true;
        if (bgc.a < 0.999) solid.property("ADBE Transform Group").property("ADBE Opacity").setValue(bgc.a * 100);
      }
      var made = {}, order = [], nl = C.layers.length, failed = 0;
      for (var i = 0; i < nl; i++) {
        var L = C.layers[i], outL = null, tl = new Date().getTime();
        status(meta.cid + ": layer " + (i + 1) + "/" + nl + " (" + L.t + ") " + L.k);
        try {
          if (L.t === "box") outL = [{ l: boxLayer(comp, L) }];
          else if (L.t === "text") outL = textLayers(comp, L);
          else if (L.t === "still") { var ly = comp.layers.add(importFile(L.src)); var m = L.scaleMul; transform(ly, L, [m, m], [-L.offset[0] / m, -L.offset[1] / m]); effects(ly, L); outL = [{ l: ly }]; }
          else if (L.t === "image") outL = [{ l: footageLayer(comp, L, importFile(L.src)) }];
          else if (L.t === "video") {
            var vl = footageLayer(comp, L, importFile(L.src));
            vl.stretch = 100 / (L.rate || 1);
            vl.startTime = L.vstart - L.mediaStart / (L.rate || 1);
            vl.inPoint = Math.max(0, L.vstart);
            if (L.vdur > 0) vl.outPoint = Math.min(dur, L.vstart + L.vdur);
            if (vl.hasAudio) {
              if (L.muted || !L.audio) vl.audioEnabled = false;
              else if (L.vol !== 1) { var dB = L.vol > 0 ? 20 * Math.log(L.vol) / Math.LN10 : -96; vl.property("ADBE Audio Group").property("ADBE Audio Levels").setValue([dB, dB]); }
            }
            outL = [{ l: vl, trimmed: true }];
          }
          else if (L.t === "canvas" || L.t === "seq") outL = [{ l: seqLayer(comp, L, dur) }];
          else if (L.t === "comp") {
            var pl = comp.layers.add(COMP[L.cid]);
            pl.startTime = L.startF / FPS;
            transform(pl, L);
            effects(pl, L);
            if (L.inF !== null) pl.inPoint = Math.max(0, L.inF / FPS);
            if (L.outF !== null) pl.outPoint = Math.min(dur, L.outF / FPS);
            pl.name = META[L.cid].label;
            outL = [{ l: pl, trimmed: true }];
          }
        } catch (err) {
          failed++;
          log("  " + meta.cid + ": " + L.t + " " + L.k + " -> " + err.toString() + (err.line ? " (line " + err.line + ")" : ""));
          outL = null;
        }
        if (outL && outL.length) {
          for (var u = 0; u < outL.length; u++) {
            var lay = outL[u].l;
            if (L.t !== "text" && L.t !== "comp") lay.name = L.k.split("/").slice(-1)[0].replace(/:\d+$/, "").substr(0, 40);
            if (!outL[u].trimmed && lay.outPoint < dur) lay.outPoint = dur;
          }
          made[L.k] = { layers: outL, clip: L.clip }; order.push(L.k);
        }
        var took = (new Date().getTime() - tl) / 1000;
        if (took > 3) log("  slow layer " + meta.cid + " " + (i + 1) + " (" + L.t + "): " + took.toFixed(1) + "s");
      }
      // mattes: overflow-hidden boxes and clip-path shapes, nested mattes matted by their own container
      var mattes = {}, CL = {}, nm = 0;
      for (var z = 0; z < C.clips.length; z++) CL[C.clips[z].k] = C.clips[z];
      var matteFor = function (key) {
        if (mattes[key]) return mattes[key];
        var c = CL[key]; if (!c) return null;
        status(meta.cid + ": matte " + key);
        var ml = comp.layers.addShape(); ml.name = "matte " + key.split("/").slice(-1)[0];
        var grp = ml.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group"); grp.name = "Matte";
        var vec = grp.property("ADBE Vectors Group");
        if (c.kind === "rrect") {
          var rr = vec.addProperty("ADBE Vector Shape - Rect");
          apply(rr.property("ADBE Vector Rect Size"), c.rect, function (v) { return [v[2], v[3]]; });
          apply(rr.property("ADBE Vector Rect Position"), c.rect, function (v) { return [v[0] + v[2] / 2, v[1] + v[3] / 2]; });
          apply(rr.property("ADBE Vector Rect Roundness"), c.rect, function (v) { return v[4]; });
        } else if (c.kind === "ellipse") {
          var el = vec.addProperty("ADBE Vector Shape - Ellipse");
          apply(el.property("ADBE Vector Ellipse Size"), c.ellipse, function (v) { return [v[2] * 2, v[3] * 2]; });
          apply(el.property("ADBE Vector Ellipse Position"), c.ellipse, function (v) { return [v[0], v[1]]; });
        } else {
          var pg = vec.addProperty("ADBE Vector Shape - Group");
          apply(pg.property("ADBE Vector Shape"), c.path, function (v) { return polyShape(v); }, false);
        }
        vec.addProperty("ADBE Vector Graphic - Fill").property("ADBE Vector Fill Color").setValue([1, 1, 1]);
        transform(ml, c);
        ml.enabled = false;
        ml.outPoint = dur;
        mattes[key] = ml; nm++;
        if (c.clip) { var outer = matteFor(c.clip); if (outer) try { ml.setTrackMatte(outer, TrackMatteType.ALPHA); } catch (eM) {} }
        return ml;
      };
      for (var q = 0; q < order.length; q++) {
        var k = order[q], cl = made[k].clip;
        if (!cl) continue;
        var mm = matteFor(cl);
        if (!mm) continue;
        for (var w = 0; w < made[k].layers.length; w++) {
          try { made[k].layers[w].l.setTrackMatte(mm, TrackMatteType.ALPHA); } catch (e2) { log("  " + meta.cid + ": matte " + k + " -> " + e2.toString()); }
        }
      }
      // audio owned by this composition
      for (var au = 0; au < M.audio.length; au++) {
        var A = M.audio[au];
        if (A.cid !== meta.cid) continue;
        var al = comp.layers.add(importFile(A.file, { folder: fAudio }));
        al.name = A.label || A.id || "audio";
        al.startTime = A.start - A.mediaStart; al.inPoint = Math.max(0, A.start);
        if (A.dur > 0) al.outPoint = Math.min(dur, A.start + A.dur);
        if (A.vol !== 1) { var db = A.vol > 0 ? 20 * Math.log(A.vol) / Math.LN10 : -96; al.property("ADBE Audio Group").property("ADBE Audio Levels").setValue([db, db]); }
        al.moveToEnd();
      }
      totals.layers += order.length; totals.failed += failed;
      log(meta.cid + ": " + order.length + " elements, " + nm + " mattes" + (failed ? ", " + failed + " FAILED" : ""));
      proj.save();
      $.gc();
    }
    COMP[M.root].openInViewer();
    proj.save();
    log("saved " + aepFile.fsName + ": " + M.comps.length + " compositions, " + totals.layers + " elements" + (totals.failed ? ", " + totals.failed + " failed" : ""));
  }
})();
