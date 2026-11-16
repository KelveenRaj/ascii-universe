// Builds the Solar System's surface maps (public/maps/*.png) from public-domain spacecraft maps.
// Run once after downloading the sources into maps-src/ (URLs in public/maps/SOURCES.md):
//
//   node scripts/planet-maps.mjs
//
// Each output is an equirectangular map, longitude −180°…180° east left to right, latitude 90°
// north at the top, with:
//   R = √albedo (the map's linear luminance, square-rooted so dark oceans keep their precision)
//   G = surface class × 32 (which colour ramp the shader uses), plus for Earth the city lights at
//       night in the low 5 bits (0…31); the shader reads G with texelFetch, so it is never blended
//   B = Earth: cloud cover; other bodies: 0
//   A = 255 (kept opaque: browsers may premultiply alpha, which would wreck the other channels)
// Classes are picked by simple, documented colour rules per body (below), not by hand.
import { mkdirSync } from 'node:fs';
import sharp from 'sharp';

const SRC = 'maps-src';
const OUT = 'public/maps';
mkdirSync(OUT, { recursive: true });

const srgbToLinear = (v) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** Reads a map resized to w×h, as RGB 0…1 (sRGB), optionally shifting longitude by `shift` px. */
async function read(file, w, h, { shift = 0, grey = false } = {}) {
  let img = sharp(`${SRC}/${file}`).resize(w, h, { fit: 'fill' }).removeAlpha();
  img = grey ? img.greyscale() : img.toColourspace('srgb');
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  const px = new Float32Array(w * h * 3);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const sx = (x + shift + w) % w;
      const i = (y * w + sx) * ch;
      const o = (y * w + x) * 3;
      px[o] = data[i] / 255;
      px[o + 1] = data[i + (ch > 1 ? 1 : 0)] / 255;
      px[o + 2] = data[i + (ch > 2 ? 2 : 0)] / 255;
    }
  return px;
}

const luma = (r, g, b) =>
  0.2126 * srgbToLinear(r * 255) + 0.7152 * srgbToLinear(g * 255) + 0.0722 * srgbToLinear(b * 255);
const sat = (r, g, b) => {
  const mx = Math.max(r, g, b);
  return mx === 0 ? 0 : (mx - Math.min(r, g, b)) / mx;
};

/** Writes one output map; `pick(r, g, b, lat, x, y)` returns [albedo 0…1, class, extraB, extraG]. */
async function write(name, w, h, src, pick) {
  const out = Buffer.alloc(w * h * 4);
  const counts = {};
  let sum = 0;
  for (let y = 0; y < h; y++) {
    const lat = 90 - ((y + 0.5) / h) * 180;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      const [alb, cls, b = 0, low = 0] = pick(src[i], src[i + 1], src[i + 2], lat, x, y);
      const o = (y * w + x) * 4;
      const a = Math.min(1, Math.max(0, alb));
      out[o] = Math.round(Math.sqrt(a) * 255);
      out[o + 1] = cls * 32 + low;
      out[o + 2] = b;
      out[o + 3] = 255;
      sum += a * Math.cos((lat * Math.PI) / 180);
      counts[cls] = (counts[cls] ?? 0) + 1;
    }
  }
  await sharp(out, { raw: { width: w, height: h, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toFile(`${OUT}/${name}.png`);
  const total = w * h;
  const share = Object.entries(counts)
    .map(([c, n]) => `${c}:${((100 * n) / total).toFixed(1)}%`)
    .join(' ');
  // area-weighted mean albedo (π/2 is the mean of cos(lat) per row times π… normalised below)
  const mean = sum / (w * h * (2 / Math.PI));
  console.log(`${name}.png ${w}×${h}  mean albedo ${mean.toFixed(4)}  classes ${share}`);
}

// Earth: Blue Marble NG (Jan 2004) + clouds + Black Marble 2016 city lights.
// Classes: 0 ocean, 1 forest, 2 grass/scrub, 3 desert, 4 ice and snow.
{
  const w = 1024;
  const h = 512;
  const land = await read('earth-bmng-200401.jpg', w, h);
  const clouds = await read('earth-clouds.jpg', w, h, { grey: true });
  const night = await read('earth-night.jpg', w, h, { grey: true });
  await write('earth', w, h, land, (r, g, b, lat, x, y) => {
    const i = (y * w + x) * 3;
    const L = luma(r, g, b);
    const s = sat(r, g, b);
    let cls;
    if (L > 0.45 && s < 0.18) cls = 4;
    else if (b > r + 0.03 && b >= g - 0.02 && L < 0.2) cls = 0;
    else if (r > g && g > b && L > 0.18) cls = 3;
    else if (g >= r && L < 0.12) cls = 1;
    else cls = 2;
    return [L, cls, Math.round(clouds[i] * 255), Math.round(night[i] * 31)];
  });
}

// Moon: LROC colour (NASA SVS CGI Moon Kit). Classes: 0 highlands, 1 maria (dark lava plains).
{
  const w = 512;
  const h = 256;
  const src = await read('moon-lroc.jpg', w, h);
  await write('moon', w, h, src, (r, g, b) => {
    const L = luma(r, g, b);
    // maria reflect roughly half to two-thirds as much as the highlands: below 0.7 × the median
    return [L, L < 0.36 ? 1 : 0];
  });
}

// Mars: Viking MDIM 2.1 colour mosaic. Classes: 0 bright dust, 1 dark basaltic ground, 2 polar ice.
{
  const w = 512;
  const h = 256;
  const src = await read('mars-mdim21.jpg', w, h);
  await write('mars', w, h, src, (r, g, b, lat) => {
    const L = luma(r, g, b);
    const s = sat(r, g, b);
    let cls = 0;
    if (Math.abs(lat) > 55 && L > 0.3 && s < 0.35) cls = 2;
    else if (L < 0.1) cls = 1;
    return [L, cls];
  });
}

// Mercury: MESSENGER monochrome basemap, centred on 180° (so shift by half a turn). One class:
// Mercury's true colour is a nearly uniform grey-brown.
{
  const w = 512;
  const h = 256;
  const src = await read('mercury-messenger.png', w, h, { shift: w / 2, grey: true });
  await write('mercury', w, h, src, (r) => [srgbToLinear(r * 255), 0]);
}

// Jupiter: Cassini PIA07782. Classes: 0 zones (light), 1 belts (dark, brown), 2 red (the Great Red
// Spot and the reddest belt edges), 3 polar haze.
{
  const w = 1024;
  const h = 512;
  const src = await read('jupiter-pia07782.jpg', w, h);
  // Zones are near-white (red ≈ blue), belts are warm brown; the reddest pixels are the GRS and
  // red belt edges; above ~48° latitude the bands fade into grey polar haze.
  await write('jupiter', w, h, src, (r, g, b, lat) => {
    const L = luma(r, g, b);
    const warm = r - b;
    let cls;
    if (warm > 0.22 && r > 0.55) cls = 2;
    else if (Math.abs(lat) > 48) cls = 3;
    else if (warm > 0.07) cls = 1;
    else cls = 0;
    return [L, cls];
  });
}

// Saturn: a latitude profile from Cassini's "True Saturn" (PIA06193) full-disk mosaic. The column
// x = 560 crosses the clear southern part of the disk; disk centre y ≈ 300 px, projected polar
// semi-axis ≈ 158 px, sub-observer latitude ≈ −15° (October 2004, southern summer), so
// sin(lat − B) = (300 − y) / 158. Visible from the south pole to about 19° N; further north the
// rings hide the disk, so that part is mirrored from the south. Classes: 0 light band, 1 dark band.
{
  const w = 8;
  const h = 256;
  const { data, info } = await sharp(`${SRC}/saturn-pia06193.jpg`)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const at = (x, y) => {
    const i = (Math.round(y) * info.width + x) * 3;
    return [data[i] / 255, data[i + 1] / 255, data[i + 2] / 255];
  };
  const B = (-15 * Math.PI) / 180;
  const sample = (latDeg) => {
    let lat = latDeg;
    if (lat > 19) lat = -lat; // mirrored, see above
    const s = Math.sin((lat * Math.PI) / 180 - B);
    const y = Math.min(455, Math.max(214, 300 - s * 158));
    // average a few columns on the day side
    let acc = [0, 0, 0];
    for (let dx = -6; dx <= 6; dx += 3) {
      const p = at(560 + dx, y);
      acc = acc.map((v, k) => v + p[k] / 5);
    }
    return acc;
  };
  const rows = [];
  for (let y = 0; y < h; y++) rows.push(sample(90 - ((y + 0.5) / h) * 180));
  const lum = rows.map(([r, g, b]) => luma(r, g, b));
  const sorted = [...lum].sort((a, b) => a - b);
  const median = sorted[sorted.length >> 1];
  const src = new Float32Array(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) src.set(rows[y], (y * w + x) * 3);
  await write('saturn', w, h, src, (r, g, b, lat, x, y) => [
    lum[y],
    lum[y] < median * 0.93 ? 1 : 0,
  ]);
}
