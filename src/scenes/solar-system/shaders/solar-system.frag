// The Solar System: the Sun, eight planets and the Moon, ray-traced as ellipsoids (no marching),
// with Saturn's rings, on a starfield. Positions, sizes and spin axes come from layout.ts (real
// data for the date); everything is placed relative to the camera on the CPU, so the camera sits
// at the origin here and float32 stays exact even a few planet radii from a world 30 au out.
//
// Surfaces sample the spacecraft maps in public/maps (see SOURCES.md): R = √albedo, G = surface
// class × 32 (+ Earth's city lights in the low bits), B = Earth's clouds.
//
// Output as every scene: R brightness, G background stars, B material (materials.ts), A debug.
precision highp float;
precision highp int;
precision highp sampler2D;

uniform mat3 uCamBasis;
uniform float uTanHalfFov;
uniform float uAspect;
uniform float uPixelAngle;
uniform float uTime;
uniform bool uRedshiftView;

// body order: see SOLAR_BODIES in bodies.ts
const int N = 10;
const int SUN = 0;
const int MERCURY = 1;
const int VENUS = 2;
const int EARTH = 3;
const int MOON = 4;
const int MARS = 5;
const int JUPITER = 6;
const int SATURN = 7;
const int URANUS = 8;

uniform vec4 uBody[N];       // xyz camera-relative centre, w equatorial radius
uniform float uFlat[N];      // polar / equatorial radius
uniform vec3 uAxisX[N];      // the body's own axes (x: longitude 0, z: north pole)
uniform vec3 uAxisY[N];
uniform vec3 uAxisZ[N];
uniform float uGain[N];      // exposure × sunlight reaching it × its albedo ÷ its map's mean
uniform float uPointMaterial[N];

uniform float uSunGlow;
uniform float uCorona;
uniform float uStarDensity;

uniform sampler2D uEarth;
uniform sampler2D uMoon;
uniform sampler2D uMars;
uniform sampler2D uMercury;
uniform sampler2D uJupiter;
uniform sampler2D uSaturn;
uniform sampler2D uRings;    // optical depth τ across the rings, inner → outer
uniform vec2 uRingRange;     // inner and outer ring radius, in Saturn equatorial radii

in vec2 vUv;
out vec4 fragColor;

#include /src/shaders/lib/noise.glsl;
#include /src/shaders/lib/stars.glsl;

// materials (materials.ts)
const float M_SUN = 0.0;
const float M_CORONA = 1.0;
const float M_EARTH = 2.0;   // + class 0…4
const float M_CLOUD = 7.0;
const float M_LIGHTS = 8.0;
const float M_AIR = 9.0;
const float M_MOON = 10.0;   // + class 0…1
const float M_MARS = 12.0;   // + class 0…2
const float M_MERCURY = 15.0;
const float M_VENUS = 16.0;
const float M_JUPITER = 17.0; // + class 0…3
const float M_SATURN = 21.0;  // + class 0…1
const float M_RING = 23.0;
const float M_URANUS = 24.0;
const float M_NEPTUNE = 25.0;

const float PI = 3.141592653589793;

// A point in body i's frame, scaled so the body is the unit sphere.
vec3 toUnit(int i, vec3 v) {
  return vec3(dot(v, uAxisX[i]), dot(v, uAxisY[i]), dot(v, uAxisZ[i]) / uFlat[i]) / uBody[i].w;
}

// Nearest positive hit of the ray ro + t·rd with body i's ellipsoid, or −1.
float hitBody(int i, vec3 ro, vec3 rd) {
  vec3 o = toUnit(i, ro - uBody[i].xyz);
  vec3 d = toUnit(i, rd);
  float a = dot(d, d);
  float b = dot(o, d);
  float h = b * b - a * (dot(o, o) - 1.0);
  if (h < 0.0) return -1.0;
  float t = (-b - sqrt(h)) / a;
  return t > 0.0 ? t : -1.0;
}

// Outward normal of body i at surface point p.
vec3 normalAt(int i, vec3 p) {
  vec3 q = toUnit(i, p - uBody[i].xyz);
  vec3 g = vec3(q.x, q.y, q.z / uFlat[i]);
  return normalize(uAxisX[i] * g.x + uAxisY[i] * g.y + uAxisZ[i] * g.z);
}

// Map coordinates (east longitude, latitude) of surface point p on body i: x 0…1 from −180° to
// 180°, y 0…1 from the south pole to the north (three.js flips images, so row 0 is the south).
vec2 mapUv(int i, vec3 p) {
  vec3 s = normalize(toUnit(i, p - uBody[i].xyz));
  float lon = atan(s.y, s.x);
  float lat = asin(clamp(s.z, -1.0, 1.0));
  return vec2(lon / (2.0 * PI) + 0.5, 0.5 + lat / PI);
}

// albedo (linear), class, clouds, city lights, from one map. The class texel is fetched, never
// filtered, so neighbouring classes don't blend into a third.
vec4 readMap(sampler2D m, vec2 uv, float lod) {
  vec4 s = textureLod(m, uv, lod);
  ivec2 size = textureSize(m, 0);
  ivec2 ij = clamp(ivec2(uv * vec2(size)), ivec2(0), size - 1);
  vec4 raw = texelFetch(m, ij, 0);
  float g = floor(raw.g * 255.0 + 0.5);
  return vec4(s.r * s.r, floor(g / 32.0), s.b, mod(g, 32.0) / 31.0);
}

// Optical depth of Saturn's rings at a point in the ring plane, and whether it's in them.
float ringTau(vec3 p) {
  float r = length(p - uBody[SATURN].xyz) / uBody[SATURN].w;
  if (r < uRingRange.x || r > uRingRange.y) return 0.0;
  return texture(uRings, vec2((r - uRingRange.x) / (uRingRange.y - uRingRange.x), 0.5)).r;
}

// How much sunlight reaches p (on or near body self): other bodies' shadows (umbra only) and the
// shadow of Saturn's rings.
float sunlight(int self, vec3 p, vec3 toSun) {
  for (int j = 1; j < N; j++) {
    if (j == self) continue;
    if (hitBody(j, p, toSun) > 0.0) return 0.0;
  }
  vec3 n = uAxisZ[SATURN];
  float denom = dot(toSun, n);
  if (abs(denom) > 1e-6) {
    float t = dot(uBody[SATURN].xyz - p, n) / denom;
    if (t > 0.0) {
      float tau = ringTau(p + toSun * t);
      if (tau > 0.0) return exp(-tau / abs(denom));
    }
  }
  return 1.0;
}

// Minnaert's law: limb darkening for cloudy planets (k = 1 is Lambert).
float minnaert(float mu0, float mu, float k) {
  return pow(mu0, k) * pow(max(mu, 1e-3), k - 1.0);
}

// Shades body i at p (normal n, view direction v back to the camera). Returns brightness and
// writes the material.
float shade(int i, vec3 p, vec3 n, vec3 v, float t, out float material) {
  vec3 toSun = normalize(uBody[SUN].xyz - p);
  float mu0 = dot(n, toSun);
  float mu = max(dot(n, v), 0.0);
  float lit = mu0 > 0.0 ? sunlight(i, p, toSun) : 0.0;
  mu0 = max(mu0, 0.0);
  float gain = uGain[i];
  // map level of detail from the pixel's footprint on the surface
  float footprint = uPixelAngle * t / max(mu, 0.15);

  if (i == EARTH) {
    vec2 size = vec2(textureSize(uEarth, 0));
    float lod = max(0.0, log2(footprint / (2.0 * PI * uBody[i].w / size.x)));
    vec4 m = readMap(uEarth, mapUv(i, p), lod);
    // clouds reflect about 0.75 (Blue Marble's cloud layer is that bright); under them, the ground
    float cloud = m.z;
    float albedo = mix(m.x, 0.75, cloud);
    float day = gain * albedo * mu0 * lit;
    material = cloud > 0.45 ? M_CLOUD : M_EARTH + m.y;
    // city lights (Black Marble) where the Sun has set, dimmed by clouds; a long exposure, as in
    // the photos from orbit
    float night = (1.0 - smoothstep(-0.12, 0.04, dot(n, toSun))) * (1.0 - cloud);
    float lights = 0.45 * m.w * m.w * night;
    if (lights > day) material = M_LIGHTS;
    // blue haze towards the lit limb (Rayleigh scattering)
    float haze = gain * 0.12 * pow(1.0 - mu, 3.0) * mu0 * lit;
    if (haze > day) material = M_AIR;
    return day + lights + haze;
  }
  if (i == MOON || i == MERCURY) {
    // airless regolith: Lommel–Seeliger, which is why a full Moon looks flat, not shaded
    float ls = 2.0 * mu0 / (mu0 + mu + 1e-4);
    vec4 m;
    if (i == MOON) {
      vec2 size = vec2(textureSize(uMoon, 0));
      m = readMap(uMoon, mapUv(i, p), max(0.0, log2(footprint / (2.0 * PI * uBody[i].w / size.x))));
      material = M_MOON + m.y;
    } else {
      vec2 size = vec2(textureSize(uMercury, 0));
      m = readMap(uMercury, mapUv(i, p), max(0.0, log2(footprint / (2.0 * PI * uBody[i].w / size.x))));
      material = M_MERCURY;
    }
    return gain * m.x * ls * lit;
  }
  if (i == MARS) {
    vec2 size = vec2(textureSize(uMars, 0));
    vec4 m = readMap(uMars, mapUv(i, p), max(0.0, log2(footprint / (2.0 * PI * uBody[i].w / size.x))));
    material = M_MARS + m.y;
    return gain * m.x * mu0 * lit;
  }
  if (i == JUPITER) {
    vec2 size = vec2(textureSize(uJupiter, 0));
    vec4 m = readMap(uJupiter, mapUv(i, p), max(0.0, log2(footprint / (2.0 * PI * uBody[i].w / size.x))));
    material = M_JUPITER + m.y;
    return gain * m.x * minnaert(mu0, mu, 0.9) * lit;
  }
  if (i == SATURN) {
    // a latitude profile: Saturn's bands run along latitude
    vec2 uv = mapUv(i, p);
    vec4 m = readMap(uSaturn, vec2(0.5, uv.y), 0.0);
    material = M_SATURN + m.y;
    return gain * m.x * minnaert(mu0, mu, 0.9) * lit;
  }
  if (i == VENUS) {
    // the featureless cloud deck of visible light
    material = M_VENUS;
    return gain * minnaert(mu0, mu, 0.75) * lit;
  }
  // Uranus and Neptune: nearly featureless in visible light, limb-darkened
  material = i == URANUS ? M_URANUS : M_NEPTUNE;
  return gain * minnaert(mu0, mu, 0.85) * lit;
}

// Baumbach's law for the white-light corona (r in solar radii), normalised to 1 at the limb.
float corona(float r) {
  float b = 0.0532 * pow(r, -2.5) + 1.425 * pow(r, -7.0) + 2.565 * pow(r, -17.0);
  return b / 4.0432;
}

void main() {
  vec2 ndc = vUv * 2.0 - 1.0;
  vec3 rd = normalize(uCamBasis * vec3(ndc.x * uAspect * uTanHalfFov, ndc.y * uTanHalfFov, -1.0));
  vec3 v = -rd;

  float tBest = 1e30;
  int hit = -1;
  for (int i = 0; i < N; i++) {
    float t = hitBody(i, vec3(0.0), rd);
    if (t > 0.0 && t < tBest) {
      tBest = t;
      hit = i;
    }
  }

  float brightness = 0.0;
  float material = M_SUN;
  bool solid = hit >= 0;

  if (hit == SUN) {
    vec3 p = rd * tBest;
    vec3 n = normalAt(SUN, p);
    float mu = max(dot(n, v), 0.0);
    // limb darkening, quadratic law at 550 nm (u ≈ 0.93, v ≈ −0.23; Cox 2000, Allen's
    // Astrophysical Quantities): I(μ)/I(1) = 1 − u(1 − μ) − v(1 − μ)²
    float m1 = 1.0 - mu;
    float limb = 1.0 - 0.93 * m1 + 0.23 * m1 * m1;
    // granulation: cells ~1000 km across (R☉/700), only once the pixels are that small
    float grainScale = uBody[SUN].w / 700.0;
    float show = smoothstep(2.0, 0.6, uPixelAngle * tBest / grainScale);
    float grain = 1.0 + 0.08 * show * gnoise(n * 700.0 + uTime * 0.01);
    brightness = uSunGlow * limb * grain;
    material = M_SUN;
  } else if (hit > 0) {
    vec3 p = rd * tBest;
    brightness = shade(hit, p, normalAt(hit, p), v, tBest, material);
  }

  // bodies smaller than a pixel: still a dot, lit by the phase it shows us
  for (int i = 0; i < N; i++) {
    vec3 c = uBody[i].xyz;
    float dist = length(c);
    float ang = uBody[i].w / dist;
    if (ang >= uPixelAngle || dist > tBest || dot(rd, c) <= 0.0) continue;
    float sep = sqrt(max(0.0, 2.0 * (1.0 - dot(rd, c / dist))));
    if (i == SUN) {
      // a bright core and a short halo, so the Sun reads as a star from the outer planets
      float core = sep < uPixelAngle * 0.8 ? 1.0 : 0.0;
      float halo = exp(-sep / (uPixelAngle * 1.5));
      float b = uSunGlow * (1.4 * core + 0.6 * halo);
      if (b > brightness) material = M_SUN;
      brightness = max(brightness, b);
      continue;
    }
    if (sep > uPixelAngle * 0.7) continue;
    float phase = 0.5 + 0.5 * dot(normalize(uBody[SUN].xyz - c), -c / dist);
    float b = 0.2 + 0.7 * phase;
    if (b > brightness) {
      brightness = b;
      material = uPointMaterial[i];
      solid = true;
    }
  }

  // Earth's atmosphere just off the limb, where the sunlit side catches it
  {
    vec3 c = uBody[EARTH].xyz;
    float b = dot(rd, c);
    if (b > 0.0 && b < tBest) {
      float h = sqrt(max(0.0, dot(c, c) - b * b)) / uBody[EARTH].w - 1.0;
      if (h > 0.0 && h < 0.03) {
        vec3 q = rd * b;
        vec3 toSun = normalize(uBody[SUN].xyz - q);
        float day = max(0.0, dot(normalize(q - c), toSun) + 0.15);
        float air = uGain[EARTH] * 0.2 * exp(-h / 0.006) * day;
        if (air > brightness) material = M_AIR;
        brightness += air;
      }
    }
  }

  // Saturn's rings: single scattering in a layer of optical depth τ (Chandrasekhar), lit or seen
  // through from the dark side, with Saturn's shadow across them; light from behind is dimmed by
  // e^(−τ/μ)
  {
    vec3 nr = uAxisZ[SATURN];
    float denom = dot(rd, nr);
    if (abs(denom) > 1e-6) {
      float t = dot(uBody[SATURN].xyz, nr) / denom;
      if (t > 0.0 && t < tBest) {
        vec3 p = rd * t;
        float tau = ringTau(p);
        if (tau > 0.0) {
          vec3 toSun = normalize(uBody[SUN].xyz - p);
          float mu = abs(denom);
          float mu0s = dot(toSun, nr);
          float mu0 = max(abs(mu0s), 1e-3);
          bool litSide = sign(mu0s) == sign(dot(v, nr));
          // ϖ·P: ring particles' albedo (~0.5) times their backscattering phase function
          float wp = litSide ? 1.25 : 0.5;
          float iof;
          if (litSide) {
            iof = wp / 4.0 * mu0 / (mu0 + mu) * (1.0 - exp(-tau * (1.0 / mu0 + 1.0 / mu)));
          } else if (abs(mu0 - mu) > 1e-3) {
            iof = wp / 4.0 * mu0 / (mu0 - mu) * (exp(-tau / mu0) - exp(-tau / mu));
          } else {
            iof = wp / 4.0 * tau / mu * exp(-tau / mu);
          }
          if (hitBody(SATURN, p, toSun) > 0.0) iof = 0.0;
          // I/F of a Lambert surface is A·μ0, so this matches the planet's own exposure
          float ring = uGain[SATURN] * 2.3 * iof;
          float through = exp(-tau / mu);
          if (ring > brightness * through) material = M_RING;
          brightness = ring + brightness * through;
          solid = solid || through < 0.5;
        }
      }
    }
  }

  // the corona around the Sun, unless something closer is in the way
  {
    vec3 c = uBody[SUN].xyz;
    float b = dot(rd, c);
    if (b > 0.0 && tBest >= b) {
      float r = sqrt(max(0.0, dot(c, c) - b * b)) / uBody[SUN].w;
      if (r > 1.0) {
        float glow = uCorona * uSunGlow * 0.5 * corona(r);
        if (glow > brightness) material = M_CORONA;
        brightness += glow;
      }
    }
  }

  float sky = solid ? 0.0 : stars(rd, uStarDensity, uPixelAngle) * exp(-brightness * 2.0);
  fragColor = vec4(brightness, sky, material, uRedshiftView ? 0.0 : 0.05);
}
