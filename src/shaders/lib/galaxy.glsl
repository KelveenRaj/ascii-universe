// The Milky Way's density: emission of old stars, young stars and gas, and dust, at a point.
// Shared by the Milky Way overview and the open-world galaxy layer.
//
// Units: kly, galactic centre at the origin, disk in the XZ plane, Sun on +Z. The shape comes from
// published models (see src/scenes/milky-way/layout.ts for the numbers and their sources):
// Reid et al. 2019 spiral arms, Bland-Hawthorn & Gerhard 2016 disks, bulge and bar, Drimmel &
// Spergel 2001 dust, Henshaw et al. 2023 central molecular zone. The G_* constants are inserted
// by withGalaxyLayout() in layout.ts. The includer declares uAngle, uArmContrast and uDust, and
// includes noise.glsl (for gnoise).
// The large-scale shape is mirrored on the CPU in src/world/gen/density.ts; change both together.

const float G_PI = 3.14159265;

vec2 rot(vec2 v, float a) {
  float c = cos(a), s = sin(a);
  return vec2(c * v.x - s * v.y, s * v.x + c * v.y);
}

// How close a point (radius R, azimuth beta, Reid's convention) is to the spiral arms:
// x = arm emission (Gaussian across each arm), y = dust lanes along the arms' inner edges.
vec2 spiralArms(float R, float beta) {
  float arms = 0.0;
  float lanes = 0.0;
  for (int i = 0; i < G_ARM_SEGMENTS; i++) {
    vec2 band = G_ARM_BAND[i];
    if (R < band.x || R > band.y) continue;
    vec4 shape = G_ARM_SHAPE[i];
    // the first winding of beta at or after the segment's start; segments are under a full turn
    float b = beta + 2.0 * G_PI * ceil((shape.x - beta) / (2.0 * G_PI));
    for (int j = 0; j < 2; j++) {
      if (b <= shape.y) {
        vec4 range = G_ARM_RANGE[i];
        vec4 w = G_ARM_WIDTH[i];
        float ra = exp(shape.z + shape.w * (b - shape.x));
        float sigma = max(w.x + G_ARM_WIDTH_GROWTH * (ra - w.y), 0.1 * G_KPC);
        // distance across the arm (radial offset times cos(pitch)); far from it nothing is lit
        float d = (R - ra) / sqrt(1.0 + shape.w * shape.w);
        if (abs(d) < 4.5 * sigma) {
          float strength = 1.0;
          if (b < range.x || b > range.y) {
            float toEnd = b < range.x ? b - range.z : range.w - b;
            strength = G_ARM_EXTRAPOLATED * clamp(toEnd / G_ARM_END_FADE, 0.0, 1.0);
          }
          float s = w.z * strength;
          arms = max(arms, s * exp(-0.5 * d * d / (sigma * sigma)));
          float dl = d + 0.9 * sigma;
          lanes = max(lanes, s * exp(-0.5 * dl * dl / (0.36 * sigma * sigma)));
        }
      }
      b += 2.0 * G_PI;
    }
  }
  return vec2(arms, lanes);
}

// Emission of old stars, young stars and gas (x, y, z) and dust density (w) at a point.
vec4 galaxy(vec3 p) {
  vec2 q = rot(p.xz, uAngle); // into the galaxy's own frame (it turns as uAngle grows)
  float R = length(q);
  float y = abs(p.y);
  float beta = 0.5 * G_PI - atan(q.y, q.x);
  float edge = smoothstep(G_DISK_RADIUS, G_DISK_RADIUS * 0.8, R);

  // thin and thick disks (thick: 4% of the thin disk's density at the Sun)
  float thin = exp(-R / G_THIN_LENGTH - y / G_THIN_HEIGHT);
  float thickNorm = G_THICK_FRACTION * exp(G_SUN_RADIUS / G_THICK_LENGTH - G_SUN_RADIUS / G_THIN_LENGTH);
  float thick = thickNorm * exp(-R / G_THICK_LENGTH - y / G_THICK_HEIGHT);
  float disk = 0.6 * (thin + thick);

  // The central parts only matter near the centre; elsewhere they are skipped (this runs for
  // every sample of every pixel).
  float bulge = 0.0;
  float bar = 0.0;
  float nsd = 0.0;
  float cmz = 0.0;
  if (R < 1.5 * G_BAR_HALF_LENGTH && y < 6.0) {
    // boxy/peanut bulge: exponential, its vertical scale growing where the X shape is widest
    vec2 qb = rot(q, -G_BULGE_ANGLE);
    float xr = (abs(qb.x) - G_BULGE_X_RADIUS) / (0.4 * G_BULGE_X_RADIUS);
    float hz = G_BULGE_Z * (1.0 + 0.95 * exp(-xr * xr));
    bulge = 0.9 * exp(-length(vec3(qb.x / G_BULGE_X, qb.y / G_BULGE_Y, y / hz)));

    // long bar: thin (180 pc) and superthin (45 pc) components, the superthin one growing to the ends
    vec2 ql = rot(q, -G_BAR_ANGLE);
    float along = abs(ql.x) / G_BAR_HALF_LENGTH;
    float across = ql.y / (0.3 * G_BAR_HALF_LENGTH);
    float a2 = along * along;
    float barPlan = exp(-a2 * a2 - across * across);
    bar = barPlan * (0.45 * exp(-along * 1.2 - y / G_BAR_THIN_HEIGHT) + 0.35 * along * exp(-y / G_BAR_SUPERTHIN_HEIGHT));

    // nuclear stellar disk and the central molecular zone
    if (R < G_CMZ_RADIUS) {
      nsd = 0.6 * exp(-R / (0.4 * G_NSD_RADIUS) - y / G_NSD_HEIGHT);
      cmz = smoothstep(G_CMZ_RADIUS, 0.6 * G_CMZ_RADIUS, R) * exp(-y / G_NSD_HEIGHT);
    }
  }

  // spiral arms, traced by young stars and glowing gas, broken up into star-forming clumps
  // (arms are thin: skip them well above the disk)
  vec2 sa = y < 2.0 ? spiralArms(R, beta) * smoothstep(2.5 * G_KPC, 3.5 * G_KPC, R) : vec2(0.0);
  float n = 0.0;
  if (sa.x > 0.002) n = gnoise(vec3(q * 0.28, 1.3)) * 0.65 + gnoise(vec3(q * 0.7, 7.1)) * 0.35;
  float clumps = clamp(0.55 + 0.9 * n, 0.0, 1.6);
  float armThin = exp(-y / G_BAR_THIN_HEIGHT);
  float armFade = exp(-R / 40.0) * edge;
  float young = uArmContrast * 2.4 * sa.x * clumps * armThin * armFade;
  float gas = uArmContrast * (6.0 * sa.x * sa.x * (max(n, 0.0) * max(n, 0.0) * max(n, 0.0)) * armThin * armFade + 2.0 * cmz);

  // dust: an exponential disk (flattened inside 0.35 R0, where the fit stops) with a flaring scale
  // height, dust lanes along the arms, and the dense gas of the CMZ
  float dustH = mix(G_DUST_HEIGHT_INNER, G_DUST_HEIGHT_SUN, R / G_SUN_RADIUS);
  float dustDisk = exp(-max(R, 0.35 * G_SUN_RADIUS) / G_DUST_LENGTH);
  float dust = uDust * ((3.0 * dustDisk + 0.8 * sa.y * armFade) * exp(-y / dustH) + 3.0 * cmz) * edge;

  return vec4((disk + bulge + bar + nsd) * edge, young, gas, dust);
}
