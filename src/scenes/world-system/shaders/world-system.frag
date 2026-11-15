// The open world's star-system layer: one star and up to 8 planets (some ringed), ray-traced as
// spheres and discs (no marching), on a starfield. Everything is placed relative to the camera
// on the CPU, so the camera sits at the origin here and float32 stays exact.
//
// Output as every scene: R brightness, G background stars, B material (see materials.ts), A 0.
precision highp float;
precision highp int;

uniform mat3 uCamBasis;
uniform float uTanHalfFov;
uniform float uAspect;
uniform float uPixelAngle;
uniform float uTime;
uniform bool uRedshiftView;

uniform vec4 uStar;          // xyz camera-relative centre, w radius
uniform float uStarMaterial;
uniform float uStarGlow;
uniform float uCorona;
uniform float uDaylight;
uniform float uNightside;
uniform float uStarDensity;

const int PLANET_MAX = 8;
uniform vec4 uPlanet[PLANET_MAX];     // xyz camera-relative centre, w radius
uniform vec2 uPlanetInfo[PLANET_MAX]; // x material, y seed (0…1)
uniform vec4 uRing[PLANET_MAX];       // xyz plane normal, w outer radius (0 = no ring)
uniform int uPlanetCount;

in vec2 vUv;
out vec4 fragColor;

#include /src/shaders/lib/noise.glsl;
#include /src/shaders/lib/stars.glsl;

// materials (keep in step with SYSTEM_MATERIAL in src/world/gen/planets.ts)
const int M_OCEAN = 4;
const int M_GAS = 6;
const int M_ICE = 7;
const int M_LAVA = 8;
const float M_RING = 9.0;
const float RING_INNER = 1.35;

// Nearest positive hit of the ray from the origin along rd with a sphere, or -1.
float hitSphere(vec3 rd, vec3 c, float r) {
  float b = dot(rd, c);
  float h = b * b - (dot(c, c) - r * r);
  if (h < 0.0) return -1.0;
  float t = b - sqrt(h);
  return t > 0.0 ? t : -1.0;
}

// Surface pattern for a planet: n is the surface normal (the planet's own frame: they don't spin).
float pattern(int m, vec3 n, float seed) {
  vec3 q = n * 2.5 + seed * 17.0;
  if (m == M_GAS) return 0.72 + 0.28 * sin(n.y * 15.0 + 2.2 * fbm(q * 1.4) + seed * 20.0);
  if (m == M_ICE) return 0.86 + 0.14 * sin(n.y * 7.0 + 0.8 * fbm(q) + seed * 9.0);
  if (m == M_OCEAN) return fbm(q) > 0.08 ? 1.2 : 0.78; // continents and seas
  return 0.72 + 0.32 * fbm(q * 1.6);
}

void main() {
  vec2 ndc = vUv * 2.0 - 1.0;
  vec3 rd = normalize(uCamBasis * vec3(ndc.x * uAspect * uTanHalfFov, ndc.y * uTanHalfFov, -1.0));

  float tBest = 1e30;
  float brightness = 0.0;
  float material = uStarMaterial;
  bool solid = false;

  // the star: limb-darkened, with slowly crawling granulation
  float ts = hitSphere(rd, uStar.xyz, uStar.w);
  if (ts > 0.0) {
    vec3 n = normalize(rd * ts - uStar.xyz);
    float mu = max(dot(n, -rd), 0.0);
    float grain = 0.88 + 0.12 * gnoise(n * 9.0 + uTime * 0.06);
    brightness = uStarGlow * (0.4 + 0.6 * sqrt(mu)) * grain;
    tBest = ts;
    solid = true;
  }

  for (int i = 0; i < PLANET_MAX; i++) {
    if (i >= uPlanetCount) break;
    vec3 c = uPlanet[i].xyz;
    float r = uPlanet[i].w;
    int m = int(uPlanetInfo[i].x + 0.5);
    float seed = uPlanetInfo[i].y;

    float t = hitSphere(rd, c, r);
    if (t > 0.0 && t < tBest) {
      vec3 p = rd * t;
      vec3 n = normalize(p - c);
      vec3 toStar = normalize(uStar.xyz - p);
      float lit = max(dot(n, toStar), 0.0);
      float pat = pattern(m, n, seed);
      brightness = (uDaylight * lit + uNightside) * pat;
      if (m == M_LAVA) {
        // glowing cracks, which show best on the night side
        float cracks = smoothstep(0.25, 0.55, fbm(n * 5.0 + seed * 13.0));
        brightness += 0.35 * cracks * (1.0 - lit);
      }
      material = float(m);
      tBest = t;
      solid = true;
    } else if (t < 0.0 && dot(rd, c) > 0.0) {
      // too small to cover a pixel: still show it as a point, lit by how much of it faces us
      float dist = length(c);
      float sep = sqrt(max(0.0, 2.0 * (1.0 - dot(rd, c / dist))));
      float ang = max(uPixelAngle * 0.7, r / dist);
      if (sep < ang && dist < tBest && r / dist < uPixelAngle) {
        float phase = 0.5 + 0.5 * dot(normalize(uStar.xyz - c), -c / dist);
        float v = uDaylight * (0.15 + 0.6 * phase);
        if (v > brightness) {
          brightness = v;
          material = float(m);
        }
      }
    }

    // a ring: a flat annulus through the centre, banded, with gaps you see through
    float outer = uRing[i].w;
    if (outer > 0.0) {
      vec3 nrm = uRing[i].xyz;
      float denom = dot(rd, nrm);
      if (abs(denom) > 1e-5) {
        float tr = dot(c, nrm) / denom;
        if (tr > 0.0 && tr < tBest) {
          float d = length(rd * tr - c) / r;
          if (d > RING_INNER && d < outer / r) {
            float band = 0.55 + 0.45 * sin(d * 21.0 + seed * 40.0) * sin(d * 7.3 + seed * 11.0);
            if (band > 0.35) {
              float sunAngle = abs(dot(nrm, normalize(uStar.xyz - c)));
              brightness = uDaylight * band * (0.25 + 0.6 * sunAngle) + uNightside;
              material = M_RING;
              tBest = tr;
              solid = true;
            }
          }
        }
      }
    }
  }

  // corona around the star, unless something closer is in the way
  float b = dot(rd, uStar.xyz);
  if (b > 0.0 && tBest >= b) {
    float perp = sqrt(max(0.0, dot(uStar.xyz, uStar.xyz) - b * b));
    float R = uStar.w;
    if (perp > R) {
      float x = (perp - R) / R;
      float glow = uCorona * uStarGlow * (0.45 * exp(-x / 0.35) + 0.08 * exp(-x / 3.0));
      if (glow > brightness) material = uStarMaterial;
      brightness += glow;
    }
  }

  float sky = solid ? 0.0 : stars(rd, uStarDensity, uPixelAngle) * exp(-brightness * 2.0);
  fragColor = vec4(brightness, sky, material, uRedshiftView ? 0.0 : 0.05);
}
