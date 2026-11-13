// Pass 1: ray-march null geodesics around a Schwarzschild black hole.
//
// Units: r_s = 1 (M = 0.5), so the horizon is r = 1, photon sphere 1.5, ISCO 3.
// Light paths obey  d²x/dλ² = -1.5 · h² · x / r⁵  with h = |x × v| conserved. This reproduces the
// Schwarzschild photon orbit equation u'' + u = 1.5 u² exactly, so the lensing is not approximate.
//
// Output (half-float):
//   R = disk intensity (HDR, linear)
//   G = star intensity behind the disk, or -1 if the ray fell into the hole (lets later passes tell
//       the pure-black shadow apart from the near-black sky)
//   B = g-factor of the first disk crossing (0 if none)
//   A = fraction of the step budget used (debug heatmap)
precision highp float;
precision highp int;

uniform vec3 uCamPos;
uniform mat3 uCamBasis;
uniform float uTanHalfFov;
uniform float uAspect;
uniform float uPixelAngle;
uniform float uTime;
uniform int uMaxSteps;
uniform float uDiskInner;
uniform float uDiskOuter;
uniform float uBeaming;
uniform float uStarDensity;

in vec2 vUv;
out vec4 fragColor;

#include lib/noise.glsl;
#include lib/stars.glsl;
#include lib/disk.glsl;

const int MAX_STEPS_CAP = 1024;

// Spatial step length. Must match stepLength() in src/renderer/physics/geodesic.ts.
float stepLength(float r) {
  return clamp(0.08 * r * clamp(r / 4.0, 0.35, 1.0), 0.02, 4.0);
}

void main() {
  vec2 ndc = vUv * 2.0 - 1.0;
  vec3 dir = normalize(uCamBasis * vec3(ndc.x * uAspect * uTanHalfFov, ndc.y * uTanHalfFov, -1.0));

  vec3 pos = uCamPos;
  vec3 vel = dir;
  vec3 hv = cross(pos, vel);
  float h2 = dot(hv, hv);
  float rEscape = max(30.0, 2.0 * uDiskOuter);

  float diskI = 0.0;
  float opacity = 0.0;
  float firstG = 0.0;
  float starI = 0.0;
  int crossings = 0;
  int steps = 0;
  bool captured = false;
  bool escaped = false;

  for (int i = 0; i < MAX_STEPS_CAP; i++) {
    if (i >= uMaxSteps) break;
    steps = i + 1;

    float r = length(pos);
    float dt = stepLength(r) / length(vel);
    vec3 prev = pos;

    // kick-drift-kick leapfrog (symplectic, 2nd order)
    vel += 0.5 * dt * (-1.5 * h2 * pos / (r * r * r * r * r));
    pos += dt * vel;
    float r2 = length(pos);
    vel += 0.5 * dt * (-1.5 * h2 * pos / (r2 * r2 * r2 * r2 * r2));

    // crossed the disk plane during this step?
    if (prev.y * pos.y < 0.0 && crossings < 3) {
      vec3 hit = mix(prev, pos, prev.y / (prev.y - pos.y));
      float rh = length(hit.xz);
      if (rh > uDiskInner * 0.98 && rh < uDiskOuter) {
        vec3 d = diskShade(hit, normalize(vel), uTime, uDiskInner, uDiskOuter, uBeaming);
        if (crossings == 0) firstG = d.z;
        diskI += (1.0 - opacity) * d.y * d.x; // front-to-back compositing
        opacity += (1.0 - opacity) * d.y;
        crossings++;
        if (opacity > 0.985) break;
      }
    }

    if (r2 < 1.0) {
      captured = true;
      break;
    }
    if (r2 > rEscape && dot(pos, vel) > 0.0) {
      escaped = true;
      break;
    }
  }

  // Out of steps: rays still heading outward far from the hole would have escaped.
  if (!captured && !escaped && opacity <= 0.985) {
    if (length(pos) > 4.0 && dot(pos, vel) > 0.0) escaped = true;
    else captured = true;
  }

  float sky = 0.0;
  if (escaped) {
    starI = stars(normalize(vel), uStarDensity, uPixelAngle);
    sky = starI * (1.0 - opacity);
  } else if (captured && opacity < 0.5) {
    sky = -1.0;
  }

  fragColor = vec4(diskI, sky, firstG, float(steps) / float(uMaxSteps));
}
