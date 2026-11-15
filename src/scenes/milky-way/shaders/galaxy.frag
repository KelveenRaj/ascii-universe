// The Milky Way from outside: a barred spiral, ray-marched as an emitting, dusty volume.
//
// Units: thousands of light-years (kly), galactic centre at the origin, disk in the XZ plane.
// The shape follows the numbers in src/content/bodies/milky-way.ts (100 kly stellar disk, four
// arms, a 27 kly bar at ~45° to the Sun–centre line); see layout.ts for the constants.
//
// Output (half-float):
//   R = brightness (HDR, linear)
//   G = background stars, dimmed by whatever galaxy light/dust is in front of them
//   B = material: 0 old stars (bulge, bar, smooth disk), 1 young stars (arms), 2 glowing gas (HII)
//   A = fraction of the step budget used (the steps debug view); no redshift here, so 0 for that view
precision highp float;
precision highp int;

uniform vec3 uCamPos;
uniform mat3 uCamBasis;
uniform float uTanHalfFov;
uniform float uAspect;
uniform float uPixelAngle;
uniform int uMaxSteps;
uniform float uAngle;       // how far the galaxy has turned (radians)
uniform float uStarDensity;
uniform float uArmContrast;
uniform float uDust;
uniform bool uRedshiftView;

// layout (kly, radians); keep in sync with layout.ts
uniform float uDiskRadius;
uniform float uBarHalfLength;
uniform float uBarAngle;
uniform float uPitch;

in vec2 vUv;
out vec4 fragColor;

#include /src/shaders/lib/noise.glsl;
#include /src/shaders/lib/stars.glsl;
#include /src/shaders/lib/galaxy.glsl;

const int MAX_SAMPLES = 160;
const float SLAB = 4.0;          // half-thickness of the marched slab (kly)
const float DUST_OPACITY = 2.2;  // per kly at unit dust density

void main() {
  vec2 ndc = vUv * 2.0 - 1.0;
  vec3 rd = normalize(uCamBasis * vec3(ndc.x * uAspect * uTanHalfFov, ndc.y * uTanHalfFov, -1.0));
  vec3 ro = uCamPos;

  // clip the ray to the galaxy's bounding cylinder: |y| < SLAB, radius < uDiskRadius
  float t0 = 0.0;
  float t1 = 1e6;
  if (abs(rd.y) > 1e-5) {
    float ta = (-SLAB - ro.y) / rd.y;
    float tb = (SLAB - ro.y) / rd.y;
    t0 = max(t0, min(ta, tb));
    t1 = min(t1, max(ta, tb));
  } else if (abs(ro.y) > SLAB) {
    t1 = -1.0;
  }
  vec2 o = ro.xz;
  vec2 d = rd.xz;
  float a = dot(d, d);
  float b = dot(o, d);
  float c = dot(o, o) - uDiskRadius * uDiskRadius;
  float disc = b * b - a * c;
  if (a < 1e-10) {
    if (c > 0.0) t1 = -1.0;
  } else if (disc < 0.0) {
    t1 = -1.0;
  } else {
    float sq = sqrt(disc);
    t0 = max(t0, (-b - sq) / a);
    t1 = min(t1, (-b + sq) / a);
  }

  int samples = clamp(uMaxSteps / 3, 24, MAX_SAMPLES);
  vec3 light = vec3(0.0);
  float transmittance = 1.0;
  if (t1 > t0) {
    float ds = (t1 - t0) / float(samples);
    for (int i = 0; i < MAX_SAMPLES; i++) {
      if (i >= samples) break;
      vec3 p = ro + rd * (t0 + (float(i) + 0.5) * ds);
      vec4 g = galaxy(p);
      // light from this slice, dimmed by the dust in front of it
      light += transmittance * g.xyz * ds;
      transmittance *= exp(-g.w * DUST_OPACITY * ds);
    }
  }

  float brightness = light.x + light.y + light.z;
  // material: whichever kind of light dominates (gas wins early, it's the rarest and reddest)
  float material = 0.0;
  if (light.z > 0.45 * max(light.x, light.y)) material = 2.0;
  else if (light.y > light.x) material = 1.0;

  float sky = stars(rd, uStarDensity, uPixelAngle) * transmittance * exp(-brightness * 2.0);

  float debugValue = uRedshiftView ? 0.0 : float(samples) / float(uMaxSteps);
  fragColor = vec4(brightness, sky, material, debugValue);
}
