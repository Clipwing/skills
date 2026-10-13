// fonts.mjs: what After Effects needs to set the same type: for every (CSS family, weight, style) the text uses, the real
// family / style / PostScript name read from the font file itself (CSS aliases like "Brand Sans" point at Inter files),
// a category for picking a fallback, and the files to install when After Effects cannot see the face.
import { writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";
import { fileURLToPath } from "node:url";

const WEIGHT_NAMES = { 100: "Thin", 200: "ExtraLight", 300: "Light", 400: "Regular", 500: "Medium", 600: "SemiBold", 700: "Bold", 800: "ExtraBold", 900: "Black" };

function firstFamily(ff) { return ff.split(",")[0].trim().replace(/^["']|["']$/g, ""); }
function genericOf(ff) {
  const g = ff.split(",").map((s) => s.trim().replace(/^["']|["']$/g, "").toLowerCase());
  if (g.includes("monospace") || g.some((s) => /mono|code|consol|courier/.test(s))) return "mono";
  if (g.includes("serif") && !g.includes("sans-serif")) return "serif";
  if (g.some((s) => /serif|garamond|georgia|times|playfair|baskerville|caslon|bodoni|didot/.test(s)) && !g.some((s) => /sans/.test(s))) return "serif";
  return "sans";
}
const wnum = (w) => (w === "normal" ? 400 : w === "bold" ? 700 : parseInt(w, 10) || 400);

// pick the @font-face rule for a family / weight / style (weight ranges "100 900" allowed)
function pickFace(faces, fam, w, italic) {
  const c = faces.filter((f) => f.family.toLowerCase() === fam.toLowerCase());
  if (!c.length) return null;
  const score = (f) => {
    const [lo, hi] = f.weight.split(/\s+/).map(wnum);
    const d = w < lo ? lo - w : w > (hi ?? lo) ? w - (hi ?? lo) : 0;
    return d + ((f.style === "italic" || f.style === "oblique") !== italic ? 1000 : 0);
  };
  return c.sort((a, b) => score(a) - score(b))[0];
}

export async function resolveFonts({ hf, usage, faces, fetchUrl, serverOrigin, projectDir, fontsDir, log }) {
  const fontkit = hf.require("fontkit");
  const out = [];
  mkdirSync(fontsDir, { recursive: true });
  for (const u of usage) {
    const fam = firstFamily(u.ff), w = wnum(u.fw), italic = u.fst === "italic" || u.fst === "oblique";
    const rec = { css: `${u.ff}|${u.fw}|${u.fst}`, cssFamily: fam, weight: w, italic, category: genericOf(u.ff), family: fam,
      style: (WEIGHT_NAMES[Math.round(w / 100) * 100] || "Regular") + (italic ? " Italic" : ""), ps: null, file: null };
    const face = pickFace(faces, fam, w, italic);
    if (face && face.src.length) {
      for (const src of face.src) {
        try {
          let buf, local = null;
          if (src.startsWith(serverOrigin)) { local = join(projectDir, decodeURIComponent(new URL(src).pathname)); buf = await import("node:fs").then((fs) => fs.readFileSync(local)); }
          else if (src.startsWith("file:")) { local = fileURLToPath(src); buf = await import("node:fs").then((fs) => fs.readFileSync(local)); }
          else buf = Buffer.from(await (await fetchUrl(src)).arrayBuffer());
          let font = fontkit.create(buf);
          if (font.fonts) font = font.fonts[0]; // collections
          // typographic family (name ID 16) when present: "Outfit", not the default instance's "Outfit Thin"
          const nm = (id) => { const r = font.name?.records?.[id]; return r ? r.en || Object.values(r)[0] : null; };
          let family = nm("preferredFamily") || font.familyName;
          // variable fonts often name the family after their default instance ("Outfit Thin"): drop the style word
          if (font.variationAxes && font.variationAxes.wght && !nm("preferredFamily")) family = family.replace(/\s+(Thin|Hairline|ExtraLight|UltraLight|Light|Regular|Book|Medium|SemiBold|DemiBold|Bold|ExtraBold|UltraBold|Black|Heavy)$/i, "");
          if (font.variationAxes && font.variationAxes.wght) {
            // variable font: the named instance closest to the weight (After Effects lists instances by style name)
            const inst = Object.entries(font.namedVariations || {}).map(([name, axes]) => ({ name, w: axes.wght })).sort((a, b) => Math.abs(a.w - w) - Math.abs(b.w - w))[0];
            rec.family = family; rec.style = inst ? inst.name + (italic && !/italic/i.test(inst.name) ? " Italic" : "") : rec.style;
          } else {
            rec.family = family; rec.style = nm("preferredSubfamily") || font.subfamilyName; rec.ps = font.postscriptName;
          }
          if (font["OS/2"] && font.post && font.post.isFixedPitch) rec.category = "mono";
          // keep a copy to install (After Effects reads TTF / OTF; WOFF / WOFF2 must be installed from the original files)
          const ext = (local || src).split("?")[0].split(".").pop().toLowerCase();
          if (["ttf", "otf", "ttc"].includes(ext)) {
            const name = (rec.ps || `${rec.family}-${rec.style}`).replace(/[^\w.-]+/g, "") + "." + ext;
            if (!existsSync(join(fontsDir, name))) writeFileSync(join(fontsDir, name), buf);
            rec.file = name;
          } else {
            // a Google family fetched by page.mjs already has TrueType copies in fontsDir
            const stem = fam.replace(/\s+/g, "") + "-", have = readdirSync(fontsDir).filter((f) => f.startsWith(stem) && f.endsWith(".ttf"));
            const g = have.find((f) => f.startsWith(stem + w + (italic ? "Italic" : ""))) || have.find((f) => /Italic/.test(f) === italic) || have[0];
            rec.file = g || basename(local || src.split("?")[0]) + " (web font: install the TTF/OTF of this family)";
          }
          break;
        } catch (e) { log(`font ${fam}: could not read ${src} (${e.message})`); }
      }
    }
    out.push(rec);
  }
  return out;
}
