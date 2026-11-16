// The open world's galaxy layer: the same Milky Way as the overview (galaxy.glsl), but seen from
// anywhere, inside the disk included, while you fly through it. The galaxy doesn't turn here, so
// places stay put.
//
// From inside the disk a ray can cross ~80 kly of glowing disk, so samples are spaced
// geometrically: short steps near the camera (nearby arms and dust lanes stay sharp) and long ones
// far away (where everything blurs into the band of the Milky Way anyway).
//
// Output as galaxy.frag: R brightness, G background stars, B material (0 old stars, 1 young
// stars, 2 gas), A fraction of the step budget used.
precision highp float;
precision highp int;

uniform vec3 uCamPos;
uniform mat3 uCamBasis;
uniform float uTanHalfFov;
uniform float uAspect;
uniform float uPixelAngle;
uniform int uMaxSteps;
uniform float uAngle;       // always 0 here; galaxy.glsl reads it
uniform float uStarDensity;
uniform float uArmContrast;
uniform float uDust;
uniform float uGlow;        // overall gain: a path through the disk collects far more light than one across it
uniform float uContrast;    // > 1 darkens the faint haze every direction picks up from inside the disk
uniform bool uRedshiftView;

// Stars near the ship (procedural systems and landmarks), camera-relative so float32 keeps them
// exact: xyz = position (kly), w = brightness; info x = material, y = core size in sky pixels.
const int NEAR_MAX = 48;
uniform vec4 uNear[NEAR_MAX];
uniform vec2 uNearInfo[NEAR_MAX];
uniform int uNearCount;
uniform float uStarGain;

// the layout constants (G_*) are inserted after the precision lines by withGalaxyLayout (layout.ts)

in vec2 vUv;
out vec4 fragColor;

#include /src/shaders/lib/noise.glsl;
#include /src/shaders/lib/stars.glsl;
#include /src/shaders/lib/galaxy.glsl;

const int MAX_SAMPLES = 160;
const float SLAB = 4.0;          // half-thickness of the marched slab (kly)
const float DUST_OPACITY = 2.2;  // per kly at unit dust density
const float FIRST_STEP = 0.05;   // kly: the nearest sample's spacing
// Glow fades in from 10% of this distance (kly) to all of it. Up close a galaxy is separate stars
// on a dark sky, not a glow, and nearby glow would smear into a fat band across half the view;
// what's left is the thin band of the Milky Way. Dust still dims at every distance.
const float NEAR_FADE = 2.5;

void main() {
  vec2 ndc = vUv * 2.0 - 1.0;
  vec3 rd = normalize(uCamBasis * vec3(ndc.x * uAspect * uTanHalfFov, ndc.y * uTanHalfFov, -1.0));
  vec3 ro = uCamPos;

  // clip the ray to the galaxy's bounding cylinder: |y| < SLAB, radius < G_DISK_RADIUS
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
  float c = dot(o, o) - G_DISK_RADIUS * G_DISK_RADIUS;
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
    float len = t1 - t0;
    // t(u) = t0 + len·(e^(k·u) − 1)/(e^k − 1); pick k so the first step is about FIRST_STEP
    // (or evenly spaced when the whole segment is short)
    float n = float(samples);
    float k = clamp(log(max(len / (FIRST_STEP * n), 1.0)) * 1.6, 0.0, 9.0);
    float norm = k > 1e-3 ? 1.0 / (exp(k) - 1.0) : 0.0;
    float prev = t0;
    for (int i = 0; i < MAX_SAMPLES; i++) {
      if (i >= samples) break;
      float u = (float(i) + 1.0) / n;
      float t = t0 + len * (k > 1e-3 ? (exp(k * u) - 1.0) * norm : u);
      float ds = t - prev;
      float tm = prev + 0.5 * ds; // distance from the camera
      vec3 p = ro + rd * tm;
      prev = t;
      vec4 g = galaxy(p);
      float near = smoothstep(0.1 * NEAR_FADE, NEAR_FADE, tm);
      light += transmittance * g.xyz * ds * near;
      transmittance *= exp(-g.w * DUST_OPACITY * ds);
      if (transmittance < 0.01) break;
    }
  }
  float total = light.x + light.y + light.z;
  // a power curve on the total, applied to all three so the material mix is unchanged
  float brightness = uGlow * pow(total, uContrast);
  light *= total > 0.0 ? brightness / total : 0.0;
  float material = 0.0;
  if (light.z > 0.45 * max(light.x, light.y)) material = 2.0;
  else if (light.y > light.x) material = 1.0;

  // nearby stars: a sharp core at least a sky pixel wide, plus a soft halo; the brightest one
  // under this pixel picks the material once it outshines the galaxy behind it
  float starLight = 0.0;
  float strongest = 0.0;
  float starMaterial = 0.0;
  for (int i = 0; i < NEAR_MAX; i++) {
    if (i >= uNearCount) break;
    vec3 s = uNear[i].xyz;
    float c = dot(rd, normalize(s));
    if (c <= 0.0) continue;
    float ang = sqrt(max(0.0, 2.0 * (1.0 - c))); // small-angle distance from the ray
    float r = uPixelAngle * uNearInfo[i].y;
    float v = uNear[i].w * uStarGain * (exp(-(ang * ang) / (r * r)) + 0.15 * exp(-ang / (3.0 * r)));
    starLight += v;
    if (v > strongest) {
      strongest = v;
      starMaterial = uNearInfo[i].x;
    }
  }
  if (strongest > 0.02 && strongest > 0.5 * brightness) material = starMaterial;
  brightness += starLight;

  float sky = stars(rd, uStarDensity, uPixelAngle) * transmittance * exp(-brightness * 2.0);

  float debugValue = uRedshiftView ? 0.0 : float(samples) / float(uMaxSteps);
  fragColor = vec4(brightness, sky, material, debugValue);
}
