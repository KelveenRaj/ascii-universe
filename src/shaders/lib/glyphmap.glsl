// Shared scene-texel → glyph mapping. Used by ascii.frag (drawing) and, later, the copy-as-text
// readback pass, so the exported text always matches what is on screen.
//
// Expects these uniforms in the including shader:
//   float uExposure, uRampLength, uStarBase, uStarLength

const float STAR_THRESHOLD = 0.18;

float tonemap(float intensity) {
  return 1.0 - exp(-max(intensity, 0.0) * uExposure);
}

float starTone(float starIntensity) {
  return 1.0 - exp(-max(starIntensity, 0.0) * 1.5);
}

// Returns vec2(glyph index in the atlas, kind) where kind is 0 = empty, 1 = disk, 2 = star.
vec2 glyphFor(vec4 scene) {
  float t = tonemap(scene.r);
  float diskGlyph = clamp(floor(t * (uRampLength - 1.0) + 0.5), 0.0, uRampLength - 1.0);
  if (diskGlyph > 0.0) return vec2(diskGlyph, 1.0);

  float s = starTone(scene.g);
  if (s > STAR_THRESHOLD) {
    float k = (s - STAR_THRESHOLD) / (1.0 - STAR_THRESHOLD);
    return vec2(uStarBase + clamp(floor(k * uStarLength), 0.0, uStarLength - 1.0), 2.0);
  }
  return vec2(0.0, 0.0);
}
