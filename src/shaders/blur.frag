// Bloom: one direction of a separable 9-tap Gaussian, run on the low-res scene (one texel per
// character cell), so the glow costs almost nothing. The first (horizontal) pass also does the
// bright-pass: it tonemaps the scene and keeps only what is above the threshold.
//
// Output: R = blurred bright disk tone (0..1), G = blurred star tone.
precision highp float;
precision highp int;

uniform sampler2D uInput;
uniform vec2 uStep;        // uv offset between taps
uniform int uBrightPass;   // 1 = read the raw scene and threshold it
uniform float uExposure;
uniform float uThreshold;

in vec2 vUv;
out vec4 fragColor;

const float W0 = 0.2270270270;
const float W1 = 0.1945945946;
const float W2 = 0.1216216216;
const float W3 = 0.0540540541;
const float W4 = 0.0162162162;

vec2 source(vec2 uv) {
  vec4 s = texture(uInput, uv);
  if (uBrightPass == 0) return s.rg;
  float t = 1.0 - exp(-max(s.r, 0.0) * uExposure);
  float star = 1.0 - exp(-max(s.g, 0.0) * 1.5);
  return vec2(max(t - uThreshold, 0.0) / (1.0 - uThreshold), star);
}

void main() {
  vec2 acc = source(vUv) * W0;
  acc += (source(vUv + uStep) + source(vUv - uStep)) * W1;
  acc += (source(vUv + 2.0 * uStep) + source(vUv - 2.0 * uStep)) * W2;
  acc += (source(vUv + 3.0 * uStep) + source(vUv - 3.0 * uStep)) * W3;
  acc += (source(vUv + 4.0 * uStep) + source(vUv - 4.0 * uStep)) * W4;
  fragColor = vec4(acc, 0.0, 1.0);
}
