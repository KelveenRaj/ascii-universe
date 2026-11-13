// Thin Keplerian accretion disk in the y = 0 plane. Units: r_s = 1, M = 0.5. Needs noise.glsl.

const float SWIRL_PERIOD = 40.0; // anti-winding crossfade period, in disk-time units

// One layer of swirling gas. `ph` is the azimuth already advanced by differential rotation.
float swirlLayer(float ph, float r, float seed) {
  float lr = log(r);
  vec3 p = vec3(cos(ph) * 2.2, sin(ph) * 2.2, lr * 5.0 + seed);
  float n = fbm(p + seed);
  float streak = gnoise(vec3(cos(ph) * 7.0, sin(ph) * 7.0, lr * 22.0 + seed * 1.3));
  return clamp(0.5 + 0.55 * n + 0.22 * streak, 0.0, 1.0);
}

// Returns vec3(observed intensity, opacity, g) for a ray crossing the disk plane at `hit`.
// `rayDir` is the traced direction (camera → scene); photons travel the opposite way.
vec3 diskShade(vec3 hit, vec3 rayDir, float time, float rIn, float rOut, float beamExp) {
  float r = length(hit.xz);
  float phi = atan(hit.z, hit.x);

  // Novikov–Thorne-like emissivity ~ T^4 ∝ r^-3 (1 - sqrt(rIn / r)), normalised to peak 1
  float rPeak = rIn * 49.0 / 36.0;
  float norm = (rPeak * rPeak * rPeak) / (1.0 - sqrt(rIn / rPeak));
  float emit = norm * max(1.0 - sqrt(rIn / r), 0.0) / (r * r * r);
  float outerFade = smoothstep(rOut, rOut * 0.72, r);

  // Swirl: Keplerian differential rotation (Ω = sqrt(M / r^3)). Two layers whose clocks reset
  // half a period apart are crossfaded, so the shear never winds the noise into thin rings.
  float omega = 0.70710678 * pow(r, -1.5);
  float t1 = mod(time, SWIRL_PERIOD);
  float t2 = mod(time + 0.5 * SWIRL_PERIOD, SWIRL_PERIOD);
  float w1 = 1.0 - abs(2.0 * t1 / SWIRL_PERIOD - 1.0);
  float n = mix(swirlLayer(phi - omega * t2, r, 17.0), swirlLayer(phi - omega * t1, r, 0.0), w1);

  // Relativistic beaming: orbital speed seen by a static observer, plus gravitational redshift
  vec3 vDir = normalize(vec3(-hit.z, 0.0, hit.x));
  float beta = min(sqrt(0.5 / max(r - 1.0, 1e-3)), 0.99);
  float gammaL = inversesqrt(1.0 - beta * beta);
  float doppler = 1.0 / (gammaL * (1.0 + beta * dot(vDir, rayDir)));
  float g = doppler * sqrt(max(1.0 - 1.0 / r, 0.0));

  float intensity = emit * (0.3 + 1.4 * n) * pow(g, beamExp) * outerFade;
  float alpha = mix(0.55, 0.97, n) * outerFade * smoothstep(rIn * 0.98, rIn * 1.06, r);
  return vec3(intensity, alpha, g);
}
