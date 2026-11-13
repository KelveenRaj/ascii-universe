// Sparse procedural starfield on a cube-mapped grid. Needs noise.glsl.
// Stars keep their peak brightness and grow to at least ~1 pixel, so they survive low resolutions.

float starLayer(vec3 dir, float cells, float density, float pixelAngle, float seed) {
  vec3 a = abs(dir);
  vec2 uv;
  float face;
  if (a.x >= a.y && a.x >= a.z) {
    uv = dir.yz / a.x;
    face = dir.x > 0.0 ? 0.0 : 1.0;
  } else if (a.y >= a.z) {
    uv = dir.xz / a.y;
    face = dir.y > 0.0 ? 2.0 : 3.0;
  } else {
    uv = dir.xy / a.z;
    face = dir.z > 0.0 ? 4.0 : 5.0;
  }

  vec2 g = (uv * 0.5 + 0.5) * cells;
  vec2 cell = floor(g);
  vec2 f = fract(g);
  vec3 h = hash33(vec3(cell, face * 37.0 + seed));
  if (h.z > density) return 0.0;

  // keep the star away from cell borders so it is never clipped
  vec2 starPos = 0.25 + 0.5 * h.xy;
  float cellAngle = 2.0 / cells; // angular size of one cell near the face centre (radians)
  float d = length(f - starPos) * cellAngle;
  float radius = max(pixelAngle * 0.75, cellAngle * 0.03);
  float bright = 0.25 + 0.75 * pow(hash13(vec3(cell.yx, face + seed * 3.1)), 4.0);
  return bright * exp(-(d * d) / (radius * radius));
}

float stars(vec3 dir, float density, float pixelAngle) {
  return starLayer(dir, 70.0, 0.55 * density, pixelAngle, 0.0)
    + 0.45 * starLayer(dir, 180.0, 0.4 * density, pixelAngle, 11.0);
}
