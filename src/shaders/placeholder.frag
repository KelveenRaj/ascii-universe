// Milestone 0 placeholder: an animated warm gradient with a pulsing ring.
// Proves the pipeline (glsl import -> RawShaderMaterial -> fullscreen pass -> screen).
precision highp float;

uniform vec2 uResolution;
uniform float uTime;

in vec2 vUv;
out vec4 fragColor;

// EHT-ish ramp: black -> deep red -> burnt orange -> amber -> pale yellow
vec3 ramp(float t) {
  t = clamp(t, 0.0, 1.0);
  vec3 c0 = vec3(0.0);
  vec3 c1 = vec3(0.290, 0.051, 0.008); // #4A0D02
  vec3 c2 = vec3(0.761, 0.231, 0.039); // #C23B0A
  vec3 c3 = vec3(0.969, 0.576, 0.118); // #F7931E
  vec3 c4 = vec3(1.000, 0.969, 0.878); // #FFF7E0
  if (t < 0.25) return mix(c0, c1, t / 0.25);
  if (t < 0.5) return mix(c1, c2, (t - 0.25) / 0.25);
  if (t < 0.75) return mix(c2, c3, (t - 0.5) / 0.25);
  return mix(c3, c4, (t - 0.75) / 0.25);
}

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * uResolution) / uResolution.y;
  float r = length(p);
  float a = atan(p.y, p.x);

  float ring = exp(-pow((r - 0.28) / 0.05, 2.0));
  float swirl = 0.5 + 0.5 * sin(a * 3.0 - uTime * 1.5 + r * 12.0);
  float glow = 0.12 * (1.0 - smoothstep(0.0, 1.2, r));
  float t = ring * (0.65 + 0.35 * swirl) + glow * (0.5 + 0.5 * sin(uTime * 0.7));
  t *= step(0.16, r); // the "shadow"

  fragColor = vec4(ramp(t), 1.0);
}
