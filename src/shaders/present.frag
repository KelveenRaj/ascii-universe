// Milestone 1 display pass: tonemap the scene buffer and colour it through the palette LUT.
// In M2 this is replaced by the ASCII pass, which uses the same tonemap + LUT per character cell.
precision highp float;
precision highp int;

uniform sampler2D uScene;
uniform sampler2D uLut;
uniform vec3 uStarTint;
uniform vec3 uBackground;
uniform float uExposure;
uniform int uDebugView; // 0 final, 1 intensity, 2 redshift, 3 steps

in vec2 vUv;
out vec4 fragColor;

const float LUT_SIZE = 256.0;

vec3 lut(float t) {
  return texture(uLut, vec2((clamp(t, 0.0, 1.0) * (LUT_SIZE - 1.0) + 0.5) / LUT_SIZE, 0.5)).rgb;
}

vec3 heat(float t) {
  t = clamp(t, 0.0, 1.0);
  return clamp(vec3(1.5 * t, 1.5 * t - 0.5, 3.0 * t - 2.0), 0.0, 1.0) + vec3(0.0, 0.0, 0.25 * (1.0 - t));
}

void main() {
  vec4 s = texture(uScene, vUv);
  float t = 1.0 - exp(-max(s.r, 0.0) * uExposure);
  float starT = 1.0 - exp(-max(s.g, 0.0) * 1.5);
  float skyMask = step(0.0, s.g); // 0 inside the shadow, 1 for sky

  vec3 col;
  if (uDebugView == 1) {
    col = vec3(t);
  } else if (uDebugView == 2) {
    // blue = blueshifted (approaching), red = redshifted (receding)
    float g = s.b;
    vec3 shift = g > 1.0
      ? vec3(0.25, 0.55, 1.0) * clamp((g - 1.0) * 2.5, 0.0, 1.0)
      : vec3(1.0, 0.3, 0.15) * clamp((1.0 - g) * 2.5, 0.0, 1.0);
    col = g > 0.0 ? mix(vec3(0.15), shift, 0.85) * (0.3 + 0.7 * sqrt(t)) : vec3(0.0);
  } else if (uDebugView == 3) {
    col = heat(s.a);
  } else {
    col = lut(t) + uStarTint * starT + uBackground * skyMask * (1.0 - t);
  }
  fragColor = vec4(col, 1.0);
}
